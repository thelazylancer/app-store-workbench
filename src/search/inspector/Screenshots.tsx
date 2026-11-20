import { Lightbox } from "@astryxdesign/core";
import { useRef, useState } from "react";
import { getHighResolutionScreenshotUrl } from "./helpers";
import "../styles/inspector-screenshots.css";

type ScreenshotGalleryProps = {
  urls: string[];
  appName: string;
  limit?: number;
  compact?: boolean;
};

export function ScreenshotGallery({ urls, appName, limit, compact = false }: ScreenshotGalleryProps) {
  const sources = limit ? urls.slice(0, limit) : urls;
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);

  if (sources.length === 0) {
    return null;
  }

  const media = urls.map((url, position) => ({
    src: getHighResolutionScreenshotUrl(url),
    alt: `${appName} 商店截图 ${position + 1}`,
  }));

  function openAt(position: number) {
    triggers.current[position]?.focus();
    setIndex(position);
    setIsOpen(true);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      triggers.current[index]?.focus();
    }
  }

  return (
    <div className={compact ? "wx-screenshots is-compact" : "wx-screenshots"}>
      <div className="wx-screenshot-strip">
        {sources.map((url, position) => {
          const alt = `${appName} 商店截图 ${position + 1}`;
          return (
            <button
              key={url}
              ref={(node) => {
                triggers.current[position] = node;
              }}
              type="button"
              className="wx-screenshot-trigger"
              aria-label={`放大查看${alt}`}
              aria-haspopup="dialog"
              onClick={() => openAt(position)}
            >
              <img
                className={compact ? "wx-candidate-screenshot" : "wx-screenshot"}
                src={url}
                alt={alt}
                loading="lazy"
                decoding="async"
              />
            </button>
          );
        })}
      </div>

      <Lightbox
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        media={media}
        index={index}
        onIndexChange={setIndex}
        hasZoom
      />
    </div>
  );
}
