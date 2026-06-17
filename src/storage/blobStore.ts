import { getStore } from "@netlify/blobs";
import type {
  CreateReminderTaskInput,
  CreateSavedSearchInput,
  CreateTaskInput,
  ReminderTask,
  SavedSearch,
  SavedSearchListingHistory,
  SavedSearchStatus,
  Task,
  TaskResult,
  TaskStatus,
} from "./types";

const TASKS_STORE = "krisha-tasks";
const RESULTS_STORE = "krisha-results";
const CHAT_STORE = "krisha-chat-index";
const SAVED_SEARCHES_STORE = "krisha-saved-searches";
const SAVED_SEARCH_INDEX_STORE = "krisha-saved-search-indexes";
const SAVED_SEARCH_HISTORY_STORE = "krisha-saved-search-history";
const REMINDER_TASKS_STORE = "krisha-reminder-tasks";
const REMINDER_TASK_INDEX_STORE = "krisha-reminder-task-indexes";
const ACTIVE_SAVED_SEARCH_IDS_KEY = "active-saved-search-ids";
const DUE_REMINDER_TASK_IDS_KEY = "due-reminder-task-ids";

function nowIso(): string {
  return new Date().toISOString();
}

function taskKey(taskId: string): string {
  return `task:${taskId}`;
}

function resultKey(taskId: string): string {
  return `result:${taskId}`;
}

function chatKey(chatId: string): string {
  return `last-task:${chatId}`;
}

function savedSearchKey(savedSearchId: string): string {
  return `saved-search:${savedSearchId}`;
}

function savedSearchHistoryKey(savedSearchId: string): string {
  return `saved-search-history:${savedSearchId}`;
}

function reminderTaskKey(taskId: string): string {
  return `reminder-task:${taskId}`;
}

function chatSavedSearchIndexKey(chatId: string): string {
  return `chat-saved-searches:${chatId}`;
}

function chatReminderTaskIndexKey(chatId: string): string {
  return `chat-reminder-tasks:${chatId}`;
}

function tasksStore() {
  return getStore({ name: TASKS_STORE, consistency: "strong" });
}

function resultsStore() {
  return getStore({ name: RESULTS_STORE, consistency: "strong" });
}

function chatStore() {
  return getStore({ name: CHAT_STORE, consistency: "strong" });
}

function savedSearchesStore() {
  return getStore({ name: SAVED_SEARCHES_STORE, consistency: "strong" });
}

function savedSearchIndexStore() {
  return getStore({ name: SAVED_SEARCH_INDEX_STORE, consistency: "strong" });
}

function savedSearchHistoryStore() {
  return getStore({ name: SAVED_SEARCH_HISTORY_STORE, consistency: "strong" });
}

function reminderTasksStore() {
  return getStore({ name: REMINDER_TASKS_STORE, consistency: "strong" });
}

function reminderTaskIndexStore() {
  return getStore({ name: REMINDER_TASK_INDEX_STORE, consistency: "strong" });
}

