/**
 * insightAnalyzer.ts
 * 인사이트 자동 탐지 로직
 * 전체기간·최근 1개월·최근 1주 데이터를 받아 특이 변화 3가지를 선정
 */
import { InsightRawData, PeriodSummary } from "./insightDb";

export type InsightType =
  | "rev_spike"       // 매출 급등
  | "rev_drop"        // 매출 급락
  | "imp_spike"       // 노출 급등
  | "imp_drop"        // 노출 급락
  | "app_shift"       // 앱별 점유율 변화
  | "adpf_shift"      // ADPF 점유율 변화
  | "cpm_change"      // CPM 변화
  | "period_compare"; // 기간 대비 변화

export interface Insight {
  id: string;
  type: InsightType;
  period: string;        // "전체기간" | "최근 1개월" | "최근 1주"
  title: string;
  summary: string;       // 1~2줄 요약
  detail: string;        // 수치 포함 상세 설명
  direction: "up" | "down" | "neutral";
  magnitude: number;     // 변화율 (%)
  metric: "revenue" | "impression" | "cpm" | "share";
  dateRange: string;
  chartData?: { label: string; value: number; color?: string }[];
}

// 표준편차 계산
function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// 이동평균 (window 크기)
function movingAvg(arr: number[], window: number): number[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

// 포맷 헬퍼
function fmtRev(v: number): string {
  if (v >= 1e9) return `₩${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₩${Math.floor(v / 1e6)}M`;
  if (v >= 1e3) return `₩${Math.floor(v / 1e3)}K`;
  return `₩${Math.floor(v).toLocaleString()}`;
}
function fmtImp(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

const APP_COLORS: Record<string, string> = {
  ocb: "#3b82f6",
  syrup: "#a855f7",
  olock: "#10b981",
  // 익명화 모드
  "A사": "#3b82f6",
  "B사": "#a855f7",
  "C사": "#10b981",
};
const ADPF_COLORS: Record<string, string> = {
  "3rd Party": "#2dd4bf",
  PADNW: "#f59e0b",
};

// ── 분석 함수들 ───────────────────────────────────────────

/** 1. 기간 대비 일평균 매출 변화 (전체 vs 최근 1개월, 최근 1개월 vs 최근 1주) */
function analyzePeriodRevChange(data: InsightRawData): Insight[] {
  const insights: Insight[] = [];

  // 최근 1주 vs 최근 1개월 일평균 비교
  const weekAvg = data.week.avgDailyRev;
  const monthAvg = data.month.avgDailyRev;
  if (monthAvg > 0) {
    const changePct = ((weekAvg - monthAvg) / monthAvg) * 100;
    if (Math.abs(changePct) >= 3) {
      insights.push({
        id: "period_rev_week_vs_month",
        type: "period_compare",
        period: "최근 1주",
        title: `최근 1주 일평균 매출 ${changePct > 0 ? "상승" : "하락"}`,
        summary: `최근 1주 일평균 매출이 최근 1개월 대비 ${pct(changePct)}`,
        detail: `최근 1주 일평균 ${fmtRev(weekAvg)} vs 최근 1개월 일평균 ${fmtRev(monthAvg)}. ${
          changePct > 0
            ? "단기 매출 모멘텀이 강화되고 있습니다."
            : "단기 매출이 중기 평균을 하회하고 있어 주의가 필요합니다."
        }`,
        direction: changePct > 0 ? "up" : "down",
        magnitude: Math.abs(changePct),
        metric: "revenue",
        dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
        chartData: [
          { label: "전체기간 일평균", value: Math.round(data.all.avgDailyRev), color: "#6b7280" },
          { label: "최근 1개월 일평균", value: Math.round(monthAvg), color: "#f59e0b" },
          { label: "최근 1주 일평균", value: Math.round(weekAvg), color: "#2dd4bf" },
        ],
      });
    }
  }

  // 최근 1개월 vs 전체기간 일평균 비교
  const allAvg = data.all.avgDailyRev;
  if (allAvg > 0) {
    const changePct = ((monthAvg - allAvg) / allAvg) * 100;
    if (Math.abs(changePct) >= 3) {
      insights.push({
        id: "period_rev_month_vs_all",
        type: "period_compare",
        period: "최근 1개월",
        title: `최근 1개월 일평균 매출 ${changePct > 0 ? "상승" : "하락"}`,
        summary: `최근 1개월 일평균 매출이 전체기간 대비 ${pct(changePct)}`,
        detail: `최근 1개월 일평균 ${fmtRev(monthAvg)} vs 전체기간 일평균 ${fmtRev(allAvg)}. ${
          changePct > 0
            ? "최근 1개월의 매출 수준이 전체 평균을 웃돌고 있습니다."
            : "최근 1개월 매출이 전체 평균을 밑돌고 있습니다."
        }`,
        direction: changePct > 0 ? "up" : "down",
        magnitude: Math.abs(changePct),
        metric: "revenue",
        dateRange: `${data.month.dateFrom} ~ ${data.month.dateTo}`,
        chartData: [
          { label: "전체기간 일평균", value: Math.round(allAvg), color: "#6b7280" },
          { label: "최근 1개월 일평균", value: Math.round(monthAvg), color: "#f59e0b" },
          { label: "최근 1주 일평균", value: Math.round(weekAvg), color: "#2dd4bf" },
        ],
      });
    }
  }

  return insights;
}

/** 2. 최근 1주 내 일별 매출 급등/급락 탐지 (Z-score 기반) */
function analyzeWeeklySpike(data: InsightRawData): Insight[] {
  const insights: Insight[] = [];
  const daily = data.week.daily;
  if (daily.length < 3) return insights;

  const revs = daily.map((d) => d.rev);
  const imps = daily.map((d) => d.imp);
  const revMean = revs.reduce((a, b) => a + b, 0) / revs.length;
  const impMean = imps.reduce((a, b) => a + b, 0) / imps.length;
  const revStd = stddev(revs);
  const impStd = stddev(imps);

  // 매출 최고/최저일
  const maxRevIdx = revs.indexOf(Math.max(...revs));
  const minRevIdx = revs.indexOf(Math.min(...revs));
  const maxRevZ = revStd > 0 ? (revs[maxRevIdx] - revMean) / revStd : 0;
  const minRevZ = revStd > 0 ? (revs[minRevIdx] - revMean) / revStd : 0;

  if (maxRevZ > 0.8) {
    const changePct = ((revs[maxRevIdx] - revMean) / revMean) * 100;
    insights.push({
      id: "week_rev_spike",
      type: "rev_spike",
      period: "최근 1주",
      title: `${daily[maxRevIdx].date} 매출 급등`,
      summary: `최근 1주 평균 대비 ${pct(changePct)} 급등한 날 발생`,
      detail: `${daily[maxRevIdx].date}의 매출 ${fmtRev(revs[maxRevIdx])}은 최근 1주 일평균 ${fmtRev(revMean)} 대비 ${pct(changePct)} 높습니다. 특정 캠페인 집행 또는 트래픽 이벤트 여부를 확인하세요.`,
      direction: "up",
      magnitude: Math.abs(changePct),
      metric: "revenue",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: daily.map((d, i) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.rev),
        color: i === maxRevIdx ? "#2dd4bf" : "#3b82f6",
      })),
    });
  }

  if (minRevZ < -0.8) {
    const changePct = ((revs[minRevIdx] - revMean) / revMean) * 100;
    insights.push({
      id: "week_rev_drop",
      type: "rev_drop",
      period: "최근 1주",
      title: `${daily[minRevIdx].date} 매출 급락`,
      summary: `최근 1주 평균 대비 ${pct(changePct)} 하락한 날 발생`,
      detail: `${daily[minRevIdx].date}의 매출 ${fmtRev(revs[minRevIdx])}은 최근 1주 일평균 ${fmtRev(revMean)} 대비 ${pct(changePct)}입니다. 광고 소진 또는 Fill Rate 저하 여부를 점검하세요.`,
      direction: "down",
      magnitude: Math.abs(changePct),
      metric: "revenue",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: daily.map((d, i) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.rev),
        color: i === minRevIdx ? "#f43f5e" : "#3b82f6",
      })),
    });
  }

  // 노출 최고/최저일
  const maxImpIdx = imps.indexOf(Math.max(...imps));
  const minImpIdx = imps.indexOf(Math.min(...imps));
  const maxImpZ = impStd > 0 ? (imps[maxImpIdx] - impMean) / impStd : 0;
  const minImpZ = impStd > 0 ? (imps[minImpIdx] - impMean) / impStd : 0;

  if (maxImpZ > 0.8) {
    const changePct = ((imps[maxImpIdx] - impMean) / impMean) * 100;
    insights.push({
      id: "week_imp_spike",
      type: "imp_spike",
      period: "최근 1주",
      title: `${daily[maxImpIdx].date} 노출 급등`,
      summary: `최근 1주 평균 대비 ${pct(changePct)} 급등`,
      detail: `${daily[maxImpIdx].date}의 노출 ${fmtImp(imps[maxImpIdx])}은 최근 1주 일평균 ${fmtImp(impMean)} 대비 ${pct(changePct)} 높습니다.`,
      direction: "up",
      magnitude: Math.abs(changePct),
      metric: "impression",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: daily.map((d, i) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.imp),
        color: i === maxImpIdx ? "#2dd4bf" : "#a855f7",
      })),
    });
  }

  if (minImpZ < -0.8) {
    const changePct = ((imps[minImpIdx] - impMean) / impMean) * 100;
    insights.push({
      id: "week_imp_drop",
      type: "imp_drop",
      period: "최근 1주",
      title: `${daily[minImpIdx].date} 노출 급락`,
      summary: `최근 1주 평균 대비 ${pct(changePct)} 하락`,
      detail: `${daily[minImpIdx].date}의 노출 ${fmtImp(imps[minImpIdx])}은 최근 1주 일평균 ${fmtImp(impMean)} 대비 ${pct(changePct)}입니다.`,
      direction: "down",
      magnitude: Math.abs(changePct),
      metric: "impression",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: daily.map((d, i) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.imp),
        color: i === minImpIdx ? "#f43f5e" : "#a855f7",
      })),
    });
  }

  return insights;
}

