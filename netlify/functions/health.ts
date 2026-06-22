import type { Config, Context } from "@netlify/functions";
import { categories, geoNodes } from "../../src/krisha/reference";
import {
  getAiModel,
  getEnv,
  isAiIntentEnabled,
  isFirecrawlConfigured,
  isKrishaFetchEnabled,
} from "../../src/shared/config";
import { jsonResponse, methodNotAllowed } from "../../src/shared/http";

export default async (req: Request, _context: Context) => {
  if (req.method !== "GET") return methodNotAllowed();

  return jsonResponse({
    ok: true,
    service: "krisha-telegram-bot",
    reference: {
      geoNodes: geoNodes.length,
      categories: categories.length,
    },
    config: {
      allowedChatIdsConfigured: Boolean(getEnv("TELEGRAM_ALLOWED_CHAT_IDS")),
      webhookSecretConfigured: Boolean(getEnv("TELEGRAM_WEBHOOK_SECRET")),
      krishaFetchEnabled: isKrishaFetchEnabled(),
      aiIntentEnabled: isAiIntentEnabled(),
      aiModel: getAiModel(),
      aiProviderConfigured: Boolean(getEnv("OPENAI_BASE_URL") || getEnv("OPENAI_API_KEY")),
      firecrawlConfigured: isFirecrawlConfigured(),
    },
  });
};

export const config: Config = {
  path: "/api/health",
  method: ["GET"],
};
