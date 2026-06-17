import { getCategoryName } from "../krisha/reference";
import { escapeHtml } from "../shared/text";
import type {
  CommercialLocation,
  CommercialUseCase,
  HeatingType,
  HouseCondition,
  HouseMaterial,
  HouseType,
  LandPurpose,
  PhoneType,
  SearchIntent,
  SewageType,
  ToiletType,
} from "./types";
import type { ListingResult, ReminderTask, SavedSearch, Task, TaskResult } from "../storage/types";
import type { MarketSnapshot } from "./realtorAssistant";
import { splitTrackedListings } from "./realtorAssistant";
import { formatTaskDueAt } from "./taskParser";

const labelMaps = {
  toilet: {
    separate: "санузел раздельный",
    combined: "санузел совмещенный",
    two_plus: "2 с/у и более",
    none: "без санузла",
  } satisfies Record<ToiletType, string>,
  phone: {
    separate: "телефон отдельный",
    blocker: "телефон блокиратор",
    connectable: "телефон можно подключить",
    none: "без телефона",
  } satisfies Record<PhoneType, string>,
  houseType: {
    detached: "отдельный дом",
    part: "часть дома",
    dacha: "дача",
  } satisfies Record<HouseType, string>,
  houseMaterial: {
    brick: "кирпич",
    monolith: "монолит",
    wood: "дерево",
    saman: "саман",
    gas_silicate: "газосиликат",
    gas_block: "газобетон",
    cinder_block: "шлакоблок",
    foam_block: "пеноблок",
    heat_block: "теплоблок",
    frame_reed: "каркасно-камышитовый",
    frame_panel: "каркасно-щитовой",
    sip_panel: "СИП-панели",
    reinforced_panel: "ЖБ-панели",
    shell: "ракушняк",
    finblock: "финблок",
  } satisfies Record<HouseMaterial, string>,
  houseCondition: {
    fresh: "свежий ремонт",
    tidy: "аккуратный ремонт",
    needs_repair: "нужен ремонт",
    rough: "черновая отделка",
    demolition: "под снос",
    unfinished: "недостроенный",
  } satisfies Record<HouseCondition, string>,
  heating: {
    central: "отопление центральное",
    gas: "отопление на газе",
    solid: "отопление на твердом топливе",
    liquid: "отопление на жидком топливе",
    electric: "отопление электрическое",
    mixed: "отопление смешанное",
    none: "без отопления",
  } satisfies Record<HeatingType, string>,
  sewage: {
    central: "канализация центральная",
    can_connect: "канализацию можно подвести",
    septic: "септик",
    none: "без канализации",
  } satisfies Record<SewageType, string>,
  landPurpose: {
    izhs: "ИЖС",
    farm: "КХ",
    lph: "ЛПХ",
    gardening: "садоводство",
    commercial: "коммерческое назначение",
    mzh: "МЖС",
    dacha: "дачное строительство",
    other: "другое назначение",
  } satisfies Record<LandPurpose, string>,
  commercialUseCase: {
    free: "свободное назначение",
    office: "офисы",
    shop: "магазины",
    warehouse: "склады",
    auto: "АЗС/автосервис/автомойка",
    food: "общепит",
    beauty: "салоны красоты",
    agriculture: "сельское хозяйство",
    hotel: "гостиницы/зоны отдыха",
    medical: "медцентры/аптеки",
    education: "образование",
    entertainment: "развлечения",
  } satisfies Record<CommercialUseCase, string>,
  commercialLocation: {
    business_center: "в бизнес-центре",
    residential: "в жилом доме/ЖК",
    mall: "в торговом центре",
    market: "на рынке",
    standalone: "отдельностоящее здание",
  } satisfies Record<CommercialLocation, string>,
};

function pushMapped<T extends string>(parts: string[], values: T[] | undefined, labels: Record<T, string>): void {
  if (!values?.length) return;
  parts.push(...values.map((value) => labels[value]));
}

function formatMoney(value: number | undefined): string {
  return value === undefined ? "нет данных" : `${value.toLocaleString("ru-RU")} ₸`;
}

