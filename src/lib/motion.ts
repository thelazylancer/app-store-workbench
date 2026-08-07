import gsap from "gsap";

export function initMotion(root: ParentNode, mode: "boot" | "empty" | "results" = "results") {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return;
  }

  const header = root.querySelector(".workspace-header");
  const rail = root.querySelector(".search-rail");
  const filterBar = root.querySelector(".filter-bar");
  const emptyState = root.querySelector(".empty-state");
  const resultsSummary = root.querySelector(".results-summary");
  const rows = root.querySelectorAll(".result-row");
  const inspector = root.querySelector(".inspector");
  const screenshots = root.querySelectorAll(".screenshot");

  if (mode === "boot" && root instanceof HTMLElement && !root.dataset.motionBooted) {
    const shellTargets = [header, rail].filter(Boolean);
    gsap.fromTo(
      shellTargets,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.06,
        ease: "power2.out",
        overwrite: "auto",
      },
    );
    root.dataset.motionBooted = "true";
  }

  if (filterBar && mode === "results") {
    gsap.fromTo(filterBar, { y: 3 }, { y: 0, duration: 0.14, ease: "power1.out", overwrite: "auto" });
  }

  if (resultsSummary) {
    gsap.fromTo(resultsSummary, { y: 2 }, { y: 0, duration: 0.12, ease: "power1.out", overwrite: "auto" });
  }

  if (emptyState) {
    gsap.fromTo(
      emptyState,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.22, ease: "power1.out", overwrite: "auto" },
    );
    return;
  }

  if (rows.length > 0) {
    gsap.fromTo(
      rows,
      { y: 6 },
      {
        y: 0,
        duration: 0.14,
        stagger: 0.03,
        ease: "power1.out",
        overwrite: "auto",
      },
    );
  }

  if (inspector) {
    gsap.fromTo(
      inspector,
      { y: 6 },
      { y: 0, duration: 0.14, ease: "power1.out", overwrite: "auto" },
    );
  }

  screenshots.forEach((shot, index) => {
    gsap.fromTo(
      shot,
      { y: 6 },
      {
        y: 0,
        delay: index * 0.02,
        duration: 0.12,
        ease: "power1.out",
        overwrite: "auto",
      },
    );
  });
}
