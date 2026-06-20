import type { GeoNode, SupportedCategorySlug } from "../krisha/reference";

export type BuildingType = "panel" | "brick" | "monolith";
export type SellerType = "owner" | "agent";
export type ToiletType = "separate" | "combined" | "two_plus" | "none";
export type PhoneType = "separate" | "blocker" | "connectable" | "none";
export type HouseType = "detached" | "part" | "dacha";
export type HouseMaterial =
  | "brick"
  | "monolith"
  | "wood"
  | "saman"
  | "gas_silicate"
  | "gas_block"
  | "cinder_block"
  | "foam_block"
  | "heat_block"
  | "frame_reed"
  | "frame_panel"
  | "sip_panel"
  | "reinforced_panel"
  | "shell"
  | "finblock";
export type HouseCondition = "fresh" | "tidy" | "needs_repair" | "rough" | "demolition" | "unfinished";
export type HeatingType = "central" | "gas" | "solid" | "liquid" | "electric" | "mixed" | "none";
export type SewageType = "central" | "can_connect" | "septic" | "none";
export type LandPurpose = "izhs" | "farm" | "lph" | "gardening" | "commercial" | "mzh" | "dacha" | "other";
export type CommercialUseCase =
  | "free"
  | "office"
  | "shop"
  | "warehouse"
  | "auto"
  | "food"
  | "beauty"
  | "agriculture"
  | "hotel"
  | "medical"
  | "education"
  | "entertainment";
export type CommercialLocation = "business_center" | "residential" | "mall" | "market" | "standalone";

export type SearchIntent = {
  rawText: string;
  categorySlug: SupportedCategorySlug;
  geo: GeoNode;
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

export type BotCommand =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "search"; intent: SearchIntent }
  | { kind: "market_analysis"; intent: SearchIntent; sourceText: string }
  | { kind: "tracked_objects"; intent: SearchIntent; sourceText: string }
  | { kind: "real_estate_qa"; question: string }
  | { kind: "create_task"; text: string; dueAt?: string; sourceText: string }
  | { kind: "list_tasks" }
  | { kind: "complete_task"; taskId: string }
  | { kind: "delete_task"; taskId: string }
  | { kind: "save_search"; intent: SearchIntent; sourceText: string }
  | { kind: "check_searches" }
  | { kind: "list_searches" }
  | { kind: "stop_search"; savedSearchId: string };

export type ParseResult =
  | { ok: true; command: BotCommand }
  | { ok: false; message: string };
