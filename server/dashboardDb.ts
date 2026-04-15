/**
 * dashboardDb.ts
 * 광고통계 DB 헬퍼 함수
 * - CSV 행 배치 삽입
 * - 대시보드용 집계 쿼리 (섹션1~3 + KPI)
 */
import { and, desc, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { adStats, InsertAdStat, uploadLogs, InsertUploadLog } from "../drizzle/schema";

const TARGET_APPS = ["ocb", "syrup", "olock"];

// ── 날짜 범위 데이터 삭제 ────────────────────────────────────
// 파일 청크 업로드 시 첫 번째 청크에서 한 번만 호출하여 해당 날짜 범위 전체 삭제
export async function deleteStatsByDateRange(minDate: string, maxDate: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(adStats)
    .where(and(gte(adStats.date, new Date(minDate + 'T00:00:00Z')), lte(adStats.date, new Date(maxDate + 'T00:00:00Z'))));
}

// ── CSV 행 배치 삽입 (순수 INSERT) ───────────────────────────────
export async function insertAdStatsBatch(rows: InsertAdStat[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;

  const CHUNK = 500;
  let inserted = 0;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await db.insert(adStats).values(chunk);
      inserted += chunk.length;
    }
  } catch (error) {
    console.error("DB Batch Insert Error:", error);
    throw error;
  }
  return inserted;
}

// ── 날짜 목록 조회 ────────────────────────────────────────
export async function getAvailableDates(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ date: adStats.date })
    .from(adStats)
    .orderBy(adStats.date);
  return rows.map((r) => {
    const d = r.date as unknown as Date | string;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  });
}

// ── 섹션1: 앱별 일별 집계 ────────────────────────────────
export async function getSec1LineData() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: adStats.date,
      app: adStats.app,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(inArray(adStats.app, TARGET_APPS))
    .groupBy(adStats.date, adStats.app)
    .orderBy(adStats.date);
}

// ── 섹션2: ADPF별 일별 집계 ──────────────────────────────
export async function getSec2LineData() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: adStats.date,
      adpf: adStats.adpf,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .groupBy(adStats.date, adStats.adpf)
    .orderBy(adStats.date);
}

// ── 섹션2: Adnetwork1별 합계 ─────────────────────────────
export async function getSec2NetworkData() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      adpf: adStats.adpf,
      adnetwork1: adStats.adnetwork1,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .groupBy(adStats.adpf, adStats.adnetwork1)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
}

// ── 섹션3: 뉴스 Place1 앱별 일별 집계 ────────────────────
export async function getSec3LineData() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: adStats.date,
      app: adStats.app,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(
      and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.place1} LIKE '%뉴스%'`
      )
    )
    .groupBy(adStats.date, adStats.app)
    .orderBy(adStats.date);
}

// ── 섹션3: Place1별 합계 ─────────────────────────────────
export async function getSec3PlaceData() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      place1: adStats.place1,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(
      and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.place1} LIKE '%뉴스%'`
      )
    )
    .groupBy(adStats.place1)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
}

// ── 섹션3: 뉴스 애드네트워크별 합계 (전체) ────────────────
export async function getSec3NetworkData(dateMin?: string, dateMax?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    inArray(adStats.app, TARGET_APPS),
    sql`${adStats.place1} LIKE '%뉴스%'`,
  ];
  if (dateMin) conditions.push(gte(adStats.date, new Date(dateMin + 'T00:00:00Z')));
  if (dateMax) conditions.push(lte(adStats.date, new Date(dateMax + 'T00:00:00Z')));

  return db
    .select({
      adnetwork1: adStats.adnetwork1,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(...conditions))
    .groupBy(adStats.adnetwork1)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
}

// ── 섹션3: 뉴스 애드네트워크별 합계 (앱별) ────────────────
export async function getSec3NetworkByAppData(dateMin?: string, dateMax?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    inArray(adStats.app, TARGET_APPS),
    sql`${adStats.place1} LIKE '%뉴스%'`,
  ];
  if (dateMin) conditions.push(gte(adStats.date, new Date(dateMin + 'T00:00:00Z')));
  if (dateMax) conditions.push(lte(adStats.date, new Date(dateMax + 'T00:00:00Z')));

  return db
    .select({
      app: adStats.app,
      adnetwork1: adStats.adnetwork1,
      confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      impressions: sql<number>`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(...conditions))
    .groupBy(adStats.app, adStats.adnetwork1)
    .orderBy(adStats.app, sql`SUM(${adStats.confirmedRevenue}) DESC`);
}

// ── 업로드 이력 저장 ──────────────────────────────────────
export async function insertUploadLog(log: InsertUploadLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(uploadLogs).values(log);
}

// ── 업로드 이력 조회 ──────────────────────────────────────
export async function getUploadLogs() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(uploadLogs)
    .orderBy(desc(uploadLogs.uploadedAt))
    .limit(100);
}

// ── KPI 전체 합계 ─────────────────────────────────────────
export async function getKpiData() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      totalConfirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
      totalImpressions: sql<number>`SUM(${adStats.impressions})`,
      totalClicks: sql<number>`SUM(${adStats.clicks})`,
    })
    .from(adStats)
    .where(inArray(adStats.app, TARGET_APPS));
  return rows[0] ?? null;
}