export function formatHelpMessage(): string {
  return [
    "Напишите поисковый запрос:",
    "",
    "Квартиры: <code>квартиры на продажу в Астане 2-3 комнаты до 60 млн</code>",
    "Живой запрос: <code>двушка Алматы Ауэзовский до 45 хозяева раздельный санузел с фото</code>",
    "Как прошлый: <code>как прошлый, но до 50 и не последний</code>",
    "Дом: <code>дом Алматы от 100 млн 8 соток кирпич газовое отопление септик</code>",
    "Участки: <code>участок Алматы 6-10 соток ИЖС делимый не в залоге</code>",
    "Коммерция: <code>коммерция Алматы офис от 80 м2 в бизнес центре</code>",
    "Анализ: <code>анализ рынка двушка Алматы до 45</code>",
    "Новые/старые: <code>новые и старые участки Алматы ИЖС</code>",
    "Вопрос: <code>как понять что квартира переоценена?</code>",
    "Напомнить: <code>напомни завтра в 10 позвонить продавцу</code>",
    "Задача: <code>задача проверить документы по объекту 12345678</code>",
    "Мои задачи: <code>мои задачи</code>",
    "Следить: <code>следи за 2-комн Алматы до 45 млн</code>",
    "Список: <code>мои поиски</code>",
    "Остановить: <code>останови поиск abc12345</code>",
    "",
    "Пока поддерживаю продажу по публичной выдаче Krisha.",
  ].join("\n");
}

export function formatParseError(message: string): string {
  return `${escapeHtml(message)}\n\n${formatHelpMessage()}`;
}

export function formatIntentSummary(intent: SearchIntent): string {
  const parts = [getCategoryName(intent.categorySlug), intent.geo.name];
  if (intent.rooms?.length) parts.push(`комнаты: ${intent.rooms.join(", ")}`);
  if (intent.priceFrom) parts.push(`от ${intent.priceFrom.toLocaleString("ru-RU")} ₸`);
  if (intent.priceTo) parts.push(`до ${intent.priceTo.toLocaleString("ru-RU")} ₸`);
  if (intent.squareFrom) parts.push(`площадь от ${intent.squareFrom} м²`);
  if (intent.squareTo) parts.push(`площадь до ${intent.squareTo} м²`);
  if (intent.kitchenSquareFrom) parts.push(`кухня от ${intent.kitchenSquareFrom} м²`);
  if (intent.kitchenSquareTo) parts.push(`кухня до ${intent.kitchenSquareTo} м²`);
  if (intent.landSquareFrom) parts.push(`участок от ${intent.landSquareFrom} сот.`);
  if (intent.landSquareTo) parts.push(`участок до ${intent.landSquareTo} сот.`);
  if (intent.houseYearFrom) parts.push(`год от ${intent.houseYearFrom}`);
  if (intent.houseYearTo) parts.push(`год до ${intent.houseYearTo}`);
  if (intent.buildingType === "brick") parts.push("кирпич");
  if (intent.buildingType === "monolith") parts.push("монолит");
  if (intent.buildingType === "panel") parts.push("панель");
  if (intent.sellerType === "owner") parts.push("хозяева");
  if (intent.sellerType === "agent") parts.push("агенты");
  if (intent.newBuilding) parts.push("новостройка");
  if (intent.mortgage === true) parts.push("в залоге");
  if (intent.mortgage === false) parts.push("не в залоге");
  if (intent.floorFrom) parts.push(`этаж от ${intent.floorFrom}`);
  if (intent.floorTo) parts.push(`этаж до ${intent.floorTo}`);
  if (intent.houseFloorCountFrom) parts.push(`этажей от ${intent.houseFloorCountFrom}`);
  if (intent.houseFloorCountTo) parts.push(`этажей до ${intent.houseFloorCountTo}`);
  if (intent.floorNotFirst) parts.push("не первый");
  if (intent.floorNotLast) parts.push("не последний");
  if (intent.hasPhoto) parts.push("с фото");
  if (intent.hasExchange) parts.push("обмен");
  if (intent.hasPhone) parts.push("с телефоном");
  pushMapped(parts, intent.toiletTypes, labelMaps.toilet);
  pushMapped(parts, intent.phoneTypes, labelMaps.phone);
  if (intent.dormitory === true) parts.push("бывшее общежитие");
  if (intent.dormitory === false) parts.push("не общежитие");
  if (intent.houseType) parts.push(labelMaps.houseType[intent.houseType]);
  pushMapped(parts, intent.houseMaterials, labelMaps.houseMaterial);
  if (intent.houseCondition) parts.push(labelMaps.houseCondition[intent.houseCondition]);
  pushMapped(parts, intent.heatingTypes, labelMaps.heating);
  pushMapped(parts, intent.sewageTypes, labelMaps.sewage);
  if (intent.landPurpose) parts.push(labelMaps.landPurpose[intent.landPurpose]);
  if (intent.landDivisible === true) parts.push("делимый");
  if (intent.landDivisible === false) parts.push("неделимый");
  pushMapped(parts, intent.commercialUseCases, labelMaps.commercialUseCase);
  if (intent.commercialLocation) parts.push(labelMaps.commercialLocation[intent.commercialLocation]);
  if (intent.commercialHasTenants) parts.push("с арендаторами");
  if (intent.commercialActiveBusiness) parts.push("действующий бизнес");
  if (intent.residentialComplexName) parts.push(`ЖК: ${intent.residentialComplexName}`);
  if (intent.textQuery) parts.push(`текст: ${intent.textQuery}`);
  return parts.join(" · ");
}

