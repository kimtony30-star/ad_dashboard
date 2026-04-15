export interface DailySeriesData {
  confirmed_revenue: number[];
  impressions: number[];
}

export interface Sec1Line {
  dates: string[];
  series: Record<string, DailySeriesData>;
}

export interface Sec1Total {
  apps: string[];
  confirmed_revenue: number[];
  impressions: number[];
}

export interface AdpfNetworkData {
  networks: string[];
  confirmed_revenue: number[];
  impressions: number[];
}

export interface Sec2 {
  "3rd Party": AdpfNetworkData;
  PADNW: AdpfNetworkData;
}

export interface Sec2Line {
  dates: string[];
  series: Record<string, DailySeriesData>;
}

export interface NetworkData {
  networks: string[];
  confirmed_revenue: number[];
  impressions: number[];
  cpm: number[];
}

export interface DashboardData {
  kpi: {
    total_confirmed_revenue: number;
    total_impressions: number;
    total_clicks: number;
    period: string;
    apps?: string[];
  };
  sec1_line: Sec1Line;
  sec1_total: Sec1Total;
  sec2: Sec2;
  sec2_line: Sec2Line;
  sec3_line: Sec1Line;
  sec3_total: Sec1Total;
  sec3_place: {
    places: string[];
    confirmed_revenue: number[];
    impressions: number[];
  };
  sec3_network: NetworkData;
  sec3_network_by_app: Record<string, NetworkData>;
}

// 앱별 색상 (원본 + 익명화 이름 모두 지원)
export const APP_COLORS: Record<string, string> = {
  ocb: "#3b82f6",
  syrup: "#a855f7",
  olock: "#10b981",
  // 익명화 모드
  "A사": "#3b82f6",
  "B사": "#a855f7",
  "C사": "#10b981",
};

// ADPF 색상
export const ADPF_COLORS: Record<string, string> = {
  "3rd Party": "#2dd4bf",
  PADNW: "#f59e0b",
};

// 숫자 포맷 (KRW)
export function formatRevenue(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${Math.floor(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${Math.floor(value / 1_000)}K`;
  }
  return Math.floor(value).toLocaleString();
}

export function formatImpressions(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toLocaleString();
}

export function formatFullRevenue(value: number): string {
  return `₩${value.toLocaleString()}`;
}

// 날짜 포맷 (01-01)
export function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parts[1]}/${parts[2]}`;
}
