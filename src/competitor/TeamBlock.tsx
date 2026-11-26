import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@astryxdesign/core";
import type { PackageBrief, PackageDetail, SummaryCompetitor, SummaryGroup } from "../../shared/competitorTypes";
import { attributionKey, attributionLabel } from "../../shared/attribution";
import { competitorAssetUrl } from "../lib/competitorApi";
import { teamLabel } from "../lib/teamLabel";
import type { StatusFilter, ViewMode } from "./format";
import { ShotGallery } from "./ShotGallery";
import { groupShown } from "./selectors";

type ExceptionEntry = PackageBrief & { reason: "miss" | "pending" };

export function competitorKey(competitor: SummaryCompetitor): string {
  return competitor.appleId !== null
    ? `apple:${competitor.appleId}`
    : `pkg:${competitor.packages[0]?.packageCode ?? ""}`;
}

function packageLink(packageCode: string): string {
  return `/package/${encodeURIComponent(packageCode)}`;
}

function RowIcon({
  name,
  localPath,
  missed = false,
}: {
  name: string;
  localPath?: string | null;
  missed?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = missed ? null : competitorAssetUrl(localPath);
  if (missed || failed || !src) {
    return (
      <span
        className={missed ? "wx-row-icon wx-row-icon-empty" : "wx-row-icon wx-row-icon-fallback"}
        aria-hidden="true"
      >
        {missed ? null : name.slice(0, 1).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <img
      className="wx-row-icon"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Three fixed text columns: category · iOS · version (empty ones keep the column). */
function metaFields(facts: PackageDetail | undefined, brief: PackageBrief): string[] {
  const version = facts?.appVersion ?? brief.appVersion;
  return [
    facts?.category ?? "",
    facts?.minimumOsVersion ? `iOS ${facts.minimumOsVersion}` : "",
    version ? `v${version}` : "",
  ];
}

function HitRow({
  competitor,
  facts,
  rangeDays,
}: {
  competitor: SummaryCompetitor;
  facts: PackageDetail | undefined;
  rangeDays: number;
}) {
  const firstPackage = competitor.packages[0];
  const brief = firstPackage ?? {
    packageCode: "",
    displayName: competitor.name,
    team: "",
    appVersion: null,
    iconLocalPath: null,
    hasIap: false,
    versionCount: 0,
    earliestReleasedAt: null,
    latestReleasedAt: null,
  };
  const code = firstPackage?.packageCode ?? "";
  const meta = metaFields(facts, brief);
  const shotCount = rangeDays === 1 ? facts?.screenshotLocalPaths.length ?? 0 : 0;
  const dates = [
    brief.earliestReleasedAt && `最早 ${brief.earliestReleasedAt}`,
    brief.latestReleasedAt && `最新 ${brief.latestReleasedAt}`,
  ].filter(Boolean);

  return (
    <Link
      className="wx-row"
      data-role="competitor-row"
      data-competitor={competitorKey(competitor)}
      data-package={code}
      to={packageLink(code)}
      aria-label={`查看 ${competitor.name} 的竞品详情，${competitor.packageCount} 个包`}
    >
      <RowIcon name={competitor.name} localPath={facts?.iconLocalPath ?? brief.iconLocalPath} />
      <span className="wx-row-name">
        <span className="wx-row-title">
          <strong>{competitor.name}</strong>
          {competitor.packageCount > 1 ? (
            <span className="wx-count-pill" data-role="package-count">
              {competitor.packageCount} 个包
            </span>
          ) : null}
        </span>
        {competitor.appleId !== null ? <span className="wx-row-pkg">{competitor.appleId}</span> : null}
      </span>
      <span className="wx-row-code">
        <span className="wx-row-code-line">
          {competitor.packageCount > 1 ? `${code} 等 ${competitor.packageCount} 个` : code}
        </span>
        {dates.length > 0 ? <span className="wx-row-dates">{dates.join(" · ")}</span> : null}
      </span>
      <span className="wx-row-meta">
        {meta.map((value, index) => (
          <span className="wx-row-meta-cell" key={index}>{value}</span>
        ))}
        <span className="wx-row-meta-cell wx-attribution-cell">
          <span className="wx-attribution-tag">
            {attributionLabel(attributionKey(facts?.attribution))}
          </span>
        </span>
        {shotCount > 0 ? (
          <span className="wx-row-meta-cell">{shotCount} 张截图</span>
        ) : null}
      </span>
      <span className="wx-row-side">
        {brief.offlineDate ? (
          <span className="wx-offline-pill" title={`${brief.offlineDate} 下架`}>已下架</span>
        ) : null}
        {brief.hasIap ? <span className="wx-iap-pill">内购</span> : null}
        <span className="wx-row-versions">{brief.versionCount}个版本</span>
      </span>
    </Link>
  );
}

/** A missed package with an offline date is explained by the date, not by the lookup. */
function missLabel(entry: ExceptionEntry): string {
  if (entry.reason !== "miss") return "待补全";
  return entry.offlineDate ? `${entry.offlineDate} 下架` : "App Store 未命中";
}

function ExceptionRow({ entry }: { entry: ExceptionEntry }) {
  return (
    <Link
      className="wx-row wx-exception-row"
      data-role="exception-row"
      data-reason={entry.reason}
      data-package={entry.packageCode}
      data-competitor={`pkg:${entry.packageCode}`}
      to={packageLink(entry.packageCode)}
      aria-label={`查看 ${entry.displayName}，${missLabel(entry)}`}
    >
      <RowIcon name={entry.displayName} localPath={entry.iconLocalPath} missed={entry.reason === "miss"} />
      <span className="wx-row-name">{entry.displayName}</span>
      <span className="wx-row-code">{entry.packageCode}</span>
      <span className="wx-row-meta">{entry.appVersion ? `v${entry.appVersion}` : "—"}</span>
      <span className="wx-row-side">
        {entry.reason === "pending" ? <span className="wx-exception-strip" aria-hidden="true" /> : null}
        <Badge
          variant={entry.reason === "miss" ? "wx-miss" : "wx-pending"}
          label={missLabel(entry)}
        />
      </span>
    </Link>
  );
}

/** Store-screenshot mode: name and one horizontal strip, everything else dropped. */
function ShotRow({
  competitor,
  facts,
}: {
  competitor: SummaryCompetitor;
  facts: PackageDetail | undefined;
}) {
  const firstPackage = competitor.packages[0];
  const code = firstPackage?.packageCode ?? "";
  const urls = (facts?.screenshotLocalPaths ?? [])
    .map((path) => competitorAssetUrl(path))
    .filter((url): url is string => Boolean(url));
  const version = facts?.appVersion ?? firstPackage?.appVersion;
  const meta = [
    facts?.category,
    version ? `v${version}` : null,
    attributionLabel(attributionKey(facts?.attribution)),
    firstPackage?.hasIap ? "内购" : null,
    firstPackage ? `${firstPackage.versionCount}个版本` : null,
    firstPackage?.offlineDate ? "已下架" : null,
  ].filter(Boolean).join(" · ");
  const dates = [
    firstPackage?.earliestReleasedAt && `最早 ${firstPackage.earliestReleasedAt}`,
    firstPackage?.latestReleasedAt && `最新 ${firstPackage.latestReleasedAt}`,
  ].filter(Boolean);
  const [galleryOpen, setGalleryOpen] = useState(false);

  return (
    <div
      className="wx-shot-row"
      data-role="competitor-row"
      data-competitor={competitorKey(competitor)}
      data-package={code}
    >
      <div className="wx-shot-head">
        <span className="wx-shot-title">
          <Link className="wx-shot-name" to={packageLink(code)} aria-label={`查看 ${competitor.name} 的竞品详情`}>
            {competitor.name}
          </Link>
          {competitor.packageCount > 1 ? (
            <span className="wx-count-pill" data-role="package-count">
              {competitor.packageCount} 个包
            </span>
          ) : null}
        </span>
        {competitor.appleId !== null ? <span className="wx-shot-line">{competitor.appleId}</span> : null}
        <span className="wx-shot-line wx-shot-code">
          {competitor.packageCount > 1 ? `${code} 等 ${competitor.packageCount} 个` : code}
        </span>
        {dates.length > 0 ? <span className="wx-shot-line">{dates.join(" · ")}</span> : null}
        {meta ? <span className="wx-shot-meta">{meta}</span> : null}
      </div>
      {urls.length > 0 ? (
        <div className="wx-shot-strip">
          {urls.map((url, index) => (
            <button
              key={url}
              type="button"
              className="wx-shot-btn"
              aria-label={`放大查看${competitor.name} 全部 ${urls.length} 张截图（当前第 ${index + 1} 张）`}
              onClick={() => setGalleryOpen(true)}
            >
              <img
                className="wx-shot-img"
                src={url}
                alt={`${competitor.name} 商店截图 ${index + 1}`}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      ) : (
        <span className="wx-shot-empty">暂无商店图</span>
      )}
      <ShotGallery
        name={competitor.name}
        urls={urls}
        isOpen={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </div>
  );
}

function ShotExceptionRow({ entry }: { entry: ExceptionEntry }) {
  return (
    <div
      className="wx-shot-row wx-shot-row-exception"
      data-role="exception-row"
      data-reason={entry.reason}
      data-package={entry.packageCode}
      data-competitor={`pkg:${entry.packageCode}`}
    >
      <div className="wx-shot-head">
        <span className="wx-shot-title">
          <Link className="wx-shot-name" to={packageLink(entry.packageCode)}>
            {entry.displayName}
          </Link>
          <Badge
            variant={entry.reason === "miss" ? "wx-miss" : "wx-pending"}
            label={missLabel(entry)}
          />
        </span>
        <span className="wx-shot-line wx-shot-code">{entry.packageCode}</span>
      </div>
      <span className="wx-shot-empty">无商店图</span>
    </div>
  );
}

export function TeamBlock({
  group,
  packages,
  status,
  rangeDays,
  view,
}: {
  group: SummaryGroup;
  packages: Map<string, PackageDetail>;
  status: StatusFilter;
  rangeDays: number;
  view: ViewMode;
}) {
  const hits = status === "exception"
    ? []
    : [...group.competitors].sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const exceptions: ExceptionEntry[] = status === "hit"
    ? []
    : [
        ...group.missedPackages.map((brief) => ({ ...brief, reason: "miss" as const })),
        ...group.pendingPackages.map((brief) => ({ ...brief, reason: "pending" as const })),
      ].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
  const shown = groupShown(group, status);
  if (shown === 0) return null;

  return (
    <section className="wx-team-block" data-team={group.groupKey} data-packages={shown}>
      <div className="wx-team-line" data-role="team-line">
        <span className="wx-team-name" title={group.groupKey}>{teamLabel(group.groupKey)}</span>
        <span className="wx-team-n">{shown} 包</span>
      </div>
      <div className="wx-rows">
        {hits.map((competitor) => {
          const facts = competitor.packages
            .map((brief) => packages.get(brief.packageCode))
            .find((detail) => detail !== undefined);
          return view === "shots" ? (
            <ShotRow key={competitorKey(competitor)} competitor={competitor} facts={facts} />
          ) : (
            <HitRow
              key={competitorKey(competitor)}
              competitor={competitor}
              facts={facts}
              rangeDays={rangeDays}
            />
          );
        })}
        {exceptions.map((entry) => (
          view === "shots"
            ? <ShotExceptionRow key={entry.packageCode} entry={entry} />
            : <ExceptionRow key={entry.packageCode} entry={entry} />
        ))}
      </div>
    </section>
  );
}
