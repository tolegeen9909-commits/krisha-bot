import { resolveCategoryFromText, resolveGeoFromText } from "../krisha/reference";
import { normalizeText } from "../shared/text";
import type { SupportedCategorySlug } from "../krisha/reference";
import type { ParseResult, SearchIntent } from "./types";
import { parseAiIntentCandidate, type AiIntentParser } from "./aiIntentParser";
import { isContextUpdate, mergeWithPreviousIntent } from "./contextMerge";
import {
  buildIntentFromPatch,
  normalizeAiIntentCandidate,
  normalizePriceValue,
  type IntentPatch,
} from "./intentSchema";
import { isRealEstateQuestion } from "./realEstateQa";
import { parseTaskCommand } from "./taskParser";

const MONEY_PATTERN = String.raw`([0-9]+(?:[\s.,][0-9]+)*)\s*(млн|миллион(?:ов|а)?|тыс|тысяч)?`;

function parseNumber(raw: string): number {
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  return Number.parseFloat(normalized);
}

function moneyToTenge(rawAmount: string, rawUnit?: string): number | undefined {
  const amount = parseNumber(rawAmount);
  if (!Number.isFinite(amount)) return undefined;

  const unit = rawUnit?.toLocaleLowerCase("ru");
  if (unit?.startsWith("млн") || unit?.startsWith("милли")) {
    return Math.round(amount * 1_000_000);
  }
  if (unit?.startsWith("тыс") || unit?.startsWith("тысяч")) {
    return Math.round(amount * 1_000);
  }
  if (!unit && amount > 0 && amount < 1_000) {
    return Math.round(amount * 1_000_000);
  }

  return Math.round(amount);
}

function stripAreaExpressions(text: string): string {
  const areaUnit = String.raw`(?:сот(?:ок|ки|ка)?|м2|м²|кв\.?\s*м|квадрат(?:ов|а|ные|ный)?|метр(?:ов|а)?)`;
  return text
    .replace(new RegExp(String.raw`кухн[\p{L}]*\s*(?:от\s*)?\d+(?:[\s.,]\d+)?\s+(?:до|-|–)\s+\d+(?:[\s.,]\d+)?(?:\s*${areaUnit})?`, "giu"), " ")
    .replace(new RegExp(String.raw`кухн[\p{L}]*\s*(?:от|до)?\s*\d+(?:[\s.,]\d+)?(?:\s*${areaUnit})?`, "giu"), " ")
    .replace(new RegExp(String.raw`от\s+\d+(?:[\s.,]\d+)?\s+(?:до|-|–)\s+\d+(?:[\s.,]\d+)?\s*${areaUnit}`, "giu"), " ")
    .replace(new RegExp(String.raw`\d+(?:[\s.,]\d+)?\s*[-–]\s*\d+(?:[\s.,]\d+)?\s*${areaUnit}`, "giu"), " ")
    .replace(new RegExp(String.raw`(?:от|до)\s+\d+(?:[\s.,]\d+)?\s*${areaUnit}`, "giu"), " ")
    .replace(new RegExp(String.raw`\d+(?:[\s.,]\d+)?\s*${areaUnit}`, "giu"), " ");
}

function parsePrice(text: string): { priceFrom?: number; priceTo?: number } {
  const priceText = stripAreaExpressions(text);
  const price: { priceFrom?: number; priceTo?: number } = {};
  const rangeRe = new RegExp(String.raw`от\s+${MONEY_PATTERN}\s+(?:до|-|–)\s+${MONEY_PATTERN}`, "iu");
  const range = priceText.match(rangeRe);

  if (range) {
    const sharedUnit = range[4] ?? range[2];
    const priceFrom = moneyToTenge(range[1] ?? "", range[2] ?? sharedUnit);
    const priceTo = moneyToTenge(range[3] ?? "", range[4] ?? sharedUnit);
    if (priceFrom !== undefined) price.priceFrom = priceFrom;
    if (priceTo !== undefined) price.priceTo = priceTo;
    return price;
  }

  const toRe = new RegExp(String.raw`до\s+${MONEY_PATTERN}`, "iu");
  const to = priceText.match(toRe);
  if (to) {
    const priceTo = moneyToTenge(to[1] ?? "", to[2]);
    if (priceTo !== undefined) price.priceTo = priceTo;
  }

  const fromRe = new RegExp(String.raw`от\s+${MONEY_PATTERN}`, "iu");
  const from = priceText.match(fromRe);
  if (from) {
    const priceFrom = moneyToTenge(from[1] ?? "", from[2]);
    if (priceFrom !== undefined) price.priceFrom = priceFrom;
  }

  return price;
}

