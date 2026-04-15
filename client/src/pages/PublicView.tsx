/**
 * PublicView.tsx
 * /public 경로에서 접근 시:
 * 1. public_mode 쿠키를 설정하여 익명화 모드 강제 ON
 * 2. Home 컴포넌트를 그대로 렌더링 (익명화된 대시보드)
 *
 * 쿠키는 서버의 context.ts에서 읽혀 isPublicMode=true로 처리됨
 */
import { useEffect, useState } from "react";
import Home from "./Home";

export default function PublicView() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // public_mode 쿠키 설정 (1년 만료, SameSite=Lax)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `public_mode=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-teal-400 text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  return <Home />;
}
