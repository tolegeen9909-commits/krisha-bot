import { afterEach, describe, expect, it, vi } from "vitest";
import { runPublicSearch } from "../src/krisha/searchRunner";
import type { SearchIntent } from "../src/bot/types";

const intent: SearchIntent = {
  rawText: "двушка Алматы ЖК Rams City",
  categorySlug: "prodazha/kvartiry",
  geo: {
    name: "Алматы",
    slug: "almaty",
    type: "city",
    url_path: "almaty",
    parent_url_path: null,
    verified: true,
    in_sitemap: true,
    name_source: "test",
  },
  residentialComplexName: "Rams City",
};

function searchHtml(): string {
  return `
    <article class="a-card">
      <a href="/a/show/101" title="2-комнатная квартира в ЖК Rams City">2-комнатная квартира</a>
      <div class="a-card__price">55 000 000 ₸</div>
      <div class="a-card__subtitle">Алматы, ЖК Rams City</div>
    </article>
    <article class="a-card">
      <a href="/a/show/102" title="2-комнатная квартира">2-комнатная квартира</a>
      <div class="a-card__price">50 000 000 ₸</div>
      <div class="a-card__subtitle">Алматы, другой ЖК</div>
    </article>
  `;
}

describe("runPublicSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KRISHA_FETCH_ENABLED;
    delete process.env.FIRECRAWL_API_KEY;
  });

  it("post-filters listings by requested residential complex", async () => {
    process.env.KRISHA_FETCH_ENABLED = "true";
    const fetchMock = vi.fn(async () => new Response(searchHtml(), { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPublicSearch("https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City", 5, intent);

    expect(result.status).toBe("completed");
    expect(result.listings.map((listing) => listing.advertId)).toEqual(["101"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call Firecrawl when direct parser finds listings", async () => {
    process.env.KRISHA_FETCH_ENABLED = "true";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    const fetchMock = vi.fn(async () => new Response(searchHtml(), { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPublicSearch("https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City", 5, intent);

    expect(result.status).toBe("completed");
    expect(result.listings.map((listing) => listing.advertId)).toEqual(["101"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Firecrawl fallback when direct parser extracts no listings", async () => {
    process.env.KRISHA_FETCH_ENABLED = "true";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html><body>empty public page</body></html>", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: [
                "[2-комнатная квартира в ЖК Rams City](https://krisha.kz/a/show/201)",
                "55 000 000 ₸",
                "Алматы, ЖК Rams City",
              ].join("\n"),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPublicSearch("https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City", 5, intent);

    expect(result.status).toBe("completed");
    expect(result.listings).toEqual([
      expect.objectContaining({
        advertId: "201",
        title: "2-комнатная квартира в ЖК Rams City",
        price: "55 000 000 ₸",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.firecrawl.dev/v2/scrape");
  });

  it("keeps current empty result when Firecrawl is not configured", async () => {
    process.env.KRISHA_FETCH_ENABLED = "true";
    const fetchMock = vi.fn(async () => new Response("<html><body>empty public page</body></html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPublicSearch("https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City", 5, intent);

    expect(result).toEqual({ status: "completed", listings: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
