import { describe, expect, it } from "vitest";
import { parseTaskCommand } from "../src/bot/taskParser";

const now = new Date("2026-06-17T07:00:00.000Z");

describe("taskParser", () => {
  it("parses a plain task", () => {
    const parsed = parseTaskCommand("задача проверить документы по объекту 12345678", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("проверить документы по объекту 12345678");
    expect(parsed.command.dueAt).toBeUndefined();
  });

  it("parses tomorrow reminder in Asia/Almaty", () => {
    const parsed = parseTaskCommand("напомни завтра в 10 позвонить продавцу", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("позвонить продавцу");
    expect(parsed.command.dueAt).toBe("2026-06-18T05:00:00.000Z");
  });

  it("parses today reminder with minutes", () => {
    const parsed = parseTaskCommand("напомни сегодня в 18:30 написать клиенту", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("написать клиенту");
    expect(parsed.command.dueAt).toBe("2026-06-17T13:30:00.000Z");
  });

  it("parses inline reminder after phone and note with space-separated time", () => {
    const parsed = parseTaskCommand("77000450925 готов сотрудничать напомни сегодня в 22 52 позвонить", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("позвонить 77000450925 готов сотрудничать");
    expect(parsed.command.dueAt).toBe("2026-06-17T17:52:00.000Z");
  });

  it("parses relative hour reminder", () => {
    const parsed = parseTaskCommand("напомни через 2 часа проверить объект", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("проверить объект");
    expect(parsed.command.dueAt).toBe("2026-06-17T09:00:00.000Z");
  });

  it("parses relative minute reminder", () => {
    const parsed = parseTaskCommand("напомни через 30 минут перезвонить", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("перезвонить");
    expect(parsed.command.dueAt).toBe("2026-06-17T07:30:00.000Z");
  });

  it("parses date reminder", () => {
    const parsed = parseTaskCommand("напомни 18.06 в 15:30 встретиться с клиентом", { now });

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.ok || parsed.command.kind !== "create_task") throw new Error("Expected create_task");
    expect(parsed.command.text).toBe("встретиться с клиентом");
    expect(parsed.command.dueAt).toBe("2026-06-18T10:30:00.000Z");
  });

  it("parses task management commands", () => {
    expect(parseTaskCommand("мои задачи", { now })).toEqual({
      matched: true,
      ok: true,
      command: { kind: "list_tasks" },
    });
    expect(parseTaskCommand("готово abc12345", { now })).toEqual({
      matched: true,
      ok: true,
      command: { kind: "complete_task", taskId: "abc12345" },
    });
    expect(parseTaskCommand("удали задачу abc12345", { now })).toEqual({
      matched: true,
      ok: true,
      command: { kind: "delete_task", taskId: "abc12345" },
    });
  });
});
