import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractListings } from "../src/krisha/listingExtractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("extractListings", () => {
  it("extracts public listing cards and deduplicates advert ids", () => {
    const html = readFileSync(join(__dirname, "fixtures", "krisha-search.html"), "utf8");

    const listings = extractListings(html, "https://krisha.kz/prodazha/kvartiry/astana/", 5);

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      advertId: "101",
      url: "https://krisha.kz/a/show/101",
      title: "2-комнатная квартира",
      price: "55 000 000 ₸",
      location: "Астана, Есиль район",
      publishedAtText: "17 июня",
    });
    expect(listings[1]?.advertId).toBe("102");
  });

  it("returns empty results for Krisha error pages", () => {
    expect(extractListings('<div class="error-content__title">404</div>', "https://krisha.kz/", 5)).toEqual([]);
  });
});
