import { describe, expect, it } from "vitest";
import {
  formatDueReminderMessage,
  formatManualSavedSearchCheckSummary,
  formatMarketAnalysisResponse,
  formatReminderTaskCreated,
  formatReminderTaskList,
  formatSavedSearchList,
  formatSearchResponse,
  formatTrackedObjectsResponse,
} from "../src/bot/messages";
import type { SearchIntent } from "../src/bot/types";
import type { ListingResult, ReminderTask, SavedSearch, Task, TaskResult } from "../src/storage/types";

const intent: SearchIntent = {
  rawText: "двушка Алматы до 45 млн",
  categorySlug: "prodazha/kvartiry",
  geo: {
    name: "Алматы",
    slug: "almaty",
    type: "city",
    url_path: "almaty",
    parent_url_path: null,
    verified: true,
    in_sitemap: true,
    name_source: "test",
  },
  priceTo: 45_000_000,
  rooms: ["2"],
};

const listing: ListingResult = {
  id: "1",
  advertId: "1",
  title: "Listing 1",
  url: "https://krisha.kz/a/show/1",
  price: "40 000 000 ₸",
  opportunityReasons: ["ниже похожих на видимой выдаче"],
};

const reminderTask: ReminderTask = {
  id: "abc12345",
  chatId: "123",
  text: "позвонить продавцу",
  status: "active",
  dueAt: "2026-06-18T05:00:00.000Z",
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z",
};

describe("saved search messages", () => {
  it("shows saved search id and status in the list", () => {
    const message = formatSavedSearchList([
      {
        id: "abc12345",
        chatId: "123",
        rawText: "квартиры Алматы до 60 млн",
        intent: {
          rawText: "квартиры Алматы до 60 млн",
          categorySlug: "prodazha/kvartiry",
          geo: {
            name: "Алматы",
            slug: "almaty",
            type: "city",
            url_path: "almaty",
            parent_url_path: null,
            verified: true,
            in_sitemap: true,
            name_source: "test",
          },
          priceTo: 60_000_000,
        },
        searchUrl: "https://krisha.kz/prodazha/kvartiry/almaty/",
        categorySlug: "prodazha/kvartiry",
        categoryName: "Продажа квартир",
        geoName: "Алматы",
        geoPath: "almaty",
        status: "active",
        sentAdvertIds: [],
        sentCount: 0,
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
      } satisfies SavedSearch,
    ]);

    expect(message).toContain("abc12345");
    expect(message).toContain("активен");
    expect(message).toContain("Алматы");
    expect(message).toContain("проверь мои поиски");
  });

  it("formats manual saved search check summary", () => {
    const message = formatManualSavedSearchCheckSummary({ checked: 1, sent: 0, failed: 0, skipped: 0 });

    expect(message).toContain("Проверка поисков");
    expect(message).toContain("Новых объявлений");
  });

  it("formats market analysis with visible-market caveat", () => {
    const message = formatMarketAnalysisResponse(intent, "https://krisha.kz/prodazha/kvartiry/almaty/", {
      status: "completed",
      sampleSize: 3,
      pricedCount: 3,
      minPrice: 35_000_000,
      maxPrice: 45_000_000,
      medianPrice: 40_000_000,
      typicalLow: 37_000_000,
      typicalHigh: 43_000_000,
      cheapest: [listing],
      expensive: [],
      opportunities: [listing],
      caveat: "Это рыночный снимок по видимым публичным объявлениям, не официальная оценка.",
    });

    expect(message).toContain("Анализ рынка");
    expect(message).toContain("Медиана");
    expect(message).toContain("не официальная оценка");
  });

  it("formats tracked objects without history as a setup hint", () => {
    const message = formatTrackedObjectsResponse(intent, "https://krisha.kz/prodazha/kvartiry/almaty/", [listing], false);

    expect(message).toContain("Новые и старые объекты");
    expect(message).toContain("Истории по этому сегменту пока нет");
    expect(message).toContain("Почему важно");
  });

  it("formats task and reminder messages", () => {
    const created = formatReminderTaskCreated(reminderTask);
    const list = formatReminderTaskList([reminderTask]);
    const due = formatDueReminderMessage(reminderTask);

    expect(created).toContain("Напоминание создано");
    expect(created).toContain("abc12345");
    expect(list).toContain("Мои задачи");
    expect(list).toContain("позвонить продавцу");
    expect(due).toContain("Напоминание");
    expect(due).toContain("готово abc12345");
  });

  it("explains strict residential-complex no-match results", () => {
    const task: Task = {
      id: "task1",
      chatId: "123",
      rawText: "двушка Алматы ЖК Rams City",
      intent: { ...intent, residentialComplexName: "Rams City" },
      searchUrl: "https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City",
      categorySlug: "prodazha/kvartiry",
      categoryName: "Продажа квартир",
      geoName: "Алматы",
      geoPath: "almaty",
      status: "completed",
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
      resultCount: 0,
    };
    const result: TaskResult = {
      taskId: "task1",
      sourceUrl: task.searchUrl,
      status: "completed",
      listings: [],
      fetchedAt: "2026-06-17T00:00:00.000Z",
    };

    const message = formatSearchResponse(task, result);

    expect(message).toContain("ЖК Rams City");
    expect(message).toContain("не нашел карточки");
  });
});
