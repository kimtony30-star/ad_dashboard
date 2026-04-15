---
name: gpters-member-profile
description: GPTers 커뮤니티(gpters.org) 멤버의 닉네임을 입력받아 해당 멤버의 프로필 URL을 찾고, 활동 데이터를 수집·분석하여 인터랙티브 HTML 프로필 페이지를 생성하는 스킬. "닉네임으로 GPTers 프로필 만들어줘", "GPTers에서 [닉네임] 분석해줘", "GPTers 멤버 활동 시각화" 등의 요청에 사용.
---

# GPTers 멤버 프로필 생성 스킬

## 워크플로우 개요

1. **멤버 URL 탐색** — 검색창으로 닉네임 → 프로필 URL 확인
2. **프로필 페이지 수집** — 브라우저로 멤버 페이지 방문, 게시물·답변·배지 수집
3. **데이터 분석** — 수집 데이터를 JSON으로 정리 (카테고리, 월별, 스탯 등)
4. **HTML 생성** — `generate_profile_html.py`로 인터랙티브 페이지 생성
5. **결과 전달** — HTML 파일 첨부 + 웹서버 URL 제공

---

## Step 1: 멤버 URL 탐색

GPTers는 Bettermode 기반으로 공개 검색 API가 없으므로, **브라우저 검색창 드롭다운**에서 URL을 추출한다.

```
1. https://www.gpters.org/ 접속
2. 상단 검색창(input[type="search"])에 닉네임 입력 (Enter 누르지 않음)
3. 드롭다운이 열리면 Enter 키를 눌러 팝업 combobox 활성화
4. combobox에 닉네임 재입력 후 대기 (1~2초)
5. 아래 JS로 멤버 링크 추출:
```

```javascript
const portal = document.getElementById('headlessui-portal-root');
Array.from(portal.querySelectorAll('a'))
  .map(a => ({ text: a.innerText.trim().slice(0,30), href: a.href }))
  .filter(x => x.href.includes('/member/') && x.text);
```

결과에서 닉네임과 일치하는 항목의 `href`가 프로필 URL.

---

## Step 2: 프로필 페이지 수집

멤버 프로필 URL(`https://www.gpters.org/member/<id>`) 방문 후:

- **게시물 탭**: 제목, 카테고리, 날짜, 좋아요 수, 댓글 수 수집
- **답변 탭**: 답변 수 확인
- **배지**: 프로필 상단 배지 목록 수집

수집 시 주의사항:
- 무한 스크롤이 있으므로 끝까지 스크롤하여 모든 게시물 로드
- 좋아요/댓글 수는 각 게시물 카드에 숫자로 표시됨
- 날짜는 "N일 전", "N개월 전" 형식 → 현재 날짜 기준으로 역산

---

## Step 3: 데이터 JSON 정리

수집한 데이터를 아래 스키마로 JSON 파일 작성 (`/home/ubuntu/<nickname>_data.json`):

```json
{
  "name": "닉네임",
  "member_url": "https://www.gpters.org/member/<id>",
  "badges": ["배지1", "배지2"],
  "post_count": 11,
  "reply_count": 10,
  "total_likes": 27,
  "total_comments": 19,
  "activity_period": "9개월",
  "categories": {"카테고리명": 게시물수},
  "monthly_activity": {"YYYY-MM": 게시물수},
  "posts": [
    {"title": "...", "likes": 5, "comments": 3, "category": "...", "date": "YYYY-MM"}
  ],
  "tools": ["ChatGPT", "Claude", "n8n"],
  "stats": {
    "consistency": 90,
    "content_creation": 85,
    "practical_implementation": 88,
    "ai_tool_diversity": 80,
    "community_contribution": 75,
    "study_participation": 78
  },
  "summary": "한 줄 요약"
}
```

**stats 산정 기준** (0~100):
- `consistency`: 활동 기간 대비 꾸준한 게시 여부
- `content_creation`: 게시물 수 + 콘텐츠 다양성
- `practical_implementation`: 실제 결과물(앱, 자동화, 전자책 등) 포함 여부
- `ai_tool_diversity`: 사용 AI 도구 종류 수
- `community_contribution`: 좋아요 + 댓글 합계 기준
- `study_participation`: 참여 스터디 수

예시 파일: `/home/ubuntu/skills/gpters-member-profile/templates/profile_data_example.json`

---

## Step 4: HTML 생성

```bash
python /home/ubuntu/skills/gpters-member-profile/scripts/generate_profile_html.py \\
  /home/ubuntu/<nickname>_data.json \\
  /home/ubuntu/<nickname>_profile.html
```

생성되는 HTML에 포함되는 요소:
- 핵심 스탯 카드 (게시물, 답변, 좋아요, 댓글, 활동기간)
- 레이더 차트 (6가지 역량 스탯)
- 도넛 차트 (카테고리 분포)
- 바 차트 (월별 활동량)
- 수평 바 차트 (게시물별 좋아요)
- 전체 게시물 목록
- AI 도구 태그 클라우드

---

## Step 5: 결과 전달

```bash
# 웹서버 실행 (이미 실행 중이면 생략)
cd /home/ubuntu && python3 -m http.server 8080 &
```

사용자에게:
1. HTML 파일 첨부 (`/home/ubuntu/<nickname>_profile.html`)
2. 웹 URL 제공 (expose port 8080 후 `/<nickname>_profile.html`)
3. 주요 인사이트 텍스트 요약 제공
