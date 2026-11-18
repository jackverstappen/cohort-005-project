import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { teamMembers, TeamMemberRole } from "~/db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Queryable = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Looks up the Team Admin's `userId` for a team. Returns `null` when the
 * team has no admin — callers typically short-circuit the team-progress
 * fan-out in that case.
 */
export function getTeamAdminId(db: Queryable, teamId: number): number | null {
  const row = db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  return row?.userId ?? null;
}
