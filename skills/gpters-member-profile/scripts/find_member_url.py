#!/usr/bin/env python3
"""
GPTers 닉네임으로 멤버 프로필 URL 찾기
브라우저 자동화(Playwright/Selenium) 없이 검색 결과 페이지를 파싱하여 URL 반환.

Usage: python find_member_url.py <nickname>
Output: JSON {"nickname": "...", "url": "...", "candidates": [...]}

참고: GPTers는 Bettermode 기반으로, 검색 API가 로그인 없이 접근 불가.
따라서 이 스크립트는 브라우저 도구로 검색 드롭다운에서 URL을 추출하는
방법을 안내하는 헬퍼 역할을 합니다.
실제 URL 추출은 SKILL.md의 브라우저 단계에서 수행됩니다.
"""

import sys
import json

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python find_member_url.py <nickname>"}))
        sys.exit(1)

    nickname = sys.argv[1]
    print(json.dumps({
        "nickname": nickname,
        "instruction": (
            "GPTers 검색창에 닉네임을 입력하면 드롭다운 '멤버' 섹션에서 "
            "프로필 URL을 확인할 수 있습니다. "
            "브라우저 도구로 headlessui-portal-root 내 a[href*='member'] 링크를 추출하세요."
        ),
        "search_url": f"https://www.gpters.org/",
        "js_snippet": (
            "const portal = document.getElementById('headlessui-portal-root'); "
            "Array.from(portal.querySelectorAll('a[href*=\"member\"]'))"
            ".map(a => ({text: a.innerText.trim(), href: a.href}))"
        )
    }, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
