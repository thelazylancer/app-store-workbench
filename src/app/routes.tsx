import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./shell.css";
import { AppShell, EmptyState, Theme, TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { wxTheme } from "../theme/wxTheme";
import { NAV_ITEMS, isNavActive } from "./navItems";
import { CompetitorHomePage } from "../competitor/App";
import { CompetitorDetailPage } from "../competitor/Detail";
import { SearchPage as SearchPageView } from "../search/App";
import { ShelfTrendPage } from "../shelf/App";

type RouterLinkProps = Omit<ComponentProps<typeof Link>, "to"> & { href?: string };

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(function RouterLink({ href, ...rest }, ref) {
  return <Link ref={ref} to={href ?? "/"} {...rest} />;
});

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="2" fill="#1C2733" />
      <rect x="1" y="9" width="4" height="6" fill="#E7EDF2" />
      <rect x="6" y="6" width="4" height="9" fill="#E7EDF2" />
      <rect x="11" y="2" width="4" height="13" fill="#2E6FA3" />
    </svg>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <AppShell
      variant="section"
      height="auto"
      contentPadding={0}
      mobileNav={{ breakpoint: "md" }}
      topNav={
        <TopNav
          label="主导航"
          heading={<TopNavHeading as={RouterLink} logo={<BrandMark />} heading="竞品气象台" headingHref="/" />}
          startContent={NAV_ITEMS.map((item) => (
            <TopNavItem
              key={item.to}
              as={RouterLink}
              href={item.to}
              label={item.label}
              isSelected={isNavActive(item.to, pathname)}
            />
          ))}
        />
      }
    >
      {children}
    </AppShell>
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="wx-app-main">
      <EmptyState headingLevel={1} title={title} description={description} />
    </div>
  );
}

export function CompetitorPage() {
  return <CompetitorHomePage />;
}

export function SearchPage() {
  return <SearchPageView />;
}

export function PackagePage() {
  return <CompetitorDetailPage />;
}

export function ShelfPage() {
  return <ShelfTrendPage />;
}

export function NotFoundPage() {
  return <Placeholder title="页面不存在" description="没有找到这个地址，请回到竞品日报。" />;
}

export function App() {
  return (
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<CompetitorPage />} />
            <Route path="/shelf" element={<ShelfPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/package/:code" element={<PackagePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </Theme>
  );
}
