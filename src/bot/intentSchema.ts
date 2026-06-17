import type {
  BuildingType,
  CommercialLocation,
  CommercialUseCase,
  HeatingType,
  HouseCondition,
  HouseMaterial,
  HouseType,
  LandPurpose,
  PhoneType,
  SearchIntent,
  SellerType,
  SewageType,
  ToiletType,
} from "./types";
import {
  getGeoByPath,
  resolveCategoryFromText,
  resolveGeoFromText,
  type GeoNode,
  type SupportedCategorySlug,
} from "../krisha/reference";
import { normalizeText } from "../shared/text";

export type IntentPatch = {
  categorySlug?: SupportedCategorySlug;
  geo?: GeoNode;
  priceFrom?: number;
  priceTo?: number;
  rooms?: string[];
  houseYearFrom?: number;
  houseYearTo?: number;
  squareFrom?: number;
  squareTo?: number;
  kitchenSquareFrom?: number;
  kitchenSquareTo?: number;
  landSquareFrom?: number;
  landSquareTo?: number;
  buildingType?: BuildingType;
  sellerType?: SellerType;
  newBuilding?: boolean;
  mortgage?: boolean;
  houseFloorCountFrom?: number;
  houseFloorCountTo?: number;
  floorFrom?: number;
  floorTo?: number;
  floorNotFirst?: boolean;
  floorNotLast?: boolean;
  hasPhoto?: boolean;
  hasExchange?: boolean;
  hasPhone?: boolean;
  toiletTypes?: ToiletType[];
  phoneTypes?: PhoneType[];
  dormitory?: boolean;
  houseType?: HouseType;
  houseMaterials?: HouseMaterial[];
  houseCondition?: HouseCondition;
  heatingTypes?: HeatingType[];
  sewageTypes?: SewageType[];
  landPurpose?: LandPurpose;
  landDivisible?: boolean;
  commercialUseCases?: CommercialUseCase[];
  commercialLocation?: CommercialLocation;
  commercialHasTenants?: boolean;
  commercialActiveBusiness?: boolean;
  residentialComplexName?: string;
  textQuery?: string;
  sort?: "oldest_first";
  aiParsed?: boolean;
  warnings?: string[];
};

export type AiIntentCandidate = {
  category?: string | null;
  categorySlug?: string | null;
  geo?: string | null;
  geoPath?: string | null;
  priceFrom?: number | string | null;
  priceTo?: number | string | null;
  rooms?: Array<number | string> | number | string | null;
  houseYearFrom?: number | string | null;
  houseYearTo?: number | string | null;
  squareFrom?: number | string | null;
  squareTo?: number | string | null;
  kitchenSquareFrom?: number | string | null;
  kitchenSquareTo?: number | string | null;
  landSquareFrom?: number | string | null;
  landSquareTo?: number | string | null;
  buildingType?: string | null;
  sellerType?: string | null;
  newBuilding?: boolean | null;
  mortgage?: boolean | null;
  houseFloorCountFrom?: number | string | null;
  houseFloorCountTo?: number | string | null;
  floorFrom?: number | string | null;
  floorTo?: number | string | null;
  floorNotFirst?: boolean | null;
  floorNotLast?: boolean | null;
  hasPhoto?: boolean | null;
  hasExchange?: boolean | null;
  hasPhone?: boolean | null;
  toiletTypes?: Array<string> | string | null;
  phoneTypes?: Array<string> | string | null;
  dormitory?: boolean | null;
  houseType?: string | null;
  houseMaterials?: Array<string> | string | null;
  houseCondition?: string | null;
  heatingTypes?: Array<string> | string | null;
  sewageTypes?: Array<string> | string | null;
  landPurpose?: string | null;
  landDivisible?: boolean | null;
  commercialUseCases?: Array<string> | string | null;
  commercialLocation?: string | null;
  commercialHasTenants?: boolean | null;
  commercialActiveBusiness?: boolean | null;
  residentialComplexName?: string | null;
  textQuery?: string | null;
  sort?: string | null;
  unsupportedFilters?: string[] | null;
};

