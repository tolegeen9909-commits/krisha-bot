import {
  getAiBaseUrl,
  getAiModel,
  getOptionalOpenAiApiKey,
  isAiIntentEnabled,
} from "../shared/config";
import type { AiIntentCandidate } from "./intentSchema";
import type { SearchIntent } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type AiIntentParser = (
  text: string,
  context?: { previousIntent?: SearchIntent },
) => Promise<AiIntentCandidate | null>;

function summarizePreviousIntent(previousIntent: SearchIntent | undefined): object | null {
  if (!previousIntent) return null;
  return {
    categorySlug: previousIntent.categorySlug,
    geo: previousIntent.geo.name,
    geoPath: previousIntent.geo.url_path,
    priceFrom: previousIntent.priceFrom,
    priceTo: previousIntent.priceTo,
    rooms: previousIntent.rooms,
    houseYearFrom: previousIntent.houseYearFrom,
    houseYearTo: previousIntent.houseYearTo,
    squareFrom: previousIntent.squareFrom,
    squareTo: previousIntent.squareTo,
    buildingType: previousIntent.buildingType,
    sellerType: previousIntent.sellerType,
    newBuilding: previousIntent.newBuilding,
    mortgage: previousIntent.mortgage,
    houseFloorCountFrom: previousIntent.houseFloorCountFrom,
    floorFrom: previousIntent.floorFrom,
    floorTo: previousIntent.floorTo,
    floorNotFirst: previousIntent.floorNotFirst,
    floorNotLast: previousIntent.floorNotLast,
    kitchenSquareFrom: previousIntent.kitchenSquareFrom,
    kitchenSquareTo: previousIntent.kitchenSquareTo,
    landSquareFrom: previousIntent.landSquareFrom,
    landSquareTo: previousIntent.landSquareTo,
    houseFloorCountTo: previousIntent.houseFloorCountTo,
    hasPhoto: previousIntent.hasPhoto,
    hasExchange: previousIntent.hasExchange,
    hasPhone: previousIntent.hasPhone,
    toiletTypes: previousIntent.toiletTypes,
    phoneTypes: previousIntent.phoneTypes,
    dormitory: previousIntent.dormitory,
    houseType: previousIntent.houseType,
    houseMaterials: previousIntent.houseMaterials,
    houseCondition: previousIntent.houseCondition,
    heatingTypes: previousIntent.heatingTypes,
    sewageTypes: previousIntent.sewageTypes,
    landPurpose: previousIntent.landPurpose,
    landDivisible: previousIntent.landDivisible,
    commercialUseCases: previousIntent.commercialUseCases,
    commercialLocation: previousIntent.commercialLocation,
    commercialHasTenants: previousIntent.commercialHasTenants,
    commercialActiveBusiness: previousIntent.commercialActiveBusiness,
    residentialComplexName: previousIntent.residentialComplexName,
    textQuery: previousIntent.textQuery,
    sort: previousIntent.sort,
  };
}

function buildPrompt(text: string, previousIntent: SearchIntent | undefined): string {
  return JSON.stringify({
    task: "Extract a Krisha.kz real estate search intent from informal Russian/Kazakh/Russian slang text.",
    rules: [
      "Return JSON only.",
      "Do not invent missing city, category, or filters.",
      "Use category values: apartment, land, house, commercial.",
      "Use sellerType values: owner, agent.",
      "Use buildingType values: panel, brick, monolith.",
      "Prices like 45 or 45 млн mean 45000000 tenge.",
      "двушка means apartment with rooms [2], однушка rooms [1], трешка rooms [3].",
      "For land plot area in сотки, use landSquareFrom/landSquareTo, not squareFrom/squareTo.",
      "For commercial area in square meters, use squareFrom/squareTo.",
      "давно висит or долго продается means sort oldest_first.",
      "Residential complex names after ЖК or жилой комплекс go into residentialComplexName, not textQuery.",
      "For furniture, balcony, parking, repair words without a structured field, put concise Russian keywords into textQuery.",
      "If the user asks for rent, phone reveal, login-only data, or impossible filters, put them into unsupportedFilters.",
    ],
    outputShape: {
      category: "apartment | land | house | commercial | null",
      geo: "city or region name or null",
      priceFrom: "number in tenge or short million value or null",
      priceTo: "number in tenge or short million value or null",
      rooms: "array of room numbers or null",
      houseYearFrom: "year or null",
      houseYearTo: "year or null",
      squareFrom: "number or null",
      squareTo: "number or null",
      kitchenSquareFrom: "number or null",
      kitchenSquareTo: "number or null",
      landSquareFrom: "number in sotka or null",
      landSquareTo: "number in sotka or null",
      buildingType: "panel | brick | monolith | null",
      sellerType: "owner | agent | null",
      newBuilding: "boolean or null",
      mortgage: "boolean or null",
      houseFloorCountFrom: "number or null",
      houseFloorCountTo: "number or null",
      floorFrom: "number or null",
      floorTo: "number or null",
      floorNotFirst: "boolean or null",
      floorNotLast: "boolean or null",
      hasPhoto: "boolean or null",
      hasExchange: "boolean or null",
      hasPhone: "boolean or null",
      toiletTypes: "array using separate, combined, two_plus, none or null",
      phoneTypes: "array using separate, blocker, connectable, none or null",
      dormitory: "boolean or null",
      houseType: "detached | part | dacha | null",
      houseMaterials:
        "array using brick, monolith, wood, saman, gas_silicate, gas_block, cinder_block, foam_block, heat_block, frame_reed, frame_panel, sip_panel, reinforced_panel, shell, finblock or null",
      houseCondition: "fresh | tidy | needs_repair | rough | demolition | unfinished | null",
      heatingTypes: "array using central, gas, solid, liquid, electric, mixed, none or null",
      sewageTypes: "array using central, can_connect, septic, none or null",
      landPurpose: "izhs | farm | lph | gardening | commercial | mzh | dacha | other | null",
      landDivisible: "boolean or null",
      commercialUseCases:
        "array using free, office, shop, warehouse, auto, food, beauty, agriculture, hotel, medical, education, entertainment or null",
      commercialLocation: "business_center | residential | mall | market | standalone | null",
      commercialHasTenants: "boolean or null",
      commercialActiveBusiness: "boolean or null",
      residentialComplexName: "name after ЖК / жилой комплекс or null",
      textQuery: "short Russian search keywords or null",
      sort: "oldest_first | null",
      unsupportedFilters: "array of strings or null",
    },
    previousIntent: summarizePreviousIntent(previousIntent),
    userText: text,
  });
}

function parseJsonObject(raw: string): AiIntentCandidate | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AiIntentCandidate) : null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/u);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AiIntentCandidate) : null;
    } catch {
      return null;
    }
  }
}

export async function parseAiIntentCandidate(
  text: string,
  context: { previousIntent?: SearchIntent } = {},
): Promise<AiIntentCandidate | null> {
  if (!isAiIntentEnabled()) return null;

  const apiKey = getOptionalOpenAiApiKey();
  const baseUrl = getAiBaseUrl();
  if (!apiKey && !baseUrl) return null;

  const url = `${(baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/u, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: getAiModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a strict JSON extractor. Return only valid JSON. Never browse. Never call external tools.",
        },
        {
          role: "user",
          content: buildPrompt(text, context.previousIntent),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI intent parser failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as ChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;
  return content ? parseJsonObject(content) : null;
}
