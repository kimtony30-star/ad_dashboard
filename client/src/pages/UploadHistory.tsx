/**
 * UploadHistory Page
 * CSV 업로드 이력을 테이블로 표시
 * - 파일명, 날짜 범위, 적재 행 수, 업로드 시각, 상태
 */
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const s = d instanceof Date ? d.toISOString() : String(d);
  return s.slice(0, 10);
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function UploadHistory() {
  const [, navigate] = useLocation();
  const { data: logs, isLoading, refetch } = trpc.dashboard.getUploadLogs.useQuery();

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      {/* 헤더 */}
      <header className="border-b border-white/5 bg-[#0f1117]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="container py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              대시보드
            </button>
            <span className="text-white/20">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                <svg className="w-3 h-3 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-base font-bold text-white tracking-tight">업로드 이력</h1>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            새로 고침
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="container py-8">
        {/* 요약 카드 */}
        {logs && logs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-[#1a1f2e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-white/40 mb-1">총 업로드 횟수</p>
              <p className="text-2xl font-bold text-white font-mono">{logs.length.toLocaleString()}</p>
            </div>
            <div className="bg-[#1a1f2e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-white/40 mb-1">총 적재 행 수</p>
              <p className="text-2xl font-bold text-teal-400 font-mono">
                {logs.reduce((sum, l) => sum + (l.totalRows ?? 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-[#1a1f2e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-white/40 mb-1">최근 업로드</p>
              <p className="text-sm font-medium text-white/80 mt-1">
                {formatDateTime(logs[0]?.uploadedAt)}
              </p>
            </div>
          </div>
        )}

        {/* 이력 테이블 */}
        <div className="bg-[#1a1f2e] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">업로드 이력 목록</h2>
            {logs && (
              <span className="text-xs text-white/30">총 {logs.length}건</span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-white/40">이력 로딩 중...</p>
              </div>
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-white/30">아직 업로드 이력이 없습니다</p>
              <button
                onClick={() => navigate("/")}
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
              >
                대시보드에서 CSV 업로드 시작 →
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-5 py-3 text-xs font-medium text-white/40 w-8">#</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-white/40">파일명</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-white/40">데이터 기간</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-white/40">적재 행 수</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-white/40">업로드 시각</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-white/40">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr
                      key={log.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3.5 text-xs text-white/20 font-mono">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-teal-400/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-white/70 text-xs font-mono truncate max-w-[280px]" title={log.fileName}>
                            {log.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-white/60 text-xs font-mono">
                          {formatDate(log.dateMin)} ~ {formatDate(log.dateMax)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-teal-400 text-xs font-mono font-medium">
                          {(log.totalRows ?? 0).toLocaleString()}
                        </span>
                        <span className="text-white/30 text-xs ml-1">행</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-white/50 text-xs">
                          {formatDateTime(log.uploadedAt)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {log.status === "success" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs">
                            <span className="w-1 h-1 rounded-full bg-teal-400" />
                            성공
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            <span className="w-1 h-1 rounded-full bg-red-400" />
                            실패
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
