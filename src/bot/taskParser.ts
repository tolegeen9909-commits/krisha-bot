import type { BotCommand } from "./types";

const DEFAULT_TIME_ZONE = "Asia/Almaty";
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type TaskCommand = Extract<
  BotCommand,
  | { kind: "create_task" }
  | { kind: "list_tasks" }
  | { kind: "complete_task" }
  | { kind: "delete_task" }
>;

export type TaskCommandParseResult =
  | { matched: false }
  | { matched: true; ok: true; command: TaskCommand }
  | { matched: true; ok: false; message: string };

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type ParseOptions = {
  now?: Date;
  timeZone?: string;
};

function getLocalParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function addLocalDays(parts: DateParts, days: number): Pick<DateParts, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedTimeToUtc(
  parts: Pick<DateParts, "year" | "month" | "day" | "hour" | "minute">,
  timeZone: string,
): Date {
  const guessMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const actualLocal = getLocalParts(new Date(guessMs), timeZone);
  const wantedAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const actualAsUtcMs = Date.UTC(
    actualLocal.year,
    actualLocal.month - 1,
    actualLocal.day,
    actualLocal.hour,
    actualLocal.minute,
    0,
  );
  return new Date(guessMs + (wantedAsUtcMs - actualAsUtcMs));
}

function parseHourMinute(rawHour: string, rawMinute: string | undefined): { hour: number; minute: number } | null {
  const hour = Number.parseInt(rawHour, 10);
  const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function ensureFuture(dueAt: Date, now: Date): Date | null {
  return dueAt.getTime() > now.getTime() ? dueAt : null;
}

function parseRelativeReminder(rest: string, now: Date): { dueAt: Date; text: string } | null {
  const match = rest.match(/^через\s+(\d+)\s+(минут[уы]?|мин|час(?:а|ов)?|ч)\s+(.+)$/iu);
  if (!match?.[1] || !match[2] || !match[3]?.trim()) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const unit = match[2].toLocaleLowerCase("ru");
  const durationMs = unit.startsWith("час") || unit === "ч" ? amount * HOUR_MS : amount * MINUTE_MS;
  return {
    dueAt: new Date(now.getTime() + durationMs),
    text: match[3].trim(),
  };
}

function parseTodayTomorrowReminder(
  rest: string,
  now: Date,
  timeZone: string,
): { dueAt: Date; text: string } | { error: string } | null {
  const match = rest.match(/^(сегодня|завтра)\s+(?:в\s+)?(\d{1,2})(?:(?::|[ .])(\d{2}))?\s+(.+)$/iu);
  if (!match?.[1] || !match[2] || !match[4]?.trim()) return null;

  const time = parseHourMinute(match[2], match[3]);
  if (!time) return { error: "Не понял время. Пример: <code>напомни завтра в 10 позвонить продавцу</code>" };

  const nowParts = getLocalParts(now, timeZone);
  const date = addLocalDays(nowParts, match[1].toLocaleLowerCase("ru") === "завтра" ? 1 : 0);
  const dueAt = zonedTimeToUtc({ ...date, ...time }, timeZone);
  const future = ensureFuture(dueAt, now);
  if (!future) return { error: "Это время уже прошло. Укажите будущее время." };

  return {
    dueAt: future,
    text: match[4].trim(),
  };
}

function parseDateReminder(
  rest: string,
  now: Date,
  timeZone: string,
): { dueAt: Date; text: string } | { error: string } | null {
  const match = rest.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\s+(?:в\s+)?(\d{1,2})(?:(?::|[ .])(\d{2}))?\s+(.+)$/iu);
  if (!match?.[1] || !match[2] || !match[4] || !match[6]?.trim()) return null;

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const nowParts = getLocalParts(now, timeZone);
  const yearRaw = match[3];
  const year = yearRaw ? Number.parseInt(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw, 10) : nowParts.year;
  const time = parseHourMinute(match[4], match[5]);

  if (!time || month < 1 || month > 12 || day < 1 || day > 31) {
    return { error: "Не понял дату. Пример: <code>напомни 18.06 в 15:30 написать клиенту</code>" };
  }

  let dueAt = zonedTimeToUtc({ year, month, day, ...time }, timeZone);
  if (!yearRaw && dueAt.getTime() <= now.getTime()) {
    dueAt = zonedTimeToUtc({ year: year + 1, month, day, ...time }, timeZone);
  }
  const future = ensureFuture(dueAt, now);
  if (!future) return { error: "Это время уже прошло. Укажите будущее время." };

  return {
    dueAt: future,
    text: match[6].trim(),
  };
}