function rangeToRoomValues(from: number, to: number): string[] {
  const values: string[] = [];
  const start = Math.max(1, Math.min(from, to));
  const end = Math.max(from, to);

  for (let room = start; room <= Math.min(end, 4); room += 1) {
    values.push(String(room));
  }
  if (end >= 5) values.push("5.100");

  return values;
}

function atLeastRoomValues(from: number): string[] {
  if (from >= 5) return ["5.100"];
  return [...rangeToRoomValues(from, 4), "5.100"];
}

function normalizeRoomsForCategory(rooms: string[] | undefined, categorySlug: SupportedCategorySlug): string[] | undefined {
  if (!rooms) return undefined;
  if (categorySlug !== "prodazha/doma-dachi") return rooms;

  const values: string[] = [];
  for (const room of rooms) {
    if (room === "5.100") {
      values.push("5", "6", "7", "8", "9", "10.100");
      continue;
    }

    const parsed = Number.parseInt(room, 10);
    if (Number.isFinite(parsed) && parsed >= 10) {
      values.push("10.100");
    } else if (Number.isFinite(parsed) && parsed >= 1) {
      values.push(String(parsed));
    }
  }

  return values.length > 0 ? [...new Set(values)] : undefined;
}

function parseRooms(text: string): string[] | undefined {
  const normalized = normalizeText(text);
  if (/(?:однушка|однокомнатн)/iu.test(normalized)) return ["1"];
  if (/(?:двушка|двухкомнатн|двух комнатн|2х комнатн|2 х комнатн)/iu.test(normalized)) return ["2"];
  if (/(?:трешка|трёшка|трехкомнатн|трёхкомнатн|трех комнатн|трёх комнатн)/iu.test(normalized)) return ["3"];

  const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:комн|комнат|комнаты|к\b)?/iu);
  if (range) {
    const from = Number(range[1] ?? 0);
    const to = Number(range[2] ?? 0);
    if (from <= 10 && to <= 10) {
      return rangeToRoomValues(from, to);
    }
  }

  const plus = text.match(/(\d+)\s*\+/u);
  if (plus) {
    return atLeastRoomValues(Number(plus[1] ?? 0));
  }

  const single = text.match(/(\d+)[\s-]*(?:комн|комнат|комнаты|к\b)/iu);
  if (single) {
    return rangeToRoomValues(Number(single[1] ?? 0), Number(single[1] ?? 0));
  }

  return undefined;
}

function parseYearRange(text: string): Pick<IntentPatch, "houseYearFrom" | "houseYearTo"> {
  const range = text.match(/\b(19\d{2}|20\d{2})\s*[-–]\s*(19\d{2}|20\d{2})\b/u);
  if (range) {
    return {
      houseYearFrom: Number(range[1] ?? 0),
      houseYearTo: Number(range[2] ?? 0),
    };
  }

  const fromTo = text.match(/(?:год|построен|постройки)?\s*от\s+(19\d{2}|20\d{2})\s+(?:до|-|–)\s+(19\d{2}|20\d{2})/iu);
  if (fromTo) {
    return {
      houseYearFrom: Number(fromTo[1] ?? 0),
      houseYearTo: Number(fromTo[2] ?? 0),
    };
  }

  const from = text.match(/(?:после|от)\s+(19\d{2}|20\d{2})(?:\s*года|\s*год)?/iu);
  const to = text.match(/(?:до)\s+(19\d{2}|20\d{2})(?:\s*года|\s*год)?/iu);
  return {
    ...(from ? { houseYearFrom: Number(from[1] ?? 0) } : {}),
    ...(to ? { houseYearTo: Number(to[1] ?? 0) } : {}),
  };
}

function parseSquare(text: string): Pick<IntentPatch, "squareFrom" | "squareTo"> {
  const squareUnit = String.raw`(?:м2|м²|кв\.?\s*м|квадрат(?:ов|а|ные|ный)?|метр(?:ов|а)?)`;
  const range = text.match(new RegExp(String.raw`(?:площадь\s*)?(?:от\s*)?(\d+)\s*[-–]\s*(\d+)\s*${squareUnit}`, "iu"));
  if (range) {
    return {
      squareFrom: Number(range[1] ?? 0),
      squareTo: Number(range[2] ?? 0),
    };
  }

  const fromTo = text.match(
    new RegExp(String.raw`(?:площадь\s*)?от\s+(\d+)\s+(?:до|-|–)\s+(\d+)\s*${squareUnit}`, "iu"),
  );
  if (fromTo) {
    return {
      squareFrom: Number(fromTo[1] ?? 0),
      squareTo: Number(fromTo[2] ?? 0),
    };
  }

  const from = text.match(new RegExp(String.raw`(?:площадь\s*)?от\s+(\d+)\s*${squareUnit}`, "iu"));
  const to = text.match(new RegExp(String.raw`(?:площадь\s*)?до\s+(\d+)\s*${squareUnit}`, "iu"));
  const single = text.match(new RegExp(String.raw`площадь\s+(\d+)(?:\s*${squareUnit})?`, "iu"));

  return {
    ...(from ? { squareFrom: Number(from[1] ?? 0) } : {}),
    ...(to ? { squareTo: Number(to[1] ?? 0) } : {}),
    ...(!from && !to && single ? { squareFrom: Number(single[1] ?? 0) } : {}),
  };
}

