import type { ReactNode } from "react";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { CopyValue } from "./CopyValue";
import { assetStatusLabel, dateOnly, formatSize, jsonString } from "./format";

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wx-info-row">
      <span className="wx-info-label">{label}</span>
      <span className="wx-info-value">{children}</span>
    </div>
  );
}

export function InfoList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="wx-info-list">
      {rows.map(([label, value]) => <InfoRow key={label} label={label}>{value}</InfoRow>)}
    </div>
  );
}

export function PackageInfoSection({ packageDetail }: { packageDetail: PackageDetail }) {
  const json = packageDetail.appStoreJson;
  const bundleId = jsonString(json, ["bundleId"]) ?? packageDetail.packageCode;
  const latest = packageDetail.versions[0];
  const rows: Array<[string, ReactNode]> = [
    ["开发者", jsonString(json, ["developer"]) ?? "—"],
    ["发布日期", dateOnly(packageDetail.listingDate)],
    ["更新日期", latest ? dateOnly(latest.releasedAt) : "—"],
    ["Bundle ID", <CopyValue key="bundle" value={bundleId} label="Bundle ID" role="bundle-copy" />],
    ["版本", packageDetail.appVersion ?? "—"],
    ["大小", formatSize(json.fileSizeBytes)],
    ["团队", packageDetail.team || "—"],
    ["类目", packageDetail.category ?? "—"],
    ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
    ["源展示名", packageDetail.displayName || "—"],
    ["图片状态", assetStatusLabel(packageDetail.assetStatus)],
  ];

  return (
    <section className="wx-detail-section wx-package-info" data-role="package-info">
      <h3 className="wx-detail-section-title">应用包信息</h3>
      <InfoList rows={rows} />
    </section>
  );
}
