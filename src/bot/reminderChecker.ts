import {
  listDueReminderTasks,
  updateReminderTask,
} from "../storage/blobStore";
import type { ReminderTask } from "../storage/types";
import { formatDueReminderMessage } from "./messages";
import { sendTelegramMessage } from "./telegramApi";

export type CheckRemindersSummary = {
  checked: number;
  sent: number;
  failed: number;
  errors: Array<{ taskId: string; message: string }>;
};

type CheckRemindersDeps = {
  listDueReminderTasks: (now: string, limit: number) => Promise<ReminderTask[]>;
  updateReminderTask: (task: ReminderTask) => Promise<ReminderTask>;
  sendTelegramMessage: (chatId: string, text: string) => Promise<void>;
  now: () => string;
  limit: number;
};

const DEFAULT_LIMIT = 20;

export async function checkReminders(
  partialDeps: Partial<CheckRemindersDeps> = {},
): Promise<CheckRemindersSummary> {
  const deps: CheckRemindersDeps = {
    listDueReminderTasks,
    updateReminderTask,
    sendTelegramMessage,
    now: () => new Date().toISOString(),
    limit: DEFAULT_LIMIT,
    ...partialDeps,
  };
  const now = deps.now();
  const dueTasks = await deps.listDueReminderTasks(now, deps.limit);
  const summary: CheckRemindersSummary = { checked: dueTasks.length, sent: 0, failed: 0, errors: [] };

  for (const task of dueTasks) {
    try {
      if (task.status !== "active" || task.remindedAt || !task.dueAt || task.dueAt > now) {
        continue;
      }

      await deps.sendTelegramMessage(task.chatId, formatDueReminderMessage(task));
      await deps.updateReminderTask({
        ...task,
        remindedAt: now,
      });
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.errors.push({ taskId: task.id, message });
      console.error("Reminder check failed", {
        taskId: task.id,
        error: message,
      });
    }
  }

  return summary;
}
