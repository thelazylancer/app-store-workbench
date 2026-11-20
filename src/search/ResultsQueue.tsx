import { Badge, Text } from "@astryxdesign/core";
import { useEffect, useState } from "react";
import type { SearchResult } from "../../shared/types";
import {
  candidateCount,
  formatIapItemCount,
  statusLabel,
  translateMessage,
} from "./format";
import "./styles/results.css";

type BadgeVariant = "info" | "wx-pending" | "wx-miss" | "error";

function badgeVariant(result: SearchResult): BadgeVariant {
  switch (result.status) {
    case "matched":
      return "info";
    case "uncertain_match":
      return "wx-pending";
    case "no_match":
      return "wx-miss";
    case "search_failed":
      return "error";
  }
}

export function StatusBadge({ result }: { result: SearchResult }) {
  return <Badge variant={badgeVariant(result)} label={statusLabel(result)} className="wx-status-badge" />;
}

function isCompactQueue() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 959px)").matches
  );
}

type ResultsQueueProps = {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function ResultsQueue({ results, selectedIndex, onSelect }: ResultsQueueProps) {
  const [open, setOpen] = useState(true);
  const current = results[selectedIndex];

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(max-width: 959px)");
    const sync = () => setOpen(!query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  const currentLabel = current
    ? `${current.query || (current.requestedBundleId ? `Bundle ID：${current.requestedBundleId}` : "")}${
        current.query && current.requestedBundleId ? ` · ${current.requestedBundleId}` : ""
      }`
    : "";

  return (
    <details
      className="wx-result-list-panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="query-queue-summary">
        <strong>{currentLabel ? `当前：${currentLabel}` : "查询队列"}</strong>
        <span>{`全部 ${results.length} 项`}</span>
      </summary>

      <div className="panel-subhead">{`查询队列 · ${results.length} 项`}</div>

      <div className="result-list">
        {results.map((result, index) => {
          const candidates = candidateCount(result);
          const active = index === selectedIndex;
          const subtitle = result.app
            ? `${result.app.name} · ${result.app.developer}`
            : result.status === "no_match" && candidates > 0
              ? `${candidates} 个候选`
              : translateMessage(result.message) ?? "未找到结果";

          return (
            <button
              key={`${result.query}-${result.requestedBundleId ?? ""}-${index}`}
              type="button"
              className={`result-row${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() => {
                onSelect(index);
                if (isCompactQueue()) setOpen(false);
              }}
            >
              <span className="result-row-identity">
                {result.app ? (
                  <img className="result-row-icon" src={result.app.iconUrl} alt="" />
                ) : (
                  <span className="row-icon-placeholder">
                    {(result.query || result.requestedBundleId || "").slice(0, 1).toUpperCase()}
                  </span>
                )}

                <span className="result-row-copy">
                  <Text as="span" type="body" weight="semibold" className="wx-result-title">
                    {result.query || result.requestedBundleId || ""}
                  </Text>
                  {result.query && result.requestedBundleId ? (
                    <span className="requested-bundle">{`Bundle ID：${result.requestedBundleId}`}</span>
                  ) : null}
                  <span className="result-row-subtitle">{subtitle}</span>
                  {result.app ? (
                    <span className="result-row-meta">
                      {`${result.app.category ?? "类目未知"} · ` +
                        `${result.app.screenshotUrls.length} 张截图 · ` +
                        formatIapItemCount(result.app.iapItems.length)}
                    </span>
                  ) : null}
                  {candidates > 0 && (result.app !== null || result.status !== "no_match") ? (
                    <span className="result-row-meta">{`${candidates} 个候选`}</span>
                  ) : null}
                </span>
              </span>
              <StatusBadge result={result} />
            </button>
          );
        })}
      </div>
    </details>
  );
}
