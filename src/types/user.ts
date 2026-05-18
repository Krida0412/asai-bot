import { z } from "zod";
import { passwordSchema } from "lib/validations/password";

import { UserEntity } from "lib/db/pg/schema.pg";
import { getSession } from "auth/server";

export type CustomProviderConfig = {
  id: string;
  name: string;
  provider: "openai";
  baseURL?: string;
  apiKey?: string;
  models?: string[];
  enabled: boolean;
};

/** Per-service model overrides shown on the Service Model settings tab */
export type ServiceModelConfig = {
  /** Model used for auto-naming chat threads */
  topicNamingModel?: { provider: string; model: string };
  /** Model used for AI image topic / title narning */
  imageTopicNamingModel?: { provider: string; model: string };
  /** Model used for translating messages */
  messageTranslationModel?: { provider: string; model: string };
  /** Model used to compress conversation history */
  compressionModel?: { provider: string; model: string };
  /** Model used for generating agent info (name, icon, description) */
  agentInfoModel?: { provider: string; model: string };
  /** Whether to use library query rewriting */
  libraryQueryRewrite?: boolean;
  /** Model used to rewrite library queries */
  libraryQueryRewriteModel?: { provider: string; model: string };
  /** Custom prompt for library query rewriting */
  libraryQueryRewritePrompt?: string;
};

export type UserPreferences = {
  displayName?: string;
  profession?: string; // User's job or profession
  responseStyleExample?: string; // Example of preferred response style
  botName?: string; // Name of the bot
  apiKeys?: Record<string, string>; // e.g. { "openai": "sk-...", "anthropic": "sk-..." }
  customProviders?: CustomProviderConfig[];
  /** Temperature parameter for AI responses (0.0 – 2.0, default 0.7) */
  temperature?: number;
  /** Per-service model overrides */
  serviceModelConfig?: ServiceModelConfig;
};

// user without password
export interface User extends Omit<UserEntity, "password"> {
  preferences: UserPreferences | null;
  lastLogin?: Date | null;
}

export type BasicUser = Omit<
  User,
  | "password"
  | "preferences"
  | "image"
  | "role"
  | "banned"
  | "banReason"
  | "banExpires"
> & {
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
};

export interface BasicUserWithLastLogin extends BasicUser {
  lastLogin: Date | null;
}

export type UserSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type UserSessionUser = UserSession["user"];

export type UserRepository = {
  existsByEmail: (email: string) => Promise<boolean>;
  updateUserDetails: (data: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
  }) => Promise<User>;

  updatePreferences: (
    userId: string,
    preferences: UserPreferences,
  ) => Promise<User>;
  getPreferences: (userId: string) => Promise<UserPreferences | null>;
  getUserById: (userId: string) => Promise<BasicUserWithLastLogin | null>;
  getUserCount: () => Promise<number>;
  getUserStats: (userId: string) => Promise<{
    threadCount: number;
    messageCount: number;
    modelStats: Array<{
      model: string;
      messageCount: number;
      totalTokens: number;
    }>;
    totalTokens: number;
    period: string;
  }>;
  getUserAuthMethods: (userId: string) => Promise<{
    hasPassword: boolean;
    oauthProviders: string[];
  }>;
};

export const UserZodSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

export const CustomProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  provider: z.literal("openai"),
  baseURL: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  models: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const ChatModelRefSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const ServiceModelConfigSchema = z.object({
  topicNamingModel: ChatModelRefSchema.optional(),
  imageTopicNamingModel: ChatModelRefSchema.optional(),
  messageTranslationModel: ChatModelRefSchema.optional(),
  compressionModel: ChatModelRefSchema.optional(),
  agentInfoModel: ChatModelRefSchema.optional(),
  libraryQueryRewrite: z.boolean().optional(),
  libraryQueryRewriteModel: ChatModelRefSchema.optional(),
  libraryQueryRewritePrompt: z.string().optional(),
});

export const UserPreferencesZodSchema = z.object({
  displayName: z.string().optional(),
  profession: z.string().optional(),
  responseStyleExample: z.string().optional(),
  botName: z.string().optional(),
  apiKeys: z.record(z.string(), z.string()).optional(),
  customProviders: z.array(CustomProviderConfigSchema).optional(),
  temperature: z.number().min(0).max(2).optional(),
  serviceModelConfig: ServiceModelConfigSchema.optional(),
});