function parseKitchenSquare(text: string): Pick<IntentPatch, "kitchenSquareFrom" | "kitchenSquareTo"> {
  const squareUnit = String.raw`(?:м2|м²|кв\.?\s*м|квадрат(?:ов|а|ные|ный)?|метр(?:ов|а)?)?`;
  const range = text.match(new RegExp(String.raw`кухн[\p{L}]*\s*(?:от\s*)?(\d+)\s*(?:до|-|–)\s*(\d+)\s*${squareUnit}`, "iu"));
  if (range) {
    return {
      kitchenSquareFrom: Number(range[1] ?? 0),
      kitchenSquareTo: Number(range[2] ?? 0),
    };
  }

  const from = text.match(new RegExp(String.raw`кухн[\p{L}]*\s*от\s+(\d+)\s*${squareUnit}`, "iu"));
  const to = text.match(new RegExp(String.raw`кухн[\p{L}]*\s*до\s+(\d+)\s*${squareUnit}`, "iu"));

  return {
    ...(from ? { kitchenSquareFrom: Number(from[1] ?? 0) } : {}),
    ...(to ? { kitchenSquareTo: Number(to[1] ?? 0) } : {}),
  };
}

function parseLandSquare(text: string): Pick<IntentPatch, "landSquareFrom" | "landSquareTo"> {
  const unit = String.raw`сот(?:ок|ки|ка)?`;
  const range = text.match(new RegExp(String.raw`(?:участ[\p{L}]*\s*)?(?:от\s*)?(\d+(?:[\s.,]\d+)?)\s*(?:до|-|–)\s*(\d+(?:[\s.,]\d+)?)\s*${unit}`, "iu"));
  if (range) {
    return {
      landSquareFrom: parseNumber(range[1] ?? "0"),
      landSquareTo: parseNumber(range[2] ?? "0"),
    };
  }

  const fromTo = text.match(
    new RegExp(String.raw`(?:участ[\p{L}]*\s*)?от\s+(\d+(?:[\s.,]\d+)?)\s+(?:до|-|–)\s+(\d+(?:[\s.,]\d+)?)\s*${unit}`, "iu"),
  );
  if (fromTo) {
    return {
      landSquareFrom: parseNumber(fromTo[1] ?? "0"),
      landSquareTo: parseNumber(fromTo[2] ?? "0"),
    };
  }

  const from = text.match(new RegExp(String.raw`(?:участ[\p{L}]*\s*)?от\s+(\d+(?:[\s.,]\d+)?)\s*${unit}`, "iu"));
  const to = text.match(new RegExp(String.raw`(?:участ[\p{L}]*\s*)?до\s+(\d+(?:[\s.,]\d+)?)\s*${unit}`, "iu"));
  const single = text.match(new RegExp(String.raw`(\d+(?:[\s.,]\d+)?)\s*${unit}`, "iu"));

  return {
    ...(from ? { landSquareFrom: parseNumber(from[1] ?? "0") } : {}),
    ...(to ? { landSquareTo: parseNumber(to[1] ?? "0") } : {}),
    ...(!from && !to && single ? { landSquareFrom: parseNumber(single[1] ?? "0") } : {}),
  };
}

function parseBuildingType(text: string): IntentPatch["buildingType"] {
  const normalized = normalizeText(text);
  if (normalized.includes("кирпич")) return "brick";
  if (normalized.includes("монолит")) return "monolith";
  if (normalized.includes("панель")) return "panel";
  return undefined;
}

function parseSellerType(text: string): IntentPatch["sellerType"] {
  const normalized = normalizeText(text);
  if (
    normalized.includes("хозяева") ||
    normalized.includes("хозяин") ||
    normalized.includes("собственник") ||
    normalized.includes("без посредников")
  ) {
    return "owner";
  }
  if (normalized.includes("агент") || normalized.includes("риелтор") || normalized.includes("риэлтор")) {
    return "agent";
  }
  return undefined;
}