export type IntentBuildResult =
  | { ok: true; intent: SearchIntent }
  | { ok: false; message: string };

const SUPPORTED_CATEGORY_SLUGS = new Set<SupportedCategorySlug>([
  "prodazha/kvartiry",
  "prodazha/uchastkov",
  "prodazha/doma-dachi",
  "prodazha/kommercheskaya-nedvizhimost",
]);

const AI_CATEGORY_TO_SLUG = new Map<string, SupportedCategorySlug>([
  ["apartment", "prodazha/kvartiry"],
  ["apartments", "prodazha/kvartiry"],
  ["flat", "prodazha/kvartiry"],
  ["flats", "prodazha/kvartiry"],
  ["kvartiry", "prodazha/kvartiry"],
  ["квартира", "prodazha/kvartiry"],
  ["квартиры", "prodazha/kvartiry"],
  ["land", "prodazha/uchastkov"],
  ["plot", "prodazha/uchastkov"],
  ["plots", "prodazha/uchastkov"],
  ["участок", "prodazha/uchastkov"],
  ["участки", "prodazha/uchastkov"],
  ["house", "prodazha/doma-dachi"],
  ["houses", "prodazha/doma-dachi"],
  ["home", "prodazha/doma-dachi"],
  ["дом", "prodazha/doma-dachi"],
  ["дома", "prodazha/doma-dachi"],
  ["commercial", "prodazha/kommercheskaya-nedvizhimost"],
  ["commerce", "prodazha/kommercheskaya-nedvizhimost"],
  ["коммерция", "prodazha/kommercheskaya-nedvizhimost"],
]);

