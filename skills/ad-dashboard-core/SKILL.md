---
name: ad-dashboard-core
description: 광고통계 대시보드의 핵심 골격 구축 스킬. CSV 업로드 → DB 저장 → KPI 집계 → 날짜 범위 슬라이더까지의 파이프라인을 다룬다. "광고 대시보드 만들어줘", "CSV 업로드 기능 구현", "광고 KPI 대시보드", "ad_stats 테이블 설계" 등의 요청에 사용.
---

# Ad Dashboard Core

광고통계 대시보드의 기본 골격을 구축하는 스킬. CSV 파일을 업로드하여 DB에 저장하고, KPI 카드와 일별 추이 차트를 렌더링하는 전체 파이프라인을 다룬다.

## 기술 스택

- **Backend**: tRPC + Drizzle ORM + MySQL(TiDB)
- **Frontend**: React 19 + Recharts + Tailwind CSS 4
- **Upload**: 청크 분할 업로드 (5MB 단위), RFC 4180 CSV 파싱
- **Design**: 다크 테마 (`#0f1117` 배경, teal 액센트, Pretendard + JetBrains Mono 폰트)

## DB 스키마

```ts
// drizzle/schema.ts 핵심 테이블
export const adStats = mysqlTable("ad_stats", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  date: date("date").notNull(),
  year: int("year"), month: int("month"), day: int("day"),
  app: varchar("app", { length: 64 }),
  adpf: varchar("adpf", { length: 64 }),        // "3rd Party" | "PADNW"
  adnetwork1: varchar("adnetwork1", { length: 128 }),
  adnetwork2: varchar("adnetwork2", { length: 128 }),
  unitId: varchar("unitId", { length: 512 }),
  unitName: varchar("unitName", { length: 256 }),
  creativeType: varchar("creativeType", { length: 64 }),
  place1: varchar("place1", { length: 128 }),
  place2: varchar("place2", { length: 128 }),
  place3: varchar("place3", { length: 128 }),
  requests: bigint("requests", { mode: "number" }).default(0),
  fills: bigint("fills", { mode: "number" }).default(0),
  impressions: bigint("impressions", { mode: "number" }).default(0),
  clicks: bigint("clicks", { mode: "number" }).default(0),
  estimatedRevenue: decimal("estimatedRevenue", { precision: 18, scale: 4 }).default("0"),
  confirmedRevenue: decimal("confirmedRevenue", { precision: 18, scale: 4 }).default("0"),
  currency: varchar("currency", { length: 8 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_date").on(table.date),
  index("idx_app").on(table.app),
  index("idx_adpf").on(table.adpf),
  index("idx_date_app").on(table.date, table.app),
]);

export const uploadLogs = mysqlTable("upload_logs", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  dateMin: date("dateMin"), dateMax: date("dateMax"),
  totalRows: int("totalRows").default(0),
  status: mysqlEnum("status", ["success", "failed"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
```

## CSV 파싱 패턴

RFC 4180 표준 준수 (따옴표 내 쉼표 처리):

```ts
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = "";
    } else { current += ch; }
  }
  result.push(current);
  return result;
}
```

## 청크 업로드 전략

대용량 CSV를 5MB 단위로 분할하여 서버에 전송. **첫 번째 청크에서만** 해당 날짜 범위 기존 데이터를 삭제(교체 방식):

```ts
// 서버 tRPC 프로시저 패턴
uploadCsvChunk: publicProcedure.input(z.object({
  csvText: z.string(),
  chunkIndex: z.number(),
  isLastChunk: z.boolean(),
  dateMin: z.string().optional(),
  dateMax: z.string().optional(),
})).mutation(async ({ input }) => {
  // 첫 번째 청크에서만 기존 날짜 범위 삭제 (같은 기간 데이터 교체)
  if (input.chunkIndex === 0 && input.dateMin && input.dateMax) {
    await deleteStatsByDateRange(input.dateMin, input.dateMax);
  }
  const rows = parseChunk(input.csvText);
  const inserted = await insertAdStatsBatch(rows);
  return { inserted };
});
```

## KPI 집계 쿼리 패턴

```ts
export async function getKpiData() {
  const db = await getDb();
  const [row] = await db.select({
    totalConfirmedRevenue: sql<number>`SUM(${adStats.confirmedRevenue})`,
    totalImpressions: sql<number>`SUM(${adStats.impressions})`,
    dateMin: sql<string>`MIN(${adStats.date})`,
    dateMax: sql<string>`MAX(${adStats.date})`,
  }).from(adStats).where(inArray(adStats.app, TARGET_APPS));
  return row;
}
```

## 날짜 범위 슬라이더 패턴

서버 데이터 로드 후 인덱스 기반으로 날짜 범위 필터링:

```tsx
const [dateRange, setDateRange] = useState<[number, number]>([0, 0]);
useEffect(() => {
  if (serverData && !initialized) {
    setDateRange([0, serverData.sec1_line.dates.length - 1]);
    setInitialized(true);
  }
}, [serverData]);

const dashData = useMemo(() => {
  if (!serverData) return null;
  return filterByDateRange(serverData, dateRange[0], dateRange[1]);
}, [serverData, dateRange]);
```

## 디자인 토큰

```
배경: #0f1117 (base), #1a1f2e (카드)
액센트: teal(#2dd4bf 매출), amber(#f59e0b 노출), violet(#a855f7 AI/인사이트)
폰트: Pretendard(한글), JetBrains Mono(숫자 KPI)
```

## 주요 tRPC 프로시저

| 프로시저 | 역할 |
|---|---|
| `dashboard.getData` | 전체 대시보드 데이터 조회 (섹션1~3 + KPI) |
| `dashboard.uploadCsv` | 소용량 CSV 단일 업로드 |
| `dashboard.uploadCsvChunk` | 대용량 CSV 청크 업로드 |
| `dashboard.getUploadLogs` | 업로드 이력 조회 |

## 헤더 구조

```tsx
<header className="border-b border-white/5 bg-[#0f1117]/90 backdrop-blur-sm sticky top-0 z-20">
  <div className="container py-3.5 flex items-center justify-between gap-4">
    {/* 로고 + 타이틀 + 기간 */}
    {/* 우측: 업로드 | 업로드이력 | 익명화 | Insight | AI분석 | Live */}
  </div>
</header>
```

## 참고 파일

- `references/csv-column-mapping.md`: CSV 컬럼 → DB 컬럼 매핑 규칙
