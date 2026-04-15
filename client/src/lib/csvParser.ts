/*
 * CSV Parser Utility
 * - 브라우저에서 직접 CSV 파일을 파싱하여 DashboardData 형태로 변환
 * - Papa Parse 없이 순수 JS로 구현 (의존성 최소화)
 * - 대상 앱: ocb, syrup, olock
 * - Place1 뉴스 필터: '뉴스' 포함
 */

import type { DashboardData } from "./dashboardTypes";

interface RawRow {
  Date: string;
  App: string;
  ADPF: string;
  Adnetwork1: string;
  Place1: string;
  Impressions: number;
  Clicks: number;
  "Confirmed Revenue": number;
  "Estimated Revenue": number;
  Currency: string;
}

const TARGET_APPS = ["ocb", "syrup", "olock"];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSVToRows(csvText: string): RawRow[] {
  // BOM 제거
  const text = csvText.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < headers.length) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    rows.push({
      Date: obj["Date"] ?? "",
      App: (obj["App"] ?? "").toLowerCase(),
      ADPF: obj["ADPF"] ?? "",
      Adnetwork1: obj["Adnetwork1"] ?? "",
      Place1: obj["Place1"] ?? "",
      Impressions: parseFloat(obj["Impressions"]) || 0,
      Clicks: parseFloat(obj["Clicks"]) || 0,
      "Confirmed Revenue": parseFloat(obj["Confirmed Revenue"]) || 0,
      "Estimated Revenue": parseFloat(obj["Estimated Revenue"]) || 0,
      Currency: obj["Currency"] ?? "",
    });
  }
  return rows;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function sumField(rows: RawRow[], field: keyof RawRow): number {
  return rows.reduce((s, r) => s + (r[field] as number), 0);
}

