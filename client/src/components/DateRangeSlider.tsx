/*
 * DateRangeSlider Component
 * - 전체 날짜 목록을 받아 양방향 범위 슬라이더로 표시
 * - 선택된 시작/끝 인덱스를 부모에게 콜백으로 전달
 * - shadcn/ui Slider (range) 활용
 */
import { Slider } from "@/components/ui/slider";

interface Props {
  dates: string[];           // 전체 날짜 배열 (정렬된 상태)
  startIdx: number;          // 현재 선택된 시작 인덱스
  endIdx: number;            // 현재 선택된 끝 인덱스
  onChange: (start: number, end: number) => void;
}

function formatDateLabel(dateStr: string): string {
  // "2026-01-01" → "1/1"
  const parts = dateStr.split("-");
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

export default function DateRangeSlider({ dates, startIdx, endIdx, onChange }: Props) {
  if (dates.length === 0) return null;

  const handleChange = (values: number[]) => {
    if (values.length === 2) {
      onChange(values[0], values[1]);
    }
  };

  const selectedDays = endIdx - startIdx + 1;

  return (
    <div className="bg-[#1a1f2e] border border-white/5 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">날짜 범위</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 선택 기간 배지 */}
          <span className="px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 font-medium mono">
            {selectedDays}일
          </span>
          {/* 전체 선택 버튼 */}
          {(startIdx !== 0 || endIdx !== dates.length - 1) && (
            <button
              onClick={() => onChange(0, dates.length - 1)}
              className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-0.5 border border-white/10 rounded-md"
            >
              전체
            </button>
          )}
        </div>
      </div>

      {/* 슬라이더 */}
      <div className="px-1">
        <Slider
          min={0}
          max={dates.length - 1}
          step={1}
          value={[startIdx, endIdx]}
          onValueChange={handleChange}
          className="w-full"
        />
      </div>

      {/* 날짜 레이블 */}
      <div className="flex justify-between mt-2.5">
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-white/30">시작</span>
          <span className="text-xs font-semibold text-teal-400 mono">
            {dates[startIdx]}
          </span>
        </div>

        {/* 중간 눈금 레이블 (5개 이상일 때) */}
        {dates.length >= 5 && (
          <div className="flex gap-4 items-end pb-0.5">
            {dates
              .filter((_, i) => {
                // 균등 간격으로 최대 5개 중간 레이블 표시
                const step = Math.floor(dates.length / 6);
                return step > 0 && i % step === 0 && i !== 0 && i !== dates.length - 1;
              })
              .slice(0, 4)
              .map((d) => (
                <span key={d} className="text-[10px] text-white/20 mono">
                  {formatDateLabel(d)}
                </span>
              ))}
          </div>
        )}

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-white/30">종료</span>
          <span className="text-xs font-semibold text-teal-400 mono">
            {dates[endIdx]}
          </span>
        </div>
      </div>
    </div>
  );
}
