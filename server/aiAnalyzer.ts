/**
 * aiAnalyzer.ts
 * AI 자연어 분석용 DB 집계 + 시스템 프롬프트 생성 (개선본)
 * - 최근 3개월 데이터 (월별 3구간 비교)
 * - 일별 트렌드, 앱×네트워크 조합, Place 상세, CPM/Fill Rate, 월별 비교
 */
import { and, sql, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { adStats } from "../drizzle/schema";

const TARGET_APPS = ["ocb", "syrup", "olock"];

// ── 날짜 헬퍼 ─────────────────────────────────────────────
function offsetDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function toUnixSec(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}
function fromUnixSec(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────
function fmtRev(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${Math.floor(v / 1e6)}M`;
  if (v >= 1e3) return `${Math.floor(v / 1e3)}K`;
  return `${Math.floor(v).toLocaleString()}`;
}
function fmtImp(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
function fmtCpm(rev: number, imp: number): string {
  if (imp === 0) return "-";
  return `₩${((rev / imp) * 1000).toFixed(0)}`;
}
function fmtFillRate(fills: number, requests: number): string {
  if (requests === 0) return "-";
  return `${((fills / requests) * 100).toFixed(1)}%`;
}
function growthStr(prev: number, curr: number): string {
  if (prev === 0) return curr > 0 ? "신규" : "-";
  const pct = ((curr - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
function getWeekday(dateStr: string): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date(dateStr + "T00:00:00Z").getUTCDay()];
}

// ── DB 집계 함수들 ────────────────────────────────────────

// 1. 일별 트렌드 (요일 포함)
async function getDailyTrend(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      dateTs: sql`${adStats.date}`,
      rev:  sql`SUM(${adStats.confirmedRevenue})`,
      imp:  sql`SUM(${adStats.impressions})`,
      req:  sql`SUM(${adStats.requests})`,
      fill: sql`SUM(${adStats.fills})`,
      clk:  sql`SUM(${adStats.clicks})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.date)
    .orderBy(adStats.date);
  return rows.map(r => {
    const date = fromUnixSec(Number(r.dateTs));
    const rev  = Number(r.rev);
    const imp  = Number(r.imp);
    const req  = Number(r.req);
    const fill = Number(r.fill);
    return { date, weekday: getWeekday(date), rev, imp, req, fill, clk: Number(r.clk), cpm: imp > 0 ? (rev / imp) * 1000 : 0, fillRate: req > 0 ? (fill / req) * 100 : 0 };
  });
}

// 2. 월별 집계 (3개월)
async function getMonthlyTotals(months: { label: string; from: string; to: string }[]) {
  const db = await getDb();
  if (!db) return [];
  return Promise.all(months.map(async m => {
    const fromTs = toUnixSec(m.from);
    const toTs   = toUnixSec(m.to);
    const rows = await db
      .select({
        rev:  sql`SUM(${adStats.confirmedRevenue})`,
        imp:  sql`SUM(${adStats.impressions})`,
        req:  sql`SUM(${adStats.requests})`,
        fill: sql`SUM(${adStats.fills})`,
        clk:  sql`SUM(${adStats.clicks})`,
      })
      .from(adStats)
      .where(and(
        inArray(adStats.app, TARGET_APPS),
        sql`${adStats.date} >= ${fromTs}`,
        sql`${adStats.date} <= ${toTs}`,
      ));
    const r = rows[0];
    const rev  = Number(r?.rev ?? 0);
    const imp  = Number(r?.imp ?? 0);
    const req  = Number(r?.req ?? 0);
    const fill = Number(r?.fill ?? 0);
    return { label: m.label, from: m.from, to: m.to, rev, imp, req, fill, clk: Number(r?.clk ?? 0), cpm: imp > 0 ? (rev / imp) * 1000 : 0, fillRate: req > 0 ? (fill / req) * 100 : 0 };
  }));
}

// 3. 앱별 집계
async function getAppTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      app:  adStats.app,
      rev:  sql`SUM(${adStats.confirmedRevenue})`,
      imp:  sql`SUM(${adStats.impressions})`,
      req:  sql`SUM(${adStats.requests})`,
      fill: sql`SUM(${adStats.fills})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.app)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => {
    const rev  = Number(r.rev);
    const imp  = Number(r.imp);
    const req  = Number(r.req);
    const fill = Number(r.fill);
    return { app: r.app ?? "", rev, imp, req, fill, cpm: imp > 0 ? (rev / imp) * 1000 : 0, fillRate: req > 0 ? (fill / req) * 100 : 0 };
  });
}

// 4. 앱 × 네트워크 조합
async function getAppNetworkTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      app:        adStats.app,
      adnetwork1: adStats.adnetwork1,
      adpf:       adStats.adpf,
      rev:  sql`SUM(${adStats.confirmedRevenue})`,
      imp:  sql`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.app, adStats.adnetwork1, adStats.adpf)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => {
    const rev = Number(r.rev);
    const imp = Number(r.imp);
    return { app: r.app ?? "", adnetwork1: r.adnetwork1 ?? "", adpf: r.adpf ?? "", rev, imp, cpm: imp > 0 ? (rev / imp) * 1000 : 0 };
  });
}

