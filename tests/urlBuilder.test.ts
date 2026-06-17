import { describe, expect, it } from "vitest";
import { parseBotCommand } from "../src/bot/commandParser";
import { buildKrishaSearchUrl } from "../src/krisha/urlBuilder";

describe("buildKrishaSearchUrl", () => {
  it("builds apartment URL with price and rooms", () => {
    const parsed = parseBotCommand("квартиры на продажу в Астане 2-3 комнаты до 60 млн");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kvartiry/astana/?das[price][to]=60000000&das[live.rooms][]=2&das[live.rooms][]=3",
    );
  });

  it("builds land plot URL", () => {
    const parsed = parseBotCommand("участки на продажу в Алматы до 30 млн");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe("https://krisha.kz/prodazha/uchastkov/almaty/?das[price][to]=30000000");
  });

  it("builds rich apartment URL with optional filters", () => {
    const parsed = parseBotCommand("двушка Алматы до 45 хозяева не первый кирпич");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kvartiry/almaty/?das[price][to]=45000000&das[live.rooms][]=2&das[flat.building]=1&das[who]=1&das[floor_not_first]=1",
    );
  });

  it("builds apartment URL with district and expanded filters", () => {
    const parsed = parseBotCommand("двушка Алматы Ауэзовский до 45 хозяева раздельный санузел с фото кухня от 9 не в залоге");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kvartiry/almaty-aujezovskij/?das[price][to]=45000000&das[live.square_k][from]=9&das[live.rooms][]=2&das[who]=1&das[mortgage]=0&das[_sys.hasphoto]=1&das[flat.toilet]=1",
    );
  });

  it("builds house URL with land and communication filters", () => {
    const parsed = parseBotCommand("дом Алматы от 100 млн 8 соток кирпич газовое отопление септик свежий ремонт");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/doma-dachi/almaty/?das[price][from]=100000000&das[land.square][from]=8&das[house.building_opts]=1&das[house.renewal]=1&das[cmtn.heating]=2&das[cmtn.sewage]=3&_txt_=%D1%80%D0%B5%D0%BC%D0%BE%D0%BD%D1%82",
    );
  });

  it("builds land URL with purpose, divisibility, pledge, and sotka filters", () => {
    const parsed = parseBotCommand("участок Алматы от 6 до 10 соток ИЖС делимый не в залоге до 30 млн");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/uchastkov/almaty/?das[price][to]=30000000&das[land.square][from]=6&das[land.square][to]=10&das[mortgage]=0&das[land.earmarked]=1&das[land.separable]=1",
    );
  });

  it("builds commercial URL with use case and location", () => {
    const parsed = parseBotCommand("коммерция Алматы офис от 80 м2 в бизнес центре с арендаторами");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kommercheskaya-nedvizhimost/almaty/?das[com.square][from]=80&das[com.use_case]=2&das[com.location]=1&das[com.is_tenants]=1",
    );
  });

  it("builds year and mortgage filters", () => {
    const parsed = parseBotCommand("квартиры Астана 2015-2022 от 60 до 90 млн ипотека");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kvartiry/astana/?das[price][from]=60000000&das[price][to]=90000000&das[house.year][from]=2015&das[house.year][to]=2022&das[mortgage]=1",
    );
  });

  it("adds residential complex name to text search", () => {
    const parsed = parseBotCommand("двушка Алматы ЖК Rams City до 60 с ремонтом");
    if (!parsed.ok || parsed.command.kind !== "search") throw new Error("Expected search command");

    const url = buildKrishaSearchUrl(parsed.command.intent);

    expect(url).toBe(
      "https://krisha.kz/prodazha/kvartiry/almaty/?das[price][to]=60000000&das[live.rooms][]=2&_txt_=Rams%20City%20%D1%80%D0%B5%D0%BC%D0%BE%D0%BD%D1%82",
    );
  });
});
