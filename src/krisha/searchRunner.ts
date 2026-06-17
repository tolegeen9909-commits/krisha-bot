import type { SearchIntent } from "../bot/types";
import { isKrishaFetchEnabled } from "../shared/config";
import type { ListingResult, TaskStatus } from "../storage/types";
import { extractListings } from "./listingExtractor";
import { filterListingsForIntent } from "./listingMatcher";
import { sortListingsForIntent } from "./listingSorter";

export type PublicSearchResult = {
  status: TaskStatus;
  listings: ListingResult[];
  error?: string;
};

export async function runPublicSearch(searchUrl: string, limit: number, intent: SearchIntent): Promise<PublicSearchResult> {
  if (!isKrishaFetchEnabled()) {
    return { status: "fetch_disabled", listings: [] };
  }

  try {
    const response = await fetch(searchUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ru-RU,ru;q=0.9",
        "user-agent": "krisha-telegram-bot/0.1 public-search",
      },
    });

    if (!response.ok && response.status !== 404) {
      return {
        status: "fetch_failed",
        listings: [],
        error: `Krisha returned HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const needsWiderExtraction = intent.sort === "oldest_first" || Boolean(intent.residentialComplexName);
    const extractionLimit = needsWiderExtraction ? Math.max(limit, 50) : limit;
    const extractedListings = extractListings(html, searchUrl, extractionLimit);
    const listings = sortListingsForIntent(filterListingsForIntent(extractedListings, intent), intent).slice(0, limit);

    return {
      status: "completed",
      listings,
    };
  } catch (error) {
    return {
      status: "fetch_failed",
      listings: [],
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}
