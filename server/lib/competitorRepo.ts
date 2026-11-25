import type { Pool } from "pg";
import { createCompetitorQueries } from "./competitorRepo/queries";
import type { CompetitorQueryRepo } from "./competitorRepo/queries";
import { createCompetitorWrites } from "./competitorRepo/writes";
import type { CompetitorWriteRepo } from "./competitorRepo/writes";

export type { CompetitorQueryRepo } from "./competitorRepo/queries";
export type { CompetitorWriteRepo, CountryHitRow, OfflineDateUpdate, AttributionUpdate } from "./competitorRepo/writes";

export function createCompetitorRepo(pool: Pool): CompetitorWriteRepo & CompetitorQueryRepo {
  return {
    ...createCompetitorQueries(pool),
    ...createCompetitorWrites(pool),
  };
}