function formatNoListingsMessage(intent: SearchIntent): string {
  if (intent.residentialComplexName) {
    return `Ссылку собрал, но на первой публичной странице не нашел карточки, где явно видно ЖК ${escapeHtml(intent.residentialComplexName)}.`;
  }
  return "Ссылку собрал, но карточки объявлений на странице не распознал.";
}

function formatListings(listings: ListingResult[]): string[] {
  return listings.map((listing, index) => {
    const price = listing.price ? ` — ${escapeHtml(listing.price)}` : "";
    const location = listing.location ? `\n   ${escapeHtml(listing.location)}` : "";
    const publishedAt = listing.publishedAtText ? `\n   Дата: ${escapeHtml(listing.publishedAtText)}` : "";
    const reasons = listing.opportunityReasons?.length
      ? `\n   Почему важно: ${escapeHtml(listing.opportunityReasons.join("; "))}`
      : "";
    return `${index + 1}. <a href="${escapeHtml(listing.url)}">${escapeHtml(listing.title)}</a>${price}${location}${publishedAt}${reasons}`;
  });
}

export function formatSearchResponse(task: Task, result: TaskResult): string {
  const lines = [
    `<b>${escapeHtml(task.categoryName)}</b>`,
    `${escapeHtml(task.geoName)}`,
    ...(task.intent.residentialComplexName ? [`ЖК: ${escapeHtml(task.intent.residentialComplexName)}`] : []),
    `<a href="${escapeHtml(task.searchUrl)}">Открыть поиск на Krisha</a>`,
    "",
  ];

  if (result.status === "fetch_disabled") {
    lines.push("Ссылку собрал. Живое чтение публичной выдачи отключено в этом окружении.");
    return lines.join("\n");
  }

  if (result.status === "fetch_failed") {
    lines.push("Ссылку собрал, но публичную страницу сейчас не удалось прочитать.");
    if (result.error) lines.push(escapeHtml(result.error));
    return lines.join("\n");
  }

  if (result.listings.length === 0) {
    lines.push(formatNoListingsMessage(task.intent));
    return lines.join("\n");
  }

  const rawText = task.rawText.toLocaleLowerCase("ru");
  if (rawText.includes("давно") || rawText.includes("долго") || rawText.includes("старые")) {
    lines.push("Сортирую по видимой дате на первой публичной странице: старые выше.");
    lines.push("");
  }

  lines.push(...formatListings(result.listings));
  return lines.join("\n");
}

export function formatMarketAnalysisResponse(
  intent: SearchIntent,
  searchUrl: string,
  snapshot: MarketSnapshot,
): string {
  const lines = [
    "<b>Анализ рынка</b>",
    `${escapeHtml(formatIntentSummary(intent))}`,
    `<a href="${escapeHtml(searchUrl)}">Открыть поиск на Krisha</a>`,
    "",
    `Выборка: ${snapshot.sampleSize} объявл., с ценой: ${snapshot.pricedCount}`,
    `Цена: ${formatMoney(snapshot.minPrice)} - ${formatMoney(snapshot.maxPrice)}`,
    `Медиана: ${formatMoney(snapshot.medianPrice)}`,
    `Типичный диапазон: ${formatMoney(snapshot.typicalLow)} - ${formatMoney(snapshot.typicalHigh)}`,
    "",
  ];

  if (snapshot.status === "insufficient_data") {
    lines.push(
      intent.residentialComplexName && snapshot.sampleSize === 0
        ? `На первой публичной странице не нашел карточки, где явно видно ЖК ${escapeHtml(intent.residentialComplexName)}.`
        : "Мало цен в видимой выдаче, поэтому вывод осторожный.",
    );
  }

  if (snapshot.cheapest.length > 0) {
    lines.push("<b>Дешевые видимые варианты</b>", ...formatListings(snapshot.cheapest));
  }

  if (snapshot.opportunities.length > 0) {
    lines.push("", "<b>Что взять в работу</b>", ...formatListings(snapshot.opportunities));
  }

  lines.push("", escapeHtml(snapshot.caveat));
  return lines.join("\n");
}

