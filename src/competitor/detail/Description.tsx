import { useEffect, useRef, useState } from "react";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { jsonString } from "./format";

export function DescriptionSection({ packageDetail }: { packageDetail: PackageDetail }) {
  const description = jsonString(packageDetail.appStoreJson, ["description"]);
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const copy = copyRef.current;
    if (!copy || !description) return;
    const text = copy.textContent ?? "";
    // shortcut: character count approximates 12 lines when layout is not measurable (jsdom).
    setCanToggle(text.length > 600 || text.split("\n").length > 12 || copy.scrollHeight > copy.clientHeight + 1);
  }, [description]);

  if (!description) return null;

  return (
    <section className="wx-detail-section wx-description-section" data-role="description-section">
      <h3 className="wx-detail-section-title">应用描述</h3>
      <div
        ref={copyRef}
        className={`wx-description-copy${expanded || !canToggle ? "" : " is-collapsed"}`}
      >
        {description}
      </div>
      {canToggle ? (
        <button
          type="button"
          className="wx-description-toggle"
          data-role="description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      ) : null}
    </section>
  );
}
