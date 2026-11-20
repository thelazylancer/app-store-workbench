export function materializeMediaUrl(item: any): string {
  const rawUrl = typeof item?.url === "string" ? item.url : "";

  if (!rawUrl || !rawUrl.includes("{")) {
    return rawUrl;
  }

  const width = item?.width;
  const height = item?.height;

  if (typeof width !== "number" || typeof height !== "number") {
    return "";
  }

  return rawUrl
    .replace("{w}", String(width))
    .replace("{h}", String(height))
    .replace("{c}", "bb")
    .replace("{f}", "jpg");
}

export function collectMediaByType(mediaByType: any): Record<string, Array<{ url: string; width: number | null; height: number | null }>> {
  const collected: Record<string, Array<{ url: string; width: number | null; height: number | null }>> = {};

  if (!mediaByType || typeof mediaByType !== "object") {
    return collected;
  }

  for (const [type, items] of Object.entries(mediaByType)) {
    if (!Array.isArray(items)) {
      continue;
    }

    const urls = items
      .map((item: any) => ({
        url: materializeMediaUrl(item),
        width: typeof item?.width === "number" ? item.width : null,
        height: typeof item?.height === "number" ? item.height : null,
      }))
      .filter((item) => item.url);

    if (urls.length > 0) {
      collected[type] = urls;
    }
  }

  return collected;
}

export function flattenMediaByPrefix(
  mediaByType: Record<string, Array<{ url: string }>>,
  prefix: string,
): string[] {
  const urls: string[] = [];

  for (const [type, items] of Object.entries(mediaByType)) {
    if (type.toLowerCase().startsWith(prefix)) {
      urls.push(...items.map((item) => item.url));
    }
  }

  return [...new Set(urls)];
}
