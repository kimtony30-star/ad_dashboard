
// ═══════════════════════════════════════════════
// 수정 1: routers.ts 상단 import에 아래 줄 추가
// (기존 import들 바로 아래에 붙여넣기)
// ═══════════════════════════════════════════════
import { buildAiContext, buildSystemPrompt, callOpenAI } from "./aiAnalyzer";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  insertAdStatsBatch,
  deleteStatsByDateRange,
  getAvailableDates,
  getSec1LineData,
  getSec2LineData,
  getSec2NetworkData,
  getSec3LineData,
  getSec3PlaceData,
  getSec3NetworkData,
  getSec3NetworkByAppData,
  getKpiData,
  insertUploadLog,
  getUploadLogs,
} from "./dashboardDb";
import { getInsightRawData } from "./insightDb";
import { analyzeInsights } from "./insightAnalyzer";
import {
  saveInsightSnapshot,
  listInsightHistory,
  getInsightSnapshot,
  compareSnapshots,
} from "./insightHistoryDb";
import { InsertAdStat } from "../drizzle/schema";
import {
  anonymizeApp,
  anonymizeNetwork,
  setNetworkAnonMap,
  isAnonMode,
} from "./anonymize";

// ── CSV 파싱 헬퍼 ─────────────────────────────────────────
// CSV 한 줄을 RFC 4180 표준에 맞게 파싱 (따옴표 내 쉼표 처리)
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsvContent(content: string): InsertAdStat[] {
  const cleanContent = content.replace(/^\uFEFF/, "");
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const getCol = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    if (idx === -1) return "";
    const val = (row[idx] ?? "").trim().replace(/^"|"$/g, "");
    return val;
  };

  const toNum = (s: string): number => {
    const n = parseFloat(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const rows: InsertAdStat[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateStr = getCol(row, "date");
    if (!dateStr) continue;

    // date 파싱 - Date 객체 대신 'YYYY-MM-DD' 문자열로 저장하여 타임존 오프셋 문제 근본 방지
    let normalizedDate: string;
    if (dateStr.includes("-") && dateStr.length === 10) {
      normalizedDate = dateStr; // 이미 YYYY-MM-DD 형식
    } else if (dateStr.length === 8 && !dateStr.includes("-")) {
      normalizedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    } else {
      continue;
    }
    // 유효성 검사
    const testDate = new Date(normalizedDate + 'T00:00:00Z');
    if (isNaN(testDate.getTime())) continue;
    const parsedDate = testDate; // SQLite Drizzle은 Date.getTime()을 호출하므로 실제 Date 객체를 전달해야 함

    const app = getCol(row, "app").toLowerCase();

    rows.push({
      date: parsedDate,
      year: parseInt(getCol(row, "year")) || parsedDate.getFullYear(),
      month: parseInt(getCol(row, "month")) || parsedDate.getMonth() + 1,
      day: parseInt(getCol(row, "day")) || parsedDate.getDate(),
      app,
      adpf: getCol(row, "adpf"),
      adnetwork1: getCol(row, "adnetwork1"),
      adnetwork2: getCol(row, "adnetwork2"),
      unitId: getCol(row, "unit_id") || getCol(row, "unitid"),
      unitName: getCol(row, "unit_name") || getCol(row, "unitname"),
      creativeType: getCol(row, "creative_type") || getCol(row, "creativetype"),
      place1: getCol(row, "place1"),
      place2: getCol(row, "place2"),
      place3: getCol(row, "place3"),
      requests: toNum(getCol(row, "requests")),
      fills: toNum(getCol(row, "fills")),
      impressions: toNum(getCol(row, "impressions")),
      clicks: toNum(getCol(row, "clicks")),
      estimatedRevenue: toNum(getCol(row, "estimated revenue") || getCol(row, "estimatedrevenue")),
      confirmedRevenue: toNum(getCol(row, "confirmed revenue") || getCol(row, "confirmedrevenue")),
      currency: getCol(row, "currency"),
      uploadedAt: new Date(),
    });
  }
  return rows;
}

// ── 집계 데이터 → DashboardData 변환 ─────────────────────
async function buildDashboardData(forceAnon = false) {
  const [dates, sec1Raw, sec2LineRaw, sec2NetRaw, sec3LineRaw, sec3PlaceRaw, sec3NetRaw, sec3NetByAppRaw, kpiRaw] =
    await Promise.all([
      getAvailableDates(),
      getSec1LineData(),
      getSec2LineData(),
      getSec2NetworkData(),
      getSec3LineData(),
      getSec3PlaceData(),
      getSec3NetworkData(),
      getSec3NetworkByAppData(),
      getKpiData(),
    ]);

  if (dates.length === 0) return null;

  const TARGET_APPS = ["ocb", "syrup", "olock"];

  // 익명화 모드: forceAnon(공개 URL) 또는 서버 전역 ANON_MODE 중 하나라도 ON이면 익명화
  const anonMode = forceAnon || isAnonMode();
  if (anonMode) {
    const allNetworks = new Set<string>();
    for (const row of sec2NetRaw) { if (row.adnetwork1) allNetworks.add(row.adnetwork1); }
    for (const row of sec3NetRaw) { if (row.adnetwork1) allNetworks.add(row.adnetwork1); }
    for (const row of sec3NetByAppRaw) { if (row.adnetwork1) allNetworks.add(row.adnetwork1); }
    setNetworkAnonMap(Array.from(allNetworks));
  }

  const anonApp = (name: string) => anonMode ? anonymizeApp(name) : name;
  const anonNet = (name: string) => anonMode ? anonymizeNetwork(name) : name;

  // 날짜 문자열 정규화 헬퍼
  const normDate = (d: unknown): string => {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  // ── 섹션1 라인 ──────────────────────────────────────────
  const sec1Series: Record<string, { confirmed_revenue: number[]; impressions: number[] }> = {};
  for (const app of TARGET_APPS) {
    sec1Series[app] = {
      confirmed_revenue: new Array(dates.length).fill(0),
      impressions: new Array(dates.length).fill(0),
    };
  }
  for (const row of sec1Raw) {
    const app = (row.app ?? "").toLowerCase();
    const dateStr = normDate(row.date);
    const idx = dates.indexOf(dateStr);
    if (idx === -1 || !sec1Series[app]) continue;
    sec1Series[app].confirmed_revenue[idx] += Number(row.confirmedRevenue);
    sec1Series[app].impressions[idx] += Number(row.impressions);
  }

  // 섹션1 합계
  const sec1Total = {
    apps: TARGET_APPS.map(anonApp),
    confirmed_revenue: TARGET_APPS.map((app) =>
      sec1Series[app].confirmed_revenue.reduce((a, b) => a + b, 0)
    ),
    impressions: TARGET_APPS.map((app) =>
      sec1Series[app].impressions.reduce((a, b) => a + b, 0)
    ),
  };

  // ── 섹션2 라인 ──────────────────────────────────────────
  const adpfList = ["3rd Party", "PADNW"];
  const sec2Series: Record<string, { confirmed_revenue: number[]; impressions: number[] }> = {};
  for (const adpf of adpfList) {
    sec2Series[adpf] = {
      confirmed_revenue: new Array(dates.length).fill(0),
      impressions: new Array(dates.length).fill(0),
    };
  }
  for (const row of sec2LineRaw) {
    const adpf = row.adpf ?? "";
    const dateStr = normDate(row.date);
    const idx = dates.indexOf(dateStr);
    if (idx === -1 || !sec2Series[adpf]) continue;
    sec2Series[adpf].confirmed_revenue[idx] += Number(row.confirmedRevenue);
    sec2Series[adpf].impressions[idx] += Number(row.impressions);
  }

  // 섹션2 네트워크별
  const sec2: Record<string, { networks: string[]; confirmed_revenue: number[]; impressions: number[] }> = {
    "3rd Party": { networks: [], confirmed_revenue: [], impressions: [] },
    PADNW: { networks: [], confirmed_revenue: [], impressions: [] },
  };
  for (const row of sec2NetRaw) {
    const adpf = row.adpf ?? "";
    if (!sec2[adpf]) continue;
    sec2[adpf].networks.push(anonNet(row.adnetwork1 ?? ""));
    sec2[adpf].confirmed_revenue.push(Number(row.confirmedRevenue));
    sec2[adpf].impressions.push(Number(row.impressions));
  }

  // ── 섹션3 라인 ──────────────────────────────────────────
  const sec3Series: Record<string, { confirmed_revenue: number[]; impressions: number[] }> = {};
  for (const app of TARGET_APPS) {
    sec3Series[app] = {
      confirmed_revenue: new Array(dates.length).fill(0),
      impressions: new Array(dates.length).fill(0),
    };
  }
  for (const row of sec3LineRaw) {
    const app = (row.app ?? "").toLowerCase();
    const dateStr = normDate(row.date);
    const idx = dates.indexOf(dateStr);
    if (idx === -1 || !sec3Series[app]) continue;
    sec3Series[app].confirmed_revenue[idx] += Number(row.confirmedRevenue);
    sec3Series[app].impressions[idx] += Number(row.impressions);
  }

  const sec3Total = {
    apps: TARGET_APPS.map(anonApp),
    confirmed_revenue: TARGET_APPS.map((app) =>
      sec3Series[app].confirmed_revenue.reduce((a, b) => a + b, 0)
    ),
    impressions: TARGET_APPS.map((app) =>
      sec3Series[app].impressions.reduce((a, b) => a + b, 0)
    ),
  };

  const sec3Place = {
    places: sec3PlaceRaw.map((r) => r.place1 ?? ""),
    confirmed_revenue: sec3PlaceRaw.map((r) => Number(r.confirmedRevenue)),
    impressions: sec3PlaceRaw.map((r) => Number(r.impressions)),
  };

  // 섹션3 애드네트워크별 (CPM 계산 포함)
  const sec3Network = {
    networks: sec3NetRaw.map((r) => anonNet(r.adnetwork1 ?? "")),
    confirmed_revenue: sec3NetRaw.map((r) => Number(r.confirmedRevenue)),
    impressions: sec3NetRaw.map((r) => Number(r.impressions)),
    cpm: sec3NetRaw.map((r) => {
      const imp = Number(r.impressions);
      const rev = Number(r.confirmedRevenue);
      return imp > 0 ? (rev / imp) * 1000 : 0;
    }),
  };

  // 섹션3 앱별 애드네트워크 (CPM 계산 포함)
  const TARGET_APPS_LIST = ["ocb", "syrup", "olock"];
  const sec3NetworkByApp: Record<string, { networks: string[]; confirmed_revenue: number[]; impressions: number[]; cpm: number[] }> = {};
  for (const app of TARGET_APPS_LIST) {
    const appRows = sec3NetByAppRaw.filter((r) => (r.app ?? "").toLowerCase() === app);
    const appKey = anonApp(app); // 익명화 모드에서는 "A사" 등으로 키 변경
    sec3NetworkByApp[appKey] = {
      networks: appRows.map((r) => anonNet(r.adnetwork1 ?? "")),
      confirmed_revenue: appRows.map((r) => Number(r.confirmedRevenue)),
      impressions: appRows.map((r) => Number(r.impressions)),
      cpm: appRows.map((r) => {
        const imp = Number(r.impressions);
        const rev = Number(r.confirmedRevenue);
        return imp > 0 ? (rev / imp) * 1000 : 0;
      }),
    };
  }

  // ── KPI ─────────────────────────────────────────────────
  const totalRev = Number(kpiRaw?.totalConfirmedRevenue ?? 0);
  const totalImp = Number(kpiRaw?.totalImpressions ?? 0);
  const totalClicks = Number(kpiRaw?.totalClicks ?? 0);

  return {
    kpi: {
      total_confirmed_revenue: totalRev,
      total_impressions: totalImp,
      total_clicks: totalClicks,
      period: `${dates[0]} ~ ${dates[dates.length - 1]}`,
    },
    sec1_line: { dates, series: sec1Series },
    sec1_total: sec1Total,
    sec2,
    sec2_line: { dates, series: sec2Series },
    sec3_line: { dates, series: sec3Series },
    sec3_total: sec3Total,
    sec3_place: sec3Place,
    sec3_network: sec3Network,
    sec3_network_by_app: sec3NetworkByApp,
  };
}

// ── 청크 누적 버퍼 (서버 메모리, 파일명 기준) ──────────────
const chunkBuffer = new Map<string, {
  chunks: string[];
  totalChunks: number;
  fileMinDate: string;
  fileMaxDate: string;
}>();

// ── tRPC 라우터 ───────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    // 대시보드 전체 집계 데이터 조회
    getData: publicProcedure.query(async ({ ctx }) => {
      return await buildDashboardData(ctx.isPublicMode);
    }),

    // CSV 파일 업로드 → DB 적재 (단일 파일, 소용량 fallback)
    // 업로드한 날짜 범위의 기존 데이터를 삭제 후 새 데이터로 교체
    uploadCsv: publicProcedure
      .input(
        z.object({
          files: z.array(
            z.object({
              name: z.string(),
              content: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        let totalInserted = 0;
        const fileNames: string[] = [];

        for (const file of input.files) {
          const rows = parseCsvContent(file.content);
          if (rows.length > 0) {
            // 날짜 범위 추출 후 기존 데이터 삭제
            const dates = rows.map((r) =>
              r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
            );
            const minDate = dates.reduce((a, b) => (a < b ? a : b));
            const maxDate = dates.reduce((a, b) => (a > b ? a : b));
            await deleteStatsByDateRange(minDate, maxDate);
            const inserted = await insertAdStatsBatch(rows);
            totalInserted += inserted;
            fileNames.push(file.name);
            // 업로드 이력 기록
            await insertUploadLog({
              fileName: file.name,
              dateMin: new Date(minDate),
              dateMax: new Date(maxDate),
              totalRows: inserted,
              status: "success",
            });
          }
        }

        // 업로드 완료 후 자동 인사이트 스냅샷 저장 (비동기, 실패해도 업로드 결과에 영향 없음)
        let autoSnapshotId: number | null = null;
        try {
          const raw = await getInsightRawData();
          if (raw) {
            const insights = analyzeInsights(raw);
            const periods = {
              all:   { label: raw.all.label,   dateFrom: raw.all.dateFrom,   dateTo: raw.all.dateTo,   totalRev: raw.all.totalRev,   totalImp: raw.all.totalImp,   avgDailyRev: raw.all.avgDailyRev,   avgDailyImp: raw.all.avgDailyImp,   days: raw.all.days },
              month: { label: raw.month.label, dateFrom: raw.month.dateFrom, dateTo: raw.month.dateTo, totalRev: raw.month.totalRev, totalImp: raw.month.totalImp, avgDailyRev: raw.month.avgDailyRev, avgDailyImp: raw.month.avgDailyImp, days: raw.month.days },
              week:  { label: raw.week.label,  dateFrom: raw.week.dateFrom,  dateTo: raw.week.dateTo,  totalRev: raw.week.totalRev,  totalImp: raw.week.totalImp,  avgDailyRev: raw.week.avgDailyRev,  avgDailyImp: raw.week.avgDailyImp,  days: raw.week.days },
            };
            const memo = `자동 저장 — ${fileNames.join(", ")} 업로드 완료`;
            autoSnapshotId = await saveInsightSnapshot(raw.all.dateTo, periods, insights, memo);
          }
        } catch (e) {
          console.error("[Auto Snapshot] 저장 실패:", e);
        }

        return { insertedRows: totalInserted, fileNames, autoSnapshotId };
      }),

    // CSV 청크 업로드 → DB 적재 (대용량 파일 분할 전송)
    // 모든 청크를 서버 메모리에 누적 후, 마지막 청크에서 한 번에 DELETE + INSERT
    // → 중간 실패 시 기존 데이터가 보존됨
    uploadCsvChunk: publicProcedure
      .input(
        z.object({
          fileName: z.string(),
          chunkIndex: z.number(),
          totalChunks: z.number(),
          chunkContent: z.string(),
          isFirstChunk: z.boolean(),
          fileMinDate: z.string().optional(),
          fileMaxDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const bufKey = input.fileName;

        // 첫 번째 청크: 버퍼 초기화
        if (input.isFirstChunk) {
          chunkBuffer.set(bufKey, {
            chunks: [],
            totalChunks: input.totalChunks,
            fileMinDate: input.fileMinDate ?? "",
            fileMaxDate: input.fileMaxDate ?? "",
          });
        }

        const buf = chunkBuffer.get(bufKey);
        if (!buf) {
          throw new Error(`버퍼 없음: ${bufKey} — 첫 번째 청크부터 다시 업로드해 주세요.`);
        }

        // 청크 누적
        buf.chunks[input.chunkIndex] = input.chunkContent;

        const isDone = input.chunkIndex === input.totalChunks - 1 &&
          buf.chunks.filter(Boolean).length === input.totalChunks;

        if (!isDone) {
          return { insertedRows: 0, chunkIndex: input.chunkIndex, totalChunks: input.totalChunks, fileName: input.fileName, done: false };
        }

        // 모든 청크 수신 완료 → 헤더 중복 제거 후 전체 파싱
        const header = buf.chunks[0].split(/\r?\n/)[0];
        let fullContent = header + "\n";
        for (const chunk of buf.chunks) {
          const chunkLines = chunk.split(/\r?\n/);
          // 첫 번째 청크는 헤더 포함이므로 1번째 줄부터, 나머지는 0번째 줄이 헤더이므로 1번째부터
          const startLine = 1; // 모든 청크에 헤더가 포함되어 있으므로 skip
          fullContent += chunkLines.slice(startLine).filter(l => l.trim()).join("\n") + "\n";
        }

        const rows = parseCsvContent(fullContent);
        chunkBuffer.delete(bufKey);

        if (rows.length === 0) {
          return { insertedRows: 0, chunkIndex: input.chunkIndex, totalChunks: input.totalChunks, fileName: input.fileName, done: true };
        }

        // 날짜 범위 삭제 후 전체 삽입 (원자적 교체)
        const minDate = buf.fileMinDate || rows.map(r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10)).reduce((a,b) => a<b?a:b);
        const maxDate = buf.fileMaxDate || rows.map(r => r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10)).reduce((a,b) => a>b?a:b);

        await deleteStatsByDateRange(minDate, maxDate);
        const inserted = await insertAdStatsBatch(rows);

        await insertUploadLog({
          fileName: input.fileName,
          dateMin: new Date(minDate),
          dateMax: new Date(maxDate),
          totalRows: inserted,
          status: "success",
        });

        // 업로드 완료 후 자동 인사이트 스냅샷 저장 (비동기, 실패해도 업로드 결과에 영향 없음)
        let autoSnapshotId: number | null = null;
        try {
          const raw = await getInsightRawData();
          if (raw) {
            const insights = analyzeInsights(raw);
            const periods = {
              all:   { label: raw.all.label,   dateFrom: raw.all.dateFrom,   dateTo: raw.all.dateTo,   totalRev: raw.all.totalRev,   totalImp: raw.all.totalImp,   avgDailyRev: raw.all.avgDailyRev,   avgDailyImp: raw.all.avgDailyImp,   days: raw.all.days },
              month: { label: raw.month.label, dateFrom: raw.month.dateFrom, dateTo: raw.month.dateTo, totalRev: raw.month.totalRev, totalImp: raw.month.totalImp, avgDailyRev: raw.month.avgDailyRev, avgDailyImp: raw.month.avgDailyImp, days: raw.month.days },
              week:  { label: raw.week.label,  dateFrom: raw.week.dateFrom,  dateTo: raw.week.dateTo,  totalRev: raw.week.totalRev,  totalImp: raw.week.totalImp,  avgDailyRev: raw.week.avgDailyRev,  avgDailyImp: raw.week.avgDailyImp,  days: raw.week.days },
            };
            const memo = `자동 저장 — ${input.fileName} 업로드 완료`;
            autoSnapshotId = await saveInsightSnapshot(raw.all.dateTo, periods, insights, memo);
          }
        } catch (e) {
          console.error("[Auto Snapshot] 저장 실패:", e);
        }

        return {
          insertedRows: inserted,
          chunkIndex: input.chunkIndex,
          totalChunks: input.totalChunks,
          fileName: input.fileName,
          done: true,
          autoSnapshotId,
        };
      }),

    // 업로드 이력 조회
    getUploadLogs: publicProcedure.query(async () => {
      return await getUploadLogs();
    }),

    // 인사이트 분석 (전체기간/최근 1개월/최근 1주 이상 탐지)
    getInsights: publicProcedure.query(async ({ ctx }) => {
      const raw = await getInsightRawData();
      if (!raw) return { insights: [], periods: null };
      // 익명화 모드에서는 앱 이름 매핑 제공
      const anonMode = ctx.isPublicMode || isAnonMode();
      const appLabelMap = anonMode
        ? { ocb: "A사", syrup: "B사", olock: "C사" }
        : undefined;
      const insights = analyzeInsights(raw, appLabelMap);
      return {
        insights,
        periods: {
          all:   { label: raw.all.label,   dateFrom: raw.all.dateFrom,   dateTo: raw.all.dateTo,   totalRev: raw.all.totalRev,   totalImp: raw.all.totalImp,   avgDailyRev: raw.all.avgDailyRev,   avgDailyImp: raw.all.avgDailyImp,   days: raw.all.days },
          month: { label: raw.month.label, dateFrom: raw.month.dateFrom, dateTo: raw.month.dateTo, totalRev: raw.month.totalRev, totalImp: raw.month.totalImp, avgDailyRev: raw.month.avgDailyRev, avgDailyImp: raw.month.avgDailyImp, days: raw.month.days },
          week:  { label: raw.week.label,  dateFrom: raw.week.dateFrom,  dateTo: raw.week.dateTo,  totalRev: raw.week.totalRev,  totalImp: raw.week.totalImp,  avgDailyRev: raw.week.avgDailyRev,  avgDailyImp: raw.week.avgDailyImp,  days: raw.week.days },
        },
      };
    }),

    // 인사이트 히스토리: 현재 스냅샷 저장
    saveInsightSnapshot: publicProcedure
      .input(z.object({ memo: z.string().optional() }))
      .mutation(async ({ input }) => {
        const raw = await getInsightRawData();
        if (!raw) throw new Error("No data available");
        const insights = analyzeInsights(raw);
        const periods = {
          all:   { label: raw.all.label,   dateFrom: raw.all.dateFrom,   dateTo: raw.all.dateTo,   totalRev: raw.all.totalRev,   totalImp: raw.all.totalImp,   avgDailyRev: raw.all.avgDailyRev,   avgDailyImp: raw.all.avgDailyImp,   days: raw.all.days },
          month: { label: raw.month.label, dateFrom: raw.month.dateFrom, dateTo: raw.month.dateTo, totalRev: raw.month.totalRev, totalImp: raw.month.totalImp, avgDailyRev: raw.month.avgDailyRev, avgDailyImp: raw.month.avgDailyImp, days: raw.month.days },
          week:  { label: raw.week.label,  dateFrom: raw.week.dateFrom,  dateTo: raw.week.dateTo,  totalRev: raw.week.totalRev,  totalImp: raw.week.totalImp,  avgDailyRev: raw.week.avgDailyRev,  avgDailyImp: raw.week.avgDailyImp,  days: raw.week.days },
        };
        const id = await saveInsightSnapshot(raw.all.dateTo, periods, insights, input.memo);
        return { id, dataAsOf: raw.all.dateTo };
      }),

    // 인사이트 히스토리: 목록 조회
    listInsightHistory: publicProcedure.query(async () => {
      return await listInsightHistory();
    }),

    // 인사이트 히스토리: 단건 조회
    getInsightSnapshot: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getInsightSnapshot(input.id);
      }),

    // 인사이트 히스토리: 두 스냅샷 비교
    compareInsightSnapshots: publicProcedure
      .input(z.object({ baseId: z.number(), targetId: z.number() }))
      .query(async ({ input }) => {
        const [base, target] = await Promise.all([
          getInsightSnapshot(input.baseId),
          getInsightSnapshot(input.targetId),
        ]);
        if (!base || !target) throw new Error("Snapshot not found");
        return compareSnapshots(base, target);
      }),

    // 익명화 모드 조회 (공개 URL 접근 시에는 항상 true 반환)
    getAnonMode: publicProcedure.query(({ ctx }) => {
      return { anonMode: ctx.isPublicMode || isAnonMode() };
    }),

    // 익명화 모드 토글 (서버 재시작 없이 런타임 환경변수 변경)
    setAnonMode: publicProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => {
        process.env.ANON_MODE = input.enabled ? "true" : "false";
        return { anonMode: input.enabled };
      }),
 // AI 자연어 분석
  askAI: publicProcedure
      .input(z.object({
        question: z.string().min(1).max(500),
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).default([]),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = await buildAiContext(); // 이제 string 직접 반환
        const answer = await callOpenAI(systemPrompt, input.history, input.question);
        return { answer };
      }), 
  }),
});

export type AppRouter = typeof appRouter;
