export function isChatAllowed(chatId: string | number, allowedChatIds: Set<string>): boolean {
  return allowedChatIds.has(String(chatId));
}

export function isWebhookSecretValid(received: string | null, configured?: string): boolean {
  if (!configured) return true;
  return received === configured;
}