function parseReminder(rest: string, options: Required<ParseOptions>): TaskCommandParseResult {
  const relative = parseRelativeReminder(rest, options.now);
  const parsed =
    relative ??
    parseTodayTomorrowReminder(rest, options.now, options.timeZone) ??
    parseDateReminder(rest, options.now, options.timeZone);

  if (!parsed) {
    return {
      matched: true,
      ok: false,
      message:
        "Не понял время напоминания. Примеры: <code>напомни завтра в 10 позвонить</code>, <code>напомни через 2 часа проверить объект</code>.",
    };
  }

  if ("error" in parsed) {
    return { matched: true, ok: false, message: parsed.error };
  }

  return {
    matched: true,
    ok: true,
    command: {
      kind: "create_task",
      text: parsed.text,
      dueAt: parsed.dueAt.toISOString(),
      sourceText: rest,
    },
  };
}

function parseReminderWithPrefix(prefix: string, rest: string, options: Required<ParseOptions>): TaskCommandParseResult {
  const parsed = parseReminder(rest, options);
  if (!parsed.matched || !parsed.ok) return parsed;
  if (parsed.command.kind !== "create_task") return parsed;
  const prefixText = prefix.trim();
  if (!prefixText) return parsed;

  return {
    matched: true,
    ok: true,
    command: {
      ...parsed.command,
      text: `${parsed.command.text} ${prefixText}`,
      sourceText: `${prefixText} напомни ${parsed.command.sourceText}`,
    },
  };
}

function createPlainTask(text: string): TaskCommandParseResult {
  const taskText = text.trim();
  if (!taskText) {
    return { matched: true, ok: false, message: "Напишите текст задачи. Пример: <code>задача позвонить продавцу</code>" };
  }

  return {
    matched: true,
    ok: true,
    command: {
      kind: "create_task",
      text: taskText,
      sourceText: taskText,
    },
  };
}

export function parseTaskCommand(text: string, options: ParseOptions = {}): TaskCommandParseResult {
  const trimmed = text.trim();
  const normalized = trimmed.toLocaleLowerCase("ru").replaceAll("ё", "е");
  const parseOptions: Required<ParseOptions> = {
    now: options.now ?? new Date(),
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  };

  if (normalized === "мои задачи" || normalized === "мои напоминания" || normalized === "задачи") {
    return { matched: true, ok: true, command: { kind: "list_tasks" } };
  }

  const doneMatch = trimmed.match(/^(?:готово|сделано|выполнил|выполнено)\s+([a-z0-9-]{4,})$/iu);
  if (doneMatch?.[1]) {
    return { matched: true, ok: true, command: { kind: "complete_task", taskId: doneMatch[1] } };
  }

  const deleteMatch = trimmed.match(/^(?:удали|удалить)\s+(?:задачу\s+)?([a-z0-9-]{4,})$/iu);
  if (deleteMatch?.[1]) {
    return { matched: true, ok: true, command: { kind: "delete_task", taskId: deleteMatch[1] } };
  }

  const reminderMatch = trimmed.match(/^(?:напомни|напомнить|напоминание)\s+(.+)$/iu);
  if (reminderMatch?.[1]) {
    return parseReminder(reminderMatch[1].trim(), parseOptions);
  }

  const inlineReminderMatch = trimmed.match(/^(.+?)\s+(?:напомни|напомнить|напоминание)\s+(.+)$/iu);
  if (inlineReminderMatch?.[1] && inlineReminderMatch[2]) {
    return parseReminderWithPrefix(inlineReminderMatch[1], inlineReminderMatch[2].trim(), parseOptions);
  }

  const taskMatch = trimmed.match(/^(?:задача|добавь\s+задачу|создай\s+задачу)\s+(.+)$/iu);
  if (taskMatch?.[1] !== undefined) {
    return createPlainTask(taskMatch[1]);
  }

  return { matched: false };
}

export function formatTaskDueAt(dueAt: string, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dueAt));
}
