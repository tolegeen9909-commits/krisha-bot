import type { SearchIntent } from "./types";
import type { ListingHistoryEntry, ListingResult } from "../storage/types";

export type EnrichListingsOptions = {
  history?: Record<string, ListingHistoryEntry>;
  now?: string;
};

export type MarketSnapshot = {
  status: "completed" | "insufficient_data";
  sampleSize: number;
  pricedCount: number;
  minPrice?: number;
  maxPrice?: number;
  medianPrice?: number;
  typicalLow?: number;
  typicalHigh?: number;
  cheapest: ListingResult[];
  expensive: ListingResult[];
  opportunities: ListingResult[];
  caveat: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function quantile(sortedValues: number[], q: number): number | undefined {
  if (sortedValues.length === 0) return undefined;
  const index = (sortedValues.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const lowerValue = sortedValues[lower];
  const upperValue = sortedValues[upper];
  if (lowerValue === undefined || upperValue === undefined) return undefined;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function parseListingPrice(price: string | undefined): number | undefined {
  if (!price) return undefined;
  const normalized = price
    .toLocaleLowerCase("ru")
    .replaceAll(",", ".")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/(?:от\s*)?([0-9]+(?:[ .][0-9]+)*)\s*(млрд|миллиард(?:ов|а)?|млн|миллион(?:ов|а)?|тыс|тысяч)?/iu);
  if (!match) return undefined;

  const amountRaw = match[1]?.replace(/\s+/g, "");
  if (!amountRaw) return undefined;
  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = match[2];
  if (unit?.startsWith("млрд") || unit?.startsWith("миллиард")) return Math.round(amount * 1_000_000_000);
  if (unit?.startsWith("млн") || unit?.startsWith("миллион")) return Math.round(amount * 1_000_000);
  if (unit?.startsWith("тыс") || unit?.startsWith("тысяч")) return Math.round(amount * 1_000);
  if (amount > 0 && amount < 1_000) return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function daysSince(timestamp: number | undefined, now: string): number | undefined {
  if (timestamp === undefined) return undefined;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return undefined;
  return Math.floor((nowMs - timestamp) / DAY_MS);
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

function collectComparableStats(listings: ListingResult[]): { prices: number[]; median?: number; q1?: number; q3?: number } {
  const prices = listings
    .map((listing) => listing.parsedPrice ?? parseListingPrice(listing.price))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const median = quantile(prices, 0.5);
  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);

  return {
    prices,
    ...(median !== undefined ? { median } : {}),
    ...(q1 !== undefined ? { q1 } : {}),
    ...(q3 !== undefined ? { q3 } : {}),
  };
}

function baseReasons(
  listing: ListingResult,
  intent: SearchIntent,
  stats: { median?: number; q1?: number; q3?: number },
  options: EnrichListingsOptions,
): string[] {
  const reasons: string[] = [];
  const now = options.now ?? new Date().toISOString();
  const history = options.history?.[listing.advertId];
  const parsedPrice = listing.parsedPrice ?? parseListingPrice(listing.price);
  const visibleDays = daysSince(listing.publishedAtTimestamp, now);
  const trackedDays = history ? daysSince(Date.parse(history.firstSeenAt), now) : undefined;

  if (options.history && !history) {
    reasons.push("новое для мониторинга");
  }

  if ((visibleDays !== undefined && visibleDays >= 30) || (trackedDays !== undefined && trackedDays >= 30)) {
    reasons.push("давно стоит");
  }

  if (history?.lastPrice !== undefined && parsedPrice !== undefined && parsedPrice < history.lastPrice) {
    reasons.push(`снизили цену: ${formatPrice(history.lastPrice)} -> ${formatPrice(parsedPrice)}`);
  }

  if (parsedPrice !== undefined && stats.median !== undefined && parsedPrice <= stats.median * 0.9) {
    reasons.push("ниже похожих на видимой выдаче");
  }

  if (
    parsedPrice !== undefined &&
    stats.median !== undefined &&
    parsedPrice >= stats.median * 1.15 &&
    ((visibleDays !== undefined && visibleDays >= 30) || (trackedDays !== undefined && trackedDays >= 30))
  ) {
    reasons.push("похоже на переоцененный старый объект");
  }

  if (intent.sellerType === "owner") reasons.push("поиск по хозяевам");
  if (intent.categorySlug === "prodazha/uchastkov") reasons.push("участок: отдельная работа с землей");
  if (intent.categorySlug === "prodazha/kommercheskaya-nedvizhimost") reasons.push("коммерция: потенциально высокий чек");
  if (!listing.summary || listing.summary.length < 80) reasons.push("слабая упаковка карточки");

  return [...new Set(reasons)];
}

export function enrichListingsForRealtor(
  listings: ListingResult[],
  intent: SearchIntent,
  options: EnrichListingsOptions = {},
): ListingResult[] {
  const pricedListings: ListingResult[] = listings.map((listing) => {
    const parsedPrice = listing.parsedPrice ?? parseListingPrice(listing.price);
    return parsedPrice !== undefined ? { ...listing, parsedPrice } : { ...listing };
  });
  const stats = collectComparableStats(pricedListings);

  return pricedListings.map((listing) => {
    const reasons = baseReasons(listing, intent, stats, options);
    const history = options.history?.[listing.advertId];
    const priceDrop =
      history?.lastPrice !== undefined && listing.parsedPrice !== undefined && listing.parsedPrice < history.lastPrice
        ? { from: history.lastPrice, to: listing.parsedPrice }
        : undefined;

    return {
      ...listing,
      ...(reasons.length > 0 ? { opportunityReasons: reasons } : {}),
      ...(priceDrop ? { priceDrop } : {}),
      ...(history?.firstSeenAt ? { firstSeenAt: history.firstSeenAt } : {}),
      ...(history?.lastSeenAt ? { lastSeenAt: history.lastSeenAt } : {}),
    };
  });
}

export function buildMarketSnapshot(listings: ListingResult[], intent: SearchIntent): MarketSnapshot {
  const enriched = enrichListingsForRealtor(listings, intent);
  const stats = collectComparableStats(enriched);
  const prices = stats.prices;

  const sortedPriced = enriched
    .filter((listing) => listing.parsedPrice !== undefined)
    .sort((left, right) => (left.parsedPrice ?? 0) - (right.parsedPrice ?? 0));

  return {
    status: prices.length >= 2 ? "completed" : "insufficient_data",
    sampleSize: listings.length,
    pricedCount: prices.length,
    ...(prices[0] !== undefined ? { minPrice: prices[0] } : {}),
    ...(prices[prices.length - 1] !== undefined ? { maxPrice: prices[prices.length - 1] } : {}),
    ...(stats.median !== undefined ? { medianPrice: Math.round(stats.median) } : {}),
    ...(stats.q1 !== undefined ? { typicalLow: Math.round(stats.q1) } : {}),
    ...(stats.q3 !== undefined ? { typicalHigh: Math.round(stats.q3) } : {}),
    cheapest: sortedPriced.slice(0, 3),
    expensive: [...sortedPriced].reverse().slice(0, 3),
    opportunities: enriched.filter((listing) => listing.opportunityReasons?.length).slice(0, 5),
    caveat: "Это рыночный снимок по видимым публичным объявлениям, не официальная оценка.",
  };
}

export function splitTrackedListings(listings: ListingResult[]): {
  newListings: ListingResult[];
  oldListings: ListingResult[];
  priceDrops: ListingResult[];
} {
  return {
    newListings: listings.filter((listing) => listing.opportunityReasons?.some((reason) => reason.includes("новое"))),
    oldListings: listings.filter((listing) => listing.opportunityReasons?.some((reason) => reason.includes("давно"))),
    priceDrops: listings.filter((listing) => listing.priceDrop || listing.opportunityReasons?.some((reason) => reason.includes("снизили"))),
  };
}

export function updateListingHistory(
  history: Record<string, ListingHistoryEntry>,
  listings: ListingResult[],
  seenAt: string,
  maxEntries = 500,
): Record<string, ListingHistoryEntry> {
  const next: Record<string, ListingHistoryEntry> = { ...history };

  for (const listing of listings) {
    const parsedPrice = listing.parsedPrice ?? parseListingPrice(listing.price);
    const previous = next[listing.advertId];
    next[listing.advertId] = {
      advertId: listing.advertId,
      title: listing.title,
      url: listing.url,
      firstSeenAt: previous?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      ...(parsedPrice !== undefined ? { lastPrice: parsedPrice } : previous?.lastPrice !== undefined ? { lastPrice: previous.lastPrice } : {}),
      ...(listing.price ? { lastPriceText: listing.price } : previous?.lastPriceText ? { lastPriceText: previous.lastPriceText } : {}),
    };
  }

  return Object.fromEntries(
    Object.entries(next)
      .sort(([, left], [, right]) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, maxEntries),
  );
}
