---
name: ad-dashboard-sections
description: 광고통계 대시보드의 앱별/ADPF별/뉴스섹션 탭 차트 구현 스킬. 3개 탭(앱별 성과, ADPF·네트워크별, 뉴스 섹션)과 Recharts 라인/바 차트 구성 방법을 다룬다. "앱별 매출 차트 만들어줘", "ADPF 분석 탭 구현", "Place별 성과 차트", "네트워크별 비교 차트" 등의 요청에 사용.
---

# Ad Dashboard Sections

광고통계 대시보드의 3개 분석 탭 섹션 구현 스킬. 각 탭은 독립 컴포넌트로 분리되어 있으며, 공통 DashboardData 타입을 기반으로 Recharts 차트를 렌더링한다.

## 탭 구성

| 탭 ID | 컴포넌트 | 내용 |
|---|---|---|
| `apps` | `Section1Apps.tsx` | 앱별(OCB/Syrup/Olock) 일별 매출·노출 라인차트 + 앱별 바차트 |
| `adpf` | `Section2Adpf.tsx` | ADPF별(3rd Party/PADNW) 라인차트 + 애드네트워크 바차트 |
| `news` | `Section3News.tsx` | Place1별 매출·노출 바차트 + 뉴스 포함 Place 분석 |

## DashboardData 타입 구조

```ts
// client/src/lib/dashboardTypes.ts
interface DashboardData {
  kpi: { total_confirmed_revenue: number; total_impressions: number; period: string; };
  sec1_line: { dates: string[]; series: { app: string; rev: number[]; imp: number[]; }[]; };
  sec1_total: { apps: string[]; rev: number[]; imp: number[]; };
  sec2_line: { dates: string[]; series: { adpf: string; rev: number[]; imp: number[]; }[]; };
  sec2_network: { adpf: string; networks: { name: string; rev: number; imp: number; }[]; }[];
  sec3_line: { dates: string[]; series: { app: string; rev: number[]; imp: number[]; }[]; };
  sec3_place: { place1: string; rev: number; imp: number; cpm: number; }[];
  sec3_network: { name: string; rev: number; imp: number; share: number; cpm: number; }[];
  sec3_network_by_app: { app: string; networks: { name: string; rev: number; }[]; }[];
}
```

## 탭 전환 패턴

```tsx
const TABS = [
  { id: "apps", label: "앱별 성과", sub: "OCB · Syrup · Olock" },
  { id: "adpf", label: "ADPF · 네트워크별", sub: "3rd Party · PADNW" },
  { id: "news", label: "뉴스 섹션", sub: "Place1 = 뉴스 포함" },
];
const [activeTab, setActiveTab] = useState("apps");

// 탭 버튼 렌더링
{TABS.map((tab) => (
  <button
    key={tab.id}
    onClick={() => setActiveTab(tab.id)}
    className={`px-5 py-3 text-sm font-medium rounded-lg transition-all ${
      activeTab === tab.id
        ? "bg-teal-500/20 border border-teal-500/30 text-teal-300"
        : "text-white/40 hover:text-white/70 hover:bg-white/5"
    }`}
  >
    {tab.label}
    <span className="block text-xs text-white/30 mt-0.5">{tab.sub}</span>
  </button>
))}
```

## Recharts 라인차트 패턴

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// 데이터 변환: dates 배열 + series 배열 → [{date, ocb, syrup, olock}, ...]
const chartData = dates.map((date, i) => ({
  date,
  ...Object.fromEntries(series.map(s => [s.app, s.rev[i]]))
}));

<ResponsiveContainer width="100%" height={200}>
  <LineChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
    <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
           tickFormatter={(v) => formatRevenue(v)} />
    <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)" }} />
    {series.map(s => (
      <Line key={s.app} dataKey={s.app} stroke={APP_COLORS[s.app]}
            dot={false} strokeWidth={1.5} />
    ))}
  </LineChart>
</ResponsiveContainer>
```

## 앱 색상 맵

```ts
const APP_COLORS: Record<string, string> = {
  ocb: "#3b82f6",    // 파랑
  syrup: "#a855f7",  // 보라
  olock: "#10b981",  // 초록
  // 익명화 모드
  "A사": "#3b82f6",
  "B사": "#a855f7",
  "C사": "#10b981",
};
const ADPF_COLORS: Record<string, string> = {
  "3rd Party": "#2dd4bf",
  "PADNW": "#f59e0b",
};
```

## 수치 포맷 헬퍼

```ts
export function formatRevenue(v: number): string {
  if (v >= 1e9) return `₩${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₩${Math.floor(v / 1e6)}M`;
  if (v >= 1e3) return `₩${Math.floor(v / 1e3)}K`;
  return `₩${Math.floor(v).toLocaleString()}`;
}
export function formatImpressions(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
```

## Section2 내부 탭 패턴 (ADPF 선택)

```tsx
const [activeAdpf, setActiveAdpf] = useState<"3rd Party" | "PADNW">("3rd Party");
const [metric, setMetric] = useState<"revenue" | "impressions">("revenue");
// activeAdpf에 해당하는 네트워크 데이터만 필터링하여 바차트 렌더링
```

## Section3 Place 바차트 패턴

```tsx
// place1별 매출 수평 바차트
const placeData = sec3_place
  .sort((a, b) => b.rev - a.rev)
  .slice(0, 15); // 상위 15개만 표시

<BarChart layout="vertical" data={placeData}>
  <XAxis type="number" tickFormatter={formatRevenue} />
  <YAxis type="category" dataKey="place1" width={120} />
  <Bar dataKey="rev" fill="#2dd4bf" />
</BarChart>
```

## 서버 집계 쿼리 패턴

```ts
// server/dashboardDb.ts
export async function getSec1LineData() {
  return db.select({
    date: adStats.date,
    app: adStats.app,
    confirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
    impressions: sql<number>`SUM(${adStats.impressions})`,
  }).from(adStats)
    .where(inArray(adStats.app, TARGET_APPS))
    .groupBy(adStats.date, adStats.app)
    .orderBy(adStats.date);
}
```
