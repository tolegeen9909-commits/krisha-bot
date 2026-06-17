import type { SearchIntent } from "../bot/types";
import type { ListingResult } from "../storage/types";

export function normalizeResidentialComplexName(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/^(?:\s*)(?:жк|жилой\s+комплекс)\s+/iu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleListingText(listing: ListingResult): string {
  return [listing.title, listing.location, listing.summary, listing.url].filter(Boolean).join(" ");
}

export function listingMatchesResidentialComplex(listing: ListingResult, residentialComplexName: string): boolean {
  const needle = normalizeResidentialComplexName(residentialComplexName);
  if (!needle) return true;

  const haystack = normalizeResidentialComplexName(visibleListingText(listing));
  return haystack.includes(needle);
}

export function filterListingsForIntent(listings: ListingResult[], intent: SearchIntent): ListingResult[] {
  if (!intent.residentialComplexName) return listings;
  return listings.filter((listing) => listingMatchesResidentialComplex(listing, intent.residentialComplexName!));
}
