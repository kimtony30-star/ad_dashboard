/**
 * aiAnalyzer.ts
 * AI 자연어 분석용 DB 집계 + 시스템 프롬프트 생성
 * - 최근 1개월 vs 이전 1개월 자동 비교
 * - OpenAI API 호출
 */
import { and, gte, lte, sql, inArray } from "drizzle-orm";
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

// ── 포맷 헬퍼 ─────────────────────────────────────────────
function fmtRev(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${Math.floor(v / 1e6)}M`;
  if (v >= 1e3) return `${Math.floor(v / 1e3)}K`;
  return `${Math.floor(v).toLocaleString()}`;
}

function growthStr(prev: number, curr: number): string {
  if (prev === 0) return "신규";
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ── DB 집계 함수들 ────────────────────────────────────────
async function getPlaceTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      place1: adStats.place1,
      rev: sql`SUM(${adStats.confirmedRevenue})`,
      imp: sql`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.place1)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => ({ place1: r.place1 ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

async function getAppTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      app: adStats.app,
      rev: sql`SUM(${adStats.confirmedRevenue})`,
      imp: sql`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.app)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => ({ app: r.app ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

async function getAdpfTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      adpf: adStats.adpf,
      rev: sql`SUM(${adStats.confirmedRevenue})`,
      imp: sql`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.adpf)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => ({ adpf: r.adpf ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

async function getNetworkTotals(dateFrom: string, dateTo: string) {
  const db = await getDb();
  if (!db) return [];
  const fromTs = toUnixSec(dateFrom);
  const toTs   = toUnixSec(dateTo);
  const rows = await db
    .select({
      adnetwork1: adStats.adnetwork1,
      adpf: adStats.adpf,
      rev: sql`SUM(${adStats.confirmedRevenue})`,
      imp: sql`SUM(${adStats.impressions})`,
    })
    .from(adStats)
    .where(and(
      inArray(adStats.app, TARGET_APPS),
      sql`${adStats.date} >= ${fromTs}`,
      sql`${adStats.date} <= ${toTs}`,
    ))
    .groupBy(adStats.adnetwork1, adStats.adpf)
    .orderBy(sql`SUM(${adStats.confirmedRevenue}) DESC`);
  return rows.map(r => ({ adnetwork1: r.adnetwork1 ?? "", adpf: r.adpf ?? "", rev: Number(r.rev), imp: Number(r.imp) }));
}

// ── AI 컨텍스트 빌드 ──────────────────────────────────────
export interface AiContext {
  currPlace: { place1: string; rev: number; imp: number }[];
  prevPlace: { place1: string; rev: number; imp: number }[];
  currApp:   { app: string;    rev: number; imp: number }[];
  prevApp:   { app: string;    rev: number; imp: number }[];
  currAdpf:  { adpf: string;   rev: number; imp: number }[];
  prevAdpf:  { adpf: string;   rev: number; imp: number }[];
  currNetwork: { adnetwork1: string; adpf: string; rev: number; imp: number }[];
  prevNetwork: { adnetwork1: string; adpf: string; rev: number; imp: number }[];
  period: { curr: string; prev: string };
}

export async function buildAiContext(): Promise<AiContext> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const rangeRow = await db
    .select({ maxTs: sql`MAX(${adStats.date})` })
    .from(adStats)
    .where(inArray(adStats.app, TARGET_APPS));

  const maxTs = Number(rangeRow[0]?.maxTs ?? 0);
  const today = maxTs > 0
    ? new Date(maxTs * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const currFrom = offsetDate(today, -30);
  const prevTo   = offsetDate(today, -31);
  const prevFrom = offsetDate(today, -61);

  const [currPlace, prevPlace, currApp, prevApp, currAdpf, prevAdpf, currNetwork, prevNetwork] = await Promise.all([
    getPlaceTotals(currFrom, today),
    getPlaceTotals(prevFrom, prevTo),
    getAppTotals(currFrom, today),
    getAppTotals(prevFrom, prevTo),
    getAdpfTotals(currFrom, today),
    getAdpfTotals(prevFrom, prevTo),
    getNetworkTotals(currFrom, today),
    getNetworkTotals(prevFrom, prevTo),
  ]);

  return {
    currPlace, prevPlace, currApp, prevApp, currAdpf, prevAdpf,
    currNetwork, prevNetwork,
    period: { curr: `${currFrom}~${today}`, prev: `${prevFrom}~${prevTo}` },
  };
}

// ── 시스템 프롬프트 생성 ──────────────────────────────────
export function buildSystemPrompt(ctx: AiContext): string {
  const placeRows = ctx.currPlace.slice(0, 15).map(c => {
    const p = ctx.prevPlace.find(x => x.place1 === c.place1);
    return `  ${c.place1}: 현재 ${fmtRev(c.rev)} / 이전 ${fmtRev(p?.rev ?? 0)} / 성장률 ${growthStr(p?.rev ?? 0, c.rev)}`;
  }).join("\n");

  const appRows = ctx.currApp.map(c => {
    const p = ctx.prevApp.find(x => x.app === c.app);
    return `  ${c.app.toUpperCase()}: 현재 ${fmtRev(c.rev)} / 이전 ${fmtRev(p?.rev ?? 0)} / 성장률 ${growthStr(p?.rev ?? 0, c.rev)}`;
  }).join("\n");

  const adpfRows = ctx.currAdpf.map(c => {
    const p = ctx.prevAdpf.find(x => x.adpf === c.adpf);
    return `  ${c.adpf}: 현재 ${fmtRev(c.rev)} / 이전 ${fmtRev(p?.rev ?? 0)} / 성장률 ${growthStr(p?.rev ?? 0, c.rev)}`;
  }).join("\n");

  const networkRows = ctx.currNetwork.map(c => {
    const p = ctx.prevNetwork.find(x => x.adnetwork1 === c.adnetwork1 && x.adpf === c.adpf);
    return `  [${c.adpf}] ${c.adnetwork1}: 현재 ${fmtRev(c.rev)} / 이전 ${fmtRev(p?.rev ?? 0)} / 성장률 ${growthStr(p?.rev ?? 0, c.rev)}`;
  }).join("\n");

  return `당신은 광고 성과 데이터 분석 전문가입니다.
아래는 최근 1개월(${ctx.period.curr})과 이전 1개월(${ctx.period.prev})의 광고 데이터입니다.

[Place별 매출 현황]
${placeRows}

[앱별 매출 현황]
${appRows}

[ADPF별 매출 현황]
${adpfRows}

[Adnetwork1별 매출 현황 (ADPF 포함)]
${networkRows}

사용자의 질문에 한국어로 명확하고 구체적인 수치를 포함하여 답변하세요.
마크다운 형식(볼드, 목록, 표 등)을 활용해 읽기 쉽게 작성하세요.
데이터에 없는 내용은 추측하지 말고 "데이터 없음"으로 답변하세요.`;
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
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API 오류: ${response.status} - ${err}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}