export function formatTrackedObjectsResponse(
  intent: SearchIntent,
  searchUrl: string,
  listings: ListingResult[],
  hasHistory: boolean,
): string {
  const split = splitTrackedListings(listings);
  const lines = [
    "<b>Новые и старые объекты</b>",
    `${escapeHtml(formatIntentSummary(intent))}`,
    `<a href="${escapeHtml(searchUrl)}">Открыть поиск на Krisha</a>`,
    "",
  ];

  if (!hasHistory) {
    lines.push("Истории по этому сегменту пока нет. Сохраните поиск, и бот начнет отличать новые, старые и снизившие цену объекты.");
    lines.push("");
  }

  if (split.newListings.length > 0) {
    lines.push("<b>Новые для мониторинга</b>", ...formatListings(split.newListings.slice(0, 5)), "");
  }
  if (split.priceDrops.length > 0) {
    lines.push("<b>Снизили цену</b>", ...formatListings(split.priceDrops.slice(0, 5)), "");
  }
  if (split.oldListings.length > 0) {
    lines.push("<b>Давно стоят</b>", ...formatListings(split.oldListings.slice(0, 5)), "");
  }

  if (split.newListings.length === 0 && split.priceDrops.length === 0 && split.oldListings.length === 0) {
    if (listings.length === 0 && intent.residentialComplexName) {
      lines.push(`На первой публичной странице не нашел карточки, где явно видно ЖК ${escapeHtml(intent.residentialComplexName)}.`);
    } else {
      lines.push("По видимой выдаче пока нет сильных сигналов. Ниже первые найденные объекты:", ...formatListings(listings.slice(0, 5)));
    }
  }

  return lines.join("\n").trim();
}

export function formatRealEstateQaResponse(answer: string): string {
  return `<b>Помощник по недвижимости</b>\n${escapeHtml(answer)}`;
}

function formatReminderTaskLine(task: ReminderTask, index: number): string {
  const due = task.dueAt ? `\n   Когда: ${escapeHtml(formatTaskDueAt(task.dueAt))}` : "";
  const reminded = task.remindedAt ? `\n   Напоминание отправлено: ${escapeHtml(formatTaskDueAt(task.remindedAt))}` : "";
  const status = task.status === "done" ? " · готово" : "";
  return `${index + 1}. <code>${escapeHtml(task.id)}</code>${status} — ${escapeHtml(task.text)}${due}${reminded}`;
}

export function formatReminderTaskCreated(task: ReminderTask): string {
  const lines = [
    task.dueAt ? "<b>Напоминание создано</b>" : "<b>Задача создана</b>",
    `ID: <code>${escapeHtml(task.id)}</code>`,
    escapeHtml(task.text),
  ];

  if (task.dueAt) {
    lines.push(`Когда: ${escapeHtml(formatTaskDueAt(task.dueAt))}`);
  }

  return lines.join("\n");
}

export function formatReminderTaskList(tasks: ReminderTask[]): string {
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length === 0) {
    return "Активных задач пока нет. Пример: <code>напомни завтра в 10 позвонить продавцу</code>";
  }

  return ["<b>Мои задачи</b>", ...activeTasks.slice(0, 20).map(formatReminderTaskLine)].join("\n");
}

export function formatReminderTaskCompleted(task: ReminderTask): string {
  return [
    "<b>Задача закрыта</b>",
    `ID: <code>${escapeHtml(task.id)}</code>`,
    escapeHtml(task.text),
  ].join("\n");
}

export function formatReminderTaskDeleted(task: ReminderTask): string {
  return [
    "<b>Задача удалена</b>",
    `ID: <code>${escapeHtml(task.id)}</code>`,
    escapeHtml(task.text),
  ].join("\n");
}

