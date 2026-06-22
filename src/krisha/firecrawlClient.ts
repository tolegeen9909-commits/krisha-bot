import { getOptionalFirecrawlApiKey } from "../shared/config";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

export type FirecrawlScrapeData = {
  markdown?: string;
  html?: string;
};

export type FirecrawlScrapeResult =
  | { status: "skipped"; reason: "missing_api_key" }
  | { status: "completed"; data: FirecrawlScrapeData }
  | { status: "failed"; error: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractScrapeData(payload: unknown): FirecrawlScrapeData {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const markdown = typeof data?.markdown === "string" ? data.markdown : undefined;
  const html = typeof data?.html === "string" ? data.html : undefined;
  return {
    ...(markdown ? { markdown } : {}),
    ...(html ? { html } : {}),
  };
}

function extractError(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const error = root?.error ?? root?.message;
  return typeof error === "string" && error.trim() ? error.trim() : undefined;
}

export async function scrapeWithFirecrawl(url: string): Promise<FirecrawlScrapeResult> {
  const apiKey = getOptionalFirecrawlApiKey();
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };

  try {
    const response = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: false,
        timeout: 30_000,
      }),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return { status: "failed", error: `Firecrawl returned HTTP ${response.status}` };
    }

    const root = asRecord(payload);
    if (root?.success === false) {
      return { status: "failed", error: extractError(payload) ?? "Firecrawl scrape failed" };
    }

    const data = extractScrapeData(payload);
    if (!data.markdown && !data.html) {
      return { status: "failed", error: "Firecrawl response did not include markdown or html" };
    }

    return { status: "completed", data };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown Firecrawl error",
    };
  }
}
