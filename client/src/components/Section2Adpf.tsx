/*
 * Section 2: ADPF > Adnetwork1 별 Confirmed Revenue & Impressions
 * Design: 3rd Party / PADNW 탭 + 네트워크별 수평 바차트 + 날짜별 ADPF 추이 라인차트
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
  ADPF_COLORS,
  DashboardData,
  formatDate,
  formatImpressions,
  formatRevenue,
} from "@/lib/dashboardTypes";

interface Props {
  data: DashboardData;
}

const NETWORK_COLORS = [
  "#2dd4bf", "#3b82f6", "#a855f7", "#f59e0b", "#10b981",
  "#ef4444", "#6366f1", "#ec4899", "#14b8a6", "#f97316",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1f2e] border border-white/10 rounded-lg p-3 shadow-xl text-xs">
        <p className="text-white/60 mb-2 font-medium">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-white/70">{entry.name}:</span>
            <span className="text-white font-semibold mono">
              {entry.dataKey === "revenue" || entry.name?.includes("Revenue")
                ? `₩${Number(entry.value).toLocaleString()}`
                : Number(entry.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Section2Adpf({ data }: Props) {
  const [activeAdpf, setActiveAdpf] = useState<"3rd Party" | "PADNW">("3rd Party");
  const [metric, setMetric] = useState<"revenue" | "impressions">("revenue");

  const { sec2, sec2_line } = data;
  const adpfData = sec2[activeAdpf];

  // 바차트 데이터
  const barData = adpfData.networks.map((net, i) => ({
    network: net,
    revenue: adpfData.confirmed_revenue[i],
    impressions: adpfData.impressions[i],
  }));

  // 날짜별 ADPF 추이 라인차트 데이터
  const lineData = sec2_line.dates.map((date, i) => ({
    date: formatDate(date),
    "3rd Party_rev": sec2_line.series["3rd Party"]?.confirmed_revenue[i] ?? 0,
    "PADNW_rev": sec2_line.series["PADNW"]?.confirmed_revenue[i] ?? 0,
    "3rd Party_imp": sec2_line.series["3rd Party"]?.impressions[i] ?? 0,
    "PADNW_imp": sec2_line.series["PADNW"]?.impressions[i] ?? 0,
  }));

  const adpfList = ["3rd Party", "PADNW"] as const;

  return (
    <div className="space-y-6">
      {/* ADPF 합계 카드 */}
      <div className="grid grid-cols-2 gap-4">
        {adpfList.map((adpf) => {
          const netData = sec2[adpf];
          const totalRev = netData.confirmed_revenue.reduce((a, b) => a + b, 0);
          const totalImp = netData.impressions.reduce((a, b) => a + b, 0);
          return (
            <div
              key={adpf}
              className="bg-[#1a1f2e] rounded-xl p-4 border border-white/5"
              style={{ borderLeft: `3px solid ${ADPF_COLORS[adpf]}` }}
            >
              <div className="text-xs text-white/50 uppercase tracking-widest mb-1">{adpf}</div>
              <div className="kpi-value text-xl text-white mb-1">₩{formatRevenue(totalRev)}</div>
              <div className="text-xs text-white/40">노출 {formatImpressions(totalImp)}</div>
            </div>
          );
        })}
      </div>

      {/* ADPF 일별 추이 라인차트 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/70">ADPF 일별 추이</h3>
          <div className="flex gap-2">
            {(["revenue", "impressions"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  metric === m
                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {m === "revenue" ? "Revenue" : "Impressions"}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) =>
                metric === "revenue" ? `₩${formatRevenue(v)}` : formatImpressions(v)
              }
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<CustomTooltip />} />
            {adpfList.map((adpf) => (
              <Line
                key={adpf}
                type="monotone"
                dataKey={`${adpf}_${metric === "revenue" ? "rev" : "imp"}`}
                name={adpf}
                stroke={ADPF_COLORS[adpf]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Adnetwork1 바차트 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/70">Adnetwork1별 성과</h3>
          <div className="flex gap-2">
            {adpfList.map((adpf) => (
              <button
                key={adpf}
                onClick={() => setActiveAdpf(adpf)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeAdpf === adpf
                    ? "text-white border border-white/20 bg-white/10"
                    : "text-white/40 hover:text-white/60"
                }`}
                style={
                  activeAdpf === adpf
                    ? { borderColor: ADPF_COLORS[adpf], color: ADPF_COLORS[adpf], background: `${ADPF_COLORS[adpf]}18` }
                    : {}
                }
              >
                {adpf}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Revenue 바차트 */}
          <div>
            <p className="text-xs text-white/40 mb-3">Confirmed Revenue</p>
            <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 32)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `₩${formatRevenue(v)}`}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="network"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={entry.network} fill={NETWORK_COLORS[index % NETWORK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Impressions 바차트 */}
          <div>
            <p className="text-xs text-white/40 mb-3">Impressions</p>
            <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 32)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatImpressions(v)}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="network"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="impressions" name="Impressions" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={entry.network} fill={NETWORK_COLORS[index % NETWORK_COLORS.length]} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
