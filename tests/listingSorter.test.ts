import { describe, expect, it } from "vitest";
import { sortListingsForIntent } from "../src/krisha/listingSorter";
import type { SearchIntent } from "../src/bot/types";
import type { ListingResult } from "../src/storage/types";

const baseIntent = {
  rawText: "квартиры на продажу в Алматы сначала старые объявления",
  categorySlug: "prodazha/kvartiry",
  geo: {
    name: "Алматы",
    slug: "almaty",
    type: "city",
    url_path: "almaty",
    parent_url_path: null,
    verified: true,
    in_sitemap: true,
    name_source: "manual",
  },
} satisfies SearchIntent;

describe("sortListingsForIntent", () => {
  it("puts older known listing dates first and unknown dates last", () => {
    const listings: ListingResult[] = [
      { id: "new", advertId: "new", title: "new", url: "https://krisha.kz/a/show/new", publishedAtTimestamp: 300 },
      { id: "unknown", advertId: "unknown", title: "unknown", url: "https://krisha.kz/a/show/unknown" },
      { id: "old", advertId: "old", title: "old", url: "https://krisha.kz/a/show/old", publishedAtTimestamp: 100 },
    ];

    expect(sortListingsForIntent(listings, { ...baseIntent, sort: "oldest_first" }).map((item) => item.id)).toEqual([
      "old",
      "new",
      "unknown",
    ]);
  });

  it("keeps original order when no sorting was requested", () => {
    const listings: ListingResult[] = [
      { id: "new", advertId: "new", title: "new", url: "https://krisha.kz/a/show/new", publishedAtTimestamp: 300 },
      { id: "old", advertId: "old", title: "old", url: "https://krisha.kz/a/show/old", publishedAtTimestamp: 100 },
    ];

    expect(sortListingsForIntent(listings, baseIntent).map((item) => item.id)).toEqual(["new", "old"]);
  });
});