// 5. Place 상세 (place1 + place2)
async function getPlaceDetailTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      place1: adStats.place1,
      place2: adStats.place2,
      rev:  sql`SUM(${adStats.confirmedRevenue})`,
      imp:  sql`SUM(${adStats.impressions})`,
      req:  sql`SUM(${adStats.requests})`,
      fill: sql`SUM(${adStats.fills})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.place1, adStats.place2)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => {
    const rev  = Number(r.rev);
    const imp  = Number(r.imp);
    const req  = Number(r.req);
    const fill = Number(r.fill);
    return { place1: r.place1 ?? "", place2: r.place2 ?? "", rev, imp, req, fill, cpm: imp > 0 ? (rev / imp) * 1000 : 0, fillRate: req > 0 ? (fill / req) * 100 : 0 };
  });
}

// 6. 네트워크별 집계
async function getNetworkTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      adnetwork1: adStats.adnetwork1,
      adpf:       adStats.adpf,
      rev:  sql`SUM(${adStats.confirmedRevenue})`,
      imp:  sql`SUM(${adStats.impressions})`,
      req:  sql`SUM(${adStats.requests})`,
      fill: sql`SUM(${adStats.fills})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.adnetwork1, adStats.adpf)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => {
    const rev  = Number(r.rev);
    const imp  = Number(r.imp);
    const req  = Number(r.req);
    const fill = Number(r.fill);
    return { adnetwork1: r.adnetwork1 ?? "", adpf: r.adpf ?? "", rev, imp, req, fill, cpm: imp > 0 ? (rev / imp) * 1000 : 0, fillRate: req > 0 ? (fill / req) * 100 : 0 };
  });
}

// ── AI 컨텍스트 빌드 ──────────────────────────────────────
export async function buildAiContext(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // DB 최신 날짜 기준
  const rangeRow = await db
    .select({ maxTs: sql`MAX(${adStats.date})`, minTs: sql`MIN(${adStats.date})` })
    .from(adStats)
    .where(inArray(adStats.app, TARGET_APPS));

  const maxTs = Number(rangeRow[0]?.maxTs ?? 0);
  const minTs = Number(rangeRow[0]?.minTs ?? 0);
  if (!maxTs) throw new Error("데이터 없음");

  const today    = fromUnixSec(maxTs);
  const m1From   = offsetDate(today, -30);
  const m2From   = offsetDate(today, -60);
  const m3From   = offsetDate(today, -90);
  const m1To     = today;
  const m2To     = offsetDate(today, -31);
  const m3To     = offsetDate(today, -61);
  const allFrom  = fromUnixSec(minTs);

  const months = [
    { label: "3개월 전", from: m3From, to: m3To },
    { label: "2개월 전", from: m2From, to: m2To },
    { label: "최근 1개월", from: m1From, to: m1To },
  ];

  const [monthly, appTotals, appNetwork, placeDetail, network, dailyTrend] = await Promise.all([
    getMonthlyTotals(months),
    getAppTotals(m1From, today),
    getAppNetworkTotals(m1From, today),
    getPlaceDetailTotals(m1From, today),
    getNetworkTotals(m1From, today),
    getDailyTrend(m1From, today),
  ]);

  return buildSystemPrompt({
    today, allFrom, months, monthly, appTotals, appNetwork, placeDetail, network, dailyTrend,
  });
}

