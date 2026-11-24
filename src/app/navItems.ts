export type NavItem = {
  to: string;
  label: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "竞品日报" },
  { to: "/shelf", label: "竞品趋势" },
  { to: "/weekly", label: "竞品周动态" },
  { to: "/search", label: "App Store 搜索" },
];

/** Package details belong to the competitor half of the app. */
export function isNavActive(to: string, pathname: string): boolean {
  if (to === "/") {
    return !pathname.startsWith("/search") && !pathname.startsWith("/shelf") && !pathname.startsWith("/weekly");
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
