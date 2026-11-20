export type NavItem = {
  to: string;
  label: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "竞品日报" },
  { to: "/search", label: "App Store 搜索" },
];

/** Package details belong to the competitor half of the app. */
export function isNavActive(to: string, pathname: string): boolean {
  if (to === "/") return !pathname.startsWith("/search");
  return pathname === to || pathname.startsWith(`${to}/`);
}
