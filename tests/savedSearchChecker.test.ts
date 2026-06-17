import { describe, expect, it, vi } from "vitest";
import { checkSavedSearches } from "../src/bot/savedSearchChecker";
import type { ListingResult, SavedSearch, SavedSearchListingHistory } from "../src/storage/types";

function listing(advertId: string, overrides: Partial<ListingResult> = {}): ListingResult {
  return {
    id: advertId,
    advertId,
    url: `https://krisha.kz/a/show/${advertId}`,
    title: `Listing ${advertId}`,
    ...overrides,
  };
}

function savedSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: "abc12345",
    chatId: "123",
    rawText: "2-комн Алматы до 45 млн",
    intent: {
      rawText: "2-комн Алматы до 45 млн",
      categorySlug: "prodazha/kvartiry",
      geo: {
        name: "Алматы",
        slug: "almaty",
        type: "city",
        url_path: "almaty",
        parent_url_path: null,
        verified: true,
        in_sitemap: true,
        name_source: "test",
      },
      priceTo: 45_000_000,
      rooms: ["2"],
    },
    searchUrl: "https://krisha.kz/prodazha/kvartiry/almaty/",
    categorySlug: "prodazha/kvartiry",
    categoryName: "Продажа квартир",
    geoName: "Алматы",
    geoPath: "almaty",
    status: "active",
    sentAdvertIds: ["1"],
    sentCount: 1,
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkSavedSearches", () => {
  it("sends only unseen listings and marks sent ids after Telegram succeeds", async () => {
    const search = savedSearch();
    const updateSavedSearch = vi.fn(async (next: SavedSearch) => next);
    const sendTelegramMessage = vi.fn(async () => undefined);
    const saveSavedSearchListingHistory = vi.fn(async (history: SavedSearchListingHistory) => history);

    const summary = await checkSavedSearches({
      listActiveSavedSearches: vi.fn(async () => [search]),
      updateSavedSearch,
      getSavedSearchListingHistory: vi.fn(async () => ({
        savedSearchId: search.id,
        listings: {},
        updatedAt: "2026-06-17T00:00:00.000Z",
      })),
      saveSavedSearchListingHistory,
      runPublicSearch: vi.fn(async () => ({
        status: "completed" as const,
        listings: [listing("1"), listing("2"), listing("3")],
      })),
      sendTelegramMessage,
      now: () => "2026-06-17T01:00:00.000Z",
      maxActiveSearches: 10,
      maxNewListings: 2,
    });

    expect(summary).toEqual({ checked: 1, sent: 2, failed: 0, skipped: 0, errors: [] });
    expect(sendTelegramMessage).toHaveBeenCalledWith("123", expect.stringContaining("Listing 2"));
    expect(saveSavedSearchListingHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        savedSearchId: "abc12345",
        listings: expect.objectContaining({
          "1": expect.objectContaining({ advertId: "1" }),
          "2": expect.objectContaining({ advertId: "2" }),
          "3": expect.objectContaining({ advertId: "3" }),
        }),
      }),
    );
    expect(updateSavedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        sentAdvertIds: ["1", "2", "3"],
        sentCount: 3,
        lastCheckedAt: "2026-06-17T01:00:00.000Z",
      }),
    );
  });

  it("does not mark listings as seen when Telegram send fails", async () => {
    const search = savedSearch();
    const updateSavedSearch = vi.fn(async (next: SavedSearch) => next);
    const saveSavedSearchListingHistory = vi.fn(async (history: SavedSearchListingHistory) => history);

    const summary = await checkSavedSearches({
      listActiveSavedSearches: vi.fn(async () => [search]),
      updateSavedSearch,
      getSavedSearchListingHistory: vi.fn(async () => ({
        savedSearchId: search.id,
        listings: {},
        updatedAt: "2026-06-17T00:00:00.000Z",
      })),
      saveSavedSearchListingHistory,
      runPublicSearch: vi.fn(async () => ({
        status: "completed" as const,
        listings: [listing("2")],
      })),
      sendTelegramMessage: vi.fn(async () => {
        throw new Error("Telegram is down");
      }),
      now: () => "2026-06-17T01:00:00.000Z",
      maxActiveSearches: 10,
      maxNewListings: 5,
    });

    expect(summary).toEqual({
      checked: 0,
      sent: 0,
      failed: 1,
      skipped: 0,
      errors: [{ savedSearchId: "abc12345", message: "Telegram is down" }],
    });
    expect(updateSavedSearch).not.toHaveBeenCalled();
    expect(saveSavedSearchListingHistory).not.toHaveBeenCalled();
  });

  it("sends existing listings again when the saved price drops", async () => {
    const search = savedSearch({
      sentAdvertIds: ["1"],
      sentCount: 1,
    });
    const updateSavedSearch = vi.fn(async (next: SavedSearch) => next);
    const sendTelegramMessage = vi.fn(async () => undefined);

    const summary = await checkSavedSearches({
      listActiveSavedSearches: vi.fn(async () => [search]),
      updateSavedSearch,
      getSavedSearchListingHistory: vi.fn(async () => ({
        savedSearchId: search.id,
        listings: {
          "1": {
            advertId: "1",
            title: "Listing 1",
            url: "https://krisha.kz/a/show/1",
            firstSeenAt: "2026-05-01T00:00:00.000Z",
            lastSeenAt: "2026-06-16T00:00:00.000Z",
            lastPrice: 50_000_000,
            lastPriceText: "50 000 000 ₸",
          },
        },
        updatedAt: "2026-06-16T00:00:00.000Z",
      })),
      saveSavedSearchListingHistory: vi.fn(async (history: SavedSearchListingHistory) => history),
      runPublicSearch: vi.fn(async () => ({
        status: "completed" as const,
        listings: [listing("1", { price: "47 000 000 ₸" })],
      })),
      sendTelegramMessage,
      now: () => "2026-06-17T01:00:00.000Z",
      maxActiveSearches: 10,
      maxNewListings: 5,
    });

    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, skipped: 0, errors: [] });
    expect(sendTelegramMessage).toHaveBeenCalledWith("123", expect.stringContaining("снизили цену"));
    expect(updateSavedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        sentAdvertIds: ["1"],
        sentCount: 2,
      }),
    );
  });
});
