import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LookupCandidate, SearchResult } from "../../../shared/types";
import { installDialogPolyfill, makeApp, matched, renderInspector } from "./fixtures";

beforeAll(installDialogPolyfill);
afterEach(cleanup);

const alternate: LookupCandidate = {
  name: "Funce Daily",
  developer: "B Dev",
  appleId: 456,
  bundleId: "com.example.funceDaily",
  appStoreUrl: "https://apps.apple.com/us/app/funce-daily/id456",
  iconUrl: "",
  description: "Daily description",
  screenshotUrls: ["https://example.com/c1.png", "https://example.com/c2.png"],
};

describe("inspector screenshots", () => {
  it("upgrades thumbnails to high-resolution media and returns focus on Escape", async () => {
    const result = matched({
      screenshotUrls: ["https://example.com/320x480bb.jpg", "https://example.com/321x481bb.jpg"],
    });
    renderInspector(result);

    const trigger = screen.getByRole("button", { name: "放大查看Funce 商店截图 1" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    expect(dialog).not.toBeNull();
    const firstImage = dialog?.querySelector<HTMLImageElement>('img[alt="Funce 商店截图 1"]');
    expect(firstImage?.getAttribute("src")).toBe("https://example.com/1290x2796bb.jpg");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(dialog?.open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("moves through the gallery with arrow keys", async () => {
    renderInspector(
      matched({
        screenshotUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "放大查看Funce 商店截图 1" }));
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    expect(dialog?.getAttribute("aria-label")).toBe("Funce 商店截图 1");

    fireEvent.keyDown(dialog!, { key: "ArrowRight" });
    await waitFor(() => expect(dialog?.getAttribute("aria-label")).toBe("Funce 商店截图 2"));
  });

  it("opens candidate thumbnails in the same lightbox", () => {
    const result: SearchResult = {
      query: "Funce",
      status: "uncertain_match",
      app: makeApp(),
      candidates: [makeApp(), alternate],
      alternates: [],
      iapHints: null,
      message: "Possible match found; review alternates",
    };
    renderInspector(result);

    fireEvent.click(screen.getByRole("button", { name: "放大查看Funce Daily 商店截图 1" }));
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('img[alt="Funce Daily 商店截图 1"]')).not.toBeNull();
  });

  it("opens every candidate screenshot in the lightbox, not just the preview", async () => {
    const many: LookupCandidate = {
      ...alternate,
      name: "Many Shots",
      screenshotUrls: Array.from({ length: 5 }, (_, index) => `https://example.com/m${index + 1}.png`),
    };
    const result: SearchResult = {
      query: "Funce",
      status: "uncertain_match",
      app: makeApp(),
      candidates: [makeApp(), many],
      alternates: [],
      iapHints: null,
      message: "Possible match found; review alternates",
    };
    renderInspector(result);

    fireEvent.click(screen.getByRole("button", { name: "放大查看Many Shots 商店截图 1" }));
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    expect(dialog?.getAttribute("aria-label")).toBe("Many Shots 商店截图 1");

    for (let step = 0; step < 3; step += 1) {
      fireEvent.keyDown(dialog!, { key: "ArrowRight" });
    }
    await waitFor(() => expect(dialog?.getAttribute("aria-label")).toBe("Many Shots 商店截图 4"));
  });
});
