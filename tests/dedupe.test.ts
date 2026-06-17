import { describe, expect, it } from "vitest";
import { filterUnseenListings } from "../src/storage/dedupe";
import type { ListingResult } from "../src/storage/types";

function listing(advertId: string): ListingResult {
  return {
    id: advertId,
    advertId,
    url: `https://krisha.kz/a/show/${advertId}`,
    title: `Listing ${advertId}`,
  };
}

describe("filterUnseenListings", () => {
  it("returns only new advert ids and appends them to seen ids", () => {
    const result = filterUnseenListings([listing("1"), listing("2"), listing("1"), listing("3")], ["1"]);

    expect(result.unseen.map((item) => item.advertId)).toEqual(["2", "3"]);
    expect(result.nextSeenAdvertIds).toEqual(["1", "2", "3"]);
  });
});