function parseFloor(text: string): Pick<IntentPatch, "floorFrom" | "floorTo" | "floorNotFirst" | "floorNotLast"> {
  const normalized = normalizeText(text);
  const range = text.match(/(?:этаж|этажи)\s*(?:от\s*)?(\d+)\s*(?:до|-|–)\s*(\d+)/iu);
  const from = text.match(/(?:этаж\s+от|с)\s+(\d+)(?:\s*этажа?)?/iu);
  const to = text.match(/(?:этаж\s+до|до)\s+(\d+)\s*этажа?/iu);

  return {
    ...(range ? { floorFrom: Number(range[1] ?? 0), floorTo: Number(range[2] ?? 0) } : {}),
    ...(!range && from ? { floorFrom: Number(from[1] ?? 0) } : {}),
    ...(!range && to ? { floorTo: Number(to[1] ?? 0) } : {}),
    ...(normalized.includes("не первый") || normalized.includes("без первых") ? { floorNotFirst: true } : {}),
    ...(normalized.includes("не последний") || normalized.includes("без последних") ? { floorNotLast: true } : {}),
  };
}

function parseHouseFloorCount(text: string): Pick<IntentPatch, "houseFloorCountFrom" | "houseFloorCountTo"> {
  const range = text.match(/(?:этажность|этажей\s+в\s+доме)\s*(?:от\s*)?(\d+)\s*(?:до|-|–)\s*(\d+)/iu);
  const from = text.match(/(?:этажность|этажей\s+в\s+доме|дом\s+от)\s+(\d+)\s*(?:этаж|эт)?/iu);
  const to = text.match(/(?:этажность|этажей\s+в\s+доме)\s*до\s+(\d+)\s*(?:этаж|эт)?/iu);
  return {
    ...(range ? { houseFloorCountFrom: Number(range[1] ?? 0), houseFloorCountTo: Number(range[2] ?? 0) } : {}),
    ...(!range && from ? { houseFloorCountFrom: Number(from[1] ?? 0) } : {}),
    ...(!range && to ? { houseFloorCountTo: Number(to[1] ?? 0) } : {}),
  };
}

function parseFlags(text: string): Pick<
  IntentPatch,
  "newBuilding" | "mortgage" | "hasPhoto" | "hasExchange" | "hasPhone" | "sort"
> {
  const normalized = normalizeText(text);
  const sort = parseSort(text);
  const mortgage =
    normalized.includes("не в залоге") || normalized.includes("без залога") || normalized.includes("не залоговая")
      ? false
      : normalized.includes("в залоге") || normalized.includes("залоговая") || normalized.includes("ипотек")
        ? true
        : undefined;
  return {
    ...(normalized.includes("новострой") || normalized.includes("новый дом") ? { newBuilding: true } : {}),
    ...(mortgage !== undefined ? { mortgage } : {}),
    ...(normalized.includes("с фото") || normalized.includes("есть фото") || normalized.includes("только с фото")
      ? { hasPhoto: true }
      : {}),
    ...(normalized.includes("обмен") ? { hasExchange: true } : {}),
    ...(normalized.includes("с телефоном") || normalized.includes("есть телефон") ? { hasPhone: true } : {}),
    ...(sort ? { sort } : {}),
  };
}

function parseToiletTypes(text: string): Pick<IntentPatch, "toiletTypes"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["toiletTypes"]> = [];
  if (/(?:раздельн[\p{L}]*\s+сануз|сануз[\p{L}]*\s+раздельн)/iu.test(normalized)) values.push("separate");
  if (/(?:совмещ[\p{L}]*\s+сануз|сануз[\p{L}]*\s+совмещ)/iu.test(normalized)) values.push("combined");
  if (/(?:2|два)\s*(?:с\/у|с у|сануз)|сануз[\p{L}]*\s*(?:2|два)/iu.test(normalized)) values.push("two_plus");
  if (/(?:без\s+сануз|сануз[\p{L}]*\s+нет)/iu.test(normalized)) values.push("none");
  return values.length > 0 ? { toiletTypes: [...new Set(values)] } : {};
}

function parsePhoneTypes(text: string): Pick<IntentPatch, "phoneTypes"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["phoneTypes"]> = [];
  if (/(?:телефон[\p{L}]*\s+отдельн|отдельн[\p{L}]*\s+телефон)/iu.test(normalized)) values.push("separate");
  if (/телефон[\p{L}]*\s+блокиратор/iu.test(normalized)) values.push("blocker");
  if (/(?:телефон[\p{L}]*.*подключ|подключ.*телефон)/iu.test(normalized)) values.push("connectable");
  if (/(?:без\s+телефона|телефон[\p{L}]*\s+нет)/iu.test(normalized)) values.push("none");
  return values.length > 0 ? { phoneTypes: [...new Set(values)] } : {};
}

function parseDormitory(text: string): Pick<IntentPatch, "dormitory"> {
  const normalized = normalizeText(text);
  if (normalized.includes("не общежитие") || normalized.includes("не бывшее общежитие")) return { dormitory: false };
  if (normalized.includes("общежитие") || normalized.includes("бывшее общежитие")) return { dormitory: true };
  return {};
}

