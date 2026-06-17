import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { extractPublicDateText } from "./dateParser";
import { normalizeWhitespace } from "../shared/text";
import type { ListingResult } from "../storage/types";

const ADVERT_RE = /\/a\/show\/(\d+)/;
const PRICE_RE = /(?:от\s*)?[\d\s.,]+(?:млн|тыс)?\s*(?:₸|〒|тг|тенге)/iu;

function firstText($element: cheerio.Cheerio<AnyNode>, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const text = normalizeWhitespace($element.find(selector).first().text());
    if (text) return text;
  }
  return undefined;
}

function cleanTitle(value: string): string {
  return normalizeWhitespace(value).replace(/\s+/g, " ");
}

function textSnippet(value: string, maxLength = 180): string | undefined {
  const text = normalizeWhitespace(value);
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

export function extractListings(html: string, sourceUrl: string, limit = 5): ListingResult[] {
  if (html.includes("error-content__title")) {
    return [];
  }

  const $ = cheerio.load(html);
  const listings = new Map<string, ListingResult>();

  $('a[href*="/a/show/"]').each((_, element) => {
    if (listings.size >= limit) return;

    const $link = $(element);
    const href = $link.attr("href") ?? "";
    const advertId = href.match(ADVERT_RE)?.[1];
    if (!advertId || listings.has(advertId)) return;

    const url = new URL(href, sourceUrl).toString();
    const $card = $link.closest("article, [data-id], .a-card, .a-card__inc, .list-item, .serp-item").first();
    const $scope = $card.length ? $card : $link.parent();
    const cardText = normalizeWhitespace($scope.text());

    const title = cleanTitle(
      $link.attr("title") ??
        firstText($scope, [".a-card__title", "[class*='title']", "h2", "h3"]) ??
        $link.text(),
    );
    if (!title) return;

    const explicitPrice = firstText($scope, [".a-card__price", "[class*='price']"]);
    const price = explicitPrice ?? cardText.match(PRICE_RE)?.[0];
    const location = firstText($scope, [
      ".a-card__subtitle",
      ".a-card__location",
      "[class*='subtitle']",
      "[class*='location']",
      "[class*='address']",
    ]);
    const summary = textSnippet(cardText);
    const publishedAt = extractPublicDateText(cardText);

    listings.set(advertId, {
      id: advertId,
      advertId,
      url,
      title,
      ...(price ? { price: normalizeWhitespace(price) } : {}),
      ...(location ? { location: normalizeWhitespace(location) } : {}),
      ...(publishedAt ? { publishedAtText: publishedAt.text, publishedAtTimestamp: publishedAt.timestamp } : {}),
      ...(summary ? { summary } : {}),
    });
  });

  return [...listings.values()];
}