async function getStringArray(store: ReturnType<typeof getStore>, key: string): Promise<string[]> {
  const value = (await store.get(key, { type: "json" })) as string[] | null;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function addToStringArrayIndex(store: ReturnType<typeof getStore>, storeKey: string, id: string): Promise<void> {
  const ids = await getStringArray(store, storeKey);
  if (!ids.includes(id)) {
    ids.push(id);
    await store.setJSON(storeKey, ids);
  }
}

async function saveTask(task: Task): Promise<Task> {
  await tasksStore().setJSON(taskKey(task.id), task);
  await chatStore().set(chatKey(task.chatId), task.id);
  return task;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const timestamp = nowIso();
  const task: Task = {
    id: crypto.randomUUID(),
    chatId: input.chatId,
    rawText: input.rawText,
    intent: input.intent,
    searchUrl: input.searchUrl,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    geoName: input.geoName,
    geoPath: input.geoPath,
    status: "created",
    createdAt: timestamp,
    updatedAt: timestamp,
    resultCount: 0,
  };

  return saveTask(task);
}

export async function updateTaskStatus(
  task: Task,
  status: TaskStatus,
  resultCount: number,
  error?: string,
): Promise<Task> {
  const next: Task = {
    ...task,
    status,
    resultCount,
    updatedAt: nowIso(),
    ...(error ? { error } : {}),
  };

  return saveTask(next);
}

export async function saveTaskResult(result: TaskResult): Promise<void> {
  await resultsStore().setJSON(resultKey(result.taskId), result);
}

export async function getTask(taskId: string): Promise<Task | null> {
  return (await tasksStore().get(taskKey(taskId), { type: "json" })) as Task | null;
}

export async function getTaskResult(taskId: string): Promise<TaskResult | null> {
  return (await resultsStore().get(resultKey(taskId), { type: "json" })) as TaskResult | null;
}

export async function getLastTaskForChat(chatId: string): Promise<{ task: Task; result: TaskResult | null } | null> {
  const taskId = await chatStore().get(chatKey(chatId));
  if (!taskId) return null;

  const task = await getTask(taskId);
  if (!task) return null;

  return {
    task,
    result: await getTaskResult(task.id),
  };
}

async function saveSavedSearch(savedSearch: SavedSearch): Promise<SavedSearch> {
  await savedSearchesStore().setJSON(savedSearchKey(savedSearch.id), savedSearch);
  return savedSearch;
}

async function addToIndex(storeKey: string, id: string): Promise<void> {
  const store = savedSearchIndexStore();
  await addToStringArrayIndex(store, storeKey, id);
}

async function removeFromIndex(storeKey: string, id: string): Promise<void> {
  const store = savedSearchIndexStore();
  const ids = await getStringArray(store, storeKey);
  const nextIds = ids.filter((item) => item !== id);
  if (nextIds.length !== ids.length) {
    await store.setJSON(storeKey, nextIds);
  }
}

export async function createSavedSearch(input: CreateSavedSearchInput): Promise<SavedSearch> {
  const timestamp = nowIso();
  const savedSearch: SavedSearch = {
    id: crypto.randomUUID().slice(0, 8),
    chatId: input.chatId,
    rawText: input.rawText,
    intent: input.intent,
    searchUrl: input.searchUrl,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    geoName: input.geoName,
    geoPath: input.geoPath,
    status: "active",
    sentAdvertIds: [],
    sentCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await saveSavedSearch(savedSearch);
  await addToIndex(chatSavedSearchIndexKey(input.chatId), savedSearch.id);
  await addToIndex(ACTIVE_SAVED_SEARCH_IDS_KEY, savedSearch.id);

  return savedSearch;
}

export async function updateSavedSearch(savedSearch: SavedSearch): Promise<SavedSearch> {
  const next: SavedSearch = {
    ...savedSearch,
    updatedAt: nowIso(),
  };
  await saveSavedSearch(next);
  return next;
}

export async function updateSavedSearchStatus(
  savedSearch: SavedSearch,
  status: SavedSearchStatus,
): Promise<SavedSearch> {
  const next = await updateSavedSearch({ ...savedSearch, status });
  if (status === "active") {
    await addToIndex(ACTIVE_SAVED_SEARCH_IDS_KEY, savedSearch.id);
  } else {
    await removeFromIndex(ACTIVE_SAVED_SEARCH_IDS_KEY, savedSearch.id);
  }
  return next;
}

export async function getSavedSearch(savedSearchId: string): Promise<SavedSearch | null> {
  return (await savedSearchesStore().get(savedSearchKey(savedSearchId), { type: "json" })) as SavedSearch | null;
}

export async function listSavedSearchesForChat(chatId: string): Promise<SavedSearch[]> {
  const ids = await getStringArray(savedSearchIndexStore(), chatSavedSearchIndexKey(chatId));
  const searches = await Promise.all(ids.map((id) => getSavedSearch(id)));
  return searches.filter((search): search is SavedSearch => Boolean(search));
}

export async function listActiveSavedSearches(limit: number): Promise<SavedSearch[]> {
  const ids = await getStringArray(savedSearchIndexStore(), ACTIVE_SAVED_SEARCH_IDS_KEY);
  const searches = await Promise.all(ids.slice(0, limit).map((id) => getSavedSearch(id)));
  return searches.filter((search): search is SavedSearch => search !== null && search.status === "active");
}

export async function getSavedSearchListingHistory(savedSearchId: string): Promise<SavedSearchListingHistory> {
  const history = (await savedSearchHistoryStore().get(savedSearchHistoryKey(savedSearchId), {
    type: "json",
  })) as SavedSearchListingHistory | null;

  return (
    history ?? {
      savedSearchId,
      listings: {},
      updatedAt: nowIso(),
    }
  );
}

export async function saveSavedSearchListingHistory(
  history: SavedSearchListingHistory,
): Promise<SavedSearchListingHistory> {
  const next: SavedSearchListingHistory = {
    ...history,
    updatedAt: nowIso(),
  };
  await savedSearchHistoryStore().setJSON(savedSearchHistoryKey(history.savedSearchId), next);
  return next;
}

async function saveReminderTask(task: ReminderTask): Promise<ReminderTask> {
  await reminderTasksStore().setJSON(reminderTaskKey(task.id), task);
  return task;
}

export async function createReminderTask(input: CreateReminderTaskInput): Promise<ReminderTask> {
  const timestamp = nowIso();
  const task: ReminderTask = {
    id: crypto.randomUUID().slice(0, 8),
    chatId: input.chatId,
    text: input.text,
    status: "active",
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await saveReminderTask(task);
  const indexStore = reminderTaskIndexStore();
  await addToStringArrayIndex(indexStore, chatReminderTaskIndexKey(input.chatId), task.id);
  if (task.dueAt) {
    await addToStringArrayIndex(indexStore, DUE_REMINDER_TASK_IDS_KEY, task.id);
  }

  return task;
}

export async function getReminderTask(taskId: string): Promise<ReminderTask | null> {
  return (await reminderTasksStore().get(reminderTaskKey(taskId), { type: "json" })) as ReminderTask | null;
}

export async function updateReminderTask(task: ReminderTask): Promise<ReminderTask> {
  const next: ReminderTask = {
    ...task,
    updatedAt: nowIso(),
  };
  await saveReminderTask(next);
  if (next.dueAt) {
    await addToStringArrayIndex(reminderTaskIndexStore(), DUE_REMINDER_TASK_IDS_KEY, next.id);
  }
  return next;
}

export async function listReminderTasksForChat(chatId: string): Promise<ReminderTask[]> {
  const ids = await getStringArray(reminderTaskIndexStore(), chatReminderTaskIndexKey(chatId));
  const tasks = await Promise.all(ids.map((id) => getReminderTask(id)));
  return tasks
    .filter((task): task is ReminderTask => task !== null && task.status !== "deleted")
    .sort((left, right) => {
      const leftDate = left.dueAt ?? left.createdAt;
      const rightDate = right.dueAt ?? right.createdAt;
      return leftDate.localeCompare(rightDate);
    });
}

export async function listDueReminderTasks(now: string, limit: number): Promise<ReminderTask[]> {
  const ids = await getStringArray(reminderTaskIndexStore(), DUE_REMINDER_TASK_IDS_KEY);
  const tasks = await Promise.all(ids.slice(0, Math.max(limit * 5, limit)).map((id) => getReminderTask(id)));
  return tasks
    .filter(
      (task): task is ReminderTask =>
        task !== null &&
        task.status === "active" &&
        Boolean(task.dueAt) &&
        !task.remindedAt &&
        task.dueAt! <= now,
    )
    .sort((left, right) => (left.dueAt ?? "").localeCompare(right.dueAt ?? ""))
    .slice(0, limit);
}
