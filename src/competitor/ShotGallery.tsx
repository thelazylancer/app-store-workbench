import { Dialog, DialogHeader, Layout, LayoutContent } from "@astryxdesign/core";

/** All of one app's store shots in one enlarged grid, scrollable inside the dialog. */
export function ShotGallery({
  name,
  urls,
  isOpen,
  onOpenChange,
}: {
  name: string;
  urls: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={1100}>
      <DialogHeader
        title={`${name} · 商店图（${urls.length}）`}
        onOpenChange={onOpenChange}
      />
      <Layout
        height="auto"
        content={(
          <LayoutContent>
            <div className="wx-shot-gallery" data-role="shot-gallery">
              {urls.map((url, index) => (
                <a
                  key={url}
                  className="wx-shot-gallery-item"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`在新窗口查看${name} 截图 ${index + 1} 原图`}
                >
                  <img
                    src={url}
                    alt={`${name} 商店截图 ${index + 1}`}
                    loading={index < 6 ? "eager" : "lazy"}
                    decoding="async"
                  />
                </a>
              ))}
            </div>
          </LayoutContent>
        )}
      />
    </Dialog>
  );
}