function parseHouseType(text: string): Pick<IntentPatch, "houseType"> {
  const normalized = normalizeText(text);
  if (normalized.includes("часть дома")) return { houseType: "part" };
  if (normalized.includes("дача")) return { houseType: "dacha" };
  if (normalized.includes("отдельный дом") || normalized.includes("частный дом")) return { houseType: "detached" };
  return {};
}

function parseHouseMaterials(text: string): Pick<IntentPatch, "houseMaterials"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["houseMaterials"]> = [];
  if (normalized.includes("кирпич")) values.push("brick");
  if (normalized.includes("монолит")) values.push("monolith");
  if (normalized.includes("дерев")) values.push("wood");
  if (normalized.includes("саман")) values.push("saman");
  if (normalized.includes("газосиликат")) values.push("gas_silicate");
  if (normalized.includes("газобетон")) values.push("gas_block");
  if (normalized.includes("шлакоблок")) values.push("cinder_block");
  if (normalized.includes("пеноблок")) values.push("foam_block");
  if (normalized.includes("теплоблок")) values.push("heat_block");
  if (normalized.includes("каркасно камышит")) values.push("frame_reed");
  if (normalized.includes("каркасно щит")) values.push("frame_panel");
  if (normalized.includes("сип")) values.push("sip_panel");
  if (normalized.includes("жб панел")) values.push("reinforced_panel");
  if (normalized.includes("ракушняк")) values.push("shell");
  if (normalized.includes("финблок")) values.push("finblock");
  return values.length > 0 ? { houseMaterials: [...new Set(values)] } : {};
}

function parseHouseCondition(text: string): Pick<IntentPatch, "houseCondition"> {
  const normalized = normalizeText(text);
  if (normalized.includes("свежий ремонт") || normalized.includes("новый ремонт")) return { houseCondition: "fresh" };
  if (normalized.includes("аккуратный ремонт")) return { houseCondition: "tidy" };
  if (normalized.includes("требует ремонта") || normalized.includes("нужен ремонт") || normalized.includes("без ремонта")) {
    return { houseCondition: "needs_repair" };
  }
  if (normalized.includes("черновая")) return { houseCondition: "rough" };
  if (normalized.includes("под снос")) return { houseCondition: "demolition" };
  if (normalized.includes("недостро")) return { houseCondition: "unfinished" };
  return {};
}

function parseHeating(text: string): Pick<IntentPatch, "heatingTypes"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["heatingTypes"]> = [];
  if (normalized.includes("центральное отопление")) values.push("central");
  if (normalized.includes("газовое отопление") || normalized.includes("отопление на газе")) values.push("gas");
  if (normalized.includes("твердом топливе") || normalized.includes("твердое топливо")) values.push("solid");
  if (normalized.includes("жидком топливе") || normalized.includes("жидкое топливо")) values.push("liquid");
  if (normalized.includes("электрическое отопление") || normalized.includes("отопление на электричестве")) {
    values.push("electric");
  }
  if (normalized.includes("смешанное отопление")) values.push("mixed");
  if (normalized.includes("без отопления") || normalized.includes("отопления нет")) values.push("none");
  return values.length > 0 ? { heatingTypes: [...new Set(values)] } : {};
}

function parseSewage(text: string): Pick<IntentPatch, "sewageTypes"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["sewageTypes"]> = [];
  if (normalized.includes("центральная канализация")) values.push("central");
  if (normalized.includes("можно подвести канализацию")) values.push("can_connect");
  if (normalized.includes("септик")) values.push("septic");
  if (normalized.includes("без канализации") || normalized.includes("канализации нет")) values.push("none");
  return values.length > 0 ? { sewageTypes: [...new Set(values)] } : {};
}

function parseLandPurpose(text: string): Pick<IntentPatch, "landPurpose"> {
  const normalized = normalizeText(text);
  if (/(?:^| )ижс(?: |$)/iu.test(normalized)) return { landPurpose: "izhs" };
  if (/(?:^| )кх(?: |$)/iu.test(normalized) || normalized.includes("крестьянское хозяйство")) return { landPurpose: "farm" };
  if (/(?:^| )лпх(?: |$)/iu.test(normalized)) return { landPurpose: "lph" };
  if (normalized.includes("садоводство")) return { landPurpose: "gardening" };
  if (normalized.includes("коммерческое назначение")) return { landPurpose: "commercial" };
  if (/\bмжс\b/iu.test(normalized)) return { landPurpose: "mzh" };
  if (normalized.includes("дачное строительство")) return { landPurpose: "dacha" };
  return {};
}

function parseLandDivisible(text: string): Pick<IntentPatch, "landDivisible"> {
  const normalized = normalizeText(text);
  if (normalized.includes("неделимый")) return { landDivisible: false };
  if (normalized.includes("делимый")) return { landDivisible: true };
  return {};
}

