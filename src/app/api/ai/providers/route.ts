import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";

// Known OpenAI-compatible service catalog
export const SERVICE_CATALOG = [
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference powered by LPU hardware. Best for speed.",
    baseURL: "https://api.groq.com/openai/v1",
    website: "https://console.groq.com",
    category: "inference",
    tags: ["fast", "free-tier"],
    defaultModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "gemma2-9b-it",
      "mixtral-8x7b-32768",
    ],
    color: "#F55036",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access hundreds of AI models via a unified API gateway.",
    baseURL: "https://openrouter.ai/api/v1",
    website: "https://openrouter.ai",
    category: "gateway",
    tags: ["multi-model", "pay-per-use"],
    defaultModels: [
      "anthropic/claude-3.5-sonnet",
      "google/gemini-pro-1.5",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    color: "#7C3AED",
  },
  {
    id: "together",
    name: "Together AI",
    description: "Run open-source models with high throughput at low cost.",
    baseURL: "https://api.together.xyz/v1",
    website: "https://together.ai",
    category: "inference",
    tags: ["open-source", "scalable"],
    defaultModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "Qwen/Qwen2-72B-Instruct",
    ],
    color: "#059669",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    description: "Fast and affordable inference for production workloads.",
    baseURL: "https://api.fireworks.ai/inference/v1",
    website: "https://fireworks.ai",
    category: "inference",
    tags: ["fast", "production"],
    defaultModels: [
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/mixtral-8x7b-instruct",
    ],
    color: "#EF4444",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Cutting-edge reasoning models from DeepSeek AI.",
    baseURL: "https://api.deepseek.com/v1",
    website: "https://platform.deepseek.com",
    category: "reasoning",
    tags: ["reasoning", "competitive"],
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    color: "#1D4ED8",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Online AI models with real-time web search capabilities.",
    baseURL: "https://api.perplexity.ai",
    website: "https://docs.perplexity.ai",
    category: "search",
    tags: ["web-search", "online"],
    defaultModels: [
      "llama-3.1-sonar-large-128k-online",
      "llama-3.1-sonar-small-128k-online",
    ],
    color: "#2563EB",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    description: "World's fastest AI inference on specialized wafer-scale chips.",
    baseURL: "https://api.cerebras.ai/v1",
    website: "https://cloud.cerebras.ai",
    category: "inference",
    tags: ["ultra-fast"],
    defaultModels: ["llama3.1-70b", "llama3.1-8b"],
    color: "#0EA5E9",
  },
  {
    id: "lobehub",
    name: "LobeHub",
    description: "Access curated AI models via LobeHub gateway service.",
    baseURL: "https://api.lobehub.com/v1",
    website: "https://lobehub.com",
    category: "gateway",
    tags: ["curated"],
    defaultModels: [
      "gpt-4o",
      "claude-3-5-sonnet-20241022",
      "gemini-1.5-pro",
    ],
    color: "#8B5CF6",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run AI models locally on your machine. No data leaves your device.",
    baseURL: "http://localhost:11434/v1",
    website: "https://ollama.ai",
    category: "local",
    tags: ["private", "local", "free"],
    defaultModels: ["llama3.2", "mistral", "codellama", "phi3"],
    color: "#64748B",
  },
  {
    id: "anyscale",
    name: "Anyscale",
    description: "Enterprise-grade inference for open-source models.",
    baseURL: "https://api.endpoints.anyscale.com/v1",
    website: "https://anyscale.com",
    category: "inference",
    tags: ["enterprise"],
    defaultModels: [
      "meta-llama/Meta-Llama-3-70B-Instruct",
      "mistralai/Mixtral-8x22B-Instruct-v0.1",
    ],
    color: "#DC2626",
  },
];

export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(SERVICE_CATALOG);
}
