import { Theme } from "@astryxdesign/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { expect } from "vitest";
import { ShelfTrendPage } from "../../src/shelf/App";
import { wxTheme } from "../../src/theme/wxTheme";
import type { mockShelf } from "./shelfFixtures";

// Astryx Dialog drives the native <dialog>; jsdom ships the element without the modal API.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

// jsdom ships no CSS.escape(); the dialog uses it to build its title id.
if (typeof globalThis.CSS?.escape !== "function") {
  const css = (globalThis.CSS ??= {} as typeof CSS);
  css.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

export function renderPage(search = "") {
  window.history.replaceState({}, "", `/shelf${search}`);
  return render(
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <ShelfTrendPage />
      </BrowserRouter>
    </Theme>,
  );
}

export function teamSegments(week?: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="team-segment"]')]
    .filter((segment) => week === undefined || segment.dataset.week === week);
}

export function weekBars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="week-bar"]')];
}

export function detailRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="detail-row"]')];
}

export async function waitForTeamSegments(count: number) {
  await waitFor(() => {
    expect(teamSegments()).toHaveLength(count);
  });
}

export async function waitForWeekBars(count: number) {
  await waitFor(() => {
    expect(weekBars()).toHaveLength(count);
  });
}

export async function openDetails(trigger: HTMLElement) {
  fireEvent.click(trigger);
  await screen.findByRole("dialog");
}

export function packagesCalls(fetchMock: ReturnType<typeof mockShelf>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/api/public/shelf/packages"));
}
