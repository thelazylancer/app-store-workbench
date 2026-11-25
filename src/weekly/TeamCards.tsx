import { Fragment } from "react";
import type { WeeklyBucket, WeeklyTeam } from "../../shared/weeklyReportTypes";
import { teamLabel } from "../lib/teamLabel";
import { formatChange, formatPercent, versionClassName, versionLabel } from "./format";

const VERSION_KEYS = ["1", "2", "3", "4+"] as const;

function VersionLegend({ buckets, sufficient }: { buckets: WeeklyBucket[]; sufficient: boolean }) {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const keys = sufficient
    ? [...VERSION_KEYS, ...(byKey.get("0")?.count ? ["0"] : [])]
    : VERSION_KEYS;

  return (
    <ul className="wx-weekly-version-legend">
      {keys.map((key) => {
        const bucket = byKey.get(key);
        return (
          <li key={key}>
            <span>{versionLabel(key)}</span>{" "}
            {sufficient && bucket ? (
              <span className="wx-weekly-mono">{formatPercent(bucket.share)}</span>
            ) : (
              <span className="wx-weekly-mono wx-weekly-muted">—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TeamCard({ team, total }: { team: WeeklyTeam; total: number }) {
  const sufficient = team.resolvedPackages >= 3;
  const fingerprint = team.versionCounts.filter((bucket) => bucket.count > 0);
  const topCategories = team.topCategories.slice(0, 3);

  return (
    <article className="wx-weekly-card" data-role="weekly-team-card" data-team={team.team}>
      <div className="wx-weekly-card-top">
        <p className="wx-weekly-team-name">
          <span className="wx-weekly-rank" aria-hidden="true">{String(team.rank).padStart(2, "0")}</span>
          <span className="visually-hidden">第 {team.rank} 名</span>
          <span className="wx-weekly-team-label" title={team.team}>{teamLabel(team.team)}</span>
        </p>
        <span
          className={`wx-weekly-change${team.change === 0 ? " wx-weekly-change-zero" : ""}`}
          data-role="weekly-team-change"
        >
          {formatChange(team.change, team.changePct)}
        </span>
      </div>

      <div className="wx-weekly-card-main">
        <p className="wx-weekly-team-count">
          <span className="wx-weekly-count-value">{team.resolvedPackages}</span>
          <span className="wx-weekly-count-unit">包</span>
        </p>
        <p className="wx-weekly-team-share">
          {team.resolvedPackages} / {total} · {formatPercent(team.share)}
        </p>
      </div>
      <div className="wx-weekly-share-track" aria-hidden="true">
        <span style={{ width: `${team.share * 100}%` }} />
      </div>

      <div className="wx-weekly-card-divider" />

      <p className="wx-weekly-card-label">版本数</p>
      <div
        className={`wx-weekly-fingerprint${sufficient ? "" : " wx-weekly-fingerprint-empty"}`}
        aria-hidden="true"
      >
        {sufficient
          ? fingerprint.map((bucket) => (
            <span
              key={bucket.key}
              className={versionClassName(bucket.key)}
              style={{ width: `${bucket.share * 100}%` }}
            />
          ))
          : null}
      </div>
      <VersionLegend buckets={team.versionCounts} sufficient={sufficient} />

      {!sufficient ? <p className="wx-weekly-sample-note">样本不足（&lt;3 包），占比不计算。</p> : null}

      <div className="wx-weekly-facts">
        <p>
          <span className="wx-weekly-fact-label">品类</span>{" "}
          {topCategories.length > 0 ? topCategories.map((bucket, index) => (
            <Fragment key={bucket.key}>
              {index > 0 ? " · " : null}
              {bucket.label} <span className="wx-weekly-mono">{bucket.count}</span>
            </Fragment>
          )) : <span className="wx-weekly-muted">—</span>}
        </p>
        <p>
          <span className="wx-weekly-fact-label">内购</span> 有{" "}
          <span className="wx-weekly-mono">{team.iap.yes}</span> · 无{" "}
          <span className="wx-weekly-mono">{team.iap.no}</span>
          <span className="wx-weekly-fact-sep">｜</span>
          <span className="wx-weekly-fact-label">iOS</span>{" "}
          {team.topIos
            ? <>{team.topIos.label} · <span className="wx-weekly-mono">{team.topIos.count}</span> 包</>
            : <span className="wx-weekly-muted">—</span>}
          <span className="wx-weekly-fact-sep">｜</span>
          <span className="wx-weekly-fact-label">隐私</span>{" "}
          {team.topPrivacy
            ? <>{team.topPrivacy.label} · <span className="wx-weekly-mono">{team.topPrivacy.count}</span> 包</>
            : <span className="wx-weekly-muted">—</span>}
        </p>
      </div>
    </article>
  );
}

type TeamCardsProps = {
  teams: WeeklyTeam[];
  teamCount: number;
  total: number;
};

export function TeamCards({ teams, teamCount, total }: TeamCardsProps) {
  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-teams-title">
      <div className="wx-weekly-section-head">
        <h2 id="weekly-teams-title" className="wx-weekly-h2">团队</h2>
        <p className="wx-weekly-section-meta">
          <span className="wx-weekly-mono">{teamCount}</span> 个团队 ·{" "}
          <span className="wx-weekly-mono">{total}</span> 个已解析包
        </p>
      </div>
      <ul className="wx-weekly-cards" data-role="weekly-team-cards">
        {teams.map((team) => (
          <li key={team.team}>
            <TeamCard team={team} total={total} />
          </li>
        ))}
      </ul>
    </section>
  );
}
