import { Lightbox } from "@astryxdesign/core";
import { useState } from "react";
import { competitorAssetUrl } from "../../lib/competitorApi";

export function Screenshots({ name, paths }: { name: string; paths: string[] }) {
  const urls = paths.map((path) => competitorAssetUrl(path)).filter((url): url is string => Boolean(url));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  // Landscape shots at 3–4 per row shrink to thin strips, so they get 2 wider columns.
  const [landscape, setLandscape] = useState(false);

  if (urls.length === 0) return null;

  const media = urls.map((src, index) => ({
    src,
    alt: `${name} 商店截图 ${index + 1}`,
    caption: `${name} · ${index + 1}/${urls.length}`,
  }));

  const markFailed = (index: number) => {
    setFailed((current) => new Set(current).add(index));
  };

  return (
    <section className="wx-detail-section" data-role="screenshots">
      <h3 className="wx-detail-section-title">截图（{urls.length}）</h3>
      <div className={`wx-screenshot-grid${landscape ? " is-landscape" : ""}`}>
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            className="wx-screenshot-trigger"
            aria-label={`放大查看${name} 截图 ${index + 1}`}
            onClick={() => setOpenIndex(index)}
          >
            {failed.has(index) ? (
              <span className="wx-screenshot-error">截图加载失败</span>
            ) : (
              <img
                className="wx-detail-screenshot"
                src={url}
                alt={`${name} 商店截图 ${index + 1}`}
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setLandscape(image.naturalWidth > image.naturalHeight);
                }}
                onError={() => markFailed(index)}
              />
            )}
          </button>
        ))}
      </div>
      <Lightbox
        isOpen={openIndex !== null}
        index={openIndex ?? 0}
        onIndexChange={setOpenIndex}
        onOpenChange={(open) => { if (!open) setOpenIndex(null); }}
        media={media}
        hasZoom
      />
    </section>
  );
}
