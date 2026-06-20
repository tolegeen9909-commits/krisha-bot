import type { Config, Context } from "@netlify/functions";
import { isChatAllowed, isWebhookSecretValid } from "../../src/bot/auth";
import { parseBotCommandAsync } from "../../src/bot/commandParser";
import { isContextUpdate } from "../../src/bot/contextMerge";
import {
  formatHelpMessage,
  formatManualSavedSearchCheckSummary,
  formatMarketAnalysisResponse,
  formatParseError,
  formatRealEstateQaResponse,
  formatReminderTaskCompleted,
  formatReminderTaskCreated,
  formatReminderTaskDeleted,
  formatReminderTaskList,
  formatReminderTaskNotFound,
  formatSavedSearchCreated,
  formatSavedSearchList,
  formatSavedSearchNotFound,
  formatSavedSearchStopped,
  formatSearchResponse,
  formatStatusMessage,
  formatTrackedObjectsResponse,
} from "../../src/bot/messages";
import { answerRealEstateQuestion } from "../../src/bot/realEstateQa";
import { checkSavedSearches } from "../../src/bot/savedSearchChecker";
import {
  buildMarketSnapshot,
  enrichListingsForRealtor,
  updateListingHistory,
} from "../../src/bot/realtorAssistant";
import { buildKrishaSearchUrl } from "../../src/krisha/urlBuilder";
import { runPublicSearch } from "../../src/krisha/searchRunner";
import { getAllowedChatIds, getMaxResults, getOptionalWebhookSecret } from "../../src/shared/config";
import { jsonResponse, methodNotAllowed } from "../../src/shared/http";
import {
  createSavedSearch,
  createTask,
  createReminderTask,
  getReminderTask,
  getSavedSearchListingHistory,
  getSavedSearch,
  getLastTaskForChat,
  listReminderTasksForChat,
  listSavedSearchesForChat,
  saveSavedSearchListingHistory,
  saveTaskResult,
  updateReminderTask,
  updateSavedSearch,
  updateSavedSearchStatus,
  updateTaskStatus,
} from "../../src/storage/blobStore";
import { filterUnseenListings } from "../../src/storage/dedupe";
import type { Task, TaskResult } from "../../src/storage/types";
import { getCategoryName } from "../../src/krisha/reference";
import type { SearchIntent } from "../../src/bot/types";