/** 3. 앱별 점유율 변화 (최근 1주 vs 최근 1개월) */
function analyzeAppShare(data: InsightRawData, appLabelMap?: Record<string, string>): Insight[] {
  const insights: Insight[] = [];

  const monthTotal = data.monthByApp.reduce((s, r) => s + r.rev, 0);
  const weekTotal  = data.weekByApp.reduce((s, r) => s + r.rev, 0);
  if (monthTotal === 0 || weekTotal === 0) return insights;

  const monthShare: Record<string, number> = {};
  const weekShare: Record<string, number> = {};
  data.monthByApp.forEach((r) => { monthShare[r.app] = (r.rev / monthTotal) * 100; });
  data.weekByApp.forEach((r)  => { weekShare[r.app]  = (r.rev / weekTotal)  * 100; });

  // 가장 큰 점유율 변화 앱 찾기
  let maxDelta = 0;
  let maxApp = "";
  for (const app of ["ocb", "syrup", "olock"]) {
    const delta = Math.abs((weekShare[app] ?? 0) - (monthShare[app] ?? 0));
    if (delta > maxDelta) { maxDelta = delta; maxApp = app; }
  }

  if (maxDelta >= 3 && maxApp) {
    const wShare = weekShare[maxApp] ?? 0;
    const mShare = monthShare[maxApp] ?? 0;
    const dir = wShare > mShare ? "up" : "down";
    // 익명화 모드에서는 앱 이름을 매핑된 이름으로 표시
    const displayApp = appLabelMap?.[maxApp] ?? maxApp.toUpperCase();
    insights.push({
      id: `app_share_${maxApp}`,
      type: "app_shift",
      period: "최근 1주",
      title: `${displayApp} 앱 매출 비중 ${dir === "up" ? "증가" : "감소"}`,
      summary: `최근 1주 ${displayApp} 비중 ${wShare.toFixed(1)}% (1개월 대비 ${pct(wShare - mShare)})`,
      detail: `${displayApp}의 매출 비중이 최근 1개월 ${mShare.toFixed(1)}%에서 최근 1주 ${wShare.toFixed(1)}%로 ${Math.abs(wShare - mShare).toFixed(1)}%p 변화했습니다.`,
      direction: dir,
      magnitude: maxDelta,
      metric: "share",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: ["ocb", "syrup", "olock"].map((app) => ({
        label: appLabelMap?.[app] ?? app.toUpperCase(),
        value: Math.round(weekShare[app] ?? 0),
        color: APP_COLORS[appLabelMap?.[app] ?? app] ?? APP_COLORS[app],
      })),
    });
  }

  return insights;
}

