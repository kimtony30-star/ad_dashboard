# 광고통계 대시보드 - 개발 로그

AI 코딩 도구(Manus)와 함께 진행한 개발 작업 기록입니다.

---

## 2026-03-27 (Day 1)

### 1. 광고통계 대시보드 초기 구축

```
광고통계 대시보드 만들어줘.
CSV 업로드 방식으로 데이터를 넣고,
앱별(OCB, Syrup, Olock), ADPF·네트워크별, 뉴스 섹션 탭으로 구성해줘.
```

**Manus 작업:**
- React 19 + Tailwind 4 + Express + tRPC 풀스택 프로젝트 초기화
- `drizzle/schema.ts` — ad_stats 테이블 설계 (날짜, 앱, ADPF, 네트워크, 매출, 노출 등)
- `server/dashboardDb.ts` — 날짜별·앱별·네트워크별 집계 쿼리 헬퍼
- `client/src/components/CsvUploader.tsx` — CSV 드래그&드롭 업로드 컴포넌트
- `client/src/components/Section1Apps.tsx` — 앱별 성과 섹션 (OCB·Syrup·Olock KPI 카드 + 일별 추이 차트)
- `client/src/components/Section2Adpf.tsx` — ADPF·네트워크별 섹션
- `client/src/components/Section3News.tsx` — 뉴스 섹션 (Place1 포함)
- `client/src/pages/Home.tsx` — 탭 기반 대시보드 메인 페이지
- 날짜 범위 슬라이더로 기간 필터링 기능 구현

---

## 2026-03-28 (Day 2)

### 2. CSV 업로드 파일 선택 버튼 버그 수정

```
CSV업로드 방식이 폴더를 열고 파일을 선택하는 방식은 작동하지 않고,
파일을 drag&drop 하는 방식만 작동하네. 확인해줘.
```

**Manus 작업:**
- 버그 원인 파악: 드롭존 클릭 시 OS 파일 피커가 열리면서 `mousedown` 이벤트 발생 → 외부 클릭 감지 핸들러가 패널을 닫아버림
- `client/src/pages/Home.tsx` — `isFilePickerOpen` 상태 추가, 파일 피커 열림 중 외부 클릭 감지 비활성화로 수정

---

### 3. 3/1~3/15 데이터 누락 원인 분석 및 재적재

```
CSV업로드한 3/1 - 3/15 data 가 일평균 보다 낮아서 전체 data가 안들어간것으로 생각되네.
여기에 첨부한 자료와 비교해서 data 업데이트해주고, 원인 알려줘.
```

**Manus 작업:**
- CSV 91,362행 vs DB 10,000행 비교 분석 → PADNW 데이터 74,071행 전체 누락 확인
- 근본 원인 파악: CSV 파서가 단순 `split(',')` 방식 사용 → `Unit_Name` 컬럼에 쉼표가 포함된 행(예: `"inavi_housead,adx_cash_01"`)에서 컬럼이 밀려 DB 오류 발생, 배치 롤백
- `server/routers.ts` — CSV 파서를 RFC 4180 표준 파싱(따옴표 내 쉼표 처리)으로 교체
- `drizzle/schema.ts` — `unitId` 컬럼 길이 256 → 512 확장
- DB 3/1~3/15 데이터 삭제 후 91,362행 전량 재적재

---

### 4. 뉴스 섹션 애드네트워크별 매출/Imp/CPM 추가

```
뉴스 섹션에서 애드네트워크별 매출, Imp, CPM 보여줘.
```

**Manus 작업:**
- `server/dashboardDb.ts` — 뉴스 섹션 네트워크별 집계 함수 추가
- `server/routers.ts` — `sec3_network` 데이터 API에 포함
- `client/src/lib/dashboardTypes.ts` — `sec3_network` 타입 추가
- `client/src/components/Section3News.tsx` — 애드네트워크별 매출·Imp·CPM 테이블 + 바차트 추가

---

### 5. 매출 포맷 및 뉴스 섹션 앱별 분리

```
매출은 소숫점 이상만 보여주고, 뉴스 섹션 애드네트워크별 데이타는 OCB, syrup, olock 앱별로 구분해서 보여줘.
그리고 애드네트워크 이름이 안보이는 경우가 있는 데 색상 확인해줘.
```

**Manus 작업:**
- `client/src/lib/dashboardTypes.ts` — `formatRevenue` 함수 소수점 제거 (정수 표시)
- `server/dashboardDb.ts` — 앱별 뉴스 네트워크 집계 함수 추가
- `client/src/components/Section3News.tsx` — 전체/OCB/Syrup/Olock 앱 탭 추가, 텍스트 색상 `text-white`로 개선

---

### 6. 매출 단위별 소수점 포맷 세분화

```
매출 단위가 B인 경우에는 소숫점 2자리까지 보여주고, M인 경우는 소솟점 보여주지마.
```

**Manus 작업:**
- `client/src/lib/dashboardTypes.ts` — `formatRevenue` 함수: B 단위 소수점 2자리, M 단위 정수 표시로 분기 처리

---

## 2026-03-29 (Day 3)

### 7. Insight 게시판 구현

```
전체기간, 최근 1개월, 최근 1주에 특이할 만한 매출, Impression 변화를 3가지 선정해서 Insight 게시판에서 보여줘.
```

**Manus 작업:**
- `server/insightDb.ts` — 기간별 일별 집계 쿼리 헬퍼
- `server/insightAnalyzer.ts` — 6가지 이상 탐지 알고리즘 구현 (Z-score, 기간 비교, 앱/ADPF 점유율 변화, CPM 변화, 전체기간 최고/최저일)
- `server/routers.ts` — 인사이트 분석 API 추가
- `client/src/pages/Insights.tsx` — 전체기간·최근 1개월·최근 1주 기간 요약 카드 + 상위 3개 인사이트 카드 + 바차트 구현
- `client/src/pages/Home.tsx` — 헤더에 Insight 버튼 추가

