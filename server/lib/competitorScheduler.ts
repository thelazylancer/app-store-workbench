import cron from "node-cron";
import {
  computeTargetDate,
  syncCompetitorDay,
  type CompetitorSyncDeps,
} from "./competitorSync";
import {
  computeOfflineWindow,
  syncOfflinePackages,
  type OfflineSyncDeps,
} from "./offlineSync";

export { computeTargetDate };

export type SchedulerOptions = {
  now?: () => Date;
  run?: typeof syncCompetitorDay;
  runOffline?: typeof syncOfflinePackages;
  log?: (message: string) => void;
};

/** Runs one scheduled tick. Each sync fails independently; nothing is re-thrown. */
export async function runScheduledCompetitorSync(
  deps: CompetitorSyncDeps,
  offlineDeps: OfflineSyncDeps,
  options: SchedulerOptions = {},
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const run = options.run ?? syncCompetitorDay;
  const runOffline = options.runOffline ?? syncOfflinePackages;
  const log = options.log ?? ((message: string) => console.error(message));
  const current = now();

  try {
    await run(computeTargetDate(current), deps);
  } catch (error) {
    log(`Competitor sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await runOffline(computeOfflineWindow(current), offlineDeps, log);
  } catch (error) {
    log(`Offline sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Starts the daily 09:10 Asia/Shanghai run; the timer does not block listen().
 * The source publishes around 08:38–08:47 Beijing, so an 08:00 run would read
 * the previous day's publication while "yesterday" still held 0–1 rows.
 */
export function startCompetitorScheduler(
  deps: CompetitorSyncDeps,
  offlineDeps: OfflineSyncDeps,
  options: SchedulerOptions = {},
) {
  return cron.schedule(
    "10 9 * * *",
    () => {
      void runScheduledCompetitorSync(deps, offlineDeps, options);
    },
    { timezone: "Asia/Shanghai" },
  );
}
