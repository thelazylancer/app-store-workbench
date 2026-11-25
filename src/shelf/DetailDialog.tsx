import { Button, Dialog, DialogHeader, Layout, LayoutContent, Text } from "@astryxdesign/core";
import { Fragment, useEffect, useState } from "react";
import type { ShelfPackageRow } from "../../shared/shelfTypes";
import { privacyHostLabel } from "../../shared/privacyHost";
import { attributionKey, attributionLabel } from "../../shared/attribution";
import { teamLabel } from "../lib/teamLabel";
import { ShelfApiError, getShelfPackages } from "../lib/shelfApi";
import { categoryLabel, iapLabel, sourceAppName } from "./buckets";
import { matchesSelection, type ShelfSelection } from "./selection";

type Group = { category: string; rows: ShelfPackageRow[] };

/** Group the filtered rows by their category label, biggest category first. */
function groupByCategory(rows: ShelfPackageRow[]): Group[] {
  const groups = new Map<string, ShelfPackageRow[]>();
  for (const row of rows) {
    const label = row.resolved ? categoryLabel(row.category) : "Unknown";
    const list = groups.get(label) ?? [];
    list.push(row);
    groups.set(label, list);
  }
  return [...groups]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "zh"))
    .map(([category, list]) => ({ category, rows: list }));
}

function message(error: unknown): string {
  return error instanceof ShelfApiError ? error.message : "请求失败";
}

/** App Store name first; an unresolved package only has the source display name. */
function rowLabel(row: ShelfPackageRow): string {
  return row.name ?? (row.sourceName ? sourceAppName(row.sourceName) : row.packageCode);
}

export function ShelfDetailDialog({ selection, onClose }: {
  selection: ShelfSelection | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ShelfPackageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getShelfPackages({
      from: selection.weekStart,
      to: selection.weekEnd,
      team: selection.team,
      limit: 500,
    })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(message(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, reload]);

  if (!selection) return null;

  const matched = rows.filter((row) => matchesSelection(selection, row));
  const groups = groupByCategory(matched);
  const subtitle = `${selection.team ? teamLabel(selection.team) : "全部团队"}${selection.label ? ` · ${selection.label}` : ""}`;
  // The clicked dimension gets its own column; iOS and IAP already have theirs.
  const dimensionTitle = selection.groupBy === "privacy"
    ? "隐私协议"
    : selection.groupBy === "category" ? "类目"
    : selection.groupBy === "attribution" ? "归因" : null;
  const dimensionValue = (row: ShelfPackageRow): string => {
    if (selection.groupBy === "privacy") return privacyHostLabel(row.privacyHost);
    if (selection.groupBy === "attribution") return attributionLabel(attributionKey(row.attribution));
    return row.resolved ? categoryLabel(row.category) : "Unknown";
  };
  const columnCount = dimensionTitle ? 6 : 5;

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} width={880}>
      <DialogHeader
        title={`${selection.weekStart} ~ ${selection.weekEnd}`}
        subtitle={subtitle}
        onOpenChange={(open) => { if (!open) onClose(); }}
      />
      <Layout
        height="auto"
        content={(
          <LayoutContent>
            {loading ? <Text type="supporting" as="p">正在加载明细…</Text> : null}
            {!loading && error ? (
              <div className="wx-detail-error" data-role="detail-error">
                <p>明细加载失败：{error}</p>
                <Button variant="ghost" size="sm" label="重试" onClick={() => setReload((value) => value + 1)} />
              </div>
            ) : null}
            {!loading && !error ? (
              <>
                <p className="wx-detail-count" data-role="detail-count">
                  共 {matched.length} 包
                  {rows.length < total ? ` · 该范围共 ${total} 包，仅加载前 ${rows.length} 包` : ""}
                </p>
                {groups.length === 0 ? <Text type="supporting" as="p">没有匹配的入库包。</Text> : null}
                {groups.length > 0 ? (
                  <div className="wx-detail-table-wrap">
                    <table className="wx-detail-table">
                      <thead>
                        <tr>
                          <th scope="col">应用</th>
                          <th scope="col">团队</th>
                          {dimensionTitle ? <th scope="col">{dimensionTitle}</th> : null}
                          <th scope="col">入库日期</th>
                          <th scope="col">最低 iOS</th>
                          <th scope="col">内购</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((group) => (
                          <Fragment key={group.category}>
                            <tr className="wx-detail-group">
                              <th scope="colgroup" colSpan={columnCount}>
                                {group.category}
                                <span className="wx-detail-group-count">{group.rows.length}</span>
                              </th>
                            </tr>
                            {group.rows.map((row) => (
                              <tr key={`${row.packageCode}-${row.targetDate}`} data-role="detail-row">
                                <td>
                                  {/* No Apple ID locally means no page to open: plain text, no link. */}
                                  {row.resolved ? (
                                    <a
                                      className="wx-detail-name"
                                      href={`/package/${encodeURIComponent(row.packageCode)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="在新窗口打开详情"
                                    >
                                      {rowLabel(row)}
                                    </a>
                                  ) : (
                                    <span className="wx-detail-name">{rowLabel(row)}</span>
                                  )}
                                  {rowLabel(row) !== row.packageCode
                                    ? <span className="wx-detail-code wx-mono">{row.packageCode}</span>
                                    : null}
                                </td>
                                <td>{teamLabel(row.team)}</td>
                                {dimensionTitle ? <td>{dimensionValue(row)}</td> : null}
                                <td className="wx-mono">{row.targetDate}</td>
                                <td className="wx-mono">{row.minimumOsVersion ?? "—"}</td>
                                <td>{iapLabel(row.iap)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </LayoutContent>
        )}
      />
    </Dialog>
  );
}
