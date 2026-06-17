import type { SearchIntent } from "../bot/types";
import type { SupportedCategorySlug } from "../krisha/reference";

export type TaskStatus = "created" | "completed" | "fetch_disabled" | "fetch_failed";
export type SavedSearchStatus = "active" | "stopped";
export type ReminderTaskStatus = "active" | "done" | "deleted";

export type Task = {
  id: string;
  chatId: string;
  rawText: string;
  intent: SearchIntent;
  searchUrl: string;
  categorySlug: SupportedCategorySlug;
  categoryName: string;
  geoName: string;
  geoPath: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  resultCount: number;
  error?: string;
};

export type ListingResult = {
  id: string;
  advertId: string;
  url: string;
  title: string;
  price?: string;
  parsedPrice?: number;
  location?: string;
  publishedAtText?: string;
  publishedAtTimestamp?: number;
  summary?: string;
  opportunityReasons?: string[];
  priceDrop?: {
    from: number;
    to: number;
  };
  firstSeenAt?: string;
  lastSeenAt?: string;
};

export type TaskResult = {
  taskId: string;
  sourceUrl: string;
  status: TaskStatus;
  listings: ListingResult[];
  fetchedAt: string;
  error?: string;
};

export type CreateTaskInput = {
  chatId: string;
  rawText: string;
  intent: SearchIntent;
  searchUrl: string;
  categorySlug: SupportedCategorySlug;
  categoryName: string;
  geoName: string;
  geoPath: string;
};

export type SavedSearch = {
  id: string;
  chatId: string;
  rawText: string;
  intent: SearchIntent;
  searchUrl: string;
  categorySlug: SupportedCategorySlug;
  categoryName: string;
  geoName: string;
  geoPath: string;
  status: SavedSearchStatus;
  sentAdvertIds: string[];
  sentCount: number;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateSavedSearchInput = {
  chatId: string;
  rawText: string;
  intent: SearchIntent;
  searchUrl: string;
  categorySlug: SupportedCategorySlug;
  categoryName: string;
  geoName: string;
  geoPath: string;
};

export type ListingHistoryEntry = {
  advertId: string;
  title: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastPrice?: number;
  lastPriceText?: string;
};

export type SavedSearchListingHistory = {
  savedSearchId: string;
  listings: Record<string, ListingHistoryEntry>;
  updatedAt: string;
};

export type ReminderTask = {
  id: string;
  chatId: string;
  text: string;
  status: ReminderTaskStatus;
  dueAt?: string;
  remindedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateReminderTaskInput = {
  chatId: string;
  text: string;
  dueAt?: string;
};
