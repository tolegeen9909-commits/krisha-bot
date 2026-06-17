import type { SearchIntent } from "../bot/types";

const BASE_URL = "https://krisha.kz";
const BUILDING_TYPE_TO_KRISHA_VALUE = {
  brick: 1,
  panel: 2,
  monolith: 3,
} as const;
const BUILDING_TYPE_TO_HOUSE_MATERIAL_VALUE = {
  brick: 1,
  monolith: 2,
  panel: 13,
} as const;
const TOILET_TYPE_TO_KRISHA_VALUE = {
  separate: 1,
  combined: 2,
  two_plus: 3,
  none: 4,
} as const;
const PHONE_TYPE_TO_KRISHA_VALUE = {
  separate: 1,
  blocker: 2,
  connectable: 3,
  none: 4,
} as const;
const HOUSE_TYPE_TO_KRISHA_VALUE = {
  detached: 1,
  part: 2,
  dacha: 3,
} as const;
const HOUSE_MATERIAL_TO_KRISHA_VALUE = {
  brick: 1,
  monolith: 2,
  wood: 3,
  saman: 4,
  gas_silicate: 5,
  gas_block: 6,
  cinder_block: 7,
  foam_block: 8,
  heat_block: 9,
  frame_reed: 10,
  frame_panel: 11,
  sip_panel: 12,
  reinforced_panel: 13,
  shell: 14,
  finblock: 15,
} as const;
const HOUSE_CONDITION_TO_KRISHA_VALUE = {
  fresh: 1,
  tidy: 2,
  needs_repair: 3,
  rough: 4,
  demolition: 5,
  unfinished: 6,
} as const;
const HEATING_TYPE_TO_KRISHA_VALUE = {
  central: 1,
  gas: 2,
  solid: 3,
  liquid: 4,
  electric: 7,
  mixed: 5,
  none: 6,
} as const;
const SEWAGE_TYPE_TO_KRISHA_VALUE = {
  central: 1,
  can_connect: 2,
  septic: 3,
  none: 4,
} as const;
const LAND_PURPOSE_TO_KRISHA_VALUE = {
  izhs: 1,
  farm: 2,
  lph: 3,
  gardening: 4,
  commercial: 5,
  mzh: 6,
  dacha: 7,
  other: 8,
} as const;
const COMMERCIAL_USE_CASE_TO_KRISHA_VALUE = {
  free: 1,
  office: 2,
  shop: 3,
  warehouse: 4,
  auto: 5,
  food: 6,
  beauty: 7,
  agriculture: 8,
  hotel: 9,
  medical: 11,
  education: 12,
  entertainment: 13,
} as const;
const COMMERCIAL_LOCATION_TO_KRISHA_VALUE = {
  business_center: 1,
  residential: 2,
  mall: 3,
  market: 4,
  standalone: 5,
} as const;

function addParam(params: string[], key: string, value: string | number): void {
  params.push(`${key}=${encodeURIComponent(String(value))}`);
}

function addRangeParams(
  params: string[],
  key: string,
  from: number | undefined,
  to: number | undefined,
): void {
  if (from !== undefined) addParam(params, `das[${key}][from]`, from);
  if (to !== undefined) addParam(params, `das[${key}][to]`, to);
}

function addRepeatedParams<T extends string>(
  params: string[],
  key: string,
  values: T[] | undefined,
  mapping: Record<T, string | number>,
): void {
  if (!values?.length) return;
  for (const value of values) {
    addParam(params, `das[${key}]`, mapping[value]);
  }
}

function buildTextQuery(intent: SearchIntent): string | undefined {
  const parts = [intent.residentialComplexName, intent.textQuery]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? [...new Set(parts)].join(" ") : undefined;
}

