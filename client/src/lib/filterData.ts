/*
 * filterData.ts
 * DashboardData를 날짜 인덱스 범위로 슬라이싱하는 유틸리티
 * - 라인차트 series는 dates 배열 기준으로 슬라이스
 * - 바차트용 합계(total)는 슬라이스된 범위 내에서 재집계
 * - KPI도 슬라이스된 범위 기준으로 재계산
 */
import type { DashboardData } from "./dashboardTypes";

export function filterByDateRange(
  data: DashboardData,
  startIdx: number,
  endIdx: number
): DashboardData {
  // 범위가 전체와 동일하면 원본 반환 (최적화)
  if (startIdx === 0 && endIdx === data.sec1_line.dates.length - 1) {
    return data;
  }

  const slicedDates = data.sec1_line.dates.slice(startIdx, endIdx + 1);

  // ── 섹션1 라인 슬라이스 ──────────────────────────────
  const sec1_line: DashboardData["sec1_line"] = {
    dates: slicedDates,
    series: Object.fromEntries(
      Object.entries(data.sec1_line.series).map(([app, s]) => [
        app,
        {
          confirmed_revenue: s.confirmed_revenue.slice(startIdx, endIdx + 1),
          impressions: s.impressions.slice(startIdx, endIdx + 1),
        },
      ])
    ),
  };

  // 섹션1 합계 재계산
  const appList = data.sec1_total.apps;
  const sec1_total: DashboardData["sec1_total"] = {
    apps: appList,
    confirmed_revenue: appList.map((app) =>
      Math.round(
        (sec1_line.series[app]?.confirmed_revenue ?? []).reduce((a, b) => a + b, 0)
      )
    ),
    impressions: appList.map((app) =>
      Math.round(
        (sec1_line.series[app]?.impressions ?? []).reduce((a, b) => a + b, 0)
      )
    ),
  };

  // ── 섹션2 라인 슬라이스 ──────────────────────────────
  const sec2_line: DashboardData["sec2_line"] = {
    dates: slicedDates,
    series: Object.fromEntries(
      Object.entries(data.sec2_line.series).map(([adpf, s]) => [
        adpf,
        {
          confirmed_revenue: s.confirmed_revenue.slice(startIdx, endIdx + 1),
          impressions: s.impressions.slice(startIdx, endIdx + 1),
        },
      ])
    ),
  };

  // 섹션2 네트워크별 합계: 날짜별 데이터가 없으므로 원본 비율 유지 방식으로 재계산
  // (네트워크별 일별 데이터가 없으므로 ADPF 전체 비율로 안분)
  const adpfKeys = ["3rd Party", "PADNW"] as const;
  const sec2: DashboardData["sec2"] = { "3rd Party": data.sec2["3rd Party"], PADNW: data.sec2["PADNW"] };

  adpfKeys.forEach((adpf) => {
    const origTotal = data.sec2_line.series[adpf]?.confirmed_revenue.reduce((a, b) => a + b, 0) ?? 1;
    const filteredTotal = sec2_line.series[adpf]?.confirmed_revenue.reduce((a, b) => a + b, 0) ?? 0;
    const ratio = origTotal > 0 ? filteredTotal / origTotal : 0;

    sec2[adpf] = {
      networks: data.sec2[adpf].networks,
      confirmed_revenue: data.sec2[adpf].confirmed_revenue.map((v) => Math.round(v * ratio)),
      impressions: data.sec2[adpf].impressions.map((v) => Math.round(v * ratio)),
    };
  });

  // ── 섹션3 라인 슬라이스 ──────────────────────────────
  const sec3_line: DashboardData["sec3_line"] = {
    dates: slicedDates,
    series: Object.fromEntries(
      Object.entries(data.sec3_line.series).map(([app, s]) => [
        app,
        {
          confirmed_revenue: s.confirmed_revenue.slice(startIdx, endIdx + 1),
          impressions: s.impressions.slice(startIdx, endIdx + 1),
        },
      ])
    ),
  };

  // 섹션3 합계 재계산
  const newsAppList = data.sec3_total.apps;
  const sec3_total: DashboardData["sec3_total"] = {
    apps: newsAppList,
    confirmed_revenue: newsAppList.map((app) =>
      Math.round(
        (sec3_line.series[app]?.confirmed_revenue ?? []).reduce((a, b) => a + b, 0)
      )
    ),
    impressions: newsAppList.map((app) =>
      Math.round(
        (sec3_line.series[app]?.impressions ?? []).reduce((a, b) => a + b, 0)
      )
    ),
  };

  // Place1 비율 안분
  const newsOrigTotal =
    data.sec3_line.series[newsAppList[0]]
      ? data.sec3_line.series[newsAppList[0]].confirmed_revenue.reduce((a, b) => a + b, 0)
      : 1;
  const newsFilteredTotal =
    sec3_line.series[newsAppList[0]]
      ? sec3_line.series[newsAppList[0]].confirmed_revenue.reduce((a, b) => a + b, 0)
      : 0;
  const newsRatio = newsOrigTotal > 0 ? newsFilteredTotal / newsOrigTotal : 0;

  const sec3_place: DashboardData["sec3_place"] = {
    places: data.sec3_place.places,
    confirmed_revenue: data.sec3_place.confirmed_revenue.map((v) => Math.round(v * newsRatio)),
    impressions: data.sec3_place.impressions.map((v) => Math.round(v * newsRatio)),
  };

  // 섹션3 애드네트워크별 비율 안분
  const sec3_network: DashboardData["sec3_network"] = {
    networks: data.sec3_network.networks,
    confirmed_revenue: data.sec3_network.confirmed_revenue.map((v) => Math.round(v * newsRatio)),
    impressions: data.sec3_network.impressions.map((v) => Math.round(v * newsRatio)),
    cpm: data.sec3_network.impressions.map((imp, i) => {
      const filteredImp = Math.round(imp * newsRatio);
      const filteredRev = Math.round(data.sec3_network.confirmed_revenue[i] * newsRatio);
      return filteredImp > 0 ? (filteredRev / filteredImp) * 1000 : 0;
    }),
  };

  // 섹션3 앱별 애드네트워크 비율 안분
  const sec3_network_by_app: DashboardData["sec3_network_by_app"] = {};
  for (const app of Object.keys(data.sec3_network_by_app)) {
    const appNet = data.sec3_network_by_app[app];
    // 앱별 newsRatio: 해당 앱의 섹션3라인 필터링 비율 사용
    const appOrigTotal = data.sec3_line.series[app]
      ? data.sec3_line.series[app].confirmed_revenue.reduce((a, b) => a + b, 0)
      : 1;
    const appFilteredTotal = sec3_line.series[app]
      ? sec3_line.series[app].confirmed_revenue.reduce((a, b) => a + b, 0)
      : 0;
    const appRatio = appOrigTotal > 0 ? appFilteredTotal / appOrigTotal : 0;
    sec3_network_by_app[app] = {
      networks: appNet.networks,
      confirmed_revenue: appNet.confirmed_revenue.map((v) => Math.round(v * appRatio)),
      impressions: appNet.impressions.map((v) => Math.round(v * appRatio)),
      cpm: appNet.impressions.map((imp, i) => {
        const filteredImp = Math.round(imp * appRatio);
        const filteredRev = Math.round(appNet.confirmed_revenue[i] * appRatio);
        return filteredImp > 0 ? (filteredRev / filteredImp) * 1000 : 0;
      }),
    };
  }

  // ── KPI 재계산 ────────────────────────────────────────────────
  const totalRev = sec1_total.confirmed_revenue.reduce((a, b) => a + b, 0);
  const totalImp = sec1_total.impressions.reduce((a, b) => a + b, 0);
  // clicks는 비율 안분
  const clickRatio =
    data.kpi.total_impressions > 0 ? totalImp / data.kpi.total_impressions : 0;
  const totalClicks = Math.round(data.kpi.total_clicks * clickRatio);

  return {
    kpi: {
      ...data.kpi,
      total_confirmed_revenue: totalRev,
      total_impressions: totalImp,
      total_clicks: totalClicks,
      period: `${slicedDates[0]} ~ ${slicedDates[slicedDates.length - 1]}`,
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
