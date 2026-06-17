import type { Config, Context } from "@netlify/functions";
import { isWebhookSecretValid } from "../../src/bot/auth";
import { checkReminders } from "../../src/bot/reminderChecker";
import { getOptionalWebhookSecret } from "../../src/shared/config";
import { jsonResponse, methodNotAllowed } from "../../src/shared/http";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return methodNotAllowed();

  const configuredSecret = getOptionalWebhookSecret();
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isWebhookSecretValid(receivedSecret, configuredSecret)) {
    return jsonResponse({ ok: false, error: "Invalid checker secret" }, { status: 401 });
  }

  const summary = await checkReminders();
  return jsonResponse({ ok: true, summary });
};

export const config: Config = {
  path: "/api/check-reminders",
  method: ["POST"],
};
