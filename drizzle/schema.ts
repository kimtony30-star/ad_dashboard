import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

/**
 * Core user table backing auth flow.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 광고통계 원본 데이터 테이블
 * CSV 파일의 각 행을 그대로 저장
 */
export const adStats = sqliteTable(
  "ad_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 날짜
    date: integer("date", { mode: "timestamp" }).notNull(),
    year: integer("year"),
    month: integer("month"),
    day: integer("day"),
    // 앱/매체
    app: text("app"),
    adpf: text("adpf"),
    adnetwork1: text("adnetwork1"),
    adnetwork2: text("adnetwork2"),
    // 광고 단위
    unitId: text("unitId"),
    unitName: text("unitName"),
    creativeType: text("creativeType"),
    // Place 정보
    place1: text("place1"),
    place2: text("place2"),
    place3: text("place3"),
    // 지표
    requests: integer("requests", { mode: "number" }).default(0),
    fills: integer("fills", { mode: "number" }).default(0),
    impressions: integer("impressions", { mode: "number" }).default(0),
    clicks: integer("clicks", { mode: "number" }).default(0),
    // 수익
    estimatedRevenue: real("estimatedRevenue").default(0),
    confirmedRevenue: real("confirmedRevenue").default(0),
    currency: text("currency"),
    // 메타
    uploadedAt: integer("uploadedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_date").on(table.date),
    index("idx_app").on(table.app),
    index("idx_adpf").on(table.adpf),
    index("idx_date_app").on(table.date, table.app),
  ]
);

export type AdStat = typeof adStats.$inferSelect;
export type InsertAdStat = typeof adStats.$inferInsert;

/**
 * CSV 업로드 이력 테이블
 * 파일별 업로드 결과를 기록
 */
export const uploadLogs = sqliteTable("upload_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("fileName").notNull(),
  dateMin: integer("dateMin", { mode: "timestamp" }),
  dateMax: integer("dateMax", { mode: "timestamp" }),
  totalRows: integer("totalRows").default(0),
  status: text("status", { enum: ["success", "failed"] }).default("success").notNull(),
  errorMessage: text("errorMessage"),
  uploadedAt: integer("uploadedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type UploadLog = typeof uploadLogs.$inferSelect;
export type InsertUploadLog = typeof uploadLogs.$inferInsert;

/**
 * 인사이트 히스토리 테이블
 * 날짜별로 분석된 인사이트 스냅샷을 저장
 */
export const insightHistory = sqliteTable(
  "insight_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 스냅샷 생성 시점의 데이터 기준 최신 날짜
    dataAsOf: integer("dataAsOf", { mode: "timestamp" }).notNull(),
    // 스냅샷 메모 (선택)
    memo: text("memo"),
    // 기간별 요약 (JSON)
    periods: text("periods", { mode: "json" }).notNull(),
    // 인사이트 목록 (JSON)
    insights: text("insights", { mode: "json" }).notNull(),
    // 생성 시각
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_insight_data_as_of").on(table.dataAsOf),
  ]
);

export type InsightHistory = typeof insightHistory.$inferSelect;
export type InsertInsightHistory = typeof insightHistory.$inferInsert;
