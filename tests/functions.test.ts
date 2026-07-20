import type { Context } from "@netlify/functions";
import { afterEach, describe, expect, it } from "vitest";
import checkSavedSearchesNow from "../netlify/functions/check-saved-searches-now";
import checkRemindersNow from "../netlify/functions/check-reminders-now";
import health from "../netlify/functions/health";
import telegram from "../netlify/functions/telegram";

const context = {} as Context;

afterEach(() => {
  delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.KRISHA_FETCH_ENABLED;
  delete process.env.FIRECRAWL_API_KEY;
});

describe("Netlify functions", () => {
  it("returns health response", async () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "123";
    process.env.KRISHA_FETCH_ENABLED = "false";

    const response = await health(new Request("http://localhost/api/health"), context);
    const body = (await response.json()) as {
      ok: boolean;
      reference: { geoNodes: number };
      config: { firecrawlConfigured: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reference.geoNodes).toBeGreaterThan(0);
    expect(body.config.firecrawlConfigured).toBe(false);
  });

  it("rejects invalid Telegram webhook secret", async () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "123";
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected";

    const response = await telegram(
      new Request("http://localhost/api/telegram", {
        method: "POST",
        body: JSON.stringify({ update_id: 1 }),
        headers: { "content-type": "application/json" },
      }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it("rejects unauthorized Telegram chat without touching storage", async () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "123";

    const response = await telegram(
      new Request("http://localhost/api/telegram", {
        method: "POST",
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 10,
            text: "квартиры на продажу в Астане",
            chat: { id: 999 },
          },
        }),
        headers: { "content-type": "application/json" },
      }),
      context,
    );
    const body = (await response.json()) as { method: string; chat_id: string; text: string };

    expect(response.status).toBe(200);
    expect(body.method).toBe("sendMessage");
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("закрыт");
  });

  it("rejects manual saved-search checker with invalid secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected";

    const response = await checkSavedSearchesNow(
      new Request("http://localhost/api/check-saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it("rejects manual reminder checker with invalid secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected";

    const response = await checkRemindersNow(
      new Request("http://localhost/api/check-reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      context,
    );

    expect(response.status).toBe(401);
  });
});
