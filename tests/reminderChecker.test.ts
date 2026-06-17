import { describe, expect, it, vi } from "vitest";
import { checkReminders } from "../src/bot/reminderChecker";
import type { ReminderTask } from "../src/storage/types";

function task(overrides: Partial<ReminderTask> = {}): ReminderTask {
  return {
    id: "abc12345",
    chatId: "123",
    text: "позвонить продавцу",
    status: "active",
    dueAt: "2026-06-17T06:00:00.000Z",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkReminders", () => {
  it("sends due active reminders and marks them reminded after Telegram succeeds", async () => {
    const dueTask = task();
    const updateReminderTask = vi.fn(async (next: ReminderTask) => next);
    const sendTelegramMessage = vi.fn(async () => undefined);

    const summary = await checkReminders({
      listDueReminderTasks: vi.fn(async () => [dueTask]),
      updateReminderTask,
      sendTelegramMessage,
      now: () => "2026-06-17T07:00:00.000Z",
      limit: 20,
    });

    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, errors: [] });
    expect(sendTelegramMessage).toHaveBeenCalledWith("123", expect.stringContaining("позвонить продавцу"));
    expect(updateReminderTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "abc12345",
        remindedAt: "2026-06-17T07:00:00.000Z",
      }),
    );
  });

  it("skips future, completed, deleted, and already reminded tasks", async () => {
    const updateReminderTask = vi.fn(async (next: ReminderTask) => next);
    const sendTelegramMessage = vi.fn(async () => undefined);

    const summary = await checkReminders({
      listDueReminderTasks: vi.fn(async () => [
        task({ id: "future1", dueAt: "2026-06-17T08:00:00.000Z" }),
        task({ id: "done1", status: "done" }),
        task({ id: "delete1", status: "deleted" }),
        task({ id: "sent1", remindedAt: "2026-06-17T06:30:00.000Z" }),
      ]),
      updateReminderTask,
      sendTelegramMessage,
      now: () => "2026-06-17T07:00:00.000Z",
      limit: 20,
    });

    expect(summary).toEqual({ checked: 4, sent: 0, failed: 0, errors: [] });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(updateReminderTask).not.toHaveBeenCalled();
  });

  it("does not mark reminder as sent when Telegram fails", async () => {
    const dueTask = task();
    const updateReminderTask = vi.fn(async (next: ReminderTask) => next);

    const summary = await checkReminders({
      listDueReminderTasks: vi.fn(async () => [dueTask]),
      updateReminderTask,
      sendTelegramMessage: vi.fn(async () => {
        throw new Error("Telegram is down");
      }),
      now: () => "2026-06-17T07:00:00.000Z",
      limit: 20,
    });

    expect(summary).toEqual({
      checked: 1,
      sent: 0,
      failed: 1,
      errors: [{ taskId: "abc12345", message: "Telegram is down" }],
    });
    expect(updateReminderTask).not.toHaveBeenCalled();
  });
});
