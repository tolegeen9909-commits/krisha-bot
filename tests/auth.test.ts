import { describe, expect, it } from "vitest";
import { isChatAllowed, isWebhookSecretValid } from "../src/bot/auth";

describe("telegram auth helpers", () => {
  it("checks allowlisted chat ids as strings", () => {
    const allowed = new Set(["123", "-456"]);

    expect(isChatAllowed(123, allowed)).toBe(true);
    expect(isChatAllowed("-456", allowed)).toBe(true);
    expect(isChatAllowed(789, allowed)).toBe(false);
  });

  it("allows missing configured webhook secret", () => {
    expect(isWebhookSecretValid(null, undefined)).toBe(true);
  });

  it("requires matching webhook secret when configured", () => {
    expect(isWebhookSecretValid("abc", "abc")).toBe(true);
    expect(isWebhookSecretValid("wrong", "abc")).toBe(false);
  });
});
