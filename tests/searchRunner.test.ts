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
  });

  it("post-filters listings by requested residential complex", async () => {
    process.env.KRISHA_FETCH_ENABLED = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(searchHtml(), { status: 200, headers: { "content-type": "text/html" } })),
    );

    const result = await runPublicSearch("https://krisha.kz/prodazha/kvartiry/almaty/?_txt_=Rams%20City", 5, intent);

    expect(result.status).toBe("completed");
    expect(result.listings.map((listing) => listing.advertId)).toEqual(["101"]);
  });
});
