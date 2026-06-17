import { describe, expect, it } from "vitest";
import {
  buildMarketSnapshot,
  enrichListingsForRealtor,
  parseListingPrice,
  splitTrackedListings,
  updateListingHistory,
} from "../src/bot/realtorAssistant";
import type { SearchIntent } from "../src/bot/types";
import type { ListingResult } from "../src/storage/types";

const intent: SearchIntent = {
  rawText: "двушка Алматы до 45 млн",
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
};

function listing(advertId: string, price: string, overrides: Partial<ListingResult> = {}): ListingResult {
  return {
    id: advertId,
    advertId,
    title: `Listing ${advertId}`,
    url: `https://krisha.kz/a/show/${advertId}`,
    price,
    summary: "Уютная квартира с хорошим описанием, ремонтом и понятными параметрами для сравнения.",
    ...overrides,
  };
}

describe("realtorAssistant", () => {
  it("parses common Krisha price strings", () => {
    expect(parseListingPrice("47 500 000 ₸")).toBe(47_500_000);
    expect(parseListingPrice("47.5 млн ₸")).toBe(47_500_000);
    expect(parseListingPrice("850 тыс ₸")).toBe(850_000);
  });

  it("builds a visible market snapshot with median and cheap listings", () => {
    const snapshot = buildMarketSnapshot(
      [listing("1", "10 000 000 ₸"), listing("2", "20 000 000 ₸"), listing("3", "30 000 000 ₸")],
      intent,
    );

    expect(snapshot.status).toBe("completed");
    expect(snapshot.sampleSize).toBe(3);
    expect(snapshot.pricedCount).toBe(3);
    expect(snapshot.minPrice).toBe(10_000_000);
    expect(snapshot.maxPrice).toBe(30_000_000);
    expect(snapshot.medianPrice).toBe(20_000_000);
    expect(snapshot.cheapest[0]?.advertId).toBe("1");
  });

  it("detects new, old, cheap, and price-drop signals", () => {
    const enriched = enrichListingsForRealtor(
      [
        listing("1", "47 000 000 ₸"),
        listing("2", "35 000 000 ₸", {
          publishedAtTimestamp: Date.parse("2026-05-01T00:00:00.000Z"),
        }),
      ],
      intent,
      {
        history: {
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
        now: "2026-06-17T00:00:00.000Z",
      },
    );

    const split = splitTrackedListings(enriched);

    expect(enriched[0]?.priceDrop).toEqual({ from: 50_000_000, to: 47_000_000 });
    expect(enriched[0]?.opportunityReasons?.some((reason) => reason.includes("снизили цену"))).toBe(true);
    expect(split.priceDrops.map((item) => item.advertId)).toContain("1");
    expect(split.newListings.map((item) => item.advertId)).toContain("2");
    expect(split.oldListings.map((item) => item.advertId)).toContain("2");
    expect(enriched[1]?.opportunityReasons).toContain("ниже похожих на видимой выдаче");
  });

  it("updates listing history without losing old first-seen dates", () => {
    const next = updateListingHistory(
      {
        "1": {
          advertId: "1",
          title: "Listing 1",
          url: "https://krisha.kz/a/show/1",
          firstSeenAt: "2026-05-01T00:00:00.000Z",
          lastSeenAt: "2026-06-16T00:00:00.000Z",
          lastPrice: 50_000_000,
        },
      },
      [listing("1", "47 000 000 ₸")],
      "2026-06-17T00:00:00.000Z",
    );

    expect(next["1"]?.firstSeenAt).toBe("2026-05-01T00:00:00.000Z");
    expect(next["1"]?.lastSeenAt).toBe("2026-06-17T00:00:00.000Z");
    expect(next["1"]?.lastPrice).toBe(47_000_000);
  });
});
