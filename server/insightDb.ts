/**
 * insightDb.ts
 * 인사이트 분석용 DB 헬퍼
 * - 전체기간 / 최근 1개월 / 최근 1주 구간별 집계
 * - DB의 date 컬럼은 Unix timestamp (초 단위) integer로 저장됨
 */
import { and, gte, lte, sql, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { adStats } from "../drizzle/schema";

const TARGET_APPS = ["ocb", "syrup", "olock"];

// YYYY-MM-DD 문자열 → Unix timestamp (초 단위)
function toUnixSec(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

// Unix timestamp (초) → YYYY-MM-DD 문자열
function fromUnixSec(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export interface DailyTotal {
  date: string;
  rev: number;
  imp: number;
}

export interface PeriodSummary {
  label: string;
  dateFrom: string;
  dateTo: string;
  totalRev: number;
  totalImp: number;
  avgDailyRev: number;
  avgDailyImp: number;
  days: number;
  daily: DailyTotal[];
}

export interface AppPeriodRow {
  app: string;
  rev: number;
  imp: number;
}

export interface AdpfPeriodRow {
  adpf: string;
  rev: number;
  imp: number;
}

export interface InsightRawData {
  all: PeriodSummary;
  month: PeriodSummary;
  week: PeriodSummary;
  allByApp: AppPeriodRow[];
  monthByApp: AppPeriodRow[];
  weekByApp: AppPeriodRow[];
  allByAdpf: AdpfPeriodRow[];
  monthByAdpf: AdpfPeriodRow[];
  weekByAdpf: AdpfPeriodRow[];
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getDailyTotals(dateFrom: string, dateTo: string): Promise<DailyTotal[]> {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      dateTs: sql<number>`${adStats.date}`,  // timestamp 숫자로 명시적 선택
      rev: sql<number>`SUM(${adStats.confirmedRevenue})`,
      imp: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(
      and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.date} >= ${fromTs}`,
        sql`${adStats.date} <= ${toTs}`
      )
    )
    .groupBy(adStats.date)
    .orderBy(adStats.date);
  return rows.map((r) => ({
    date: fromUnixSec(Number(r.dateTs)),  // timestamp → YYYY-MM-DD 변환
    rev: Number(r.rev),
    imp: Number(r.imp),
  }));
}

async function getAppTotals(dateFrom: string, dateTo: string): Promise<AppPeriodRow[]> {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      app: adStats.app,
      rev: sql<number>`SUM(${adStats.confirmedRevenue})`,
      imp: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(
      and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.date} >= ${fromTs}`,
        sql`${adStats.date} <= ${toTs}`
      )
    )
    .groupBy(adStats.app);
  return rows.map((r) => ({ app: r.app ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

async function getAdpfTotals(dateFrom: string, dateTo: string): Promise<AdpfPeriodRow[]> {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      adpf: adStats.adpf,
      rev: sql<number>`SUM(${adStats.confirmedRevenue})`,
      imp: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(
      and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.date} >= ${fromTs}`,
        sql`${adStats.date} <= ${toTs}`
      )
    )
    .groupBy(adStats.adpf);
  return rows.map((r) => ({ adpf: r.adpf ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

function makePeriodSummary(label: string, dateFrom: string, dateTo: string, daily: DailyTotal[]): PeriodSummary {
  const totalRev = daily.reduce((s, d) => s + d.rev, 0);
  const totalImp = daily.reduce((s, d) => s + d.imp, 0);
  const days = daily.length || 1;
  return {
    label,
    dateFrom,
    dateTo,
    totalRev,
    totalImp,
    avgDailyRev: totalRev / days,
    avgDailyImp: totalImp / days,
    days,
    daily,
  };
}

export async function getInsightRawData(): Promise<InsightRawData | null> {
  const db = await getDb();
  if (!db) return null;

  // 전체 날짜 범위 조회 (Unix timestamp 초 단위)
  const rangeRow = await db
    .select({
      minTs: sql<number>`MIN(${adStats.date})`,
      maxTs: sql<number>`MAX(${adStats.date})`,
    })
    .from(adStats)
    .where(inArray(adStats.app, TARGET_APPS));

  if (!rangeRow[0]?.maxTs) return null;

  // Unix timestamp → YYYY-MM-DD 변환
  const allFrom   = fromUnixSec(Number(rangeRow[0].minTs));
  const allTo     = fromUnixSec(Number(rangeRow[0].maxTs));
  const monthFrom = offsetDate(allTo, -29);
  const weekFrom  = offsetDate(allTo, -6);

  const [allDaily, monthDaily, weekDaily, allByApp, monthByApp, weekByApp, allByAdpf, monthByAdpf, weekByAdpf] =
    await Promise.all([
      getDailyTotals(allFrom, allTo),
      getDailyTotals(monthFrom, allTo),
      getDailyTotals(weekFrom, allTo),
      getAppTotals(allFrom, allTo),
      getAppTotals(monthFrom, allTo),
      getAppTotals(weekFrom, allTo),
      getAdpfTotals(allFrom, allTo),
      getAdpfTotals(monthFrom, allTo),
      getAdpfTotals(weekFrom, allTo),
    ]);

  return {
    all:   makePeriodSummary("전체기간",   allFrom,   allTo, allDaily),
    month: makePeriodSummary("최근 1개월", monthFrom, allTo, monthDaily),
    week:  makePeriodSummary("최근 1주",   weekFrom,  allTo, weekDaily),
    allByApp,
    monthByApp,
    weekByApp,
    allByAdpf,
    monthByAdpf,
    weekByAdpf,
  };
}