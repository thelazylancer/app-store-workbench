import { Badge } from "@astryxdesign/core";
import type { ShelfPackageRow } from "../../shared/shelfTypes";
import { addDays } from "../lib/reportDate";
import { teamLabel } from "../lib/teamLabel";
import { categoryLabel, iapLabel } from "./buckets";
import "./styles/table.css";

function weekLabel(weekStart: string): string {
  return `${weekStart} ~ ${addDays(weekStart, 6)}`;
}

function display(value: string | null): string {
  return value ?? "未知";
}

export function PackageTable({
  rows,
  total,
}: {
  rows: ShelfPackageRow[];
  total: number;
}) {
  const truncated = total > rows.length;

  return (
    <section className="wx-shelf-section" aria-labelledby="shelf-table-title" data-role="package-table-section">
      <div className="wx-shelf-block-head">
        <h2 id="shelf-table-title" className="wx-shelf-h2">核对明细（临时）</h2>
        <p className="wx-shelf-note">
          {truncated ? `共 ${total} 行 · 显示前 ${rows.length} 行` : `共 ${total} 行 · 按入库日期升序`}
        </p>
      </div>
      <p className="wx-shelf-table-note">临时核对用，正式报表上线后移除。</p>

      <div className="wx-shelf-table-wrap">
        <table className="wx-shelf-table" data-role="package-table">
          <caption className="visually-hidden">核对明细（临时），按入库日期升序</caption>
          <thead>
            <tr>
              <th scope="col">应用名</th>
              <th scope="col">Bundle ID</th>
              <th scope="col">团队</th>
              <th scope="col">类目</th>
              <th scope="col" className="wx-cell-num">最低 iOS</th>
              <th scope="col" className="wx-cell-num">当前版本</th>
              <th scope="col">内购</th>
              <th scope="col">上架日期</th>
              <th scope="col">下架日期</th>
              <th scope="col">入库日期</th>
              <th scope="col">入库周</th>
              <th scope="col">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = display(row.name);
              return (
                <tr key={`${row.packageCode}-${row.targetDate}`} data-role="package-row" data-resolved={row.resolved}>
                  <th
                    scope="row"
                    className="wx-cell-name"
                    data-label="应用名"
                    aria-label={`${name}，${row.packageCode}`}
                  >
                    {name}
                  </th>
                  <td className="wx-cell-mono wx-cell-code" data-label="Bundle ID">{row.packageCode}</td>
                  <td className="wx-cell-tight" data-label="团队" title={row.team}>{teamLabel(row.team)}</td>
                  <td className="wx-cell-tight" data-label="类目">{categoryLabel(row.category)}</td>
                  <td className="wx-cell-mono wx-cell-num" data-label="最低 iOS">{display(row.minimumOsVersion)}</td>
                  <td className="wx-cell-mono wx-cell-num" data-label="当前版本">{display(row.appVersion)}</td>
                  <td className="wx-cell-tight" data-label="内购">{iapLabel(row.iap)}</td>
                  <td className="wx-cell-mono" data-label="上架日期">{display(row.listingDate)}</td>
                  <td className="wx-cell-mono" data-label="下架日期">{display(row.offlineDate)}</td>
                  <td className="wx-cell-mono" data-label="入库日期">{row.targetDate}</td>
                  <td className="wx-cell-mono" data-label="入库周">{weekLabel(row.weekStart)}</td>
                  <td className="wx-cell-status" data-label="状态">
                    {row.resolved
                      ? <Badge variant="info" label="命中" />
                      : <Badge variant="wx-miss" label="未知" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </section>
  );
}
