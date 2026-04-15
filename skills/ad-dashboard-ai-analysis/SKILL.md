---
name: ad-dashboard-ai-analysis
description: 광고통계 대시보드에 AI 자연어 데이터 분석 채팅창을 추가하는 스킬. 사용자가 자연어로 질문하면 DB 데이터를 집계하여 LLM(Gemini 2.5 Flash)이 분석 답변을 생성한다. "AI 분석 채팅 만들어줘", "자연어로 데이터 질문", "가장 성장한 Place 분석", "AI가 광고 데이터 답변" 등의 요청에 사용.
---

# Ad Dashboard AI Analysis

광고통계 대시보드에 AI 자연어 분석 채팅창을 추가하는 스킬. 사용자 질문 → DB 집계 → LLM 답변의 3단계 파이프라인으로 동작한다.

## 전체 흐름

```
사용자 질문 (자연어)
    ↓
서버: DB에서 광고 데이터 집계 (aiAnalyzer.ts)
    ↓
집계 수치를 시스템 프롬프트에 삽입
    ↓
POST https://forge.manus.im/v1/chat/completions (Gemini 2.5 Flash)
    ↓
마크다운 형식 답변 → 클라이언트 렌더링
```

## LLM 연동 방식

Manus 내장 `invokeLLM` 헬퍼 사용. 외부 API 키 불필요.

```ts
import { invokeLLM } from "./_core/llm";

const response = await invokeLLM({
  messages: [
    { role: "system", content: systemPrompt },  // 집계 데이터 포함
    ...conversationHistory,                      // 이전 대화 이력
    { role: "user", content: userQuestion },
  ],
});
const answer = response.choices[0].message.content as string;
```

## 데이터 집계 모듈 (aiAnalyzer.ts)

```ts
// 최근 1개월 vs 이전 1개월 자동 비교
export async function buildAiContext(): Promise<AiContext> {
  const today = new Date().toISOString().slice(0, 10);
  const curr_from = offsetDate(today, -30);  // 최근 30일
  const prev_from = offsetDate(today, -60);  // 이전 30일
  const prev_to   = offsetDate(today, -31);

  const [currPlace, prevPlace, currApp, prevApp, currAdpf, prevAdpf] = await Promise.all([
    getPlaceTotals(curr_from, today),
    getPlaceTotals(prev_from, prev_to),
    getAppTotals(curr_from, today),
    getAppTotals(prev_from, prev_to),
    getAdpfTotals(curr_from, today),
    getAdpfTotals(prev_from, prev_to),
  ]);

  return { currPlace, prevPlace, currApp, prevApp, currAdpf, prevAdpf,
           period: { curr: `${curr_from}~${today}`, prev: `${prev_from}~${prev_to}` } };
}
```

## 시스템 프롬프트 생성 패턴

```ts
export function buildSystemPrompt(ctx: AiContext): string {
  const placeRows = ctx.currPlace.map(c => {
    const p = ctx.prevPlace.find(x => x.place1 === c.place1);
    const growth = p ? growthStr(p.rev, c.rev) : "신규";
    return `  ${c.place1}: 현재 ${fmtRev(c.rev)} / 이전 ${fmtRev(p?.rev ?? 0)} / 성장률 ${growth}`;
  }).join("\n");

  return `당신은 광고 성과 데이터 분석 전문가입니다.
아래는 최근 1개월(${ctx.period.curr})과 이전 1개월(${ctx.period.prev})의 광고 데이터입니다.

[Place별 매출 현황]
${placeRows}

[앱별 매출 현황]
...

사용자의 질문에 한국어로 명확하고 구체적인 수치를 포함하여 답변하세요.`;
}
```

## tRPC 프로시저

```ts
// server/routers.ts
askAI: publicProcedure.input(z.object({
  question: z.string().min(1).max(500),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).default([]),
})).mutation(async ({ input }) => {
  const ctx = await buildAiContext();
  const systemPrompt = buildSystemPrompt(ctx);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      ...input.history,
      { role: "user", content: input.question },
    ],
  });
  return { answer: response.choices[0].message.content as string };
});
```

## 프론트엔드 채팅 UI 패턴

```tsx
// client/src/pages/AiAnalysis.tsx
const [messages, setMessages] = useState<Message[]>([]);
const askMutation = trpc.dashboard.askAI.useMutation();

const handleSend = async (question: string) => {
  // 사용자 메시지 즉시 추가
  setMessages(prev => [...prev, { role: "user", content: question }]);

  const history = messages.map(m => ({ role: m.role, content: m.content }));
  const result = await askMutation.mutateAsync({ question, history });

  // AI 응답 추가
  setMessages(prev => [...prev, { role: "assistant", content: result.answer }]);
};
```

## 추천 질문 버튼 패턴

```tsx
const SUGGESTED_QUESTIONS = [
  "최근 한 달 사이 가장 성장한 Place는 어디인가요?",
  "앱별 매출 비중 변화를 분석해주세요",
  "ADPF별 성과를 비교해주세요",
  "매출이 가장 많이 감소한 Place는 어디인가요?",
  "전체 광고 성과 요약을 해주세요",
];

// 메시지가 없을 때 추천 질문 버튼 표시
{messages.length === 0 && (
  <div className="grid grid-cols-1 gap-2">
    {SUGGESTED_QUESTIONS.map(q => (
      <button key={q} onClick={() => handleSend(q)}
              className="text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70">
        {q}
      </button>
    ))}
  </div>
)}
```

## 마크다운 렌더링

AI 응답은 `streamdown` 패키지의 `<Streamdown>` 컴포넌트로 렌더링:

```tsx
import { Streamdown } from "streamdown";
<Streamdown>{message.content}</Streamdown>
```

## 헤더에서 AI 분석 페이지 연결

```tsx
import { Link } from "wouter";
<Link href="/ai-analysis">
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30">
    <Sparkles className="w-3.5 h-3.5" /> AI 분석
  </button>
</Link>
```
