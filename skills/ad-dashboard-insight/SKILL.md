---
name: ad-dashboard-insight
description: 광고통계 대시보드의 인사이트 자동 분석 및 히스토리 스냅샷 기능 구현 스킬. 전체기간/최근1개월/최근1주 데이터를 비교하여 주목할 변화 Top5를 자동 도출하고, 스냅샷으로 저장·비교한다. "인사이트 분석 기능 만들어줘", "자동 이상 탐지", "매출 급등/급락 알림", "기간별 성과 비교 스냅샷" 등의 요청에 사용.
---

# Ad Dashboard Insight

광고 데이터에서 주목할 변화를 자동 탐지하고, 스냅샷으로 저장·비교하는 인사이트 기능 구현 스킬.

## 인사이트 타입 정의

```ts
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
  period: string;         // "전체기간" | "최근 1개월" | "최근 1주"
  title: string;
  summary: string;        // 1~2줄 요약
  detail: string;         // 수치 포함 상세 설명
  direction: "up" | "down" | "neutral";
  magnitude: number;      // 변화율 (%)
  metric: "revenue" | "impression" | "cpm" | "share";
  dateRange: string;
  chartData?: { label: string; value: number; color?: string }[];
}
```

## 분석 알고리즘 패턴

```ts
// 표준편차 기반 이상치 탐지
function stddev(arr: number[]): number {
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

// 분석 진입점
export function analyzeInsights(raw: InsightRawData): Insight[] {
  const candidates: Insight[] = [];
  // 1. 최근 1주 일별 매출 급등/급락 탐지 (이동평균 대비 2σ 초과)
  // 2. 앱별 점유율 변화 탐지 (최근1개월 vs 이전1개월)
  // 3. ADPF 점유율 변화 탐지
  // 4. CPM 변화 탐지
  // 5. 기간 대비 전체 매출 변화
  return candidates
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5); // Top 5 선택
}
```

## DB 스키마 - insight_history 테이블

```ts
export const insightHistory = mysqlTable("insight_history", {
  id: int("id").autoincrement().primaryKey(),
  dataAsOf: date("dataAsOf").notNull(),  // 스냅샷 기준 최신 날짜
  memo: varchar("memo", { length: 256 }),
  periods: json("periods").notNull(),    // 기간별 요약 JSON
  insights: json("insights").notNull(),  // Insight[] JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_insight_data_as_of").on(table.dataAsOf),
]);
```

## 스냅샷 저장 패턴

```ts
// server/insightHistoryDb.ts
export async function saveInsightSnapshot(params: {
  dataAsOf: string;
  memo?: string;
  periods: PeriodSummary[];
  insights: Insight[];
}): Promise<number> {
  const db = await getDb();
  const [result] = await db.insert(insightHistory).values({
    dataAsOf: params.dataAsOf as unknown as Date,
    memo: params.memo,
    periods: params.periods,
    insights: params.insights,
  });
  return result.insertId;
}

// CSV 업로드 완료 시 자동 스냅샷 저장
if (isLastChunk) {
  const raw = await getInsightRawData();
  const insights = analyzeInsights(raw);
  const snapshotId = await saveInsightSnapshot({
    dataAsOf: raw.allTime.dateMax,
    insights,
    periods: raw.periods,
  });
}
```

## 스냅샷 비교 패턴

```ts
export async function compareSnapshots(id1: number, id2: number) {
  const [s1, s2] = await Promise.all([getInsightSnapshot(id1), getInsightSnapshot(id2)]);
  // 두 스냅샷의 insights를 type별로 매핑하여 magnitude 변화 계산
  return { before: s1, after: s2, diff: computeDiff(s1.insights, s2.insights) };
}
```

## tRPC 프로시저 목록

| 프로시저 | 역할 |
|---|---|
| `dashboard.getInsights` | 현재 데이터 기반 실시간 인사이트 조회 |
| `dashboard.saveInsightSnapshot` | 수동 스냅샷 저장 |
| `dashboard.listInsightHistory` | 스냅샷 목록 조회 |
| `dashboard.getInsightSnapshot` | 특정 스냅샷 상세 조회 |
| `dashboard.compareSnapshots` | 두 스냅샷 비교 |

## Insights 페이지 UI 구조

```
/insights 페이지
├── 헤더 (← 대시보드 돌아가기, 새로고침)
├── 기간 요약 카드 (전체기간 / 최근1개월 / 최근1주)
├── 인사이트 카드 목록 (Top 5)
│   ├── 방향 아이콘 (↑↓ direction)
│   ├── 타입 배지 (rev_spike 등)
│   ├── 제목 + 요약
│   ├── 수치 상세
│   └── 미니 바차트 (chartData 있을 때)
└── 히스토리 탭
    ├── 스냅샷 목록 (날짜, 메모)
    └── 스냅샷 비교 뷰
```

## 인사이트 카드 색상 규칙

```ts
const directionColor = {
  up: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  down: "text-red-400 bg-red-500/10 border-red-500/20",
  neutral: "text-white/60 bg-white/5 border-white/10",
};
```

## 참고 파일

- `references/insight-types.md`: 각 InsightType별 탐지 알고리즘 상세 설명
