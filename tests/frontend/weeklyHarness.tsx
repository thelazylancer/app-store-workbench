import { Theme } from "@astryxdesign/core";
import { render, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { expect } from "vitest";
import { WeeklyPage } from "../../src/weekly/App";
import { wxTheme } from "../../src/theme/wxTheme";

export function renderPage(search = "") {
  window.history.replaceState({}, "", `/weekly${search}`);
  return render(
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <WeeklyPage />
      </BrowserRouter>
    </Theme>,
  );
}

export function teamCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="weekly-team-card"]')];
}

export function byRole<T extends HTMLElement>(role: string, attribute = "data-role"): T | null {
  return document.querySelector<T>(`[${attribute}="${role}"]`);
}

export async function waitForCards(count: number) {
  await waitFor(() => expect(teamCards()).toHaveLength(count));
}
