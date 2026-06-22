import type { SearchIntent } from "../bot/types";
import { isKrishaFetchEnabled } from "../shared/config";
import type { ListingResult, TaskStatus } from "../storage/types";
import { scrapeWithFirecrawl } from "./firecrawlClient";
import { extractListingsFromFirecrawl } from "./firecrawlExtractor";
import { extractListings } from "./listingExtractor";
import { filterListingsForIntent } from "./listingMatcher";
import { sortListingsForIntent } from "./listingSorter";

export type PublicSearchResult = {
  status: TaskStatus;
  listings: ListingResult[];
  error?: string;
};

function getExtractionLimit(limit: number, intent: SearchIntent): number {
  const needsWiderExtraction = intent.sort === "oldest_first" || Boolean(intent.residentialComplexName);
  return needsWiderExtraction ? Math.max(limit, 50) : limit;
}

async function runFirecrawlFallback(
  searchUrl: string,
  limit: number,
  intent: SearchIntent,
): Promise<PublicSearchResult | undefined> {
  const scraped = await scrapeWithFirecrawl(searchUrl);
  if (scraped.status === "skipped") return undefined;

  if (scraped.status === "failed") {
    return {
      status: "fetch_failed",
      listings: [],
      error: scraped.error,
    };
  }

  const extracted = extractListingsFromFirecrawl(scraped.data, searchUrl, getExtractionLimit(limit, intent));
  const listings = sortListingsForIntent(filterListingsForIntent(extracted, intent), intent).slice(0, limit);

  if (listings.length === 0) return undefined;
  return { status: "completed", listings };
}

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
      const fallback = await runFirecrawlFallback(searchUrl, limit, intent);
      if (fallback?.listings.length) return fallback;

      return {
        status: "fetch_failed",
        listings: [],
        error: `Krisha returned HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const extractionLimit = getExtractionLimit(limit, intent);
    const extractedListings = extractListings(html, searchUrl, extractionLimit);
    const listings = sortListingsForIntent(filterListingsForIntent(extractedListings, intent), intent).slice(0, limit);

    if (listings.length === 0) {
      const fallback = await runFirecrawlFallback(searchUrl, limit, intent);
      if (fallback?.listings.length) return fallback;
    }

    return {
      status: "completed",
      listings,
    };
  } catch (error) {
    const fallback = await runFirecrawlFallback(searchUrl, limit, intent);
    if (fallback?.listings.length) return fallback;

    return {
      status: "fetch_failed",
      listings: [],
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}
