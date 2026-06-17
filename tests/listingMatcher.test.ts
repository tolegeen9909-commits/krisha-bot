import { describe, expect, it } from "vitest";
import {
  filterListingsForIntent,
  listingMatchesResidentialComplex,
  normalizeResidentialComplexName,
} from "../src/krisha/listingMatcher";
import type { SearchIntent } from "../src/bot/types";
import type { ListingResult } from "../src/storage/types";

const baseIntent: SearchIntent = {
  rawText: "двушка Алматы ЖК Rams City",
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
  residentialComplexName: "Rams City",
};

function listing(advertId: string, overrides: Partial<ListingResult> = {}): ListingResult {
  return {
    id: advertId,
    advertId,
    title: `Listing ${advertId}`,
    url: `https://krisha.kz/a/show/${advertId}`,
    ...overrides,
  };
}

describe("listingMatcher", () => {
  it("normalizes residential complex names", () => {
    expect(normalizeResidentialComplexName("ЖК Rams-City")).toBe("rams city");
    expect(normalizeResidentialComplexName("жилой комплекс Terracotta")).toBe("terracotta");
  });

  it("matches visible listing text only", () => {
    expect(
      listingMatchesResidentialComplex(
        listing("1", {
          title: "2-комнатная квартира",
          location: "Алматы, ЖК Rams-City",
        }),
        "Rams City",
      ),
    ).toBe(true);
    expect(listingMatchesResidentialComplex(listing("2", { location: "Алматы, Бостандыкский район" }), "Rams City")).toBe(
      false,
    );
  });

  it("filters listings for residential complex intent", () => {
    const filtered = filterListingsForIntent(
      [
        listing("1", { summary: "Просторная квартира в ЖК Rams City" }),
        listing("2", { summary: "Просторная квартира в другом ЖК" }),
      ],
      baseIntent,
    );

    expect(filtered.map((item) => item.advertId)).toEqual(["1"]);
  });
});
