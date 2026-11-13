import { describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { fetchProductPageDetails, parseProductPageHtml } from "../../server/lib/productPage";

it("keeps the URL storefront and rejects failed product-page navigation", async () => {
  const page = {
    goto: vi.fn(async (_url: string, _options: unknown) => ({ ok: () => false, status: () => 404 })),
    content: vi.fn(async () => "<body></body>"),
    close: vi.fn(async () => {}),
  };
  const newPage = vi.fn(async (_options: unknown) => page);
  vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", process.execPath);
  vi.spyOn(chromium, "launch").mockResolvedValue({ newPage } as unknown as Browser);
  try {
    await expect(fetchProductPageDetails("https://apps.apple.com/jp/app/id123?l=en"))
      .rejects.toThrow("404");
    expect(newPage.mock.calls[0]?.[0]).toEqual({
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    expect(page.goto.mock.calls[0]?.[0]).toBe("https://apps.apple.com/jp/app/id123?l=en");
    expect(page.close).toHaveBeenCalled();
    expect(page.content).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

describe("parseProductPageHtml", () => {
  it("extracts screenshot urls and in-app purchases from a rendered product page", () => {
    const html = `
      <section>
        <picture>
          <source
            type="image/jpeg"
            sizes="(max-width:739px) 300px,(min-width:1320px) 230px,230px"
            srcset="https://example.com/one.jpg/300x650bb-60.jpg 300w, https://example.com/one.jpg/230x499bb-60.jpg 230w"
          />
        </picture>
        <picture>
          <source
            type="image/jpeg"
            sizes="(max-width:739px) 300px,(min-width:1320px) 230px,230px"
            srcset="https://example.com/two.jpg/300x650bb-60.jpg 300w, https://example.com/two.jpg/230x499bb-60.jpg 230w"
          />
        </picture>
      </section>
      <dl>
        <div>
          <dt>In-App Purchases</dt>
          <dd>
            <details>
              <ul>
                <li>
                  <div class="text-pair">
                    <span>Funce Get 1198 coins</span>
                    <span>$4.99</span>
                  </div>
                </li>
                <li>
                  <div class="text-pair">
                    <span>Funce Get 2498 coins</span>
                    <span>$9.99</span>
                  </div>
                </li>
                <li>
                  <div class="button-wrapper">
                    <a href="https://apps.apple.com/us/iphone/story/id1436214772">Learn More</a>
                  </div>
                </li>
              </ul>
            </details>
          </dd>
        </div>
      </dl>
    `;

    expect(parseProductPageHtml(html)).toEqual({
      screenshotUrls: [
        "https://example.com/one.jpg/300x650bb-60.jpg",
        "https://example.com/two.jpg/300x650bb-60.jpg",
      ],
      iapItems: [
        {
          name: "Funce Get 1198 coins",
          price: "$4.99",
        },
        {
          name: "Funce Get 2498 coins",
          price: "$9.99",
        },
      ],
      versionHistory: [],
    });
  });

  it("extracts in-app purchases from Apple's JSON page payload", () => {
    const html = `<body>${JSON.stringify({
      pageData: {
        addOns: [
          { name: "Purchase More Coins", price: "$4.99" },
          { name: "Purchase Coins", price: "$19.99" },
          { name: "Purchase Coins", price: "$9.99" },
        ],
      },
    })}</body>`;

    expect(parseProductPageHtml(html)).toEqual({
      screenshotUrls: [],
      iapItems: [
        {
          name: "Purchase More Coins",
          price: "$4.99",
        },
        {
          name: "Purchase Coins",
          price: "$19.99",
        },
        {
          name: "Purchase Coins",
          price: "$9.99",
        },
      ],
      versionHistory: [],
    });
  });

  it("extracts all version history entries from Apple's JSON page payload", () => {
    const html = `<body>${JSON.stringify({
      pageData: {
        versionHistory: [
          {
            versionString: "1.16.24",
            releaseDate: "2026-05-06T02:08:36Z",
            releaseNotes: "Improved outfit logging",
          },
          {
            versionString: "1.0",
            releaseDate: "2026-04-24T01:43:36Z",
            releaseNotes: null,
          },
        ],
      },
    })}</body>`;

    expect(parseProductPageHtml(html).versionHistory).toEqual([
      {
        version: "1.16.24",
        releasedAt: "2026-05-06T02:08:36Z",
        notes: "Improved outfit logging",
      },
      {
        version: "1.0",
        releasedAt: "2026-04-24T01:43:36Z",
        notes: "",
      },
    ]);
  });
});
