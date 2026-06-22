type NetlifyGlobal = {
  env?: {
    get(name: string): string | undefined;
  };
};

function getNetlifyGlobal(): NetlifyGlobal | undefined {
  return (globalThis as typeof globalThis & { Netlify?: NetlifyGlobal }).Netlify;
}

export function getEnv(name: string): string | undefined {
  return getNetlifyGlobal()?.env?.get(name) ?? process.env[name];
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAllowedChatIds(): Set<string> {
  const raw = requireEnv("TELEGRAM_ALLOWED_CHAT_IDS");
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("TELEGRAM_ALLOWED_CHAT_IDS must contain at least one chat id");
  }

  return new Set(ids);
}

export function getOptionalWebhookSecret(): string | undefined {
  return getEnv("TELEGRAM_WEBHOOK_SECRET");
}

export function isKrishaFetchEnabled(): boolean {
  return getEnv("KRISHA_FETCH_ENABLED") === "true";
}

export function getMaxResults(): number {
  const raw = getEnv("KRISHA_MAX_RESULTS");
  if (!raw) return 5;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.min(parsed, 10);
}

export function isAiIntentEnabled(): boolean {
  return getEnv("AI_INTENT_ENABLED") === "true";
}

export function getAiModel(): string {
  return getEnv("AI_MODEL") || "gpt-4o-mini";
}

export function getAiBaseUrl(): string | undefined {
  return getEnv("OPENAI_BASE_URL");
}

export function getOptionalOpenAiApiKey(): string | undefined {
  return getEnv("OPENAI_API_KEY");
}

export function getOptionalFirecrawlApiKey(): string | undefined {
  return getEnv("FIRECRAWL_API_KEY");
}

export function isFirecrawlConfigured(): boolean {
  return Boolean(getOptionalFirecrawlApiKey());
}