export function buildDashboardData(rows: RawRow[]): DashboardData {
  // 대상 앱 필터
  const appRows = rows.filter((r) => TARGET_APPS.includes(r.App));

  // 날짜 목록 (정렬)
  const dates = Array.from(new Set(appRows.map((r) => r.Date))).sort();

  // ── 섹션1: 앱별 ──────────────────────────────────────
  const byAppDate = groupBy(appRows, (r) => `${r.Date}__${r.App}`);
  const sec1_line: DashboardData["sec1_line"] = {
    dates,
    series: Object.fromEntries(
      TARGET_APPS.map((app) => [
        app,
        {
          confirmed_revenue: dates.map((d) => {
            const key = `${d}__${app}`;
            return Math.round(sumField(byAppDate[key] ?? [], "Confirmed Revenue"));
          }),
          impressions: dates.map((d) => {
            const key = `${d}__${app}`;
            return Math.round(sumField(byAppDate[key] ?? [], "Impressions"));
          }),
        },
      ])
    ),
  };

  const byApp = groupBy(appRows, (r) => r.App);
  const appsSorted = TARGET_APPS.slice().sort(
    (a, b) => sumField(byApp[b] ?? [], "Confirmed Revenue") - sumField(byApp[a] ?? [], "Confirmed Revenue")
  );
  const sec1_total: DashboardData["sec1_total"] = {
    apps: appsSorted,
    confirmed_revenue: appsSorted.map((a) => Math.round(sumField(byApp[a] ?? [], "Confirmed Revenue"))),
    impressions: appsSorted.map((a) => Math.round(sumField(byApp[a] ?? [], "Impressions"))),
  };

  // ── 섹션2: ADPF > Adnetwork1 ────────────────────────
  const adpfList = ["3rd Party", "PADNW"] as const;

  const sec2: DashboardData["sec2"] = {
    "3rd Party": { networks: [], confirmed_revenue: [], impressions: [] },
    PADNW: { networks: [], confirmed_revenue: [], impressions: [] },
  };

  adpfList.forEach((adpf) => {
    const adpfRows = appRows.filter((r) => r.ADPF === adpf);
    const byNet = groupBy(adpfRows, (r) => r.Adnetwork1);
    const nets = Object.keys(byNet).sort(
      (a, b) => sumField(byNet[b], "Confirmed Revenue") - sumField(byNet[a], "Confirmed Revenue")
    );
    sec2[adpf] = {
      networks: nets,
      confirmed_revenue: nets.map((n) => Math.round(sumField(byNet[n], "Confirmed Revenue"))),
      impressions: nets.map((n) => Math.round(sumField(byNet[n], "Impressions"))),
    };
  });

  const byAdpfDate = groupBy(appRows, (r) => `${r.Date}__${r.ADPF}`);
  const sec2_line: DashboardData["sec2_line"] = {
    dates,
    series: Object.fromEntries(
      adpfList.map((adpf) => [
        adpf,
        {
          confirmed_revenue: dates.map((d) => {
            const key = `${d}__${adpf}`;
            return Math.round(sumField(byAdpfDate[key] ?? [], "Confirmed Revenue"));
          }),
          impressions: dates.map((d) => {
            const key = `${d}__${adpf}`;
            return Math.round(sumField(byAdpfDate[key] ?? [], "Impressions"));
          }),
        },
      ])
    ),
  };

  // ── 섹션3: Place1 뉴스 포함 ─────────────────────────
  const newsRows = appRows.filter((r) => r.Place1.includes("뉴스"));

  const byNewsAppDate = groupBy(newsRows, (r) => `${r.Date}__${r.App}`);
  const sec3_line: DashboardData["sec3_line"] = {
    dates,
    series: Object.fromEntries(
      TARGET_APPS.map((app) => [
        app,
        {
          confirmed_revenue: dates.map((d) => {
            const key = `${d}__${app}`;
            return Math.round(sumField(byNewsAppDate[key] ?? [], "Confirmed Revenue"));
          }),
          impressions: dates.map((d) => {
            const key = `${d}__${app}`;
            return Math.round(sumField(byNewsAppDate[key] ?? [], "Impressions"));
          }),
        },
      ])
    ),
  };

  const byNewsApp = groupBy(newsRows, (r) => r.App);
  const newsAppsSorted = TARGET_APPS.slice().sort(
    (a, b) => sumField(byNewsApp[b] ?? [], "Confirmed Revenue") - sumField(byNewsApp[a] ?? [], "Confirmed Revenue")
  );
  const sec3_total: DashboardData["sec3_total"] = {
    apps: newsAppsSorted,
    confirmed_revenue: newsAppsSorted.map((a) => Math.round(sumField(byNewsApp[a] ?? [], "Confirmed Revenue"))),
    impressions: newsAppsSorted.map((a) => Math.round(sumField(byNewsApp[a] ?? [], "Impressions"))),
  };

  // 뉴스 셀션 애드네트워크별 집계
  const byNetwork = groupBy(newsRows, (r) => r.Adnetwork1 ?? "");
  const networksSorted = Object.keys(byNetwork).sort(
    (a, b) => sumField(byNetwork[b], "Confirmed Revenue") - sumField(byNetwork[a], "Confirmed Revenue")
  );
  const sec3_network: DashboardData["sec3_network"] = {
    networks: networksSorted,
    confirmed_revenue: networksSorted.map((n) => Math.round(sumField(byNetwork[n], "Confirmed Revenue"))),
    impressions: networksSorted.map((n) => Math.round(sumField(byNetwork[n], "Impressions"))),
    cpm: networksSorted.map((n) => {
      const imp = sumField(byNetwork[n], "Impressions");
      const rev = sumField(byNetwork[n], "Confirmed Revenue");
      return imp > 0 ? (rev / imp) * 1000 : 0;
    }),
  };

  // 뉴스 셀션 앱별 애드네트워크 집계
  const sec3_network_by_app: DashboardData["sec3_network_by_app"] = {};
  for (const app of TARGET_APPS) {
    const appNewsRows = newsRows.filter((r) => r.App.toLowerCase() === app);
    const byAppNetwork = groupBy(appNewsRows, (r) => r.Adnetwork1 ?? "");
    const appNetworksSorted = Object.keys(byAppNetwork).sort(
      (a, b) => sumField(byAppNetwork[b], "Confirmed Revenue") - sumField(byAppNetwork[a], "Confirmed Revenue")
    );
    sec3_network_by_app[app] = {
      networks: appNetworksSorted,
      confirmed_revenue: appNetworksSorted.map((n) => Math.round(sumField(byAppNetwork[n], "Confirmed Revenue"))),
      impressions: appNetworksSorted.map((n) => Math.round(sumField(byAppNetwork[n], "Impressions"))),
      cpm: appNetworksSorted.map((n) => {
        const imp = sumField(byAppNetwork[n], "Impressions");
        const rev = sumField(byAppNetwork[n], "Confirmed Revenue");
        return imp > 0 ? (rev / imp) * 1000 : 0;
      }),
    };
  }

  const byPlace = groupBy(newsRows, (r) => r.Place1);
  const placesSorted = Object.keys(byPlace).sort(
    (a, b) => sumField(byPlace[b], "Confirmed Revenue") - sumField(byPlace[a], "Confirmed Revenue")
  );
  const sec3_place: DashboardData["sec3_place"] = {
    places: placesSorted,
    confirmed_revenue: placesSorted.map((p) => Math.round(sumField(byPlace[p], "Confirmed Revenue"))),
    impressions: placesSorted.map((p) => Math.round(sumField(byPlace[p], "Impressions"))),
  };

  // ── KPI ─────────────────────────────────────────────
  const totalRev = Math.round(sumField(appRows, "Confirmed Revenue"));
  const totalImp = Math.round(sumField(appRows, "Impressions"));
  const totalClicks = Math.round(sumField(appRows, "Clicks"));
  const period =
    dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "N/A";

  return {
    kpi: {
      total_confirmed_revenue: totalRev,
      total_impressions: totalImp,
      total_clicks: totalClicks,
      period,
      apps: TARGET_APPS,
    },
    sec1_line,
    sec1_total,
    sec2,
    sec2_line,
    sec3_line,
    sec3_total,
    sec3_place,
    sec3_network,
    sec3_network_by_app,
  };
}
