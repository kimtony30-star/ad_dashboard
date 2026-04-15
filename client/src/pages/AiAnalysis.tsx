/**
 * AiAnalysis.tsx
 * AI 자연어 분석 채팅 페이지
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Sparkles, Send, RotateCcw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "전체 광고 성과 요약을 해주세요",
  "최근 한 달 사이 가장 성장한 Place는 어디인가요?",
  "앱별 매출 비중 변화를 분석해주세요",
  "ADPF별 성과를 비교해주세요",
  "매출이 가장 많이 감소한 Place는 어디인가요?",
];

// 간단한 마크다운 렌더러 (볼드, 목록)
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // 헤더
    if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-white mt-3 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith("## "))  return <h2 key={i} className="font-bold text-white text-base mt-3 mb-1">{line.slice(3)}</h2>;
    if (line.startsWith("# "))   return <h1 key={i} className="font-bold text-white text-lg mt-3 mb-1">{line.slice(2)}</h1>;
    // 목록
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <li key={i} className="ml-4 list-disc text-white/80">{applyInline(line.slice(2))}</li>;
    }
    if (/^\d+\. /.test(line)) {
      return <li key={i} className="ml-4 list-decimal text-white/80">{applyInline(line.replace(/^\d+\. /, ""))}</li>;
    }
    // 빈 줄
    if (line.trim() === "") return <br key={i} />;
    // 일반 텍스트
    return <p key={i} className="text-white/80 leading-relaxed">{applyInline(line)}</p>;
  });
}

function applyInline(text: string) {
  // **볼드** 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

export default function AiAnalysis() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const askMutation = trpc.dashboard.askAI.useMutation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, askMutation.isPending]);

  const handleSend = async (question: string) => {
    if (!question.trim() || askMutation.isPending) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(newMessages);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const result = await askMutation.mutateAsync({ question, history });
      setMessages(prev => [...prev, { role: "assistant", content: result.answer }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `오류가 발생했습니다: ${e.message}` }]);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex flex-col">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[#0b0f1a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
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
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-white">AI 분석</span>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              대화 초기화
            </button>
          )}
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-6">

        {/* 초기 화면 */}
        {messages.length === 0 && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-violet-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">광고 데이터 AI 분석</h2>
              <p className="text-sm text-white/40">궁금한 내용을 자연어로 질문해보세요. DB 데이터를 기반으로 답변드립니다.</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider mb-3">추천 질문</p>
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-violet-500/30 text-sm text-white/70 hover:text-white transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 메시지 목록 */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-violet-500/20 border border-violet-500/30 text-white"
                : "bg-[#1a1f2e] border border-white/5"
            }`}>
              {msg.role === "assistant"
                ? <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                : msg.content
              }
            </div>
          </div>
        ))}

        {/* 로딩 */}
        {askMutation.isPending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0 mr-3 mt-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="bg-[#1a1f2e] border border-white/5 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                분석 중...
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="sticky bottom-0 bg-[#0b0f1a]/95 backdrop-blur border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder="광고 데이터에 대해 질문하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
              rows={1}
              className="flex-1 bg-[#1a1f2e] border border-white/10 focus:border-violet-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none resize-none transition-colors"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || askMutation.isPending}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-white/20 mt-2 text-center">
            DB의 실제 광고 데이터를 기반으로 GPT-4o mini가 분석합니다
          </p>
        </div>
      </div>
    </div>
  );
}