function parseCommercialUseCases(text: string): Pick<IntentPatch, "commercialUseCases"> {
  const normalized = normalizeText(text);
  const values: NonNullable<IntentPatch["commercialUseCases"]> = [];
  if (normalized.includes("свободное назначение")) values.push("free");
  if (normalized.includes("офис")) values.push("office");
  if (normalized.includes("магазин") || normalized.includes("бутик")) values.push("shop");
  if (normalized.includes("склад")) values.push("warehouse");
  if (normalized.includes("азс") || normalized.includes("автосервис") || normalized.includes("автомой")) values.push("auto");
  if (normalized.includes("общепит") || normalized.includes("кафе") || normalized.includes("ресторан")) values.push("food");
  if (normalized.includes("салон красоты")) values.push("beauty");
  if (normalized.includes("сельское хозяйство")) values.push("agriculture");
  if (normalized.includes("гостиниц") || normalized.includes("баня") || normalized.includes("зона отдыха")) values.push("hotel");
  if (normalized.includes("медцентр") || normalized.includes("аптек")) values.push("medical");
  if (normalized.includes("образован")) values.push("education");
  if (normalized.includes("развлечен")) values.push("entertainment");
  return values.length > 0 ? { commercialUseCases: [...new Set(values)] } : {};
}

function parseCommercialLocation(text: string): Pick<IntentPatch, "commercialLocation"> {
  const normalized = normalizeText(text);
  if (normalized.includes("бизнес центр") || normalized.includes("бизнес-центр")) {
    return { commercialLocation: "business_center" };
  }
  if (normalized.includes("жилом доме") || normalized.includes("жилой дом") || /(?:^| )жк(?: |$)/iu.test(normalized)) {
    return { commercialLocation: "residential" };
  }
  if (normalized.includes("торговом центре") || normalized.includes("торговый центр")) return { commercialLocation: "mall" };
  if (normalized.includes("рынок") || normalized.includes("на рынке")) return { commercialLocation: "market" };
  if (normalized.includes("отдельностоящее") || normalized.includes("отдельно стоящее")) {
    return { commercialLocation: "standalone" };
  }
  return {};
}

function parseCommercialFlags(text: string): Pick<IntentPatch, "commercialHasTenants" | "commercialActiveBusiness"> {
  const normalized = normalizeText(text);
  return {
    ...(normalized.includes("с арендаторами") || normalized.includes("есть арендаторы")
      ? { commercialHasTenants: true }
      : {}),
    ...(normalized.includes("действующий бизнес") || normalized.includes("готовый бизнес")
      ? { commercialActiveBusiness: true }
      : {}),
  };
}

function parseTextQuery(text: string): Pick<IntentPatch, "textQuery"> {
  const normalized = normalizeText(text);
  const terms: string[] = [];
  if (normalized.includes("ремонт")) terms.push("ремонт");
  if (normalized.includes("мебел") || normalized.includes("меблир")) terms.push("меблирована");
  if (normalized.includes("балкон")) terms.push("балкон");
  if (normalized.includes("лодж")) terms.push("лоджия");
  if (normalized.includes("парков") || normalized.includes("паркинг")) terms.push("паркинг");
  if (normalized.includes("лифт")) terms.push("лифт");
  if (normalized.includes("не углов")) terms.push("не угловая");
  if (normalized.includes("тихий двор")) terms.push("тихий двор");
  if (normalized.includes("торг")) terms.push("торг");
  return terms.length > 0 ? { textQuery: [...new Set(terms)].join(" ") } : {};
}

function parseResidentialComplexName(text: string): Pick<IntentPatch, "residentialComplexName"> {
  const markerMatch = text.match(/(?:^|[\s,.;])(?:в\s+)?(?:жк|жилой\s+комплекс)\s+(.+)$/iu);
  if (!markerMatch?.[1]) return {};

  const rawTokens = markerMatch[1].trim().split(/\s+/u);
  const nameTokens: string[] = [];
  const stopWords = new Set([
    "до",
    "от",
    "цена",
    "бюджет",
    "комн",
    "комнат",
    "комнаты",
    "хозяева",
    "хозяин",
    "собственник",
    "собственники",
    "агент",
    "агенты",
    "не",
    "без",
    "с",
    "этаж",
    "этажи",
    "ипотека",
    "залог",
    "сначала",
    "давно",
    "долго",
  ]);

  for (const token of rawTokens) {
    const cleaned = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!cleaned) continue;

    const normalized = normalizeText(cleaned);
    if (!normalized) continue;
    if (stopWords.has(normalized)) break;
    if (resolveGeoFromText(cleaned)) break;
    if (resolveCategoryFromText(cleaned)) break;

    nameTokens.push(cleaned);
    if (nameTokens.length >= 6) break;
  }

  const name = nameTokens.join(" ").trim();
  return name ? { residentialComplexName: name } : {};
}

