import { normalizeText, normalizeWhitespace } from "../shared/text";

const MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

const DATE_TEXT_RE =
  /(?:сегодня|вчера|\d+\s*(?:мин(?:ут[уы]?)?|час(?:а|ов)?|д(?:ень|ня|ней)|дн\.?)\s*(?:назад)?|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))/iu;

export type ParsedDateText = {
  text: string;
  timestamp: number;
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function parsePublicDateText(value: string, now = new Date()): ParsedDateText | null {
  const text = normalizeText(value);
  if (!text) return null;

  if (text === "сегодня") {
    return { text: value, timestamp: startOfDay(now) };
  }

  if (text === "вчера") {
    return { text: value, timestamp: startOfDay(now) - 24 * 60 * 60 * 1000 };
  }

  const relative = text.match(/(\d+)\s*(мин|минута|минуты|минут|час|часа|часов|день|дня|дней|дн\.?)/u);
  if (relative) {
    const amount = Number(relative[1] ?? 0);
    const unit = relative[2] ?? "";
    const minutes = unit.startsWith("мин") ? amount : unit.startsWith("час") ? amount * 60 : amount * 24 * 60;
    return { text: value, timestamp: now.getTime() - minutes * 60 * 1000 };
  }

  const absolute = text.match(/(\d{1,2})\s+([а-я]+)/u);
  if (absolute) {
    const day = Number(absolute[1] ?? 0);
    const month = MONTHS[absolute[2] ?? ""];
    if (month === undefined || day < 1 || day > 31) return null;

    let date = new Date(now.getFullYear(), month, day);
    if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      date = new Date(now.getFullYear() - 1, month, day);
    }

    return { text: value, timestamp: date.getTime() };
  }

  return null;
}

export function extractPublicDateText(value: string, now = new Date()): ParsedDateText | null {
  const match = normalizeWhitespace(value).match(DATE_TEXT_RE);
  if (!match?.[0]) return null;
  return parsePublicDateText(match[0], now);
}
