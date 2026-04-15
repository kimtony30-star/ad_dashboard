/*
 * CsvUploader Component
 * - 드래그앤드롭 또는 클릭으로 CSV 파일 업로드
 * - 파일 파싱 진행 상태 표시
 * - 여러 파일 동시 업로드 지원 (자동 병합)
 */
import { useCallback, useRef, useState } from "react";
import { buildDashboardData, parseCSVToRows } from "@/lib/csvParser";
import type { DashboardData } from "@/lib/dashboardTypes";

interface Props {
  onDataLoaded: (data: DashboardData, fileNames: string[]) => void;
}

type UploadState = "idle" | "dragging" | "parsing" | "done" | "error";

export default function CsvUploader({ onDataLoaded }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) =>
        f.name.toLowerCase().endsWith(".csv")
      );
      if (fileArr.length === 0) {
        setState("error");
        setErrorMsg("CSV 파일만 업로드할 수 있습니다.");
        return;
      }

      setState("parsing");
      setProgress({ current: 0, total: fileArr.length });

      try {
        const allRows: ReturnType<typeof parseCSVToRows> = [];

        for (let i = 0; i < fileArr.length; i++) {
          const text = await fileArr[i].text();
          const rows = parseCSVToRows(text);
          allRows.push(...rows);
          setProgress({ current: i + 1, total: fileArr.length });
        }

        if (allRows.length === 0) {
          setState("error");
          setErrorMsg("데이터를 파싱할 수 없습니다. CSV 형식을 확인해 주세요.");
          return;
        }

        const dashData = buildDashboardData(allRows);
        setState("done");
        onDataLoaded(dashData, fileArr.map((f) => f.name));
      } catch (e) {
        setState("error");
        setErrorMsg(`파싱 오류: ${(e as Error).message}`);
      }
    },
    [onDataLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState("idle");
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setState("dragging");
  };

  const handleDragLeave = () => setState("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const reset = () => {
    setState("idle");
    setErrorMsg("");
  };

  return (
    <div className="w-full">
      {state === "parsing" ? (
        /* 파싱 중 */
        <div className="bg-[#1a1f2e] border border-teal-500/20 rounded-xl p-6 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/60">
            파일 파싱 중... ({progress.current}/{progress.total})
          </p>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : state === "error" ? (
        /* 오류 */
        <div className="bg-[#1a1f2e] border border-red-500/30 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold">!</div>
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
          <button
            onClick={reset}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1 border border-white/10 rounded-md"
          >
            다시 시도
          </button>
        </div>
      ) : (
        /* 업로드 영역 */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl p-6 cursor-pointer
            flex flex-col items-center gap-3 transition-all duration-200
            ${state === "dragging"
              ? "border-teal-400/60 bg-teal-500/10"
              : state === "done"
              ? "border-teal-500/40 bg-teal-500/5"
              : "border-white/10 bg-[#1a1f2e] hover:border-white/20 hover:bg-white/5"
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {state === "done" ? (
            <>
              <div className="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-teal-400 font-medium">업로드 완료 — 새 파일을 드롭하면 갱신됩니다</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm text-white/60">
                  <span className="text-teal-400 font-medium">클릭</span>하거나 CSV 파일을 드래그하여 업로드
                </p>
                <p className="text-xs text-white/30 mt-1">여러 파일 동시 업로드 가능 (자동 병합)</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