type TelegramChat = {
  id: number | string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: TelegramChat;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

function telegramMessage(chatId: string | number, text: string, status = 200): Response {
  return jsonResponse(
    {
      method: "sendMessage",
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
    { status },
  );
}

async function completeTask(task: Task, fetched: Awaited<ReturnType<typeof runPublicSearch>>): Promise<TaskResult> {
  const updated = await updateTaskStatus(task, fetched.status, fetched.listings.length, fetched.error);
  const result: TaskResult = {
    taskId: updated.id,
    sourceUrl: updated.searchUrl,
    status: updated.status,
    listings: fetched.listings,
    fetchedAt: updated.updatedAt,
    ...(updated.error ? { error: updated.error } : {}),
  };
  await saveTaskResult(result);
  return result;
}

function findMatchingSavedSearch(
  searches: Awaited<ReturnType<typeof listSavedSearchesForChat>>,
  intent: SearchIntent,
  searchUrl: string,
) {
  const activeSearches = searches
    .filter((search) => search.status === "active")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    activeSearches.find((search) => search.searchUrl === searchUrl) ??
    activeSearches.find(
      (search) => search.categorySlug === intent.categorySlug && search.geoPath === intent.geo.url_path,
    )
  );
}

async function getPreviousIntentForChat(chatId: string): Promise<SearchIntent | undefined> {
  const last = await getLastTaskForChat(chatId);
  if (last) return last.task.intent;

  const searches = await listSavedSearchesForChat(chatId);
  const latest = [...searches].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return latest?.intent;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return methodNotAllowed();

  const configuredSecret = getOptionalWebhookSecret();
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isWebhookSecretValid(receivedSecret, configuredSecret)) {
    return jsonResponse({ ok: false, error: "Invalid Telegram webhook secret" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = update.message ?? update.edited_message;
  if (!message) return jsonResponse({ ok: true });

  const chatId = String(message.chat.id);
  if (!isChatAllowed(chatId, getAllowedChatIds())) {
    return telegramMessage(chatId, "Доступ к этому боту закрыт.");
  }

  const text = message.text?.trim();
  if (!text) {
    return telegramMessage(chatId, "Отправьте текстовый запрос.");
  }

  const previousIntent = isContextUpdate(text) ? await getPreviousIntentForChat(chatId) : undefined;
  const parsed = await parseBotCommandAsync(text, previousIntent ? { previousIntent } : {});
  if (!parsed.ok) {
    return telegramMessage(chatId, formatParseError(parsed.message));
  }

  if (parsed.command.kind === "help") {
    return telegramMessage(chatId, formatHelpMessage());
  }

  if (parsed.command.kind === "status") {
    const last = await getLastTaskForChat(chatId);
    if (!last) return telegramMessage(chatId, "Пока нет сохраненных запросов.");
    return telegramMessage(chatId, formatStatusMessage(last.task, last.result));
  }

  if (parsed.command.kind === "list_searches") {
    const searches = await listSavedSearchesForChat(chatId);
    return telegramMessage(chatId, formatSavedSearchList(searches));
  }

  if (parsed.command.kind === "check_searches") {
    const activeSearches = (await listSavedSearchesForChat(chatId)).filter((search) => search.status === "active");
    if (activeSearches.length === 0) {
      return telegramMessage(
        chatId,
        "Активных поисков нет. Сначала сохраните поиск: <code>следи за 2-комн Алматы до 45 млн</code>",
      );
    }

    const summary = await checkSavedSearches({
      maxActiveSearches: activeSearches.length,
      listActiveSavedSearches: async (limit) => activeSearches.slice(0, limit),
    });
    return telegramMessage(chatId, formatManualSavedSearchCheckSummary(summary));
  }

  if (parsed.command.kind === "stop_search") {
    const savedSearch = await getSavedSearch(parsed.command.savedSearchId);
    if (!savedSearch || savedSearch.chatId !== chatId) {
      return telegramMessage(chatId, formatSavedSearchNotFound(parsed.command.savedSearchId));
    }

    const stopped = await updateSavedSearchStatus(savedSearch, "stopped");
    return telegramMessage(chatId, formatSavedSearchStopped(stopped));
  }

  if (parsed.command.kind === "create_task") {
    const task = await createReminderTask({
      chatId,
      text: parsed.command.text,
      ...(parsed.command.dueAt ? { dueAt: parsed.command.dueAt } : {}),
    });
    return telegramMessage(chatId, formatReminderTaskCreated(task));
  }

  if (parsed.command.kind === "list_tasks") {
    const tasks = await listReminderTasksForChat(chatId);
    return telegramMessage(chatId, formatReminderTaskList(tasks));
  }

  if (parsed.command.kind === "complete_task") {
    const task = await getReminderTask(parsed.command.taskId);
    if (!task || task.chatId !== chatId || task.status === "deleted") {
      return telegramMessage(chatId, formatReminderTaskNotFound(parsed.command.taskId));
    }
    const completed = await updateReminderTask({ ...task, status: "done" });
    return telegramMessage(chatId, formatReminderTaskCompleted(completed));
  }

  if (parsed.command.kind === "delete_task") {
    const task = await getReminderTask(parsed.command.taskId);
    if (!task || task.chatId !== chatId || task.status === "deleted") {
      return telegramMessage(chatId, formatReminderTaskNotFound(parsed.command.taskId));
    }
    const deleted = await updateReminderTask({ ...task, status: "deleted" });
    return telegramMessage(chatId, formatReminderTaskDeleted(deleted));
  }

  if (parsed.command.kind === "real_estate_qa") {
    const answer = await answerRealEstateQuestion(parsed.command.question);
    return telegramMessage(chatId, formatRealEstateQaResponse(answer));
  }

  const intent = parsed.command.intent;
  const searchUrl = buildKrishaSearchUrl(intent);

  if (parsed.command.kind === "save_search") {
    const savedSearch = await createSavedSearch({
      chatId,
      rawText: parsed.command.sourceText,
      intent,
      searchUrl,
      categorySlug: intent.categorySlug,
      categoryName: getCategoryName(intent.categorySlug),
      geoName: intent.geo.name,
      geoPath: intent.geo.url_path,
    });
    const fetched = await runPublicSearch(searchUrl, getMaxResults(), intent);
    const fetchedAt = new Date().toISOString();
    const listings =
      fetched.status === "completed"
        ? enrichListingsForRealtor(fetched.listings, intent, { history: {}, now: fetchedAt })
        : fetched.listings;
    const result: TaskResult = {
      taskId: savedSearch.id,
      sourceUrl: savedSearch.searchUrl,
      status: fetched.status,
      listings,
      fetchedAt,
      ...(fetched.error ? { error: fetched.error } : {}),
    };

    let nextSavedSearch = savedSearch;
    if (fetched.status === "completed") {
      const { nextSeenAdvertIds } = filterUnseenListings(listings, savedSearch.sentAdvertIds);
      const listingHistory = updateListingHistory({}, listings, fetchedAt);
      nextSavedSearch = await updateSavedSearch({
        ...savedSearch,
        sentAdvertIds: nextSeenAdvertIds,
        sentCount: nextSeenAdvertIds.length,
        lastCheckedAt: fetchedAt,
      });
      await saveSavedSearchListingHistory({
        savedSearchId: savedSearch.id,
        listings: listingHistory,
        updatedAt: fetchedAt,
      });
    }

    return telegramMessage(chatId, formatSavedSearchCreated(nextSavedSearch, result));
  }

  if (parsed.command.kind === "market_analysis") {
    const task = await createTask({
      chatId,
      rawText: text,
      intent,
      searchUrl,
      categorySlug: intent.categorySlug,
      categoryName: getCategoryName(intent.categorySlug),
      geoName: intent.geo.name,
      geoPath: intent.geo.url_path,
    });
    const fetched = await runPublicSearch(searchUrl, getMaxResults(), intent);
    const enrichedFetched =
      fetched.status === "completed"
        ? { ...fetched, listings: enrichListingsForRealtor(fetched.listings, intent) }
        : fetched;
    const result = await completeTask(task, enrichedFetched);

    if (result.status !== "completed") {
      return telegramMessage(
        chatId,
        formatSearchResponse({ ...task, status: result.status, resultCount: result.listings.length }, result),
      );
    }

    const snapshot = buildMarketSnapshot(result.listings, intent);
    return telegramMessage(chatId, formatMarketAnalysisResponse(intent, searchUrl, snapshot));
  }

  if (parsed.command.kind === "tracked_objects") {
    const savedSearches = await listSavedSearchesForChat(chatId);
    const matchingSearch = findMatchingSavedSearch(savedSearches, intent, searchUrl);
    const history = matchingSearch ? await getSavedSearchListingHistory(matchingSearch.id) : undefined;
    const hadHistory = Boolean(history && Object.keys(history.listings).length > 0);
    const fetchedAt = new Date().toISOString();
    const task = await createTask({
      chatId,
      rawText: text,
      intent,
      searchUrl,
      categorySlug: intent.categorySlug,
      categoryName: getCategoryName(intent.categorySlug),
      geoName: intent.geo.name,
      geoPath: intent.geo.url_path,
    });
    const fetched = await runPublicSearch(searchUrl, getMaxResults(), intent);
    const listings =
      fetched.status === "completed"
        ? enrichListingsForRealtor(fetched.listings, intent, {
            ...(history ? { history: history.listings } : {}),
            now: fetchedAt,
          })
        : fetched.listings;
    const result = await completeTask(task, { ...fetched, listings });

    if (result.status !== "completed") {
      return telegramMessage(
        chatId,
        formatSearchResponse({ ...task, status: result.status, resultCount: result.listings.length }, result),
      );
    }

    if (matchingSearch) {
      await saveSavedSearchListingHistory({
        savedSearchId: matchingSearch.id,
        listings: updateListingHistory(history?.listings ?? {}, result.listings, fetchedAt),
        updatedAt: fetchedAt,
      });
    }

    return telegramMessage(chatId, formatTrackedObjectsResponse(intent, searchUrl, result.listings, hadHistory));
  }

  const task = await createTask({
    chatId,
    rawText: text,
    intent,
    searchUrl,
    categorySlug: intent.categorySlug,
    categoryName: getCategoryName(intent.categorySlug),
    geoName: intent.geo.name,
    geoPath: intent.geo.url_path,
  });
  const fetched = await runPublicSearch(searchUrl, getMaxResults(), intent);
  const enrichedFetched =
    fetched.status === "completed"
      ? { ...fetched, listings: enrichListingsForRealtor(fetched.listings, intent) }
      : fetched;
  const result = await completeTask(task, enrichedFetched);

  return telegramMessage(chatId, formatSearchResponse({ ...task, status: result.status, resultCount: result.listings.length }, result));
};

export const config: Config = {
  path: "/api/telegram",
  method: ["POST"],
};
