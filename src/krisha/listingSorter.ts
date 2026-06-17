import type { SearchIntent } from "../bot/types";
import type { ListingResult } from "../storage/types";

export function sortListingsForIntent(listings: ListingResult[], intent: SearchIntent): ListingResult[] {
  if (intent.sort !== "oldest_first") return listings;

  return [...listings].sort((left, right) => {
    const leftTime = left.publishedAtTimestamp;
    const rightTime = right.publishedAtTimestamp;

    if (leftTime === undefined && rightTime === undefined) return 0;
    if (leftTime === undefined) return 1;
    if (rightTime === undefined) return -1;
    return leftTime - rightTime;
  });
}
