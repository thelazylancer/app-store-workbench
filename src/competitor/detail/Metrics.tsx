import { Text } from "@astryxdesign/core";
import type { ReactNode } from "react";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { CopyValue } from "./CopyValue";
import { dateOnly, iapEntries, jsonString } from "./format";

export function Metrics({ packageDetail }: { packageDetail: PackageDetail }) {
  const json = packageDetail.appStoreJson;
  const versions = packageDetail.versions;
  const latest = versions[0];
  const earliest = versions[versions.length - 1];
  const iapCount = iapEntries(json).length;
  const metrics: Array<[string, ReactNode]> = [
    ["APP ID", packageDetail.appleId !== null
      ? <CopyValue value={String(packageDetail.appleId)} label="APP ID" role="app-id-copy" />
      : "—"],
    ["分类", packageDetail.category ?? "—"],
    ["价格", jsonString(json, ["formattedPrice"]) ?? "—"],
    ["内购", iapCount > 0 ? `${iapCount} 项` : "无"],
    ["最近更新", latest ? dateOnly(latest.releasedAt) : "—"],
    ["最早发布", earliest ? dateOnly(earliest.releasedAt) : dateOnly(packageDetail.listingDate)],
  ];

  return (
    <div className="wx-detail-metrics" data-role="detail-metrics">
      {metrics.map(([label, value]) => (
        <div className="wx-detail-metric" data-role="metric" key={label}>
          <Text as="span" type="supporting" className="wx-detail-metric-label">{label}</Text>
          <span className="wx-detail-metric-value">{value}</span>
        </div>
      ))}
    </div>
  );
}