/** 4. ADPF 점유율 변화 (최근 1주 vs 최근 1개월) */
function analyzeAdpfShare(data: InsightRawData): Insight[] {
  const insights: Insight[] = [];

  const monthTotal = data.monthByAdpf.reduce((s, r) => s + r.rev, 0);
  const weekTotal  = data.weekByAdpf.reduce((s, r) => s + r.rev, 0);
  if (monthTotal === 0 || weekTotal === 0) return insights;

  const monthShare: Record<string, number> = {};
  const weekShare: Record<string, number> = {};
  data.monthByAdpf.forEach((r) => { monthShare[r.adpf] = (r.rev / monthTotal) * 100; });
  data.weekByAdpf.forEach((r)  => { weekShare[r.adpf]  = (r.rev / weekTotal)  * 100; });

  const adpfSet = new Set([...data.monthByAdpf.map((r) => r.adpf), ...data.weekByAdpf.map((r) => r.adpf)]);
  const adpfs = Array.from(adpfSet);
  let maxDelta = 0;
  let maxAdpf = "";
  for (const adpf of adpfs) {
    const delta = Math.abs((weekShare[adpf] ?? 0) - (monthShare[adpf] ?? 0));
    if (delta > maxDelta) { maxDelta = delta; maxAdpf = adpf; }
  }

  if (maxDelta >= 2 && maxAdpf) {
    const wShare = weekShare[maxAdpf] ?? 0;
    const mShare = monthShare[maxAdpf] ?? 0;
    const dir = wShare > mShare ? "up" : "down";
    insights.push({
      id: `adpf_share_${maxAdpf}`,
      type: "adpf_shift",
      period: "최근 1주",
      title: `${maxAdpf} 매출 비중 ${dir === "up" ? "증가" : "감소"}`,
      summary: `최근 1주 ${maxAdpf} 비중 ${wShare.toFixed(1)}% (1개월 대비 ${pct(wShare - mShare)})`,
      detail: `${maxAdpf}의 매출 비중이 최근 1개월 ${mShare.toFixed(1)}%에서 최근 1주 ${wShare.toFixed(1)}%로 변화했습니다. ${
        dir === "up" ? "자사 네트워크 또는 3rd Party 비중 확대를 확인하세요." : "해당 ADPF의 Fill Rate 또는 단가 변화를 점검하세요."
      }`,
      direction: dir,
      magnitude: maxDelta,
      metric: "share",
      dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
      chartData: adpfs.map((adpf) => ({
        label: adpf,
        value: Math.round(weekShare[adpf] ?? 0),
        color: ADPF_COLORS[adpf] ?? "#6b7280",
      })),
    });
  }

  return insights;
}

