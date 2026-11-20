import { useEffect, useId, useRef, useState } from "react";
import type { IapHints, LookupCandidate, MatchedApp, SearchResult, StoreCountry } from "../../shared/types";
import { getAppDetails } from "../lib/api";
import { translateMessage } from "./format";
import { StatusBadge } from "./ResultsQueue";
import { Candidates } from "./inspector/Candidates";
import { Detail, type DetailState } from "./inspector/Detail";
import { candidateKey, getCandidates, hasAppleId, toMatchedApp } from "./inspector/helpers";
import "./styles/inspector.css";

const NO_BUNDLE_MATCH_MESSAGE = "No App Store candidate matched the supplied Bundle ID";

type CanvasView = "candidates" | "detail";

type Inspection = {
  app: MatchedApp;
  iapHints: IapHints | null;
  state: DetailState;
};

function defaultView(result: SearchResult, candidateCount: number): CanvasView {
  return !result.app || (result.status !== "matched" && candidateCount > 0) ? "candidates" : "detail";
}

export function Inspector({ result, country }: { result: SearchResult; country: StoreCountry }) {
  const candidates = getCandidates(result);
  const candidateCount = candidates.length;
  const candidatesKey = `${result.query}|${result.requestedBundleId ?? ""}|${result.status}|${candidates
    .map(candidateKey)
    .join(",")}`;
  const [source, setSource] = useState(result);
  const [view, setView] = useState<CanvasView>(() => defaultView(result, candidateCount));
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [candidateUi, setCandidateUi] = useState({ key: candidatesKey, filter: "", page: 0 });
  const candidateUiByResult = useRef(new Map<string, { filter: string; page: number }>());
  const tokenRef = useRef(0);
  const rawId = useId();
  const id = `inspector-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (source !== result) {
    setSource(result);
    setView(defaultView(result, getCandidates(result).length));
    setInspection(null);
  }

  // Candidate filter/page survive switching between queued results.
  const ui = candidateUi.key === candidatesKey
    ? candidateUi
    : { key: candidatesKey, ...(candidateUiByResult.current.get(candidatesKey) ?? { filter: "", page: 0 }) };
  const setUi = (filter: string, page: number) => {
    candidateUiByResult.current.set(candidatesKey, { filter, page });
    setCandidateUi({ key: candidatesKey, filter, page });
  };

  useEffect(() => {
    tokenRef.current += 1;
    return () => {
      tokenRef.current += 1;
    };
  }, [result]);

  async function inspectCandidate(candidate: LookupCandidate) {
    const token = ++tokenRef.current;
    const app = toMatchedApp(candidate);
    const canFetch = hasAppleId(candidate.appleId);

    setInspection({ app, iapHints: null, state: canFetch ? "loading" : "baseline" });
    setView("detail");
    if (!canFetch) {
      return;
    }

    try {
      const detail = await getAppDetails(candidate.appleId!, country);
      if (token !== tokenRef.current) {
        return;
      }
      if (detail.country !== country || detail.app.appleId !== candidate.appleId) {
        throw new Error("Candidate detail identity changed");
      }
      setInspection({ app: detail.app, iapHints: detail.iapHints, state: "ready" });
    } catch {
      if (token !== tokenRef.current) {
        return;
      }
      setInspection((current) => (current ? { ...current, state: "failed" } : current));
    }
  }

  const displayApp = inspection?.app ?? result.app;
  const displayHints = inspection ? inspection.iapHints : result.iapHints;
  const query = result.query || result.requestedBundleId || "";

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.click();
    tabs[next]?.focus();
  }

  return (
    <section className="inspector-panel">
      <div className="inspector-body">
        <div className="inspector">
          <div className="query-context">
            <p className="query-label">
              搜索词：<strong>{query}</strong>
              {result.query && result.requestedBundleId ? (
                <span className="requested-bundle">{`Bundle ID：${result.requestedBundleId}`}</span>
              ) : null}
            </p>
            <div className="query-verdict">
              <span>{`${country.toUpperCase()} 区 · 原始匹配`}</span>
              <StatusBadge result={result} />
            </div>
          </div>

          <div className="wx-canvas-tabs" role="tablist" aria-label="结果视图" onKeyDown={handleTabKeyDown}>
            <button
              type="button"
              role="tab"
              className="wx-canvas-tab"
              data-role="candidates-tab"
              id={`${id}-candidates-tab`}
              aria-controls={`${id}-candidates-panel`}
              aria-selected={view === "candidates"}
              tabIndex={view === "candidates" ? 0 : -1}
              onClick={() => setView("candidates")}
            >
              {`候选（${candidateCount}）`}
            </button>
            <button
              type="button"
              role="tab"
              className="wx-canvas-tab"
              data-role="detail-tab"
              id={`${id}-detail-tab`}
              aria-controls={`${id}-detail-panel`}
              aria-selected={view === "detail"}
              tabIndex={view === "detail" ? 0 : -1}
              disabled={!displayApp}
              onClick={() => setView("detail")}
            >
              {displayApp ? "详情" : "详情（未选择）"}
            </button>
          </div>

          <section
            role="tabpanel"
            className="wx-canvas-panel"
            data-role="candidates-panel"
            id={`${id}-candidates-panel`}
            aria-labelledby={`${id}-candidates-tab`}
            hidden={view !== "candidates"}
          >
            {result.message === NO_BUNDLE_MATCH_MESSAGE ? (
              <p className="result-message">{translateMessage(result.message)}</p>
            ) : null}
            {candidateCount > 0 ? (
              <Candidates
                key={candidatesKey}
                result={result}
                country={country}
                currentApp={displayApp}
                inspecting={inspection !== null}
                filter={ui.filter}
                page={ui.page}
                onFilterChange={(filter) => setUi(filter, 0)}
                onPageChange={(page) => setUi(ui.filter, page)}
                onInspect={(candidate) => void inspectCandidate(candidate)}
              />
            ) : (
              <p className="wx-empty-subtle">
                {translateMessage(result.message) ?? "商店本次没有返回候选应用。"}
              </p>
            )}
          </section>

          <section
            role="tabpanel"
            className="wx-canvas-panel"
            data-role="detail-panel"
            id={`${id}-detail-panel`}
            aria-labelledby={`${id}-detail-tab`}
            hidden={view !== "detail"}
          >
            <Detail
              key={displayApp ? candidateKey(displayApp) : "none"}
              result={result}
              app={displayApp}
              iapHints={displayHints}
              country={country}
              candidateCount={candidateCount}
              inspectionState={inspection?.state ?? null}
              onBack={inspection ? () => setView("candidates") : undefined}
              onRetry={inspection ? () => void inspectCandidate(inspection.app) : undefined}
            />
          </section>
        </div>
      </div>
    </section>
  );
}
