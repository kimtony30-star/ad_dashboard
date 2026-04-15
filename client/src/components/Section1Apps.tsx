/*
 * Section 1: OCB / Syrup / Olock 앱별 Confirmed Revenue & Impressions
 * Design: Dark card, dual-axis line chart (trend) + horizontal bar chart (total)
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  formatDate,
  formatImpressions,
  formatRevenue,
} from "@/lib/dashboardTypes";

interface Props {
  data: DashboardData;
}

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
              {entry.dataKey.includes("revenue")
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

export default function Section1Apps({ data }: Props) {
  const { sec1_line, sec1_total } = data;
  // 서버 응답에서 앱 이름 목록을 받아 사용 (익명화 모드 대응)
  const apps = sec1_total.apps;

  // 라인차트용 데이터 변환
  const lineData = sec1_line.dates.map((date, i) => {
    const row: Record<string, any> = { date: formatDate(date) };
    apps.forEach((app) => {
      row[`${app}_rev`] = sec1_line.series[app]?.confirmed_revenue[i] ?? 0;
      row[`${app}_imp`] = sec1_line.series[app]?.impressions[i] ?? 0;
    });
    return row;
  });

  // 바차트용 데이터 변환
  const barData = sec1_total.apps.map((app, i) => ({
    app: app, // 익명화 모드에서는 이미 "A사" 등으로 서버에서 오므로 toUpperCase 제거
    revenue: sec1_total.confirmed_revenue[i],
    impressions: sec1_total.impressions[i],
  }));

  return (
    <div className="space-y-6">
      {/* 앱별 합계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {sec1_total.apps.map((app, i) => (
          <div
            key={app}
            className="bg-[#1a1f2e] rounded-xl p-4 border border-white/5"
            style={{ borderLeft: `3px solid ${APP_COLORS[app]}` }}
          >
            <div className="text-xs text-white/50 tracking-widest mb-1 uppercase">{app}</div>
            <div className="kpi-value text-xl text-white mb-1">
              ₩{formatRevenue(sec1_total.confirmed_revenue[i])}
            </div>
            <div className="text-xs text-white/40">
              노출 {formatImpressions(sec1_total.impressions[i])}
            </div>
          </div>
        ))}
      </div>

      {/* 일별 매출 추이 라인차트 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white/70 mb-4">
          일별 Confirmed Revenue 추이
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `₩${formatRevenue(v)}`}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {value.replace("_rev", "").toUpperCase()}
                </span>
              )}
            />
            {apps.map((app) => (
              <Line
                key={app}
                type="monotone"
                dataKey={`${app}_rev`}
                name={`${app}_rev`}
                stroke={APP_COLORS[app]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 일별 노출 추이 라인차트 */}
      <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white/70 mb-4">
          일별 Impressions 추이
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatImpressions(v)}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {value.replace("_imp", "").toUpperCase()}
                </span>
              )}
            />
            {apps.map((app) => (
              <Line
                key={app}
                type="monotone"
                dataKey={`${app}_imp`}
                name={`${app}_imp`}
                stroke={APP_COLORS[app]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 앱별 합계 바차트 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white/70 mb-4">앱별 총 Confirmed Revenue</h3>
          <ResponsiveContainer width="100%" height={180}>
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
                dataKey="app"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.app}
                    fill={APP_COLORS[entry.app] ?? APP_COLORS[entry.app.toLowerCase()] ?? "#2dd4bf"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white/70 mb-4">앱별 총 Impressions</h3>
          <ResponsiveContainer width="100%" height={180}>
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
                dataKey="app"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="impressions" name="Impressions" radius={[0, 4, 4, 0]}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.app}
                    fill={APP_COLORS[entry.app] ?? APP_COLORS[entry.app.toLowerCase()] ?? "#f59e0b"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
