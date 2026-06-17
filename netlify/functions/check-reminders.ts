import type { Config } from "@netlify/functions";
import { checkReminders } from "../../src/bot/reminderChecker";

export default async (_req: Request) => {
  const summary = await checkReminders();
  console.log("Reminder check complete", summary);
};

export const config: Config = {
  schedule: "* * * * *",
};
