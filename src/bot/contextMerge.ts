import { normalizeText } from "../shared/text";
import { buildIntentFromPatch, type IntentBuildResult, type IntentPatch } from "./intentSchema";
import type { SearchIntent } from "./types";

const CONTEXT_UPDATE_PHRASES = [
  "как прошлый",
  "как прошлое",
  "как предыдущий",
  "как предыдущие",
  "как в прошлом",
  "тот же",
  "то же",
  "такой же",
];

export function isContextUpdate(text: string): boolean {
  const normalized = normalizeText(text);
  return CONTEXT_UPDATE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function mergeWithPreviousIntent(
  rawText: string,
  patch: IntentPatch,
  previousIntent?: SearchIntent,
): IntentBuildResult {
  if (!previousIntent) {
    return {
      ok: false,
      message: "Не нашел предыдущий поиск. Напишите полный запрос один раз, потом можно будет сказать: как прошлый, но до 50.",
    };
  }

  return buildIntentFromPatch(rawText, patch, previousIntent);
}