function numberFromUnknown(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function normalizePriceValue(value: number | string | null | undefined): number | undefined {
  const parsed = numberFromUnknown(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  if (parsed < 1_000) return Math.round(parsed * 1_000_000);
  return Math.round(parsed);
}

function normalizePositiveInt(value: number | string | null | undefined): number | undefined {
  const parsed = numberFromUnknown(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function normalizeYear(value: number | string | null | undefined): number | undefined {
  const parsed = normalizePositiveInt(value);
  const nextYear = new Date().getFullYear() + 1;
  if (parsed === undefined || parsed < 1900 || parsed > nextYear) return undefined;
  return parsed;
}

function normalizeRoom(value: number | string): string | undefined {
  if (value === "5.100") return "5.100";
  const parsed = Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  if (parsed >= 5) return "5.100";
  return String(parsed);
}

function normalizeRooms(values: AiIntentCandidate["rooms"]): string[] | undefined {
  if (values === null || values === undefined || values === "") return undefined;
  const rawValues = Array.isArray(values) ? values : [values];
  const rooms = rawValues
    .map((value) => normalizeRoom(value))
    .filter((value): value is string => Boolean(value));
  return rooms.length > 0 ? [...new Set(rooms)] : undefined;
}

function normalizeCategory(candidate: AiIntentCandidate, rawText: string): SupportedCategorySlug | undefined {
  if (candidate.categorySlug && SUPPORTED_CATEGORY_SLUGS.has(candidate.categorySlug as SupportedCategorySlug)) {
    return candidate.categorySlug as SupportedCategorySlug;
  }

  const rawCategory = candidate.category?.trim().toLocaleLowerCase("ru");
  if (rawCategory) {
    const mapped = AI_CATEGORY_TO_SLUG.get(rawCategory);
    if (mapped) return mapped;
  }

  return resolveCategoryFromText(rawText) ?? undefined;
}

function normalizeGeo(candidate: AiIntentCandidate, rawText: string): GeoNode | undefined {
  if (candidate.geoPath) {
    const geo = getGeoByPath(candidate.geoPath);
    if (geo) return geo;
  }

  if (candidate.geo) {
    const geo = resolveGeoFromText(candidate.geo);
    if (geo) return geo;
  }

  return resolveGeoFromText(rawText) ?? undefined;
}

function normalizeBuildingType(value: string | null | undefined): BuildingType | undefined {
  const normalized = value?.trim().toLocaleLowerCase("ru");
  if (!normalized) return undefined;
  if (["panel", "панель", "панельный"].includes(normalized)) return "panel";
  if (["brick", "кирпич", "кирпичный"].includes(normalized)) return "brick";
  if (["monolith", "монолит", "монолитный"].includes(normalized)) return "monolith";
  return undefined;
}

function normalizeSellerType(value: string | null | undefined): SellerType | undefined {
  const normalized = value?.trim().toLocaleLowerCase("ru");
  if (!normalized) return undefined;
  if (["owner", "owners", "хозяин", "хозяева", "собственник", "собственники"].includes(normalized)) return "owner";
  if (["agent", "agents", "агент", "агенты", "риэлтор", "риелтор"].includes(normalized)) return "agent";
  return undefined;
}

function normalizeStringUnion<T extends string>(
  value: string | null | undefined,
  aliases: Record<string, T>,
): T | undefined {
  const normalized = normalizeText(value ?? "");
  return normalized ? aliases[normalized] : undefined;
}

function normalizeStringUnionArray<T extends string>(
  values: Array<string> | string | null | undefined,
  aliases: Record<string, T>,
): T[] | undefined {
  if (values === null || values === undefined || values === "") return undefined;
  const rawValues = Array.isArray(values) ? values : [values];
  const normalized = rawValues
    .map((value) => normalizeStringUnion(value, aliases))
    .filter((value): value is T => Boolean(value));
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

const TOILET_TYPE_ALIASES: Record<string, ToiletType> = {
  separate: "separate",
  "раздельный": "separate",
  "раздельный санузел": "separate",
  combined: "combined",
  "совмещенный": "combined",
  "совмещённый": "combined",
  "совмещенный санузел": "combined",
  "two plus": "two_plus",
  "two_plus": "two_plus",
  "2 санузла": "two_plus",
  "2 с у": "two_plus",
  none: "none",
  "нет": "none",
  "без санузла": "none",
};

const PHONE_TYPE_ALIASES: Record<string, PhoneType> = {
  separate: "separate",
  "отдельный": "separate",
  blocker: "blocker",
  "блокиратор": "blocker",
  connectable: "connectable",
  "есть возможность подключения": "connectable",
  none: "none",
  "нет": "none",
  "без телефона": "none",
};

const HOUSE_TYPE_ALIASES: Record<string, HouseType> = {
  detached: "detached",
  "отдельный дом": "detached",
  "частный дом": "detached",
  part: "part",
  "часть дома": "part",
  dacha: "dacha",
  "дача": "dacha",
};

const HOUSE_MATERIAL_ALIASES: Record<string, HouseMaterial> = {
  brick: "brick",
  "кирпич": "brick",
  "кирпичный": "brick",
  monolith: "monolith",
  "монолит": "monolith",
  "монолитный": "monolith",
  wood: "wood",
  "дерево": "wood",
  "деревянный": "wood",
  saman: "saman",
  "саман": "saman",
  "газосиликат": "gas_silicate",
  "gas silicate": "gas_silicate",
  "газосиликатный блок": "gas_silicate",
  "газобетон": "gas_block",
  "gas block": "gas_block",
  "газобетонный блок": "gas_block",
  "cinder block": "cinder_block",
  "шлакоблок": "cinder_block",
  "foam block": "foam_block",
  "пеноблок": "foam_block",
  "heat block": "heat_block",
  "теплоблок": "heat_block",
  "frame reed": "frame_reed",
  "каркасно камышитовый": "frame_reed",
  "frame panel": "frame_panel",
  "каркасно щитовой": "frame_panel",
  "sip": "sip_panel",
  "sip panel": "sip_panel",
  "сип панели": "sip_panel",
  "reinforced panel": "reinforced_panel",
  "жб панели": "reinforced_panel",
  "ракушняк": "shell",
  "финблок": "finblock",
};

const HOUSE_CONDITION_ALIASES: Record<string, HouseCondition> = {
  fresh: "fresh",
  "свежий ремонт": "fresh",
  tidy: "tidy",
  "аккуратный ремонт": "tidy",
  "не новый но аккуратный ремонт": "tidy",
  needs_repair: "needs_repair",
  "needs repair": "needs_repair",
  "нужен ремонт": "needs_repair",
  "требует ремонта": "needs_repair",
  rough: "rough",
  "черновая": "rough",
  "черновая отделка": "rough",
  demolition: "demolition",
  "под снос": "demolition",
  unfinished: "unfinished",
  "недостроенный": "unfinished",
  "недострой": "unfinished",
};

const HEATING_TYPE_ALIASES: Record<string, HeatingType> = {
  central: "central",
  "центральное": "central",
  gas: "gas",
  "газ": "gas",
  "на газе": "gas",
  solid: "solid",
  "твердое топливо": "solid",
  "твёрдое топливо": "solid",
  liquid: "liquid",
  "жидкое топливо": "liquid",
  electric: "electric",
  "электричество": "electric",
  "электрическое": "electric",
  mixed: "mixed",
  "смешанное": "mixed",
  none: "none",
  "нет": "none",
  "без отопления": "none",
};

const SEWAGE_TYPE_ALIASES: Record<string, SewageType> = {
  central: "central",
  "центральная": "central",
  can_connect: "can_connect",
  "can connect": "can_connect",
  "можно подвести": "can_connect",
  septic: "septic",
  "септик": "septic",
  none: "none",
  "нет": "none",
  "без канализации": "none",
};

const LAND_PURPOSE_ALIASES: Record<string, LandPurpose> = {
  izhs: "izhs",
  "ижс": "izhs",
  farm: "farm",
  "кх": "farm",
  lph: "lph",
  "лпх": "lph",
  gardening: "gardening",
  "садоводство": "gardening",
  commercial: "commercial",
  "коммерческое": "commercial",
  "коммерция": "commercial",
  mzh: "mzh",
  "мжс": "mzh",
  dacha: "dacha",
  "дачное строительство": "dacha",
  other: "other",
  "другое": "other",
};

const COMMERCIAL_USE_CASE_ALIASES: Record<string, CommercialUseCase> = {
  free: "free",
  "свободное назначение": "free",
  office: "office",
  "офис": "office",
  "офисы": "office",
  shop: "shop",
  "магазин": "shop",
  "бутик": "shop",
  warehouse: "warehouse",
  "склад": "warehouse",
  auto: "auto",
  "азс": "auto",
  "автосервис": "auto",
  "автомойка": "auto",
  food: "food",
  "общепит": "food",
  "кафе": "food",
  "ресторан": "food",
  beauty: "beauty",
  "салон красоты": "beauty",
  agriculture: "agriculture",
  "сельское хозяйство": "agriculture",
  hotel: "hotel",
  "гостиница": "hotel",
  "баня": "hotel",
  medical: "medical",
  "медцентр": "medical",
  "аптека": "medical",
  education: "education",
  "образование": "education",
  entertainment: "entertainment",
  "развлечения": "entertainment",
};

const COMMERCIAL_LOCATION_ALIASES: Record<string, CommercialLocation> = {
  business_center: "business_center",
  "business center": "business_center",
  "бизнес центр": "business_center",
  "бизнес центре": "business_center",
  residential: "residential",
  "жилой дом": "residential",
  "жк": "residential",
  mall: "mall",
  "торговый центр": "mall",
  "торговом центре": "mall",
  market: "market",
  "рынок": "market",
  standalone: "standalone",
  "отдельностоящее здание": "standalone",
};

function normalizeTextQuery(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function normalizeResidentialComplexName(value: string | null | undefined): string | undefined {
  const trimmed = value
    ?.trim()
    .replace(/^(?:жк|жилой\s+комплекс)\s+/iu, "")
    .replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

export function normalizeAiIntentCandidate(
  candidate: AiIntentCandidate,
  rawText: string,
): { ok: true; patch: IntentPatch } | { ok: false; message: string } {
  if (candidate.unsupportedFilters?.length) {
    return {
      ok: false,
      message: `Пока не поддерживаю фильтр: ${candidate.unsupportedFilters.join(", ")}.`,
    };
  }

  const patch: IntentPatch = {};
  const categorySlug = normalizeCategory(candidate, rawText);
  const geo = normalizeGeo(candidate, rawText);
  const rooms = normalizeRooms(candidate.rooms);
  const buildingType = normalizeBuildingType(candidate.buildingType);
  const sellerType = normalizeSellerType(candidate.sellerType);
  const toiletTypes = normalizeStringUnionArray(candidate.toiletTypes, TOILET_TYPE_ALIASES);
  const phoneTypes = normalizeStringUnionArray(candidate.phoneTypes, PHONE_TYPE_ALIASES);
  const houseType = normalizeStringUnion(candidate.houseType, HOUSE_TYPE_ALIASES);
  const houseMaterials = normalizeStringUnionArray(candidate.houseMaterials, HOUSE_MATERIAL_ALIASES);
  const houseCondition = normalizeStringUnion(candidate.houseCondition, HOUSE_CONDITION_ALIASES);
  const heatingTypes = normalizeStringUnionArray(candidate.heatingTypes, HEATING_TYPE_ALIASES);
  const sewageTypes = normalizeStringUnionArray(candidate.sewageTypes, SEWAGE_TYPE_ALIASES);
  const landPurpose = normalizeStringUnion(candidate.landPurpose, LAND_PURPOSE_ALIASES);
  const commercialUseCases = normalizeStringUnionArray(candidate.commercialUseCases, COMMERCIAL_USE_CASE_ALIASES);
  const commercialLocation = normalizeStringUnion(candidate.commercialLocation, COMMERCIAL_LOCATION_ALIASES);
  const textQuery = normalizeTextQuery(candidate.textQuery);
  const residentialComplexName = normalizeResidentialComplexName(candidate.residentialComplexName);

  if (categorySlug) patch.categorySlug = categorySlug;
  if (geo) patch.geo = geo;
  if (rooms) patch.rooms = rooms;
  if (buildingType) patch.buildingType = buildingType;
  if (sellerType) patch.sellerType = sellerType;
  if (toiletTypes) patch.toiletTypes = toiletTypes;
  if (phoneTypes) patch.phoneTypes = phoneTypes;
  if (houseType) patch.houseType = houseType;
  if (houseMaterials) patch.houseMaterials = houseMaterials;
  if (houseCondition) patch.houseCondition = houseCondition;
  if (heatingTypes) patch.heatingTypes = heatingTypes;
  if (sewageTypes) patch.sewageTypes = sewageTypes;
  if (landPurpose) patch.landPurpose = landPurpose;
  if (commercialUseCases) patch.commercialUseCases = commercialUseCases;
  if (commercialLocation) patch.commercialLocation = commercialLocation;
  if (textQuery) patch.textQuery = textQuery;
  if (residentialComplexName) patch.residentialComplexName = residentialComplexName;

  const normalizedText = normalizeText(rawText);
  const hasBudgetWording =
    normalizedText.includes("бюджет") || normalizedText.includes("бюджетом") || normalizedText.includes("до ");
  let priceFrom = normalizePriceValue(candidate.priceFrom);
  let priceTo = normalizePriceValue(candidate.priceTo);
  if (hasBudgetWording && priceTo === undefined && priceFrom !== undefined) {
    priceTo = priceFrom;
    priceFrom = undefined;
  }
  const houseYearFrom = normalizeYear(candidate.houseYearFrom);
  const houseYearTo = normalizeYear(candidate.houseYearTo);
  const squareFrom = normalizePositiveInt(candidate.squareFrom);
  const squareTo = normalizePositiveInt(candidate.squareTo);
  const kitchenSquareFrom = normalizePositiveInt(candidate.kitchenSquareFrom);
  const kitchenSquareTo = normalizePositiveInt(candidate.kitchenSquareTo);
  const landSquareFrom = normalizePositiveInt(candidate.landSquareFrom);
  const landSquareTo = normalizePositiveInt(candidate.landSquareTo);
  const houseFloorCountFrom = normalizePositiveInt(candidate.houseFloorCountFrom);
  const houseFloorCountTo = normalizePositiveInt(candidate.houseFloorCountTo);
  const floorFrom = normalizePositiveInt(candidate.floorFrom);
  const floorTo = normalizePositiveInt(candidate.floorTo);

  if (priceFrom !== undefined) patch.priceFrom = priceFrom;
  if (priceTo !== undefined) patch.priceTo = priceTo;
  if (houseYearFrom !== undefined) patch.houseYearFrom = houseYearFrom;
  if (houseYearTo !== undefined) patch.houseYearTo = houseYearTo;
  if (squareFrom !== undefined) patch.squareFrom = squareFrom;
  if (squareTo !== undefined) patch.squareTo = squareTo;
  if (kitchenSquareFrom !== undefined) patch.kitchenSquareFrom = kitchenSquareFrom;
  if (kitchenSquareTo !== undefined) patch.kitchenSquareTo = kitchenSquareTo;
  if (landSquareFrom !== undefined) patch.landSquareFrom = landSquareFrom;
  if (landSquareTo !== undefined) patch.landSquareTo = landSquareTo;
  if (houseFloorCountFrom !== undefined) patch.houseFloorCountFrom = houseFloorCountFrom;
  if (houseFloorCountTo !== undefined) patch.houseFloorCountTo = houseFloorCountTo;
  if (floorFrom !== undefined) patch.floorFrom = floorFrom;
  if (floorTo !== undefined) patch.floorTo = floorTo;
  if (candidate.newBuilding === true) patch.newBuilding = true;
  if (candidate.mortgage !== null && candidate.mortgage !== undefined) patch.mortgage = candidate.mortgage;
  if (candidate.floorNotFirst === true) patch.floorNotFirst = true;
  if (candidate.floorNotLast === true) patch.floorNotLast = true;
  if (candidate.hasPhoto === true) patch.hasPhoto = true;
  if (candidate.hasExchange === true) patch.hasExchange = true;
  if (candidate.hasPhone === true) patch.hasPhone = true;
  if (candidate.dormitory !== null && candidate.dormitory !== undefined) patch.dormitory = candidate.dormitory;
  if (candidate.landDivisible !== null && candidate.landDivisible !== undefined) patch.landDivisible = candidate.landDivisible;
  if (candidate.commercialHasTenants === true) patch.commercialHasTenants = true;
  if (candidate.commercialActiveBusiness === true) patch.commercialActiveBusiness = true;
  if (candidate.sort === "oldest_first") patch.sort = "oldest_first";

  patch.aiParsed = true;
  return { ok: true, patch };
}

export function buildIntentFromPatch(rawText: string, patch: IntentPatch, previousIntent?: SearchIntent): IntentBuildResult {
  const categorySlug = patch.categorySlug ?? previousIntent?.categorySlug;
  const geo = patch.geo ?? previousIntent?.geo;

  if (!categorySlug) {
    return {
      ok: false,
      message: "Не понял тип недвижимости. Например: квартира, дом, участок или коммерция.",
    };
  }

  if (!geo) {
    return {
      ok: false,
      message: "Не понял город или область. Например: Алматы, Астана или Алматинская область.",
    };
  }

  return {
    ok: true,
    intent: {
      ...(previousIntent ?? {}),
      ...patch,
      rawText,
      categorySlug,
      geo,
    },
  };
}
