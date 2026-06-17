import type { ListingResult } from "./types";

export function filterUnseenListings(
  listings: ListingResult[],
  seenAdvertIds: Iterable<string>,
): { unseen: ListingResult[]; nextSeenAdvertIds: string[] } {
  const seen = new Set(seenAdvertIds);
  const unseen: ListingResult[] = [];

  for (const listing of listings) {
    if (seen.has(listing.advertId)) continue;
    unseen.push(listing);
    seen.add(listing.advertId);
  }

  return {
    unseen,
    nextSeenAdvertIds: [...seen],
  };
}
