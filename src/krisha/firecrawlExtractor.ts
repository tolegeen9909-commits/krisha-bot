import { extractPublicDateText } from "./dateParser";
import { extractListings } from "./listingExtractor";
import { normalizeWhitespace } from "../shared/text";
import type { ListingResult } from "../storage/types";
import type { FirecrawlScrapeData } from "./firecrawlClient";

const ADVERT_LINK_RE = /(?:https?:\/\/(?:www\.)?krisha\.kz)?(\/a\/show\/(\d+)[^\s)\]<"]*)/giu;
const MARKDOWN_LINK_RE = /\[([^\]]{1,220})\]\(([^)]*\/a\/show\/(\d+)[^)]*)\)/giu;
const PRICE_RE = /(?:от\s*)?[\d\s.,]+(?:млн|тыс)?\s*(?:₸|〒|тг|тенге)/iu;

function textSnippet(value: string, maxLength = 180): string | undefined {
  const text = normalizeWhitespace(value);
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function cleanTitle(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^#+\s*/, "")
    .replace(/\s*\|\s*Krisha.*$/iu, "")
    .replace(/\s+/g, " ");
}

function buildListingFromMarkdownMatch(
  sourceUrl: string,
  markdown: string,
  advertId: string,
  rawUrl: string,
  rawTitle: string | undefined,
  matchIndex: number,
): ListingResult | undefined {
  const title = cleanTitle(rawTitle || `Объявление ${advertId}`);
  if (!title) return undefined;

  const url = new URL(rawUrl, sourceUrl).toString();
  const contextStart = Math.max(0, matchIndex - 450);
  const contextEnd = Math.min(markdown.length, matchIndex + 650);
  const context = markdown.slice(contextStart, contextEnd);
  const price = context.match(PRICE_RE)?.[0];
  const summary = textSnippet(context);
  const publishedAt = extractPublicDateText(context);

  return {
    id: advertId,
    advertId,
    url,
    title,
    ...(price ? { price: normalizeWhitespace(price) } : {}),
    ...(publishedAt ? { publishedAtText: publishedAt.text, publishedAtTimestamp: publishedAt.timestamp } : {}),
    ...(summary ? { summary } : {}),
  };
}

function extractMarkdownListings(markdown: string, sourceUrl: string, limit: number): ListingResult[] {
  const listings = new Map<string, ListingResult>();

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    if (listings.size >= limit) break;

    const rawTitle = match[1];
    const rawUrl = match[2];
    const advertId = match[3];
    if (!rawUrl || !advertId || listings.has(advertId)) continue;

    const listing = buildListingFromMarkdownMatch(sourceUrl, markdown, advertId, rawUrl, rawTitle, match.index ?? 0);
    if (listing) listings.set(advertId, listing);
  }

  for (const match of markdown.matchAll(ADVERT_LINK_RE)) {
    if (listings.size >= limit) break;

    const rawUrl = match[1];
    const advertId = match[2];
    if (!rawUrl || !advertId || listings.has(advertId)) continue;

    const listing = buildListingFromMarkdownMatch(sourceUrl, markdown, advertId, rawUrl, undefined, match.index ?? 0);
    if (listing) listings.set(advertId, listing);
  }

  return [...listings.values()];
}

export function extractListingsFromFirecrawl(
  data: FirecrawlScrapeData,
  sourceUrl: string,
  limit: number,
): ListingResult[] {
  const htmlListings = data.html ? extractListings(data.html, sourceUrl, limit) : [];
  if (htmlListings.length > 0) return htmlListings;

  return data.markdown ? extractMarkdownListings(data.markdown, sourceUrl, limit) : [];
}