/** 5. CPM 변화 (최근 1주 vs 최근 1개월) */
function analyzeCpmChange(data: InsightRawData): Insight[] {
  const insights: Insight[] = [];

  const monthCpm = data.month.totalImp > 0 ? (data.month.totalRev / data.month.totalImp) * 1000 : 0;
  const weekCpm  = data.week.totalImp  > 0 ? (data.week.totalRev  / data.week.totalImp)  * 1000 : 0;

  if (monthCpm > 0) {
    const changePct = ((weekCpm - monthCpm) / monthCpm) * 100;
    if (Math.abs(changePct) >= 5) {
      insights.push({
        id: "cpm_week_vs_month",
        type: "cpm_change",
        period: "최근 1주",
        title: `CPM ${changePct > 0 ? "상승" : "하락"} (최근 1주)`,
        summary: `최근 1주 CPM ₩${weekCpm.toFixed(0)} (1개월 대비 ${pct(changePct)})`,
        detail: `최근 1주 전체 CPM ₩${weekCpm.toFixed(0)}이 최근 1개월 CPM ₩${monthCpm.toFixed(0)} 대비 ${pct(changePct)} ${changePct > 0 ? "상승했습니다. 광고 단가 개선 또는 고단가 캠페인 증가를 의미합니다." : "하락했습니다. 저단가 캠페인 비중 증가 또는 Fill Rate 저하를 점검하세요."}`,
        direction: changePct > 0 ? "up" : "down",
        magnitude: Math.abs(changePct),
        metric: "cpm",
        dateRange: `${data.week.dateFrom} ~ ${data.week.dateTo}`,
        chartData: [
          { label: "전체기간 CPM", value: Math.round(data.all.totalImp > 0 ? (data.all.totalRev / data.all.totalImp) * 1000 : 0), color: "#6b7280" },
          { label: "최근 1개월 CPM", value: Math.round(monthCpm), color: "#f59e0b" },
          { label: "최근 1주 CPM", value: Math.round(weekCpm), color: "#2dd4bf" },
        ],
      });
    }
  }

  return insights;
}