---

### 8. 인사이트 히스토리 기능 추가

```
인사이트 히스토리 기능을 추가해서, 날짜별로 인사이트 변화를 추적하고 비교할 수 있게 만들어줘.
```

**Manus 작업:**
- `drizzle/schema.ts` — `insight_history` 테이블 추가 및 마이그레이션
- `server/insightHistoryDb.ts` — 스냅샷 저장·조회·비교 DB 헬퍼
- `server/routers.ts` — 저장/목록/단건/비교 4개 API 추가
- `client/src/pages/Insights.tsx` — 히스토리 탭 추가 (스냅샷 목록, 2개 선택 시 비교 패널)

---

### 9. CSV 업로드 시 자동 인사이트 스냅샷 저장

```
업로드된 CSV 데이터를 기반으로 자동으로 인사이트 스냅샷을 저장하는 기능을 추가해 줘.
```

**Manus 작업:**
- `server/routers.ts` — `uploadCsv`(소용량)·`uploadCsvChunk`(대용량 마지막 청크) 완료 시 자동 인사이트 분석 및 스냅샷 저장 로직 추가
- `client/src/pages/Home.tsx` — 업로드 완료 토스트에 "인사이트 스냅샷 자동 저장됨" 알림 추가

---

### 10. 사외 발표용 익명화 기능

```
지금 만든 대시보드를 사외 발표용으로 만들어줘.
ocb는 A, syrup은 B, olock은 C 로 바꿔주고,
애드네트워크 이름은 etms는 e사 이렇게 바꿔주는데 만약 중복이되면 중복이 되지 않도록 만들어줘.
```

**Manus 작업:**
- `server/anonymize.ts` — DB 전체 네트워크 69개 이름을 prefix+"사" 방식으로 자동 매핑 (3글자까지 재귀 확장으로 중복 0개 보장)
- `server/routers.ts` — 모든 API 응답에 익명화 적용 (앱명·네트워크명)
- `client/src/pages/Home.tsx` — 헤더에 익명화 ON/OFF 토글 버튼 추가
- `client/src/components/Section1Apps.tsx` — 앱 이름 하드코딩 제거, 서버 응답 기반으로 변경

---

## 커밋 히스토리

| 날짜 | 버전 | 설명 |
|------|------|------|
| 03/27 | `d788fe38` | 광고통계 대시보드 초기 구축 |
| 03/28 | `ab59264c` | CSV 업로드 파일 선택 버튼 클릭 버그 수정 |
| 03/28 | `2070a766` | 3/1~3/15 데이터 재적재 및 CSV 파서 버그 수정 |
| 03/28 | `951114fe` | 뉴스 섹션 애드네트워크별 매출/Imp/CPM 추가 |
| 03/28 | `29b8d4f3` | 매출 소수점 제거, 뉴스 섹션 앱별 네트워크 탭, 텍스트 색상 개선 |
| 03/28 | `b154a08a` | formatRevenue B 단위 소수점 2자리, M 단위 정수 표시 |
| 03/29 | `26628530` | Insight 게시판 구현 완료 |
| 03/29 | `2411bf73` | 인사이트 히스토리 기능 구현 완료 |
| 03/29 | `9565f900` | CSV 업로드 완료 시 자동 인사이트 스냅샷 저장 기능 추가 |
| 03/29 | `17abbb53` | 사외 발표용 익명화 기능 구현 완료 |

---

## 기술 스택

- **Frontend**: React 19, Tailwind CSS 4, Recharts, shadcn/ui
- **Backend**: Express 4, tRPC 11, Drizzle ORM
- **Database**: MySQL (TiDB)
- **Language**: TypeScript
- **Deployment**: Manus 플랫폼 (adstatsdash-redy7nuc.manus.space)

---

## 주요 기능

1. **CSV 업로드 & 파싱**
   - 드래그&드롭 및 파일 선택 버튼 방식 지원
   - RFC 4180 표준 파싱 (쉼표 포함 필드 정확 처리)
   - 대용량 파일 청크 분할 업로드

2. **앱별 성과 대시보드**
   - OCB·Syrup·Olock KPI 카드 (매출·노출)
   - 일별 Confirmed Revenue 추이 라인차트
   - 날짜 범위 슬라이더 필터링

3. **ADPF·네트워크별 분석**
   - 3rd Party / PADNW 분류별 매출·노출 비교
   - 네트워크별 CPM 랭킹

4. **뉴스 섹션 분석**
   - Place1 포함 뉴스 지면 성과
   - 앱별(OCB/Syrup/Olock) 애드네트워크 매출·Imp·CPM 테이블 + 바차트

5. **Insight 게시판**
   - 전체기간·최근 1개월·최근 1주 자동 이상 탐지 (Z-score, 기간 비교 등 6가지 알고리즘)
   - 상위 3개 인사이트 카드 + 바차트

6. **인사이트 히스토리**
   - CSV 업로드 완료 시 자동 스냅샷 저장
   - 날짜별 스냅샷 목록 조회
   - 2개 스냅샷 선택 시 기간별 매출·노출 변화율 비교

7. **사외 발표용 익명화 모드**
   - 헤더 토글 버튼으로 ON/OFF 즉시 전환
   - 앱명 (OCB→A사, Syrup→B사, Olock→C사)
   - 애드네트워크 69개 자동 익명화 (중복 없는 prefix+"사" 방식)
