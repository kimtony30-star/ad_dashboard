---
name: ad-dashboard-public-mode
description: 광고통계 대시보드의 사외 공유용 익명화 공개 모드 구현 스킬. /public URL에서 앱명·네트워크명을 익명화하여 보여주고, 업로드/편집 UI를 숨기는 기능을 다룬다. "사외 공유 URL 만들어줘", "앱 이름 익명화", "외부 공유용 대시보드", "네트워크 이름 숨기기" 등의 요청에 사용.
---

# Ad Dashboard Public Mode

사외 발표·공유용 익명화 공개 모드 구현 스킬. `/public` 라우트에서 쿠키를 설정하여 동일한 대시보드 UI를 익명화된 이름으로 표시한다.

## 공개 모드 동작 방식

```
/public 접속
    ↓
PublicView.tsx: document.cookie에 public_mode=true 설정 (1년 유효)
    ↓
Home.tsx 렌더링 (동일 컴포넌트)
    ↓
서버: isAnonMode() → true → 앱명/네트워크명 익명화 적용
    ↓
업로드 버튼, 업로드이력, 익명화 토글 버튼 숨김
```

## PublicView 페이지

```tsx
// client/src/pages/PublicView.tsx
export default function PublicView() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 쿠키 설정 (1년)
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `public_mode=true; expires=${expires}; path=/`;
    setReady(true);
  }, []);

  if (!ready) return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
    <div className="text-white/40 text-sm">로딩 중...</div>
  </div>;

  return <Home />;
}
```

## 익명화 모듈 (server/anonymize.ts)

```ts
// 앱 이름 고정 매핑
export const APP_MAP: Record<string, string> = {
  ocb: "A사", syrup: "B사", olock: "C사",
  OCB: "A사", Syrup: "B사", Olock: "C사",
};
export function anonymizeApp(name: string): string {
  return APP_MAP[name] ?? APP_MAP[name.toLowerCase()] ?? name;
}

// 애드네트워크: 알파벳 prefix + "사" (충돌 시 길이 증가)
export function buildNetworkAnonMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  resolveGroup(names, 1, 4, map); // 최대 4글자까지 확장
  return map;
}

// 익명화 모드 여부 (쿠키 기반)
export function isAnonMode(): boolean {
  return process.env.ANON_MODE === "true";
}
```

## 서버에서 익명화 적용 패턴

```ts
// server/routers.ts - getData 프로시저
getData: publicProcedure.query(async ({ ctx }) => {
  // 쿠키에서 public_mode 확인
  const isPublic = ctx.cookies?.public_mode === "true";

  const raw = await getDashboardData();

  if (isPublic) {
    // 앱명 익명화
    raw.sec1_line.series = raw.sec1_line.series.map(s => ({
      ...s, app: anonymizeApp(s.app)
    }));
    // 네트워크명 익명화 (최초 1회 맵 빌드)
    const allNetworks = extractAllNetworkNames(raw);
    setNetworkAnonMap(allNetworks);
    raw.sec2_network = raw.sec2_network.map(adpf => ({
      ...adpf,
      networks: adpf.networks.map(n => ({ ...n, name: anonymizeNetwork(n.name) }))
    }));
  }

  return raw;
});
```

## 프론트엔드 공개 모드 감지 패턴

```tsx
// client/src/pages/Home.tsx
const isPublicMode = document.cookie.includes("public_mode=true");

// 공개 모드에서 숨길 UI 요소들
{!isPublicMode && (
  <>
    <UploadButton />
    <UploadHistoryButton />
    <AnonToggleButton />
  </>
)}
```

## 라우트 등록

```tsx
// client/src/App.tsx
import PublicView from "@/pages/PublicView";
<Route path="/public" component={PublicView} />
```

## 네트워크 익명화 알고리즘

알파벳 prefix를 1글자부터 시작하여 충돌 시 길이를 늘린다:

```
"Google AdMob" → "G사"
"Google DFP"   → "GO사" (G사 충돌 시 2글자)
"Meta Audience Network" → "M사"
"MoPub"        → "MO사" (M사 충돌 시 2글자)
```

비알파벳 문자는 제거 후 prefix 추출. 3글자까지 충돌 시 `"XYZ사-2"` 형식으로 suffix 번호 부여.

## 주의사항

- 공개 모드 쿠키는 클라이언트에서만 설정되므로 서버 측 쿠키 파싱이 필요하다.
- 서버에서 `ctx.cookies` 접근은 `server/_core/context.ts`의 쿠키 파싱 로직에 의존한다.
- 익명화 맵은 서버 기동 후 최초 요청 시 1회 빌드되어 싱글턴으로 캐시된다.
- AI 분석 채팅(`/ai-analysis`)에서는 공개 모드 여부와 무관하게 실제 데이터를 사용하므로, 공개 URL에서 AI 분석 버튼을 숨기는 것을 권장한다.