// ── 시스템 프롬프트 생성 ──────────────────────────────────
function buildSystemPrompt(ctx: {
  today: string; allFrom: string;
  months: { label: string; from: string; to: string }[];
  monthly: any[];
  appTotals: any[];
  appNetwork: any[];
  placeDetail: any[];
  network: any[];
  dailyTrend: any[];
}): string {

  // 월별 비교표
  const monthlyRows = ctx.monthly.map((m, i) => {
    const prev = ctx.monthly[i - 1];
    return `  ${m.label}(${m.from}~${m.to}): 매출 ${fmtRev(m.rev)} / 노출 ${fmtImp(m.imp)} / CPM ${fmtCpm(m.rev, m.imp)} / Fill Rate ${fmtFillRate(m.fill, m.req)}${prev ? ` / 전월대비 ${growthStr(prev.rev, m.rev)}` : ""}`;
  }).join("\n");

  // 앱별
  const totalRev = ctx.appTotals.reduce((s, a) => s + a.rev, 0);
  const appRows = ctx.appTotals.map(a =>
    `  ${a.app.toUpperCase()}: 매출 ${fmtRev(a.rev)} (비중 ${totalRev > 0 ? ((a.rev / totalRev) * 100).toFixed(1) : 0}%) / CPM ${fmtCpm(a.rev, a.imp)} / Fill Rate ${fmtFillRate(a.fill, a.req)}`
  ).join("\n");

  // 앱 × 네트워크 Top 15
  const appNetRows = ctx.appNetwork.slice(0, 15).map(r =>
    `  ${r.app.toUpperCase()} × ${r.adnetwork1} [${r.adpf}]: 매출 ${fmtRev(r.rev)} / CPM ${fmtCpm(r.rev, r.imp)}`
  ).join("\n");

  // Place 상세 Top 20
  const placeRows = ctx.placeDetail.slice(0, 20).map(p =>
    `  ${p.place1}${p.place2 ? " > " + p.place2 : ""}: 매출 ${fmtRev(p.rev)} / CPM ${fmtCpm(p.rev, p.imp)} / Fill Rate ${fmtFillRate(p.fill, p.req)}`
  ).join("\n");

  // 네트워크별
  const netRows = ctx.network.map(n =>
    `  [${n.adpf}] ${n.adnetwork1}: 매출 ${fmtRev(n.rev)} / CPM ${fmtCpm(n.rev, n.imp)} / Fill Rate ${fmtFillRate(n.fill, n.req)}`
  ).join("\n");

  // 일별 트렌드 (최근 30일, 요일별 평균 포함)
  const dailyRows = ctx.dailyTrend.slice(-30).map(d =>
    `  ${d.date}(${d.weekday}): 매출 ${fmtRev(d.rev)} / CPM ₩${d.cpm.toFixed(0)} / Fill ${d.fillRate.toFixed(1)}%`
  ).join("\n");

  // 요일별 평균
  const weekdayAvg: Record<string, { rev: number; cnt: number }> = {};
  for (const d of ctx.dailyTrend) {
    if (!weekdayAvg[d.weekday]) weekdayAvg[d.weekday] = { rev: 0, cnt: 0 };
    weekdayAvg[d.weekday].rev += d.rev;
    weekdayAvg[d.weekday].cnt += 1;
  }
  const weekdayRows = ["월", "화", "수", "목", "금", "토", "일"]
    .filter(w => weekdayAvg[w])
    .map(w => `  ${w}요일 평균: ${fmtRev(weekdayAvg[w].rev / weekdayAvg[w].cnt)}`)
    .join("\n");

  return `당신은 광고 성과 데이터 분석 전문가입니다.
전체 데이터 기간: ${ctx.allFrom} ~ ${ctx.today}
분석 기준일: ${ctx.today}

=== 월별 성과 비교 (최근 3개월) ===
${monthlyRows}

=== 앱별 성과 (최근 1개월) ===
${appRows}

=== 앱 × 애드네트워크 조합 Top 15 (최근 1개월) ===
${appNetRows}

=== Place 상세 Top 20 (최근 1개월, place1 > place2) ===
${placeRows}

=== 애드네트워크별 성과 (최근 1개월) ===
${netRows}

=== 일별 트렌드 (최근 30일) ===
${dailyRows}

=== 요일별 평균 매출 ===
${weekdayRows}

[답변 규칙]
- 한국어로 답변하세요.
- 구체적인 수치를 반드시 포함하세요.
- 표(마크다운)를 적극 활용하세요.
- 데이터에 없는 내용은 "데이터 없음"으로 답하세요.
- 질문이 특정 기간/앱/네트워크/Place에 관한 것이면 해당 데이터만 골라서 답하세요.`;
}

// ── OpenAI API 호출 ───────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function callOpenAI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API 오류: ${response.status} - ${err}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}