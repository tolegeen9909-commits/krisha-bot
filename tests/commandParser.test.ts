import { describe, expect, it } from "vitest";
import { parseBotCommand, parseBotCommandAsync } from "../src/bot/commandParser";

describe("parseBotCommand", () => {
  it("parses apartment sale request with rooms and max price", () => {
    const parsed = parseBotCommand("квартиры на продажу в Астане 2-3 комнаты до 60 млн");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("astana");
    expect(parsed.command.intent.priceTo).toBe(60_000_000);
    expect(parsed.command.intent.rooms).toEqual(["2", "3"]);
  });

  it("parses land plot request", () => {
    const parsed = parseBotCommand("дай участки на продажу в Алматы до 30 млн");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/uchastkov");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.priceTo).toBe(30_000_000);
  });

  it("parses range price and plus rooms", () => {
    const parsed = parseBotCommand("квартиры на продажу в Алматы 3+ от 20 млн до 60 млн");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.priceFrom).toBe(20_000_000);
    expect(parsed.command.intent.priceTo).toBe(60_000_000);
    expect(parsed.command.intent.rooms).toEqual(["3", "4", "5.100"]);
  });

  it("detects oldest-first sorting phrases", () => {
    const parsed = parseBotCommand("квартиры на продажу в Алматы до 60 млн сначала те что давно продаются");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.sort).toBe("oldest_first");
  });

  it("returns status command", () => {
    const parsed = parseBotCommand("статус последнего запроса");

    expect(parsed).toEqual({ ok: true, command: { kind: "status" } });
  });

  it("parses task commands before search fallback", () => {
    expect(parseBotCommand("мои задачи")).toEqual({ ok: true, command: { kind: "list_tasks" } });
    expect(parseBotCommand("готово abc12345")).toEqual({
      ok: true,
      command: { kind: "complete_task", taskId: "abc12345" },
    });
    expect(parseBotCommand("удали задачу abc12345")).toEqual({
      ok: true,
      command: { kind: "delete_task", taskId: "abc12345" },
    });
  });

  it("parses reminder creation command", () => {
    const parsed = parseBotCommand("напомни через 30 минут позвонить продавцу");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task command");
    expect(parsed.command.text).toBe("позвонить продавцу");
    expect(parsed.command.dueAt).toBeDefined();
  });

  it("parses saved search request and infers apartments from room count", () => {
    const parsed = parseBotCommand("следи за 2-комн Алматы до 45 млн");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "save_search") throw new Error("Expected save_search command");

    expect(parsed.command.sourceText).toBe("2-комн Алматы до 45 млн");
    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.priceTo).toBe(45_000_000);
    expect(parsed.command.intent.rooms).toEqual(["2"]);
  });

  it("parses market analysis command", () => {
    const parsed = parseBotCommand("анализ рынка двушка Алматы до 45");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "market_analysis") throw new Error("Expected market_analysis command");

    expect(parsed.command.sourceText).toBe("двушка Алматы до 45");
    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.priceTo).toBe(45_000_000);
    expect(parsed.command.intent.rooms).toEqual(["2"]);
  });

  it("parses tracked objects command", () => {
    const parsed = parseBotCommand("новые и старые участки Алматы ИЖС");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "tracked_objects") throw new Error("Expected tracked_objects command");

    expect(parsed.command.sourceText).toBe("участки Алматы ИЖС");
    expect(parsed.command.intent.categorySlug).toBe("prodazha/uchastkov");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.landPurpose).toBe("izhs");
  });

  it("parses residential complex names and stops before filters", () => {
    const parsed = parseBotCommand("двушка Алматы ЖК Rams City до 60");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.rooms).toEqual(["2"]);
    expect(parsed.command.intent.priceTo).toBe(60_000_000);
    expect(parsed.command.intent.residentialComplexName).toBe("Rams City");
  });

  it("infers apartments from residential complex request", () => {
    const parsed = parseBotCommand("жилой комплекс Terracotta Астана");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("astana");
    expect(parsed.command.intent.residentialComplexName).toBe("Terracotta");
  });

  it("parses informal rich apartment request", () => {
    const parsed = parseBotCommand("двушка Алматы до 45 хозяева не первый кирпич");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.rooms).toEqual(["2"]);
    expect(parsed.command.intent.priceTo).toBe(45_000_000);
    expect(parsed.command.intent.sellerType).toBe("owner");
    expect(parsed.command.intent.floorNotFirst).toBe(true);
    expect(parsed.command.intent.buildingType).toBe("brick");
  });

  it("parses year range, price range, and mortgage", () => {
    const parsed = parseBotCommand("квартиры Астана 2015-2022 от 60 до 90 млн ипотека");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.houseYearFrom).toBe(2015);
    expect(parsed.command.intent.houseYearTo).toBe(2022);
    expect(parsed.command.intent.priceFrom).toBe(60_000_000);
    expect(parsed.command.intent.priceTo).toBe(90_000_000);
    expect(parsed.command.intent.mortgage).toBe(true);
  });

  it("parses house request with square", () => {
    const parsed = parseBotCommand("дома Алматы от 100 млн площадь от 120 м2");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/doma-dachi");
    expect(parsed.command.intent.priceFrom).toBe(100_000_000);
    expect(parsed.command.intent.squareFrom).toBe(120);
  });

  it("uses text search fallback for useful unstructured listing words", () => {
    const parsed = parseBotCommand("двушка Алматы до 45 с ремонтом");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");
    expect(parsed.command.intent.textQuery).toBe("ремонт");
  });

  it("parses apartment district, toilet, photo, kitchen, and no pledge filters", () => {
    const parsed = parseBotCommand("двушка Алматы Ауэзовский до 45 хозяева раздельный санузел с фото кухня от 9 не в залоге");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.geo.url_path).toBe("almaty-aujezovskij");
    expect(parsed.command.intent.toiletTypes).toEqual(["separate"]);
    expect(parsed.command.intent.hasPhoto).toBe(true);
    expect(parsed.command.intent.kitchenSquareFrom).toBe(9);
    expect(parsed.command.intent.mortgage).toBe(false);
  });

  it("parses house filters", () => {
    const parsed = parseBotCommand("дом Алматы от 100 млн 8 соток кирпич газовое отопление септик свежий ремонт");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/doma-dachi");
    expect(parsed.command.intent.priceFrom).toBe(100_000_000);
    expect(parsed.command.intent.landSquareFrom).toBe(8);
    expect(parsed.command.intent.houseMaterials).toContain("brick");
    expect(parsed.command.intent.heatingTypes).toEqual(["gas"]);
    expect(parsed.command.intent.sewageTypes).toEqual(["septic"]);
    expect(parsed.command.intent.houseCondition).toBe("fresh");
  });

  it("parses land filters without treating sotkas as price", () => {
    const parsed = parseBotCommand("участок Алматы от 6 до 10 соток ИЖС делимый не в залоге до 30 млн");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/uchastkov");
    expect(parsed.command.intent.landSquareFrom).toBe(6);
    expect(parsed.command.intent.landSquareTo).toBe(10);
    expect(parsed.command.intent.landPurpose).toBe("izhs");
    expect(parsed.command.intent.landDivisible).toBe(true);
    expect(parsed.command.intent.mortgage).toBe(false);
    expect(parsed.command.intent.priceTo).toBe(30_000_000);
  });

  it("parses commercial filters", () => {
    const parsed = parseBotCommand("коммерция Алматы офис от 80 м2 в бизнес центре с арендаторами");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kommercheskaya-nedvizhimost");
    expect(parsed.command.intent.squareFrom).toBe(80);
    expect(parsed.command.intent.commercialUseCases).toEqual(["office"]);
    expect(parsed.command.intent.commercialLocation).toBe("business_center");
    expect(parsed.command.intent.commercialHasTenants).toBe(true);
  });

  it("merges simple follow-up with previous intent", async () => {
    const first = parseBotCommand("двушка Алматы до 45 хозяева");
    if (!first.ok || first.command.kind !== "search") throw new Error("Expected search command");

    const parsed = await parseBotCommandAsync("как прошлый, но до 50 и без первых этажей", {
      previousIntent: first.command.intent,
      useAi: false,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.geo.url_path).toBe("almaty");
    expect(parsed.command.intent.priceTo).toBe(50_000_000);
    expect(parsed.command.intent.sellerType).toBe("owner");
    expect(parsed.command.intent.floorNotFirst).toBe(true);
  });

  it("uses mocked AI parser for incomplete natural language", async () => {
    const parsed = await parseBotCommandAsync("вариант для клиента в Алматы бюджет 45", {
      useAi: true,
      aiParser: async () => ({
        category: "apartment",
        geo: "Алматы",
        priceFrom: 45,
        rooms: [2],
        sellerType: "owner",
      }),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.aiParsed).toBe(true);
    expect(parsed.command.intent.categorySlug).toBe("prodazha/kvartiry");
    expect(parsed.command.intent.priceFrom).toBeUndefined();
    expect(parsed.command.intent.priceTo).toBe(45_000_000);
    expect(parsed.command.intent.rooms).toEqual(["2"]);
    expect(parsed.command.intent.sellerType).toBe("owner");
  });

  it("normalizes mocked AI parser output for expanded filters", async () => {
    const parsed = await parseBotCommandAsync("найди офис клиенту", {
      useAi: true,
      aiParser: async () => ({
        category: "commercial",
        geo: "Алматы",
        squareFrom: 80,
        commercialUseCases: ["office"],
        commercialLocation: "business_center",
        commercialHasTenants: true,
      }),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.categorySlug).toBe("prodazha/kommercheskaya-nedvizhimost");
    expect(parsed.command.intent.squareFrom).toBe(80);
    expect(parsed.command.intent.commercialUseCases).toEqual(["office"]);
    expect(parsed.command.intent.commercialLocation).toBe("business_center");
    expect(parsed.command.intent.commercialHasTenants).toBe(true);
  });

  it("normalizes mocked AI parser output for residential complex names", async () => {
    const parsed = await parseBotCommandAsync("квартира в жк клиенту", {
      useAi: true,
      aiParser: async () => ({
        category: "apartment",
        geo: "Алматы",
        residentialComplexName: "ЖК Rams City",
      }),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    expect(parsed.command.intent.residentialComplexName).toBe("Rams City");
    expect(parsed.command.intent.aiParsed).toBe(true);
  });

  it("routes real-estate questions to Q&A when search parsing is not enough", async () => {
    const parsed = await parseBotCommandAsync("как понять что квартира переоценена?", {
      useAi: true,
      aiParser: async () => null,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "real_estate_qa") throw new Error("Expected real_estate_qa command");
    expect(parsed.command.question).toContain("переоценена");
  });

  it("returns saved searches list command", () => {
    const parsed = parseBotCommand("мои поиски");

    expect(parsed).toEqual({ ok: true, command: { kind: "list_searches" } });
  });

  it("returns stop saved search command", () => {
    const parsed = parseBotCommand("останови поиск abc12345");

    expect(parsed).toEqual({ ok: true, command: { kind: "stop_search", savedSearchId: "abc12345" } });
  });

  it("rejects unsupported rent requests", () => {
    const parsed = parseBotCommand("аренда квартиры в Алматы");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Expected parse error");
    expect(parsed.message).toContain("только продажу");
  });
});
