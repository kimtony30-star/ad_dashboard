/*
 * Section 3: Place1에 '뉴스' 포함 (OCB / Syrup / Olock)
 * - 앱별 탭으로 애드네트워크 분리 표시
 * - 매출 소수점 이하 제거
 * - 텍스트 색상 가시성 개선
 */
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  APP_COLORS,
  DashboardData,
  NetworkData,
  formatDate,
  formatImpressions,
  formatRevenue,
} from "@/lib/dashboardTypes";

interface Props {
  data: DashboardData;
}

const NET_COLORS = [
  "#2dd4bf", "#f59e0b", "#a855f7", "#3b82f6", "#10b981",
  "#f43f5e", "#fb923c", "#84cc16", "#06b6d4", "#8b5cf6",
];

const PLACE_COLORS = ["#2dd4bf", "#f59e0b", "#a855f7", "#3b82f6", "#10b981"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1420] border border-white/20 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-white/70 mb-2 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/60">{entry.name}:</span>
          <span className="text-white font-semibold">
            {entry.dataKey?.includes("rev") || entry.name?.includes("Revenue")
              ? `₩${Number(entry.value).toLocaleString()}`
              : Number(entry.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

const NetworkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1420] border border-white/20 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-white/70 mb-2 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/60">{entry.name}:</span>
          <span className="text-white font-semibold">
            {entry.name === "Revenue"
              ? `₩${Number(entry.value).toLocaleString()}`
              : entry.name === "CPM"
              ? `₩${Number(entry.value).toFixed(0)}`
              : Number(entry.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

// 애드네트워크 테이블 + 바차트 공통 컴포넌트
function NetworkTable({ netData, title }: { netData: NetworkData; title?: string }) {
  const totalRev = netData.confirmed_revenue.reduce((a, b) => a + b, 0);
  const totalImp = netData.impressions.reduce((a, b) => a + b, 0);
  const overallCpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;
  const barData = netData.networks.slice(0, 10).map((net, i) => ({
    network: net,
    revenue: netData.confirmed_revenue[i],
    impressions: netData.impressions[i],
    cpm: netData.cpm[i],
  }));

  return (
    <div className="space-y-4">
      {/* 테이블 */}
      <div className="bg-[#1a1f2e] rounded-xl border border-white/5 overflow-hidden">
        {title && (
          <div className="px-5 pt-4 pb-2 border-b border-white/5">
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest">{title}</h4>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-white/50 font-medium w-8">#</th>
                <th className="text-left px-3 py-3 text-white/50 font-medium">애드네트워크</th>
                <th className="text-right px-3 py-3 text-white/50 font-medium">Revenue</th>
                <th className="text-right px-3 py-3 text-white/50 font-medium">비율</th>
                <th className="text-right px-3 py-3 text-white/50 font-medium">Impressions</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium">CPM (₩)</th>
              </tr>
            </thead>
            <tbody>
              {netData.networks.map((net, i) => {
                const rev = netData.confirmed_revenue[i];
                const imp = netData.impressions[i];
                const cpm = netData.cpm[i];
                const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0;
                const color = NET_COLORS[i % NET_COLORS.length];
                return (
                  <tr key={net} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2.5 text-white/40">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-white font-medium">{net}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-white">
                      ₩{Math.floor(rev).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-white/60 w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-white/70">
                      {formatImpressions(imp)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span
                        className="font-semibold"
                        style={{
                          color: cpm > 1000 ? "#2dd4bf" : cpm > 500 ? "#f59e0b" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        ₩{cpm.toFixed(0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5">
                <td className="px-4 py-2.5" />
                <td className="px-3 py-2.5 text-white/60 font-medium">합계</td>
                <td className="px-3 py-2.5 text-right font-mono text-teal-400 font-semibold">
                  ₩{Math.floor(totalRev).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-white/40">100%</td>
                <td className="px-3 py-2.5 text-right font-mono text-white/60">
                  {formatImpressions(totalImp)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-white/50">
                  ₩{overallCpm.toFixed(0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 바차트 2열 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-white/5">
          <h4 className="text-xs font-semibold text-white/60 mb-3">Revenue (상위 10)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `₩${formatRevenue(v)}`}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="network"
                tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={85}
              />
              <Tooltip content={<NetworkTooltip />} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                {barData.map((_, index) => (
                  <Cell key={index} fill={NET_COLORS[index % NET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-white/5">
          <h4 className="text-xs font-semibold text-white/60 mb-3">CPM (상위 10)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `₩${Number(v).toFixed(0)}`}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="network"
                tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={85}
              />
              <Tooltip content={<NetworkTooltip />} />
              <Bar dataKey="cpm" name="CPM" radius={[0, 4, 4, 0]}>
                {barData.map((_, index) => (
                  <Cell key={index} fill={NET_COLORS[index % NET_COLORS.length]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function Section3News({ data }: Props) {
  const { sec3_line, sec3_total, sec3_place, sec3_network, sec3_network_by_app } = data;
  // 서버 응답에서 앱 이름 목록을 받아 사용 (익명화 모드 대응)
  const apps = sec3_total.apps;
  const [activeNetTab, setActiveNetTab] = useState<string>("all");

  // 원본 앱 키 목록 (서버 series 키는 항상 원본 소문자 키)
  const RAW_APP_KEYS = ["ocb", "syrup", "olock"];

  // 라인차트 데이터
  const lineData = sec3_line.dates.map((date, i) => {
    const row: Record<string, any> = { date: formatDate(date) };
    // series 키는 항상 원본 소문자 키 (ocb, syrup, olock)
    RAW_APP_KEYS.forEach((rawKey, idx) => {
      const displayApp = apps[idx] ?? rawKey;
      row[`${displayApp}_rev`] = sec3_line.series[rawKey]?.confirmed_revenue[i] ?? 0;
      row[`${displayApp}_imp`] = sec3_line.series[rawKey]?.impressions[i] ?? 0;
    });
    return row;
  });

  // Place1 바차트 데이터
  const placeBarData = sec3_place.places.map((place, i) => ({
    place,
    revenue: sec3_place.confirmed_revenue[i],
    impressions: sec3_place.impressions[i],
  }));

  // 앱 탭: 서버에서 받은 apps 배열 기반으로 동적 생성 (익명화 모드 대응)
  const netTabs = [
    { id: "all", label: "전체", color: "#ffffff" },
    ...apps.map((app) => ({ id: app, label: app, color: APP_COLORS[app] ?? "#6b7280" })),
  ];

  const activeNetData: NetworkData =
    activeNetTab === "all"
      ? sec3_network
      : sec3_network_by_app[activeNetTab] ?? { networks: [], confirmed_revenue: [], impressions: [], cpm: [] };

  return (
    <div className="space-y-6">
      {/* 뉴스 섹션 설명 배너 */}
      <div className="bg-gradient-to-r from-teal-500/10 to-transparent border border-teal-500/20 rounded-xl p-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
        <p className="text-sm text-white/70">
          <span className="text-teal-400 font-semibold">Place1 = '뉴스' 포함</span> 필터 적용 —
          오늘뉴스, 뉴스 카테고리의 광고 성과를 표시합니다.
        </p>
      </div>

      {/* 앱별 합계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {sec3_total.apps.map((app, i) => (
          <div
            key={app}
            className="bg-[#1a1f2e] rounded-xl p-4 border border-white/5"
            style={{ borderLeft: `3px solid ${APP_COLORS[app]}` }}
          >
            <div className="text-xs text-white/50 uppercase tracking-widest mb-1">{app}</div>
            <div className="kpi-value text-xl text-white mb-1">
              ₩{formatRevenue(sec3_total.confirmed_revenue[i])}
            </div>
            <div className="text-xs text-white/40">
              노출 {formatImpressions(sec3_total.impressions[i])}
            </div>
          </div>
        ))}
      </div>

      {/* ── 애드네트워크별 섹션 (앱 탭) ─────────────────────── */}
      <div className="space-y-3">
        {/* 탭 헤더 */}
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-white/70 mr-3">애드네트워크별 매출 · Imp · CPM</span>
          {netTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveNetTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeNetTab === tab.id
                  ? "text-white"
                  : "text-white/40 hover:text-white/70 bg-transparent"
              }`}
              style={
                activeNetTab === tab.id
                  ? { background: tab.id === "all" ? "rgba(255,255,255,0.15)" : `${tab.color}30`, color: tab.id === "all" ? "#fff" : tab.color, border: `1px solid ${tab.id === "all" ? "rgba(255,255,255,0.2)" : tab.color + "60"}` }
                  : { border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 선택된 탭의 네트워크 데이터 */}
        <NetworkTable
          netData={activeNetData}
          title={
            activeNetTab === "all"
              ? "전체 앱 합산"
              : `${activeNetTab} 앱 기준`
          }
        />
      </div>

      {/* 일별 매출 추이 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white/70 mb-4">
          뉴스 섹션 일별 Confirmed Revenue 추이
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `₩${formatRevenue(v)}`}
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<CustomTooltip />} />
            {apps.map((app) => (
              <Line
                key={app}
                type="monotone"
                dataKey={`${app}_rev`}
                name={app}
                stroke={APP_COLORS[app] ?? "#6b7280"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 일별 노출 추이 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white/70 mb-4">
          뉴스 섹션 일별 Impressions 추이
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatImpressions(v)}
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            {apps.map((app) => (
              <Line
                key={app}
                type="monotone"
                dataKey={`${app}_imp`}
                name={app}
                stroke={APP_COLORS[app] ?? "#6b7280"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Place1 종류별 바차트 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white/70 mb-4">
            Place1 종류별 Confirmed Revenue
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={placeBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `₩${formatRevenue(v)}`}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="place"
                tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                {placeBarData.map((_, index) => (
                  <Cell key={index} fill={PLACE_COLORS[index % PLACE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white/70 mb-4">
            Place1 종류별 Impressions
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={placeBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatImpressions(v)}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="place"
                tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="impressions" name="Impressions" radius={[0, 4, 4, 0]}>
                {placeBarData.map((_, index) => (
                  <Cell key={index} fill={PLACE_COLORS[index % PLACE_COLORS.length]} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
