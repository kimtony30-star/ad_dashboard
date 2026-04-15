/**
 * Insights.tsx
 * 인사이트 게시판 + 히스토리 탭
 * - 현재 인사이트: 전체기간·최근 1개월·최근 1주 이상 탐지 Top 3
 * - 히스토리: 날짜별 스냅샷 저장·목록·비교
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  RefreshCw, Lightbulb, History, Save, GitCompare,
  ChevronDown, ChevronUp, Check,
} from "lucide-react";
import { toast } from "sonner";

// ── 포맷 헬퍼 ────────────────────────────────────────────
function fmtRev(v: number): string {
  if (v >= 1e9) return `₩${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₩${Math.floor(v / 1e6)}M`;
  if (v >= 1e3) return `₩${Math.floor(v / 1e3)}K`;
  return `₩${Math.floor(v).toLocaleString()}`;
}
function fmtImp(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function fmtDate(s: string): string {
  return s.slice(5).replace("-", "/"); // "03/15"
}

// ── 아이콘 ────────────────────────────────────────────────
function DirectionIcon({ direction }: { direction: "up" | "down" | "neutral" }) {
  if (direction === "up") return <TrendingUp className="w-5 h-5 text-teal-400" />;
  if (direction === "down") return <TrendingDown className="w-5 h-5 text-rose-400" />;
  return <Minus className="w-5 h-5 text-white/40" />;
}

// ── 배지 색상 ─────────────────────────────────────────────
const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  rev_spike:      { bg: "bg-teal-500/20",   text: "text-teal-300",   label: "매출 급등" },
  rev_drop:       { bg: "bg-rose-500/20",   text: "text-rose-300",   label: "매출 급락" },
  imp_spike:      { bg: "bg-blue-500/20",   text: "text-blue-300",   label: "노출 급등" },
  imp_drop:       { bg: "bg-orange-500/20", text: "text-orange-300", label: "노출 급락" },
  app_shift:      { bg: "bg-purple-500/20", text: "text-purple-300", label: "앱 비중 변화" },
  adpf_shift:     { bg: "bg-amber-500/20",  text: "text-amber-300",  label: "ADPF 변화" },
  cpm_change:     { bg: "bg-indigo-500/20", text: "text-indigo-300", label: "CPM 변화" },
  period_compare: { bg: "bg-cyan-500/20",   text: "text-cyan-300",   label: "기간 비교" },
};
const PERIOD_BADGE: Record<string, string> = {
  "전체기간":   "bg-white/10 text-white/60",
  "최근 1개월": "bg-amber-500/20 text-amber-300",
  "최근 1주":   "bg-teal-500/20 text-teal-300",
};

// ── 커스텀 툴팁 ──────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1420] border border-white/20 rounded-lg p-2.5 shadow-xl text-xs">
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.fill }} />
          <span className="text-white font-semibold">
            {entry.value >= 1e6 ? fmtRev(entry.value) : entry.value >= 1e4 ? fmtImp(entry.value) : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── 기간 요약 카드 ────────────────────────────────────────
function PeriodCard({ label, dateFrom, dateTo, totalRev, totalImp, avgDailyRev, days, highlight }: {
  label: string; dateFrom: string; dateTo: string;
  totalRev: number; totalImp: number; avgDailyRev: number;
  days: number; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all ${highlight ? "bg-teal-500/10 border-teal-500/30" : "bg-[#1a1f2e] border-white/5"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PERIOD_BADGE[label] ?? "bg-white/10 text-white/60"}`}>{label}</span>
        <span className="text-xs text-white/40">{days}일</span>
      </div>
      <div className="text-lg font-bold text-white mb-0.5">{fmtRev(totalRev)}</div>
      <div className="text-xs text-white/50 mb-2">{fmtImp(totalImp)} 노출</div>
      <div className="text-xs text-white/40">일평균 <span className="text-white/70 font-medium">{fmtRev(avgDailyRev)}</span></div>
      <div className="text-xs text-white/30 mt-1">{dateFrom} ~ {dateTo}</div>
    </div>
  );
}

// ── 인사이트 카드 ─────────────────────────────────────────
function InsightCard({ insight, rank }: { insight: any; rank: number }) {
  const badge = TYPE_COLORS[insight.type] ?? { bg: "bg-white/10", text: "text-white/60", label: insight.type };
  const pctColor = insight.direction === "up" ? "text-teal-400" : insight.direction === "down" ? "text-rose-400" : "text-white/50";
  const sign = insight.direction === "up" ? "+" : insight.direction === "down" ? "-" : "";

  return (
    <div className="bg-[#1a1f2e] rounded-2xl border border-white/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-white/40">{rank}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${PERIOD_BADGE[insight.period] ?? "bg-white/10 text-white/60"}`}>{insight.period}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 font-bold text-lg ${pctColor}`}>
          <DirectionIcon direction={insight.direction} />
          {sign}{insight.magnitude.toFixed(1)}%
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-white mb-1">{insight.title}</h3>
        <p className="text-sm text-white/50">{insight.summary}</p>
      </div>
      {insight.chartData && insight.chartData.length > 0 && (
        <div className="bg-[#0f1420] rounded-xl p-3">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={insight.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={32} />
              <YAxis hide />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {insight.chartData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color ?? "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="bg-white/5 rounded-xl p-3">
        <p className="text-xs text-white/60 leading-relaxed">{insight.detail}</p>
      </div>
      <div className="text-xs text-white/30">분석 기간: {insight.dateRange}</div>
    </div>
  );
}

// ── 변화율 셀 ─────────────────────────────────────────────
function ChangePct({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.1) return <span className="text-white/40 text-xs">-</span>;
  const color = pct > 0 ? "text-teal-400" : "text-rose-400";
  return <span className={`text-xs font-semibold ${color}`}>{fmtPct(pct)}</span>;
}

// ── 히스토리 스냅샷 행 ────────────────────────────────────
function SnapshotRow({
  snap,
  isSelected,
  selectionOrder,
  onToggle,
}: {
  snap: any;
  isSelected: boolean;
  selectionOrder: number | null;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const topInsight = snap.insights?.[0];

  return (
    <div className={`rounded-xl border transition-all ${isSelected ? "border-amber-500/40 bg-amber-500/5" : "border-white/5 bg-[#1a1f2e]"}`}>
      <div className="flex items-center gap-3 p-4">
        {/* 선택 체크박스 */}
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
            isSelected
              ? "bg-amber-500 border-amber-500 text-black"
              : "border-white/20 hover:border-amber-500/50"
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
          {!isSelected && selectionOrder === null && (
            <span className="text-white/20 text-xs"></span>
          )}
        </button>

        {/* 날짜 */}
        <div className="flex-shrink-0 w-24">
          <div className="text-sm font-bold text-white">{snap.dataAsOf}</div>
          <div className="text-xs text-white/30">
            {new Date(snap.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 저장
          </div>
        </div>

        {/* 기간별 요약 */}
        <div className="flex-1 grid grid-cols-3 gap-3 text-xs">
          {["all", "month", "week"].map((key) => {
            const p = snap.periods?.[key];
            if (!p) return null;
            return (
              <div key={key} className="space-y-0.5">
                <div className={`text-xs px-1.5 py-0.5 rounded inline-block ${PERIOD_BADGE[p.label] ?? "bg-white/10 text-white/60"}`}>{p.label}</div>
                <div className="text-white font-semibold">{fmtRev(p.avgDailyRev)}<span className="text-white/40 font-normal">/일</span></div>
              </div>
            );
          })}
        </div>

        {/* 대표 인사이트 */}
        <div className="hidden md:block flex-shrink-0 w-40">
          {topInsight && (
            <div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[topInsight.type]?.bg ?? "bg-white/10"} ${TYPE_COLORS[topInsight.type]?.text ?? "text-white/60"}`}>
                {TYPE_COLORS[topInsight.type]?.label ?? topInsight.type}
              </span>
              <div className="text-xs text-white/50 mt-1 truncate">{topInsight.title}</div>
            </div>
          )}
        </div>

        {/* 메모 */}
        {snap.memo && (
          <div className="hidden lg:block flex-shrink-0 w-32 text-xs text-white/40 truncate">{snap.memo}</div>
        )}

        {/* 펼치기 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* 펼친 인사이트 목록 */}
      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-2">
          <div className="text-xs text-white/40 mb-3">인사이트 {snap.insights?.length ?? 0}개</div>
          {snap.insights?.map((ins: any, i: number) => {
            const badge = TYPE_COLORS[ins.type] ?? { bg: "bg-white/10", text: "text-white/60", label: ins.type };
            const pctColor = ins.direction === "up" ? "text-teal-400" : "text-rose-400";
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded flex-shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
                <span className="text-white/70 flex-1">{ins.title}</span>
                <span className={`flex-shrink-0 font-semibold ${pctColor}`}>
                  {ins.direction === "up" ? "+" : ins.direction === "down" ? "-" : ""}{ins.magnitude.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 비교 패널 ─────────────────────────────────────────────
function ComparePanel({ baseId, targetId }: { baseId: number; targetId: number }) {
  const { data, isLoading } = trpc.dashboard.compareInsightSnapshots.useQuery(
    { baseId, targetId },
    { enabled: baseId > 0 && targetId > 0 }
  );

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
    </div>
  );
  if (!data) return null;

  const rows = [
    { label: "전체기간", rev: data.all.rev, imp: data.all.imp },
    { label: "최근 1개월", rev: data.month.rev, imp: data.month.imp },
    { label: "최근 1주", rev: data.week.rev, imp: data.week.imp },
  ];

  return (
    <div className="bg-[#1a1f2e] rounded-2xl border border-white/5 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-amber-400" />
        <h3 className="font-semibold text-white text-sm">스냅샷 비교</h3>
        <span className="text-xs text-white/40">{data.baseDate} → {data.targetDate}</span>
      </div>

      {/* 기간별 일평균 매출/노출 변화 */}
      <div>
        <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">기간별 일평균 변화</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30 border-b border-white/5">
              <th className="text-left py-2 font-medium">기간</th>
              <th className="text-right py-2 font-medium">기준 매출/일</th>
              <th className="text-right py-2 font-medium">비교 매출/일</th>
              <th className="text-right py-2 font-medium">변화율</th>
              <th className="text-right py-2 font-medium">노출 변화</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-white/5 hover:bg-white/3">
                <td className="py-2.5 text-white/70">{row.label}</td>
                <td className="py-2.5 text-right text-white/60">{fmtRev(row.rev.base)}</td>
                <td className="py-2.5 text-right text-white font-semibold">{fmtRev(row.rev.target)}</td>
                <td className="py-2.5 text-right"><ChangePct pct={row.rev.changePct} /></td>
                <td className="py-2.5 text-right"><ChangePct pct={row.imp.changePct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 인사이트 타입 변화 */}
      {data.insightTypeDiff && data.insightTypeDiff.length > 0 && (
        <div>
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">인사이트 유형 변화</div>
          <div className="flex flex-wrap gap-2">
            {data.insightTypeDiff.map((d: any) => {
              const badge = TYPE_COLORS[d.type] ?? { bg: "bg-white/10", text: "text-white/60", label: d.type };
              const diff = d.target - d.base;
              return (
                <div key={d.type} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${badge.bg}`}>
                  <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                  <span className="text-white/30 text-xs">{d.base}→{d.target}</span>
                  {diff !== 0 && (
                    <span className={`text-xs font-bold ${diff > 0 ? "text-rose-400" : "text-teal-400"}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────
export default function Insights() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [memo, setMemo] = useState("");
  const [showMemoInput, setShowMemoInput] = useState(false);

  // 현재 인사이트
  const { data, isLoading, refetch, isFetching } = trpc.dashboard.getInsights.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // 히스토리 목록
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = trpc.dashboard.listInsightHistory.useQuery(undefined, {
    staleTime: 30 * 1000,
  });

  // 스냅샷 저장
  const saveSnapshot = trpc.dashboard.saveInsightSnapshot.useMutation({
    onSuccess: (result) => {
      toast.success(`인사이트 스냅샷 저장 완료 (기준일: ${result.dataAsOf})`);
      setMemo("");
      setShowMemoInput(false);
      refetchHistory();
    },
    onError: (err) => toast.error(`저장 실패: ${err.message}`),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // 최대 2개
      return [...prev, id];
    });
  };

  const canCompare = selectedIds.length === 2;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[#0b0f1a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              대시보드
            </button>
            <span className="text-white/20">/</span>
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-white">Insight 게시판</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "current" && (
              <>
                {showMemoInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="메모 (선택)"
                      className="text-xs bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white placeholder-white/30 outline-none focus:border-amber-500/50 w-40"
                      onKeyDown={(e) => e.key === "Enter" && saveSnapshot.mutate({ memo })}
                    />
                    <button
                      onClick={() => saveSnapshot.mutate({ memo })}
                      disabled={saveSnapshot.isPending}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition-all"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saveSnapshot.isPending ? "저장 중..." : "저장"}
                    </button>
                    <button onClick={() => setShowMemoInput(false)} className="text-xs text-white/40 hover:text-white px-2">취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowMemoInput(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    스냅샷 저장
                  </button>
                )}
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  새로고침
                </button>
              </>
            )}
            {activeTab === "history" && canCompare && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                <GitCompare className="w-3.5 h-3.5" />
                {selectedIds.length}개 선택됨 — 아래에서 비교 확인
              </div>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { id: "current" as const, label: "현재 인사이트", icon: <Lightbulb className="w-3.5 h-3.5" /> },
            { id: "history" as const, label: "히스토리", icon: <History className="w-3.5 h-3.5" />, count: historyData?.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-xs bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── 현재 인사이트 탭 ── */}
        {activeTab === "current" && (
          <>
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                <p className="text-white/50 text-sm">데이터를 분석하는 중...</p>
              </div>
            )}
            {!isLoading && (!data || data.insights.length === 0) && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Lightbulb className="w-12 h-12 text-white/20" />
                <p className="text-white/50">분석할 데이터가 없습니다. CSV를 먼저 업로드해 주세요.</p>
              </div>
            )}
            {!isLoading && data?.periods && (
              <div>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-3">기간별 요약</h2>
                <div className="grid grid-cols-3 gap-4">
                  <PeriodCard {...data.periods.all} />
                  <PeriodCard {...data.periods.month} />
                  <PeriodCard {...data.periods.week} highlight />
                </div>
              </div>
            )}
            {!isLoading && data && data.insights.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-white/70">주목할 변화 Top {data.insights.length}</h2>
                  <span className="text-xs text-white/30 ml-1">— magnitude 기준 자동 선정</span>
                </div>
                <div className="space-y-5">
                  {data.insights.map((insight: any, i: number) => (
                    <InsightCard key={insight.id} insight={insight} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}
            {!isLoading && data && data.insights.length > 0 && (
              <div className="bg-white/3 rounded-xl p-5 border border-white/5">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">분석 방법</h3>
                <div className="grid grid-cols-2 gap-3 text-xs text-white/40">
                  <div><span className="text-white/60 font-medium">기간 비교</span> — 전체기간·최근 1개월·최근 1주 일평균을 비교하여 추세 변화를 탐지합니다.</div>
                  <div><span className="text-white/60 font-medium">이상 탐지</span> — Z-score 기반으로 최근 1주 내 평균 대비 ±0.8σ 이상 벗어난 날을 탐지합니다.</div>
                  <div><span className="text-white/60 font-medium">앱/ADPF 비중</span> — 최근 1주 vs 최근 1개월 매출 점유율 변화를 계산합니다.</div>
                  <div><span className="text-white/60 font-medium">CPM 변화</span> — 기간별 전체 CPM(매출/노출×1000)을 비교합니다.</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 히스토리 탭 ── */}
        {activeTab === "history" && (
          <>
            {historyLoading && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-white/50 text-sm">히스토리를 불러오는 중...</p>
              </div>
            )}

            {!historyLoading && (!historyData || historyData.length === 0) && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <History className="w-12 h-12 text-white/20" />
                <p className="text-white/50 text-sm">저장된 스냅샷이 없습니다.</p>
                <p className="text-white/30 text-xs">현재 인사이트 탭에서 <strong className="text-white/50">스냅샷 저장</strong> 버튼을 눌러 첫 번째 기록을 남겨보세요.</p>
                <button
                  onClick={() => setActiveTab("current")}
                  className="mt-2 flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  현재 인사이트로 이동
                </button>
              </div>
            )}

            {!historyLoading && historyData && historyData.length > 0 && (
              <>
                {/* 선택 안내 */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/50">
                    총 <span className="text-white font-semibold">{historyData.length}</span>개 스냅샷
                    {selectedIds.length > 0 && (
                      <span className="ml-2 text-amber-400">{selectedIds.length}개 선택됨</span>
                    )}
                  </div>
                  {selectedIds.length > 0 && (
                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                      선택 해제
                    </button>
                  )}
                </div>
                {selectedIds.length < 2 && (
                  <p className="text-xs text-white/30 -mt-4">
                    체크박스로 2개를 선택하면 스냅샷을 비교할 수 있습니다.
                  </p>
                )}

                {/* 스냅샷 목록 */}
                <div className="space-y-3">
                  {historyData.map((snap: any) => (
                    <SnapshotRow
                      key={snap.id}
                      snap={snap}
                      isSelected={selectedIds.includes(snap.id)}
                      selectionOrder={selectedIds.indexOf(snap.id) >= 0 ? selectedIds.indexOf(snap.id) + 1 : null}
                      onToggle={() => toggleSelect(snap.id)}
                    />
                  ))}
                </div>

                {/* 비교 패널 */}
                {canCompare && (
                  <ComparePanel baseId={selectedIds[0]} targetId={selectedIds[1]} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
