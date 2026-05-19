import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { UserPreferences } from "app-types/user";

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { xai } from "@ai-sdk/xai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createOpenAICompatibleModels,
  openaiCompatibleModelsSafeParse,
} from "./create-openai-compatiable";
import { ChatModel } from "app-types/chat";
import {
  DEFAULT_FILE_PART_MIME_TYPES,
  OPENAI_FILE_MIME_TYPES,
  GEMINI_FILE_MIME_TYPES,
  ANTHROPIC_FILE_MIME_TYPES,
  XAI_FILE_MIME_TYPES,
} from "./file-support";

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const staticModels = {
  mistral: {
    "mistral-medium-latest": mistral("mistral-medium-latest"),
    "mistral-large-latest": mistral("mistral-large-latest"),
    "mistral-small-latest": mistral("mistral-small-latest"),
    "codestral-latest": mistral("codestral-latest"),
  },
  openai: {
    "gpt-4.1": openai("gpt-4.1"),
    "gpt-4.1-mini": openai("gpt-4.1-mini"),
    "o4-mini": openai("o4-mini"),
    o3: openai("o3"),
  },
  google: {
    "gemini-2.5-flash-lite": google("gemini-2.5-flash-lite"),
    "gemini-2.5-flash": google("gemini-2.5-flash"),
    "gemini-2.5-pro": google("gemini-2.5-pro"),
  },
  anthropic: {
    "sonnet-4.5": anthropic("claude-sonnet-4-5"),
    "haiku-4.5": anthropic("claude-haiku-4-5"),
    "opus-4.5": anthropic("claude-opus-4-5"),
  },
  xai: {
    "grok-4-1-fast": xai("grok-4-1-fast-non-reasoning"),
    "grok-4-1": xai("grok-4-1"),
    "grok-3-mini": xai("grok-3-mini"),
  },
};

const staticUnsupportedModels = new Set<any>([
  staticModels.openai["o4-mini"],
]);

const staticSupportImageInputModels = {
  ...staticModels.google,
  ...staticModels.xai,
  ...staticModels.openai,
  ...staticModels.anthropic,
  ...staticModels.mistral,
};

const staticFilePartSupportByModel = new Map<any, readonly string[]>();

const registerFileSupport = (
  model: any,
  mimeTypes: readonly string[] = DEFAULT_FILE_PART_MIME_TYPES,
) => {
  if (!model) return;
  staticFilePartSupportByModel.set(model, Array.from(mimeTypes));
};

registerFileSupport(staticModels.openai["gpt-4.1"], OPENAI_FILE_MIME_TYPES);
registerFileSupport(staticModels.openai["gpt-4.1-mini"], OPENAI_FILE_MIME_TYPES);

registerFileSupport(staticModels.google["gemini-2.5-flash-lite"], GEMINI_FILE_MIME_TYPES);
registerFileSupport(staticModels.google["gemini-2.5-flash"], GEMINI_FILE_MIME_TYPES);
registerFileSupport(staticModels.google["gemini-2.5-pro"], GEMINI_FILE_MIME_TYPES);

registerFileSupport(staticModels.anthropic["sonnet-4.5"], ANTHROPIC_FILE_MIME_TYPES);
registerFileSupport(staticModels.anthropic["haiku-4.5"], ANTHROPIC_FILE_MIME_TYPES);
registerFileSupport(staticModels.anthropic["opus-4.5"], ANTHROPIC_FILE_MIME_TYPES);

registerFileSupport(staticModels.xai["grok-4-1-fast"], XAI_FILE_MIME_TYPES);
registerFileSupport(staticModels.xai["grok-4-1"], XAI_FILE_MIME_TYPES);
registerFileSupport(staticModels.xai["grok-3-mini"], XAI_FILE_MIME_TYPES);

registerFileSupport(staticModels.mistral["mistral-large-latest"], DEFAULT_FILE_PART_MIME_TYPES);
registerFileSupport(staticModels.mistral["mistral-medium-latest"], DEFAULT_FILE_PART_MIME_TYPES);
registerFileSupport(staticModels.mistral["mistral-small-latest"], DEFAULT_FILE_PART_MIME_TYPES);
registerFileSupport(staticModels.mistral["codestral-latest"], DEFAULT_FILE_PART_MIME_TYPES);

const openaiCompatibleProviders = openaiCompatibleModelsSafeParse(
  process.env.OPENAI_COMPATIBLE_DATA,
);

const {
  providers: openaiCompatibleModels,
  unsupportedModels: openaiCompatibleUnsupportedModels,
} = createOpenAICompatibleModels(openaiCompatibleProviders);

const allModels = { ...openaiCompatibleModels, ...staticModels };

const allUnsupportedModels = new Set<any>([
  ...openaiCompatibleUnsupportedModels,
  ...staticUnsupportedModels,
]);

export const isToolCallUnsupportedModel = (model: any) => {
  return allUnsupportedModels.has(model);
};

const isImageInputUnsupportedModel = (model: any) => {
  return !Object.values(staticSupportImageInputModels).includes(model);
};

export const getFilePartSupportedMimeTypes = (model: any) => {
  return staticFilePartSupportByModel.get(model) ?? [];
};

const fallbackModel = staticModels.mistral["mistral-medium-latest"];

export const customModelProvider = {
  modelsInfo: Object.entries(allModels).map(([provider, models]) => ({
    provider,
    models: Object.entries(models).map(([name, model]) => ({
      name,
      isToolCallUnsupported: isToolCallUnsupportedModel(model),
      isImageInputUnsupported: isImageInputUnsupportedModel(model),
      supportedFileMimeTypes: [...getFilePartSupportedMimeTypes(model)],
    })),
    hasAPIKey: checkProviderAPIKey(provider as keyof typeof staticModels),
  })),
  getModel: (model?: ChatModel, preferences?: UserPreferences): any => {
    if (!model) return fallbackModel;
    
    // Check for custom provider
    if (preferences?.customProviders) {
      const customProvider = preferences.customProviders.find((p) => p.id === model.provider && p.enabled);
      if (customProvider) {
        const dynamicProvider = createOpenAICompatible({
          name: customProvider.id,
          baseURL: customProvider.baseURL || "",
          apiKey: customProvider.apiKey || "",
        });
        return dynamicProvider.chatModel(model.model);
      }
    }

    // Check for standard provider overrides via apiKeys
    const overrideKey = preferences?.apiKeys?.[model.provider];
    if (overrideKey) {
      if (model.provider === "openai") return createOpenAI({ apiKey: overrideKey || "" })(model.model);
      if (model.provider === "google") return createGoogleGenerativeAI({ apiKey: overrideKey || "" })(model.model);
      if (model.provider === "anthropic") return createAnthropic({ apiKey: overrideKey || "" })(model.model as any);
      if (model.provider === "xai") return createXai({ apiKey: overrideKey || "" })(model.model);
      if (model.provider === "mistral") return createMistral({ apiKey: overrideKey || "" })(model.model);
    }

    // Fall back to server environment variables
    return allModels[model.provider]?.[model.model] || fallbackModel;
  },
};

function checkProviderAPIKey(provider: keyof typeof staticModels) {
  let key: string | undefined;
  switch (provider) {
    case "openai":
      key = process.env.OPENAI_API_KEY;
      break;
    case "google":
      key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      break;
    case "anthropic":
      key = process.env.ANTHROPIC_API_KEY;
      break;
    case "xai":
      key = process.env.XAI_API_KEY;
      break;
    case "mistral":
      key = process.env.MISTRAL_API_KEY;
      break;
    default:
      return true;
  }
  return !!key && key != "****";
}