/*
 * Design Philosophy: Data Intelligence Dark UI
 * - Deep navy background
 * - Teal accent for revenue, Amber for impressions
 * - Pretendard (Korean) + JetBrains Mono (numbers)
 * - CSV 업로드 → 서버 DB 적재 → 모든 접속자 공유
 * - 날짜 범위 슬라이더 → 선택 기간 필터링
 */
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Section1Apps from "@/components/Section1Apps";
import Section2Adpf from "@/components/Section2Adpf";
import Section3News from "@/components/Section3News";
import DateRangeSlider from "@/components/DateRangeSlider";
import { APP_COLORS, DashboardData, formatImpressions, formatRevenue } from "@/lib/dashboardTypes";
import { filterByDateRange } from "@/lib/filterData";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { parseCSVToRows, buildDashboardData as parseDashData } from "@/lib/csvParser";

const TABS_BASE = [
  { id: "apps", label: "앱별 성과", sub: null }, // sub는 런타임에 서버 데이터로 대체
  { id: "adpf", label: "ADPF · 네트워크별", sub: "3rd Party · PADNW" },
  { id: "news", label: "뉴스 섹션", sub: "Place1 = 뉴스 포함" },
];

/** 공개 모드(public_mode 쿠키) 여부 감지 */
function useIsPublicMode(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith("public_mode="));
}