function findUnsupportedFilters(text: string): string[] {
  return [];
}

function parseSort(text: string): "oldest_first" | undefined {
  const normalized = normalizeText(text);
  const oldFirstPhrases = [
    "давно продаются",
    "долго продаются",
    "давно висит",
    "давно висят",
    "долго висит",
    "долго висят",
    "старые объявления",
    "старые обьявления",
    "сначала старые",
    "с начало старые",
    "сначала давно",
    "с начало давно",
    "дольше всего продаются",
  ];

  return oldFirstPhrases.some((phrase) => normalized.includes(phrase)) ? "oldest_first" : undefined;
}

function inferCategoryFromText(text: string): SupportedCategorySlug | null {
  if (/(?:^|[\s,.;])(?:в\s+)?(?:жк|жилой\s+комплекс)\s+/iu.test(text)) return "prodazha/kvartiry";
  return parseRooms(text) ? "prodazha/kvartiry" : null;
}

function parseIntentPatchFromText(text: string): IntentPatch {
  const categorySlug = resolveCategoryFromText(text) ?? inferCategoryFromText(text) ?? undefined;
  const geo = resolveGeoFromText(text) ?? undefined;
  const price = parsePrice(text);
  const rooms = parseRooms(text);
  const buildingType = parseBuildingType(text);
  const sellerType = parseSellerType(text);

  return {
    ...(categorySlug ? { categorySlug } : {}),
    ...(geo ? { geo } : {}),
    ...price,
    ...(rooms ? { rooms } : {}),
    ...parseYearRange(text),
    ...parseSquare(text),
    ...parseKitchenSquare(text),
    ...parseLandSquare(text),
    ...(buildingType ? { buildingType } : {}),
    ...(sellerType ? { sellerType } : {}),
    ...parseFloor(text),
    ...parseHouseFloorCount(text),
    ...parseFlags(text),
    ...parseToiletTypes(text),
    ...parsePhoneTypes(text),
    ...parseDormitory(text),
    ...parseHouseType(text),
    ...parseHouseMaterials(text),
    ...parseHouseCondition(text),
    ...parseHeating(text),
    ...parseSewage(text),
    ...parseLandPurpose(text),
    ...parseLandDivisible(text),
    ...parseCommercialUseCases(text),
    ...parseCommercialLocation(text),
    ...parseCommercialFlags(text),
    ...parseResidentialComplexName(text),
    ...parseTextQuery(text),
  };
}

function parseSearchIntent(
  text: string,
  previousIntent?: SearchIntent,
): { ok: true; intent: SearchIntent } | { ok: false; message: string } {
  const normalized = normalizeText(text);
  if (/(?:^| )(?:аренда|аренду|снять|сдача)(?: |$)/iu.test(normalized)) {
    return {
      ok: false,
      message: "Пока поддерживаю только продажу. Аренду добавим отдельным шагом.",
    };
  }

  const unsupportedFilters = findUnsupportedFilters(text);
  if (unsupportedFilters.length > 0) {
    return {
      ok: false,
      message: `Пока не поддерживаю фильтр: ${unsupportedFilters.join(", ")}.`,
    };
  }

  const patch = parseIntentPatchFromText(text);
  const result = isContextUpdate(text)
    ? mergeWithPreviousIntent(text, patch, previousIntent)
    : buildIntentFromPatch(text, patch);

  if (!result.ok) {
    return result;
  }

  const rooms =
    result.intent.categorySlug === "prodazha/kvartiry" || result.intent.categorySlug === "prodazha/doma-dachi"
      ? normalizeRoomsForCategory(result.intent.rooms, result.intent.categorySlug)
      : undefined;
  const { rooms: _ignoredRooms, ...intentWithoutRooms } = result.intent;

  return {
    ok: true,
    intent: {
      ...intentWithoutRooms,
      ...(rooms ? { rooms } : {}),
    },
  };
}