/** 6. 전체기간 내 최고/최저 매출일 탐지 */
function analyzeAllTimePeaks(data: InsightRawData): Insight[] {
  const insights: Insight[] = [];
  const daily = data.all.daily;
  if (daily.length < 7) return insights;

  const revs = daily.map((d) => d.rev);
  const maxRev = Math.max(...revs);
  const minRev = Math.min(...revs);
  const maxIdx = revs.indexOf(maxRev);
  const minIdx = revs.indexOf(minRev);
  const avgRev = data.all.avgDailyRev;

  const maxPct = ((maxRev - avgRev) / avgRev) * 100;
  const minPct = ((minRev - avgRev) / avgRev) * 100;

  if (maxPct >= 30) {
    insights.push({
      id: "alltime_rev_peak",
      type: "rev_spike",
      period: "전체기간",
      title: `전체기간 최고 매출일: ${daily[maxIdx].date}`,
      summary: `전체 평균 대비 ${pct(maxPct)} 급등`,
      detail: `${daily[maxIdx].date}의 매출 ${fmtRev(maxRev)}은 전체기간 일평균 ${fmtRev(avgRev)} 대비 ${pct(maxPct)} 높습니다. 해당일의 캠페인 집행 내역을 참고하세요.`,
      direction: "up",
      magnitude: maxPct,
      metric: "revenue",
      dateRange: `${data.all.dateFrom} ~ ${data.all.dateTo}`,
      chartData: daily.slice(-30).map((d) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.rev),
        color: d.date === daily[maxIdx].date ? "#2dd4bf" : "#3b82f6",
      })),
    });
  }

  if (minPct <= -30) {
    insights.push({
      id: "alltime_rev_trough",
      type: "rev_drop",
      period: "전체기간",
      title: `전체기간 최저 매출일: ${daily[minIdx].date}`,
      summary: `전체 평균 대비 ${pct(minPct)} 급락`,
      detail: `${daily[minIdx].date}의 매출 ${fmtRev(minRev)}은 전체기간 일평균 ${fmtRev(avgRev)} 대비 ${pct(minPct)}입니다. 해당일 광고 소진 또는 시스템 이슈를 점검하세요.`,
      direction: "down",
      magnitude: Math.abs(minPct),
      metric: "revenue",
      dateRange: `${data.all.dateFrom} ~ ${data.all.dateTo}`,
      chartData: daily.slice(-30).map((d) => ({
        label: d.date.slice(5).replace("-", "/"),
        value: Math.round(d.rev),
        color: d.date === daily[minIdx].date ? "#f43f5e" : "#3b82f6",
      })),
    });
  }

  return insights;
}

// ── 메인 분석 함수 ────────────────────────────────────────

/**
 * @param data - 인사이트 원시 데이터
 * @param appLabelMap - 익명화 모드에서 앱 이름 매핑 (예: { ocb: "A사", syrup: "B사", olock: "C사" })
 */
export function analyzeInsights(data: InsightRawData, appLabelMap?: Record<string, string>): Insight[] {
  const candidates: Insight[] = [
    ...analyzePeriodRevChange(data),
    ...analyzeWeeklySpike(data),
    ...analyzeAppShare(data, appLabelMap),
    ...analyzeAdpfShare(data),
    ...analyzeCpmChange(data),
    ...analyzeAllTimePeaks(data),
  ];

  // magnitude 내림차순 정렬 후 상위 3개 선정
  // 단, 같은 type이 중복되지 않도록 다양성 보장
  const selected: Insight[] = [];
  const usedTypes = new Set<string>();

  // 1순위: magnitude 높은 순
  const sorted = [...candidates].sort((a, b) => b.magnitude - a.magnitude);

  for (const insight of sorted) {
    if (selected.length >= 5) break;
    // 같은 type이 이미 있으면 skip (다양성)
    if (usedTypes.has(insight.type)) continue;
    selected.push(insight);
    usedTypes.add(insight.type);
  }

  // 5개 미만이면 중복 type도 허용하여 채우기
  if (selected.length < 5) {
    for (const insight of sorted) {
      if (selected.length >= 5) break;
      if (selected.find((s) => s.id === insight.id)) continue;
      selected.push(insight);
    }
  }

  return selected;
}