/** 사외 발표용 익명화 모드 토글 버튼 (공개 모드에서는 숨김) */
function AnonModeToggle() {
  const isPublicMode = useIsPublicMode();
  const utils = trpc.useUtils();
  const { data } = trpc.dashboard.getAnonMode.useQuery();
  const toggle = trpc.dashboard.setAnonMode.useMutation({
    onSuccess: () => {
      utils.dashboard.getData.invalidate();
      utils.dashboard.getAnonMode.invalidate();
    },
  });
  const isAnon = data?.anonMode ?? false;

  // 공개 모드에서는 "공개 보기" 배지만 표시 (토글 불가)
  if (isPublicMode) {
    return (
      <span
        title="공개 공유 URL로 접속 중 — 익명화가 항상 적용됩니다"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500/20 border border-teal-500/40 text-teal-300 cursor-default"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
        공개 보기
      </span>
    );
  }

  return (
    <button
      onClick={() => toggle.mutate({ enabled: !isAnon })}
      title={isAnon ? "익명화 모드 ON (클릭하면 원본 모드로 전환)" : "원본 모드 (클릭하면 익명화 모드로 전환)"}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
        isAnon
          ? "bg-orange-500/20 border-orange-500/40 text-orange-300 hover:bg-orange-500/30"
          : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
      {isAnon ? "익명화 ON" : "익명화 OFF"}
    </button>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("apps");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{
    currentFile: string;
    fileIndex: number;
    totalFiles: number;
    currentChunk: number;
    totalChunks: number;
    startTime: number;
    insertedRows: number;
  } | null>(null);
  const uploaderRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  // 날짜 범위 슬라이더 상태
  const [dateRange, setDateRange] = useState<[number, number]>([0, 0]);
  const [dateRangeInitialized, setDateRangeInitialized] = useState(false);

  // 공개 모드 여부 (public_mode 쿠키 기반)
  const isPublicMode = useIsPublicMode();

  const { data: serverData, isLoading, refetch } = trpc.dashboard.getData.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // 5분
  });

  // tRPC: CSV 청크 업로드 뮤테이션
  const uploadChunkMutation = trpc.dashboard.uploadCsvChunk.useMutation();

  // tRPC: CSV 업로드 뮤테이션 (소용량 fallback)
  const uploadMutation = trpc.dashboard.uploadCsv.useMutation({
    onSuccess: (result) => {
      const snapshotMsg = result.autoSnapshotId ? " — 인사이트 스냅샷 자동 저장됨" : "";
      toast.success(`${result.insertedRows.toLocaleString()}행 적재 완료${snapshotMsg}`, {
        description: result.autoSnapshotId ? "인사이트 페이지의 히스토리 탭에서 확인할 수 있습니다." : undefined,
        duration: 5000,
      });
      setUploadedFiles((prev) => [...prev, ...result.fileNames]);
      setIsUploading(false);
      setUploadProgress(0);
      refetch();
    },
    onError: (err) => {
      toast.error(`업로드 실패: ${err.message}`);
      setIsUploading(false);
      setUploadProgress(0);
    },
  });

  // 서버 데이터 로드 시 날짜 범위 초기화
  useEffect(() => {
    if (serverData && !dateRangeInitialized) {
      setDateRange([0, serverData.sec1_line.dates.length - 1]);
      setDateRangeInitialized(true);
    }
  }, [serverData, dateRangeInitialized]);

  // 날짜 범위 변경 핸들러
  const handleDateRangeChange = (start: number, end: number) => {
    setDateRange([start, end]);
  };

  // 필터링된 데이터 (메모이제이션)
  const dashData = useMemo(() => {
    if (!serverData) return null;
    const totalDates = serverData.sec1_line.dates.length;
    const safeStart = Math.min(dateRange[0], totalDates - 1);
    const safeEnd = Math.min(dateRange[1], totalDates - 1);
    return filterByDateRange(serverData as unknown as DashboardData, safeStart, safeEnd);
  }, [serverData, dateRange]);

  // CSV 파일 처리
  const handleFiles = async (files: FileList | File[]) => {
    const csvFiles = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    if (csvFiles.length === 0) {
      toast.error("CSV 파일만 업로드 가능합니다.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(null);

    // 청크 크기: 5MB 단위로 분할
    const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
    let totalInserted = 0;
    const allFileNames: string[] = [];
    let autoSnapshotSaved = false;
    try {
      for (let fi = 0; fi < csvFiles.length; fi++) {
        const file = csvFiles[fi];
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const header = lines[0];

        // 청크 분할: 헤더 포함 줄 묶음
        const dataLines = lines.slice(1).filter((l) => l.trim());
        const chunks: string[] = [];
        let currentChunk = header + "\n";
        let currentSize = new Blob([currentChunk]).size;

        for (const line of dataLines) {
          const lineSize = new Blob([line + "\n"]).size;
          if (currentSize + lineSize > CHUNK_SIZE_BYTES && currentChunk !== header + "\n") {
            chunks.push(currentChunk);
            currentChunk = header + "\n" + line + "\n";
            currentSize = new Blob([currentChunk]).size;
          } else {
            currentChunk += line + "\n";
            currentSize += lineSize;
          }
        }
        if (currentChunk !== header + "\n") chunks.push(currentChunk);

        // 파일 전체 날짜 범위 추출 (첫 번째 청크 전송 시 삭제 범위 지정)
        const headerCols = header.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const dateColIdx = headerCols.findIndex((h) => h.toLowerCase() === "date");
        let fileMinDate = "";
        let fileMaxDate = "";
        if (dateColIdx >= 0) {
          const allDates = dataLines
            .map((l) => {
              const cols = l.split(",");
              return cols[dateColIdx]?.trim().replace(/^"|"$/g, "") ?? "";
            })
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
          if (allDates.length > 0) {
            fileMinDate = allDates.reduce((a, b) => (a < b ? a : b));
            fileMaxDate = allDates.reduce((a, b) => (a > b ? a : b));
          }
        }

        // 파일 시작 시 상태 초기화
        const startTime = Date.now();
        setUploadStatus({
          currentFile: file.name,
          fileIndex: fi + 1,
          totalFiles: csvFiles.length,
          currentChunk: 0,
          totalChunks: chunks.length,
          startTime,
          insertedRows: 0,
        });

        // 청크별 전송
        for (let ci = 0; ci < chunks.length; ci++) {
          setUploadStatus(prev => prev ? { ...prev, currentChunk: ci + 1 } : null);
          const result = await uploadChunkMutation.mutateAsync({
            fileName: file.name,
            chunkIndex: ci,
            totalChunks: chunks.length,
            chunkContent: chunks[ci],
            isFirstChunk: ci === 0,
            ...(fileMinDate && fileMaxDate ? { fileMinDate, fileMaxDate } : {}),
          });
          // 마지막 청크에서만 실제 삽입 행 수 반환됨
          if (result.done) {
            totalInserted += result.insertedRows;
            setUploadStatus(prev => prev ? { ...prev, insertedRows: result.insertedRows } : null);
            if (result.autoSnapshotId) autoSnapshotSaved = true;
          }
          // 전체 진행률 계산
          const fileProgress = (fi / csvFiles.length) * 100;
          const chunkProgress = ((ci + 1) / chunks.length) * (100 / csvFiles.length);
          setUploadProgress(Math.round(fileProgress + chunkProgress));
        }
        allFileNames.push(file.name);
      }

      if (autoSnapshotSaved) {
        toast.success(`${totalInserted.toLocaleString()}행 적재 완료 — 인사이트 스냅샷 자동 저장됨`, {
          description: "인사이트 페이지의 히스토리 탭에서 확인할 수 있습니다.",
          duration: 5000,
        });
      } else {
        toast.success(`${totalInserted.toLocaleString()}행 적재 완료`, { duration: 4000 });
      }
      setUploadedFiles((prev) => [...prev, ...allFileNames]);
      setIsUploading(false);
      setUploadProgress(0);
      refetch();
    } catch (err: unknown) {
      toast.error(`업로드 실패: ${(err as Error).message}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 드래그앤드롭
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // 업로더 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 업로드 중이거나 파일 피커가 열려있을 때는 패널 닫기 방지
      if (isUploading || isFilePickerOpen) return;
      if (uploaderRef.current && !uploaderRef.current.contains(e.target as Node)) {
        setShowUploader(false);
      }
    };
    if (showUploader) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUploader, isUploading, isFilePickerOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-sm">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!dashData || !serverData) {
    return (
      <div 
        className={`min-h-screen flex items-center justify-center transition-colors ${
          isDragging ? "bg-teal-900/20" : "bg-[#0f1117]"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              const fileArray = Array.from(files);
              handleFiles(fileArray);
            }
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-4 text-center px-4 w-full max-w-sm">
          <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-white/80 font-semibold mb-1">데이터가 없습니다</p>
            <p className="text-white/40 text-sm">아래 버튼을 누르거나 화면에 드래그하여<br/>최초의 광고통계 CSV를 업로드해 주세요.</p>
          </div>

          {isUploading ? (
            <div className="w-full bg-[#1a1f2e] border border-white/10 rounded-xl p-5 mt-2 text-left animate-in fade-in">
               <p className="text-xs text-teal-400 mb-2 font-medium truncate">업로드 및 분석 처리 중...</p>
               <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                 <div className="bg-gradient-to-r from-teal-500 to-teal-400 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
               </div>
               <div className="flex justify-between items-center text-xs text-white/40">
                 <span>{uploadStatus ? `${uploadStatus.fileIndex} / ${uploadStatus.totalFiles} 파일` : '준비 중...'}</span>
                 <span className="font-mono text-teal-400">{uploadProgress}%</span>
               </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 bg-teal-500/20 border border-teal-500/30 text-teal-300 rounded-xl text-sm font-medium hover:bg-teal-500/30 transition-all mt-2 active:scale-95"
            >
              CSV 파일 선택하기
            </button>
          )}
        </div>
      </div>
    );
  }

  const { kpi } = dashData;
  const allDates = serverData.sec1_line.dates;

  // 탭 sub 레이블: 앱별 성과 탭은 서버 앱 이름 목록으로 동적 생성
  const TABS = TABS_BASE.map((t) =>
    t.id === "apps"
      ? { ...t, sub: dashData.sec1_total.apps.join(" · ") }
      : t
  );
  const isFiltered = dateRange[0] !== 0 || dateRange[1] !== allDates.length - 1;

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* 헤더 */}
      <header className="border-b border-white/5 bg-[#0f1117]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="container py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              <div className="w-3 h-3 rounded-sm bg-teal-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">광고통계 대시보드</h1>
              <p className="text-xs text-white/30">{kpi.period}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 공개 모드에서는 업로드 관련 UI 숨김 */}
            {!useIsPublicMode() && uploadedFiles.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                <span className="text-xs text-teal-400 font-medium">
                  {uploadedFiles.length}개 파일 업로드됨
                </span>
              </div>
            )}

            {/* CSV 업로드 버튼 + 업로드 이력 - 공개 모드에서는 숨김 */}
            {isPublicMode ? null : <><div className="relative" ref={uploaderRef}>
              <button
                onClick={() => setShowUploader((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  showUploader
                    ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                CSV 업로드
              </button>

              {showUploader && (
                <div className="absolute right-0 top-full mt-2 w-80 z-30 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">CSV 파일 업로드</p>
                    <button
                      onClick={() => setShowUploader(false)}
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mb-3">
                    업로드된 데이터는 <strong className="text-teal-400">서버 DB에 저장</strong>되어
                    모든 접속자가 동일한 최신 데이터를 공유합니다.
                  </p>

                  {/* 드래그앤드롭 영역 */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => {
                      setIsFilePickerOpen(true);
                      fileInputRef.current?.click();
                    }}
                    className={`relative border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? "border-teal-400 bg-teal-400/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        setIsFilePickerOpen(false);
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          const fileArray = Array.from(files);
                          handleFiles(fileArray);
                        }
                        e.target.value = ""; // 안전하게 배열로 복사한 뒤에 리셋
                      }}
                      onBlur={() => {
                        // 파일 선택 없이 다이얼로그를 닫은 경우에도 상태 초기화
                        setTimeout(() => setIsFilePickerOpen(false), 300);
                      }}
                    />
                    {isUploading ? (
                      <div className="space-y-3 py-1">
                        {/* 파일명 */}
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs text-teal-400 font-medium truncate">
                              {uploadStatus?.currentFile ?? "처리 중..."}
                            </p>
                            {uploadStatus && uploadStatus.totalFiles > 1 && (
                              <p className="text-xs text-white/30">
                                {uploadStatus.fileIndex} / {uploadStatus.totalFiles} 파일
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 전체 진행률 바 */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-white/40">전체 진행률</span>
                            <span className="text-xs text-teal-400 font-mono font-bold">{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-teal-500 to-teal-400 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* 청크 진행 현황 */}
                        {uploadStatus && uploadStatus.totalChunks > 1 && (
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-white/40">청크 전송</span>
                              <span className="text-xs text-white/50 font-mono">
                                {uploadStatus.currentChunk} / {uploadStatus.totalChunks}
                              </span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-1">
                              <div
                                className="bg-amber-400/70 h-1 rounded-full transition-all duration-200"
                                style={{ width: `${uploadStatus.totalChunks > 0 ? (uploadStatus.currentChunk / uploadStatus.totalChunks) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 예상 시간 */}
                        {uploadStatus && uploadProgress > 5 && (() => {
                          const elapsed = (Date.now() - uploadStatus.startTime) / 1000;
                          const totalEstSec = elapsed / (uploadProgress / 100);
                          const remaining = Math.max(0, totalEstSec - elapsed);
                          const fmt = (s: number) => s < 60
                            ? `${Math.ceil(s)}초`
                            : `${Math.floor(s / 60)}분 ${Math.ceil(s % 60)}초`;
                          return (
                            <div className="flex items-center justify-between pt-1 border-t border-white/5">
                              <span className="text-xs text-white/30">예상 남은 시간</span>
                              <span className="text-xs text-amber-400 font-mono">{fmt(remaining)}</span>
                            </div>
                          );
                        })()}

                        <p className="text-xs text-white/20 text-center">
                          업로드 중 창을 닫지 마세요
                        </p>
                      </div>
                    ) : (
                      <>
                        <svg className="w-7 h-7 text-white/20 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-xs text-white/50">클릭하거나 파일을 드래그하세요</p>
                        <p className="text-xs text-white/25 mt-1">여러 CSV 파일 동시 선택 가능</p>
                      </>
                    )}
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs text-white/30 mb-2">이번 세션 업로드 파일</p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {uploadedFiles.map((name, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-teal-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-xs text-white/50 truncate">{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
              <a
                href="/upload-history"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                업로드 이력
              </a>
            </>
            }

            <AnonModeToggle />

            <a
              href="/insights"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Insight
            </a>
            <a
              href="/ai-analysis"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 hover:text-violet-200 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 분석
            </a> 
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs text-white/40 hidden sm:block">Live</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-5">
        {/* KPI 요약 카드 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent" />
            <div className="relative">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">총 Confirmed Revenue</p>
              <p className="kpi-value text-3xl text-white">
                ₩{formatRevenue(kpi.total_confirmed_revenue)}
              </p>
              <p className="text-xs text-teal-400/70 mt-1">
                ₩{kpi.total_confirmed_revenue.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent" />
            <div className="relative">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">총 Impressions</p>
              <p className="kpi-value text-3xl text-white">
                {formatImpressions(kpi.total_impressions)}
              </p>
              <p className="text-xs text-amber-400/70 mt-1">
                {kpi.total_impressions.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl p-5 border border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
            <div className="relative">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">분석 대상 앱</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {(dashData.sec1_total.apps).map((appName) => (
                  <span
                    key={appName}
                    className="px-2 py-1 rounded-md text-xs font-semibold"
                    style={{
                      background: `${APP_COLORS[appName] ?? "#6366f1"}20`,
                      color: APP_COLORS[appName] ?? "#6366f1",
                      border: `1px solid ${APP_COLORS[appName] ?? "#6366f1"}30`,
                    }}
                  >
                    {appName}
                  </span>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-2">{kpi.period}</p>
            </div>
          </div>
        </div>

        {/* 날짜 범위 슬라이더 */}
        <div className="relative">
          <DateRangeSlider
            dates={allDates}
            startIdx={dateRange[0]}
            endIdx={dateRange[1]}
            onChange={handleDateRangeChange}
          />
          {isFiltered && (
            <div className="absolute top-4 right-[140px] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs text-amber-400/80">필터 적용 중</span>
            </div>
          )}
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 bg-[#1a1f2e] p-1 rounded-xl border border-white/5 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <span className="block">{tab.label}</span>
              <span className="block text-xs opacity-60 font-normal">{tab.sub}</span>
            </button>
          ))}
        </div>

        {/* 섹션 컨텐츠 */}
        <div>
          {activeTab === "apps" && <Section1Apps data={dashData} />}
          {activeTab === "adpf" && <Section2Adpf data={dashData} />}
          {activeTab === "news" && <Section3News data={dashData} />}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="border-t border-white/5 mt-12">
        <div className="container py-4 flex items-center justify-between">
          <p className="text-xs text-white/20">광고통계 대시보드 · {kpi.period}</p>
          <p className="text-xs text-white/20">DB 연동 · 실시간 공유</p>
        </div>
      </footer>
    </div>
  );
}