function stripSaveSearchPrefix(text: string): string | null {
  const match = text.trim().match(/^(?:следи\s+за|сохрани\s+поиск|сохрани|мониторь)\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

function stripMarketAnalysisPrefix(text: string): string | null {
  const match = text
    .trim()
    .match(/^(?:анализ\s+рынка|проанализируй\s+рынок|сделай\s+анализ\s+рынка|рынок)\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

function stripTrackedObjectsPrefix(text: string): string | null {
  const match = text
    .trim()
    .match(/^(?:новые\s+и\s+старые|покажи\s+новые\s+и\s+старые|отследи\s+новые\s+и\s+старые|поисковая\s+работа\s+по)\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

export function parseBotCommand(text: string): ParseResult {
  return parseBotCommandDeterministic(text);
}

function parseBotCommandDeterministic(text: string, previousIntent?: SearchIntent): ParseResult {
  const normalized = normalizeText(text);

  if (!normalized || normalized === "/start" || normalized === "help" || normalized === "помощь") {
    return { ok: true, command: { kind: "help" } };
  }

  const taskCommand = parseTaskCommand(text);
  if (taskCommand.matched) {
    return taskCommand.ok ? { ok: true, command: taskCommand.command } : { ok: false, message: taskCommand.message };
  }

  if (
    normalized === "мои поиски" ||
    normalized === "сохраненные поиски" ||
    normalized === "сохранённые поиски" ||
    normalized === "список поисков"
  ) {
    return { ok: true, command: { kind: "list_searches" } };
  }

  const stopMatch = normalized.match(/^(?:останови|остановить|удали|удалить)\s+(?:поиск\s+)?([a-z0-9-]{4,})$/iu);
  if (stopMatch?.[1]) {
    return { ok: true, command: { kind: "stop_search", savedSearchId: stopMatch[1] } };
  }

  if (normalized.includes("статус") || normalized.includes("последний запрос")) {
    return { ok: true, command: { kind: "status" } };
  }

  const marketAnalysisText = stripMarketAnalysisPrefix(text);
  if (marketAnalysisText) {
    const parsed = parseSearchIntent(marketAnalysisText, previousIntent);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      command: {
        kind: "market_analysis",
        intent: parsed.intent,
        sourceText: marketAnalysisText,
      },
    };
  }

  const trackedObjectsText = stripTrackedObjectsPrefix(text);
  if (trackedObjectsText) {
    const parsed = parseSearchIntent(trackedObjectsText, previousIntent);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      command: {
        kind: "tracked_objects",
        intent: parsed.intent,
        sourceText: trackedObjectsText,
      },
    };
  }

  const saveSearchText = stripSaveSearchPrefix(text);
  if (saveSearchText) {
    const parsed = parseSearchIntent(saveSearchText, previousIntent);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      command: {
        kind: "save_search",
        intent: parsed.intent,
        sourceText: saveSearchText,
      },
    };
  }

  const parsed = parseSearchIntent(text, previousIntent);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    command: {
      kind: "search",
      intent: parsed.intent,
    },
  };
}

export async function parseBotCommandAsync(
  text: string,
  options: {
    previousIntent?: SearchIntent;
    useAi?: boolean;
    aiParser?: AiIntentParser;
  } = {},
): Promise<ParseResult> {
  const deterministic = parseBotCommandDeterministic(text, options.previousIntent);
  if (deterministic.ok || options.useAi === false) return deterministic;
  if (deterministic.message.startsWith("Пока не поддерживаю фильтр")) return deterministic;

  const saveSearchText = stripSaveSearchPrefix(text);
  const marketAnalysisText = stripMarketAnalysisPrefix(text);
  const trackedObjectsText = stripTrackedObjectsPrefix(text);
  const searchText = saveSearchText ?? marketAnalysisText ?? trackedObjectsText ?? text;
  const aiParser = options.aiParser ?? parseAiIntentCandidate;

  try {
    const candidate = await aiParser(searchText, options.previousIntent ? { previousIntent: options.previousIntent } : {});
    if (!candidate) {
      return isRealEstateQuestion(text) ? { ok: true, command: { kind: "real_estate_qa", question: text } } : deterministic;
    }

    const normalized = normalizeAiIntentCandidate(candidate, searchText);
    if (!normalized.ok) return isRealEstateQuestion(text) ? { ok: true, command: { kind: "real_estate_qa", question: text } } : normalized;

    const intentResult = isContextUpdate(searchText)
      ? mergeWithPreviousIntent(searchText, normalized.patch, options.previousIntent)
      : buildIntentFromPatch(searchText, normalized.patch, options.previousIntent);

    if (!intentResult.ok) {
      return isRealEstateQuestion(text) ? { ok: true, command: { kind: "real_estate_qa", question: text } } : intentResult;
    }

    const command = saveSearchText
      ? { kind: "save_search" as const, intent: intentResult.intent, sourceText: saveSearchText }
      : marketAnalysisText
        ? { kind: "market_analysis" as const, intent: intentResult.intent, sourceText: marketAnalysisText }
        : trackedObjectsText
          ? { kind: "tracked_objects" as const, intent: intentResult.intent, sourceText: trackedObjectsText }
          : { kind: "search" as const, intent: intentResult.intent };

    return { ok: true, command };
  } catch {
    return isRealEstateQuestion(text) ? { ok: true, command: { kind: "real_estate_qa", question: text } } : deterministic;
  }
}
