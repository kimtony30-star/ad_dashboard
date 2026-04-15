/**
 * insightHistoryDb.ts
 * 인사이트 히스토리 DB 헬퍼
 * - 스냅샷 저장 / 목록 조회 / 단건 조회
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { insightHistory, InsertInsightHistory } from "../drizzle/schema";
import type { Insight } from "./insightAnalyzer";

export interface PeriodMeta {
  label: string;
  dateFrom: string;
  dateTo: string;
  totalRev: number;
  totalImp: number;
  avgDailyRev: number;
  avgDailyImp: number;
  days: number;
}

export interface InsightSnapshot {
  id: number;
  dataAsOf: string;
  memo: string | null;
  periods: { all: PeriodMeta; month: PeriodMeta; week: PeriodMeta };
  insights: Insight[];
  createdAt: Date;
}

/** 스냅샷 저장 (같은 dataAsOf 가 있으면 덮어쓰기) */
export async function saveInsightSnapshot(
  dataAsOf: string,
  periods: { all: PeriodMeta; month: PeriodMeta; week: PeriodMeta },
  insights: Insight[],
  memo?: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // 같은 날짜 기준 스냅샷이 있으면 삭제 후 재삽입
  const existing = await db
    .select({ id: insightHistory.id })
    .from(insightHistory)
    .where(sql`${insightHistory.dataAsOf} = ${dataAsOf}`)
    .limit(1);

  if (existing.length > 0) {
    await db.delete(insightHistory).where(sql`${insightHistory.dataAsOf} = ${dataAsOf}`);
  }

  const row: InsertInsightHistory = {
    dataAsOf: new Date(dataAsOf + "T00:00:00Z"),
    memo: memo ?? null,
    periods: periods as unknown as Record<string, unknown>,
    insights: insights as unknown as Record<string, unknown>[],
  };

  const result = await db.insert(insightHistory).values(row);
  return (result as unknown as { insertId: number }).insertId ?? 0;
}

/** 히스토리 목록 조회 (최신순, 최대 50개) */
export async function listInsightHistory(): Promise<InsightSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(insightHistory)
    .orderBy(desc(insightHistory.dataAsOf))
    .limit(50);

  return rows.map((r: typeof insightHistory.$inferSelect) => ({
    id: r.id,
    dataAsOf: typeof r.dataAsOf === "string" ? r.dataAsOf : (r.dataAsOf as Date).toISOString().slice(0, 10),
    memo: r.memo ?? null,
    periods: r.periods as InsightSnapshot["periods"],
    insights: (r.insights as unknown as Insight[]) ?? [],
    createdAt: r.createdAt,
  }));
}

/** 단건 조회 */
export async function getInsightSnapshot(id: number): Promise<InsightSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(insightHistory)
    .where(eq(insightHistory.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0] as typeof insightHistory.$inferSelect;
  return {
    id: r.id,
    dataAsOf: typeof r.dataAsOf === "string" ? r.dataAsOf : (r.dataAsOf as Date).toISOString().slice(0, 10),
    memo: r.memo ?? null,
    periods: r.periods as InsightSnapshot["periods"],
    insights: (r.insights as unknown as Insight[]) ?? [],
    createdAt: r.createdAt,
  };
}

/** 두 스냅샷 비교: 기간별 매출/노출 변화율 계산 */
export function compareSnapshots(
  base: InsightSnapshot,
  target: InsightSnapshot
) {
  const compare = (bVal: number, tVal: number) => ({
    base: bVal,
    target: tVal,
    changePct: bVal > 0 ? ((tVal - bVal) / bVal) * 100 : 0,
  });

  return {
    baseDate: base.dataAsOf,
    targetDate: target.dataAsOf,
    all: {
      rev: compare(base.periods.all.avgDailyRev, target.periods.all.avgDailyRev),
      imp: compare(base.periods.all.avgDailyImp, target.periods.all.avgDailyImp),
    },
    month: {
      rev: compare(base.periods.month.avgDailyRev, target.periods.month.avgDailyRev),
      imp: compare(base.periods.month.avgDailyImp, target.periods.month.avgDailyImp),
    },
    week: {
      rev: compare(base.periods.week.avgDailyRev, target.periods.week.avgDailyRev),
      imp: compare(base.periods.week.avgDailyImp, target.periods.week.avgDailyImp),
    },
    // 인사이트 타입별 등장 횟수 비교
    insightTypeDiff: (() => {
      const count = (snaps: Insight[]) => {
        const m: Record<string, number> = {};
        snaps.forEach((i) => { m[i.type] = (m[i.type] ?? 0) + 1; });
        return m;
      };
      const bc = count(base.insights);
      const tc = count(target.insights);
      const allTypes = Array.from(new Set([...Object.keys(bc), ...Object.keys(tc)]));
      return allTypes.map((t) => ({ type: t, base: bc[t] ?? 0, target: tc[t] ?? 0 }));
    })(),
  };
}
