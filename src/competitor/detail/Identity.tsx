import { Badge, Stack, Text } from "@astryxdesign/core";
import { useState } from "react";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { competitorAssetUrl } from "../../lib/competitorApi";
import { teamLabel } from "../../lib/teamLabel";
import { IpaDownload } from "../../search/IpaDownload";
import { appStoreUrl, jsonString } from "./format";
import type { MissingStatus } from "./types";

function statusBadge(status: MissingStatus, offlineDate: string | null) {
  if (status !== "miss") return null;
  return <Badge variant="wx-miss" label={offlineDate ? `${offlineDate} 下架` : "App Store 未命中"} />;
}

export function Identity({
  name,
  packageDetail,
  status,
}: {
  name: string;
  packageDetail: PackageDetail;
  status: MissingStatus;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const src = status ? null : competitorAssetUrl(packageDetail.iconLocalPath);
  const storeUrl = appStoreUrl(packageDetail);
  const developer = jsonString(packageDetail.appStoreJson, ["developer"]) ?? "—";
  // A captured package can be delisted later; the miss panel covers the rest.
  const offline = !status && Boolean(packageDetail.offlineDate);

  const icon = src && !iconFailed ? (
    <img
      className="wx-detail-icon"
      src={src}
      alt={`${name} 图标`}
      decoding="async"
      onError={() => setIconFailed(true)}
    />
  ) : (
    <span
      className={status ? "wx-detail-icon wx-detail-icon-empty" : "wx-detail-icon wx-detail-icon-fallback"}
      aria-hidden="true"
    >
      {status ? null : name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );

  return (
    <section className="wx-detail-identity" data-role="detail-identity">
      {offline ? (
        <span className="wx-detail-icon-wrap">
          {icon}
          <span className="wx-detail-offline-stamp" aria-hidden="true">已下架</span>
        </span>
      ) : icon}

      <Stack className="wx-detail-identity-copy" gap={1}>
        <div className="wx-detail-title-row">
          <h2>{name}</h2>
          {offline ? <span className="wx-detail-offline">{packageDetail.offlineDate} 已下架</span> : null}
          {statusBadge(status, packageDetail.offlineDate)}
        </div>
        <Text as="p" type="supporting" className="wx-detail-developer">{developer}</Text>
        {status ? null : (
          <div className="wx-detail-links">
            {storeUrl ? (
              <a className="wx-detail-link" href={storeUrl} target="_blank" rel="noreferrer">
                App Store 查看<span aria-hidden="true"> ↗</span>
              </a>
            ) : null}
            {packageDetail.appleId !== null ? (
              <a
                className="wx-detail-link"
                href={`https://www.qimai.cn/app/baseinfo/appid/${packageDetail.appleId}/country/us`}
                target="_blank"
                rel="noreferrer"
              >
                七麦查看<span aria-hidden="true"> ↗</span>
              </a>
            ) : null}
            {packageDetail.lookupStatus === "hit" ? (
              <IpaDownload bundleId={packageDetail.packageCode} team={teamLabel(packageDetail.team)} appName={name} />
            ) : null}
          </div>
        )}
      </Stack>
    </section>
  );
}
