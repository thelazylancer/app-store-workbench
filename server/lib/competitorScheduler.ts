import cron from "node-cron";
import {
  computeTargetDate,
  syncCompetitorDay,
  type CompetitorSyncDeps,
} from "./competitorSync";

export { computeTargetDate };

export type SchedulerOptions = {
  now?: () => Date;
  run?: typeof syncCompetitorDay;
  log?: (message: string) => void;
};

/** Runs one scheduled tick. Failures are logged and never re-thrown. */
export async function runScheduledCompetitorSync(
  deps: CompetitorSyncDeps,
  options: SchedulerOptions = {},
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const run = options.run ?? syncCompetitorDay;
  const log = options.log ?? ((message: string) => console.error(message));

  try {
    await run(computeTargetDate(now()), deps);
  } catch (error) {
    log(`Competitor sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Starts the daily 08:00 Asia/Shanghai run; the timer does not block listen(). */
export function startCompetitorScheduler(deps: CompetitorSyncDeps, options: SchedulerOptions = {}) {
  return cron.schedule(
    "0 8 * * *",
    () => {
      void runScheduledCompetitorSync(deps, options);
    },
    { timezone: "Asia/Shanghai" },
  );
}
