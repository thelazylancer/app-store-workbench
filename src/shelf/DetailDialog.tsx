import { Button, Dialog, DialogHeader, Layout, LayoutContent, Text } from "@astryxdesign/core";
import { Fragment, useEffect, useState } from "react";
import type { ShelfPackageRow } from "../../shared/shelfTypes";
import { teamLabel } from "../lib/teamLabel";
import { ShelfApiError, getShelfPackages } from "../lib/shelfApi";
import { categoryLabel, iapLabel } from "./buckets";
import { matchesSelection, type ShelfSelection } from "./selection";

type Group = { category: string; rows: ShelfPackageRow[] };

/** Group the filtered rows by their category label, biggest category first. */
function groupByCategory(rows: ShelfPackageRow[]): Group[] {
  const groups = new Map<string, ShelfPackageRow[]>();
  for (const row of rows) {
    const label = row.resolved ? categoryLabel(row.category) : "未知";
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
                  {rows.length < total ? ` · 本周共 ${total} 包，仅加载前 ${rows.length} 包` : ""}
                </p>
                {groups.length === 0 ? <Text type="supporting" as="p">没有匹配的入库包。</Text> : null}
                {groups.length > 0 ? (
                  <div className="wx-detail-table-wrap">
                    <table className="wx-detail-table">
                      <thead>
                        <tr>
                          <th scope="col">应用</th>
                          <th scope="col">团队</th>
                          <th scope="col">入库日期</th>
                          <th scope="col">最低 iOS</th>
                          <th scope="col">内购</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((group) => (
                          <Fragment key={group.category}>
                            <tr className="wx-detail-group">
                              <th scope="colgroup" colSpan={5}>
                                {group.category}
                                <span className="wx-detail-group-count">{group.rows.length}</span>
                              </th>
                            </tr>
                            {group.rows.map((row) => (
                              <tr key={`${row.packageCode}-${row.targetDate}`} data-role="detail-row">
                                <td>
                                  <span className="wx-detail-name">{row.name ?? "未知"}</span>
                                  <span className="wx-detail-code wx-mono">{row.packageCode}</span>
                                </td>
                                <td>{teamLabel(row.team)}</td>
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
