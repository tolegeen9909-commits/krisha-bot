import type { Config } from "@netlify/functions";
import { checkSavedSearches } from "../../src/bot/savedSearchChecker";

export default async (_req: Request) => {
  const summary = await checkSavedSearches();
  console.log("Saved search check complete", summary);
};

export const config: Config = {
  schedule: "*/30 * * * *",
};
