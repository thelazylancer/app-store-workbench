import { Theme } from "@astryxdesign/core";
import { render } from "@testing-library/react";
import type { MatchedApp, SearchResult, StoreCountry } from "../../../shared/types";
import { Inspector } from "../../../src/search/Inspector";
import { wxTheme } from "../../../src/theme/wxTheme";

export function installDialogPolyfill() {
  const proto = window.HTMLDialogElement?.prototype;
  if (!proto || typeof proto.showModal === "function") {
    return;
  }
  Object.defineProperty(proto, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
      this.querySelector<HTMLButtonElement>("button")?.focus();
    },
  });
  Object.defineProperty(proto, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
}

export function makeApp(overrides: Partial<MatchedApp> = {}): MatchedApp {
  return {
    name: "Funce",
    developer: "A Dev",
    appleId: 123,
    bundleId: "com.example.funce",
    category: "Utilities",
    appStoreUrl: "https://apps.apple.com/us/app/funce/id123",
    iconUrl: "https://example.com/icon.png",
    description: "A short description",
    screenshotUrls: [],
    iapItems: [],
    versionHistory: [],
    ...overrides,
  };
}

export function matched(overrides: Partial<MatchedApp> = {}): SearchResult {
  return {
    query: "Funce",
    status: "matched",
    app: makeApp(overrides),
    candidates: [],
    alternates: [],
    iapHints: { "4.99": "found", "9.99": "not_found", source: "rendered_page" },
    message: null,
  };
}

export function renderInspector(result: SearchResult, country: StoreCountry = "us") {
  return render(
    <Theme theme={wxTheme} mode="light">
      <Inspector result={result} country={country} />
    </Theme>,
  );
}