export function formatReminderTaskNotFound(taskId: string): string {
  return `Не нашел задачу <code>${escapeHtml(taskId)}</code> в этом чате.`;
}

export function formatDueReminderMessage(task: ReminderTask): string {
  const due = task.dueAt ? `\nКогда: ${escapeHtml(formatTaskDueAt(task.dueAt))}` : "";
  return [`<b>Напоминание</b>`, escapeHtml(task.text), due, "", `Закрыть: <code>готово ${escapeHtml(task.id)}</code>`].join("\n");
}

export function formatStatusMessage(task: Task, result: TaskResult | null): string {
  const lines = [
    `<b>Последний запрос</b>`,
    `${escapeHtml(task.categoryName)} · ${escapeHtml(task.geoName)}`,
    `Статус: <code>${escapeHtml(task.status)}</code>`,
    `<a href="${escapeHtml(task.searchUrl)}">Открыть поиск</a>`,
  ];

  if (result?.listings.length) {
    lines.push("", ...formatListings(result.listings));
  }

  return lines.join("\n");
}

export function formatSavedSearchCreated(savedSearch: SavedSearch, result: TaskResult): string {
  const lines = [
    "<b>Поиск сохранен</b>",
    `ID: <code>${escapeHtml(savedSearch.id)}</code>`,
    `${escapeHtml(formatIntentSummary(savedSearch.intent))}`,
    `<a href="${escapeHtml(savedSearch.searchUrl)}">Открыть поиск на Krisha</a>`,
    "",
  ];

  if (result.status === "fetch_disabled") {
    lines.push("Буду следить после включения живого чтения публичной выдачи.");
    return lines.join("\n");
  }

  if (result.status === "fetch_failed") {
    lines.push("Поиск сохранил, но первую публичную страницу сейчас не удалось прочитать.");
    if (result.error) lines.push(escapeHtml(result.error));
    return lines.join("\n");
  }

  if (result.listings.length === 0) {
    lines.push(
      savedSearch.intent.residentialComplexName
        ? `Поиск сохранил. Первую страницу прочитал, но видимых карточек по ЖК ${escapeHtml(savedSearch.intent.residentialComplexName)} не нашел.`
        : "Поиск сохранил. Первую страницу прочитал, но карточки объявлений не распознал.",
    );
    return lines.join("\n");
  }

  lines.push("Текущие объявления запомнил и повторно их присылать не буду:");
  lines.push("", ...formatListings(result.listings));
  return lines.join("\n");
}

export function formatSavedSearchList(searches: SavedSearch[]): string {
  if (searches.length === 0) {
    return "Пока нет сохраненных поисков. Напишите: <code>следи за квартиры на продажу в Алматы до 60 млн</code>";
  }

  const lines = ["<b>Сохраненные поиски</b>"];
  for (const search of searches.slice(0, 20)) {
    const status = search.status === "active" ? "активен" : "остановлен";
    const checked = search.lastCheckedAt ? ` · проверен ${escapeHtml(search.lastCheckedAt)}` : "";
    lines.push(
      `<code>${escapeHtml(search.id)}</code> · ${status} · ${escapeHtml(formatIntentSummary(search.intent))}${checked}`,
    );
  }

  if (searches.length > 20) {
    lines.push(`...и еще ${searches.length - 20}`);
  }

  return lines.join("\n");
}

export function formatSavedSearchStopped(savedSearch: SavedSearch): string {
  return [
    "<b>Поиск остановлен</b>",
    `ID: <code>${escapeHtml(savedSearch.id)}</code>`,
    `${escapeHtml(formatIntentSummary(savedSearch.intent))}`,
  ].join("\n");
}

export function formatSavedSearchNotFound(savedSearchId: string): string {
  return `Не нашел сохраненный поиск <code>${escapeHtml(savedSearchId)}</code> в этом чате.`;
}

export function formatSavedSearchAlert(savedSearch: SavedSearch, listings: ListingResult[]): string {
  const lines = [
    `<b>Новые объявления</b>`,
    `Поиск <code>${escapeHtml(savedSearch.id)}</code> · ${escapeHtml(formatIntentSummary(savedSearch.intent))}`,
    `<a href="${escapeHtml(savedSearch.searchUrl)}">Открыть поиск на Krisha</a>`,
    "",
    ...formatListings(listings),
  ];

  return lines.join("\n");
}
