import { runPublicSearch, type PublicSearchResult } from "../krisha/searchRunner";
import { getMaxResults } from "../shared/config";
import {
  getSavedSearchListingHistory,
  listActiveSavedSearches,
  saveSavedSearchListingHistory,
  updateSavedSearch,
} from "../storage/blobStore";
import { filterUnseenListings } from "../storage/dedupe";
import type { SavedSearch, SavedSearchListingHistory } from "../storage/types";
import { enrichListingsForRealtor, updateListingHistory } from "./realtorAssistant";
import { formatSavedSearchAlert } from "./messages";
import { sendTelegramMessage } from "./telegramApi";

export type CheckSavedSearchesSummary = {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ savedSearchId: string; message: string }>;
};

type CheckSavedSearchesDeps = {
  listActiveSavedSearches: (limit: number) => Promise<SavedSearch[]>;
  updateSavedSearch: (savedSearch: SavedSearch) => Promise<SavedSearch>;
  getSavedSearchListingHistory: (savedSearchId: string) => Promise<SavedSearchListingHistory>;
  saveSavedSearchListingHistory: (history: SavedSearchListingHistory) => Promise<SavedSearchListingHistory>;
  runPublicSearch: (searchUrl: string, limit: number, intent: SavedSearch["intent"]) => Promise<PublicSearchResult>;
  sendTelegramMessage: (chatId: string, text: string) => Promise<void>;
  now: () => string;
  maxActiveSearches: number;
  maxNewListings: number;
};

const DEFAULT_MAX_ACTIVE_SEARCHES = 10;

function uniqueAdvertIds(...groups: Array<Iterable<string>>): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const id of group) {
      ids.add(id);
    }
  }
  return [...ids];
}

export async function checkSavedSearches(
  partialDeps: Partial<CheckSavedSearchesDeps> = {},
): Promise<CheckSavedSearchesSummary> {
  const deps: CheckSavedSearchesDeps = {
    listActiveSavedSearches,
    updateSavedSearch,
    getSavedSearchListingHistory,
    saveSavedSearchListingHistory,
    runPublicSearch,
    sendTelegramMessage,
    now: () => new Date().toISOString(),
    maxActiveSearches: DEFAULT_MAX_ACTIVE_SEARCHES,
    maxNewListings: getMaxResults(),
    ...partialDeps,
  };
  const summary: CheckSavedSearchesSummary = { checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  const searches = await deps.listActiveSavedSearches(deps.maxActiveSearches);

  for (const search of searches) {
    try {
      const history = await deps.getSavedSearchListingHistory(search.id);
      const fetched = await deps.runPublicSearch(search.searchUrl, deps.maxNewListings, search.intent);
      const checkedAt = deps.now();

      if (fetched.status !== "completed") {
        await deps.updateSavedSearch({ ...search, lastCheckedAt: checkedAt });
        summary.skipped += 1;
        continue;
      }

      const enrichedListings = enrichListingsForRealtor(fetched.listings, search.intent, {
        history: history.listings,
        now: checkedAt,
      });
      const knownAdvertIds = uniqueAdvertIds(search.sentAdvertIds, Object.keys(history.listings));
      const { unseen } = filterUnseenListings(enrichedListings, knownAdvertIds);
      const priceDrops = enrichedListings.filter((listing) => listing.priceDrop);
      const listingsToSend = [...new Map([...unseen, ...priceDrops].map((listing) => [listing.advertId, listing])).values()].slice(
        0,
        deps.maxNewListings,
      );
      const nextHistory = updateListingHistory(history.listings, enrichedListings, checkedAt);

      if (listingsToSend.length === 0) {
        await deps.updateSavedSearch({ ...search, sentAdvertIds: knownAdvertIds, lastCheckedAt: checkedAt });
        await deps.saveSavedSearchListingHistory({
          savedSearchId: search.id,
          listings: nextHistory,
          updatedAt: checkedAt,
        });
        summary.checked += 1;
        continue;
      }

      await deps.sendTelegramMessage(search.chatId, formatSavedSearchAlert(search, listingsToSend));

      const sentIds = listingsToSend.map((listing) => listing.advertId);
      const nextSentAdvertIds = uniqueAdvertIds(knownAdvertIds, sentIds);
      await deps.updateSavedSearch({
        ...search,
        sentAdvertIds: nextSentAdvertIds,
        sentCount: search.sentCount + listingsToSend.length,
        lastCheckedAt: checkedAt,
      });
      await deps.saveSavedSearchListingHistory({
        savedSearchId: search.id,
        listings: nextHistory,
        updatedAt: checkedAt,
      });
      summary.checked += 1;
      summary.sent += listingsToSend.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.errors.push({ savedSearchId: search.id, message });
      console.error("Saved search check failed", {
        savedSearchId: search.id,
        error: message,
      });
    }
  }

  return summary;
}