export function buildKrishaSearchUrl(intent: SearchIntent): string {
  const params: string[] = [];

  addRangeParams(params, "price", intent.priceFrom, intent.priceTo);
  addRangeParams(params, "house.year", intent.houseYearFrom, intent.houseYearTo);
  if (intent.categorySlug === "prodazha/kommercheskaya-nedvizhimost") {
    addRangeParams(params, "com.square", intent.squareFrom, intent.squareTo);
  } else {
    addRangeParams(params, "live.square", intent.squareFrom, intent.squareTo);
  }
  addRangeParams(params, "live.square_k", intent.kitchenSquareFrom, intent.kitchenSquareTo);
  addRangeParams(params, "land.square", intent.landSquareFrom, intent.landSquareTo);

  if (intent.categorySlug === "prodazha/kvartiry") {
    addRangeParams(params, "flat.floor", intent.floorFrom, intent.floorTo);
  }

  if (
    (intent.categorySlug === "prodazha/kvartiry" || intent.categorySlug === "prodazha/doma-dachi") &&
    intent.rooms?.length
  ) {
    for (const room of intent.rooms) {
      addParam(params, "das[live.rooms][]", room);
    }
  }

  if (intent.categorySlug === "prodazha/kvartiry" && intent.buildingType) {
    addParam(params, "das[flat.building]", BUILDING_TYPE_TO_KRISHA_VALUE[intent.buildingType]);
  }
  if (intent.categorySlug === "prodazha/doma-dachi" && intent.buildingType && !intent.houseMaterials?.length) {
    addParam(params, "das[house.building_opts]", BUILDING_TYPE_TO_HOUSE_MATERIAL_VALUE[intent.buildingType]);
  }
  if (intent.sellerType === "owner") {
    addParam(params, "das[who]", 1);
  }
  if (intent.sellerType === "agent") {
    addParam(params, "das[_sys.fromAgent]", 1);
  }
  if (intent.newBuilding) {
    addParam(params, "das[novostroiki]", 1);
  }
  if (intent.mortgage !== undefined) {
    addParam(params, "das[mortgage]", intent.mortgage ? 1 : 0);
  }
  if (intent.houseFloorCountFrom !== undefined) {
    addParam(params, "das[house.floor_num][from]", intent.houseFloorCountFrom);
  }
  if (intent.houseFloorCountTo !== undefined) {
    addParam(params, "das[house.floor_num][to]", intent.houseFloorCountTo);
  }
  if (intent.categorySlug === "prodazha/kvartiry" && intent.floorNotFirst) {
    addParam(params, "das[floor_not_first]", 1);
  }
  if (intent.categorySlug === "prodazha/kvartiry" && intent.floorNotLast) {
    addParam(params, "das[floor_not_last]", 1);
  }
  if (intent.hasPhoto) {
    addParam(params, "das[_sys.hasphoto]", 1);
  }
  if (intent.hasExchange) {
    addParam(params, "das[has_change]", 1);
  }
  if (intent.categorySlug === "prodazha/kvartiry" && intent.hasPhone) {
    addParam(params, "das[flat.phone]", 1);
  }
  if (intent.categorySlug === "prodazha/kvartiry") {
    addRepeatedParams(params, "flat.toilet", intent.toiletTypes, TOILET_TYPE_TO_KRISHA_VALUE);
    addRepeatedParams(params, "flat.phone", intent.phoneTypes, PHONE_TYPE_TO_KRISHA_VALUE);
    if (intent.dormitory !== undefined) {
      addParam(params, "das[flat.priv_dorm]", intent.dormitory ? 1 : 2);
    }
  }
  if (intent.categorySlug === "prodazha/doma-dachi") {
    if (intent.houseType) addParam(params, "das[house.type_object]", HOUSE_TYPE_TO_KRISHA_VALUE[intent.houseType]);
    addRepeatedParams(params, "house.building_opts", intent.houseMaterials, HOUSE_MATERIAL_TO_KRISHA_VALUE);
    if (intent.houseCondition) {
      addParam(params, "das[house.renewal]", HOUSE_CONDITION_TO_KRISHA_VALUE[intent.houseCondition]);
    }
    addRepeatedParams(params, "cmtn.heating", intent.heatingTypes, HEATING_TYPE_TO_KRISHA_VALUE);
    addRepeatedParams(params, "cmtn.sewage", intent.sewageTypes, SEWAGE_TYPE_TO_KRISHA_VALUE);
  }
  if (intent.categorySlug === "prodazha/uchastkov") {
    if (intent.landPurpose) addParam(params, "das[land.earmarked]", LAND_PURPOSE_TO_KRISHA_VALUE[intent.landPurpose]);
    if (intent.landDivisible !== undefined) {
      addParam(params, "das[land.separable]", intent.landDivisible ? 1 : 2);
    }
  }
  if (intent.categorySlug === "prodazha/kommercheskaya-nedvizhimost") {
    addRepeatedParams(params, "com.use_case", intent.commercialUseCases, COMMERCIAL_USE_CASE_TO_KRISHA_VALUE);
    if (intent.commercialLocation) {
      addParam(params, "das[com.location]", COMMERCIAL_LOCATION_TO_KRISHA_VALUE[intent.commercialLocation]);
    }
    if (intent.commercialHasTenants) addParam(params, "das[com.is_tenants]", 1);
    if (intent.commercialActiveBusiness) addParam(params, "das[estate.is_buss]", 1);
  }
  const textQuery = buildTextQuery(intent);
  if (textQuery) {
    addParam(params, "_txt_", textQuery);
  }

  const path = `${BASE_URL}/${intent.categorySlug}/${intent.geo.url_path}/`;
  return params.length > 0 ? `${path}?${params.join("&")}` : path;
}
