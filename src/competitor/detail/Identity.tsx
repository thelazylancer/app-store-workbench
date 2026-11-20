import { Badge, Stack, Text } from "@astryxdesign/core";
import { useState } from "react";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { competitorAssetUrl } from "../../lib/competitorApi";
import { appStoreUrl, jsonString } from "./format";
import type { MissingStatus } from "./types";

function statusBadge(status: MissingStatus) {
  if (status === "miss") return <Badge variant="wx-miss" label="App Store 未命中" />;
  return null;
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

  return (
    <section className="wx-detail-identity" data-role="detail-identity">
      {src && !iconFailed ? (
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
      )}

      <Stack className="wx-detail-identity-copy" gap={1}>
        <div className="wx-detail-title-row">
          <h2>{name}</h2>
          {statusBadge(status)}
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
          </div>
        )}
      </Stack>
    </section>
  );
}
