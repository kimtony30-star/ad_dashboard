# 광고통계 대시보드 (Antigravity) - 개발 로그

AI 코딩 도구(Antigravity)와 함께 진행한 부분만 발췌한 개발 작업 기록입니다.

---

## 2026-04-02 (Day 1)

### 1. Antigravity 플랫폼으로 프로젝트 마이그레이션

```text
[추정] 기존 Manus 환경에서 개발하던 광고통계 대시보드를 Antigravity 플랫폼으로 마이그레이션해줘. 기존 코드베이스를 분석하고 환경을 세팅해줘.
```

**Antigravity 작업:**
- 기존 코드베이스 구조 및 의존성 분석
- Antigravity 에코시스템 및 로컬 환경에 맞게 대시보드 구동/빌드 설정 구성

---

## 2026-04-08 (Day 2)

### 2. SQLite 기반 백엔드 변환 및 다크 테마 UI 구축

```text
[추정] 백엔드 데이터베이스를 SQLite와 Drizzle ORM으로 구축하고, 대용량 파일을 위해 청크 단위 CSV 업로드 파이프라인을 만들어줘. 프런트엔드는 Tailwind CSS를 사용해 다크 테마로 레이아웃을 잡아줘.
```

**Antigravity 작업:**
- `drizzle` ORM을 사용하여 SQLite 기반 `ad_stats` 테이블 구조 등 백엔드 스키마 전면 수정 (`dev.db` 생성)
- 대용량 CSV 파일을 끊김 없이 처리하기 위한 청크(Chunk) 기반 분할 업로드 파이프라인(`uploadCsvChunk`) 로직 신규 구현
- Tailwind CSS 토큰을 활용하여 모던한 다크 테마 기반의 대시보드 UI 및 컴포넌트 레이아웃 구성

---

### 3. CSV 데이터 인제스천 오류 (NOT NULL Constraint) 해결

```text
[추정] SQLite로 변환 후 CSV 파일 업로드를 테스트해보니 데이터 적재가 실패해. uploadedAt 필드에 NOT NULL 제약 조건 에러가 발생하는데, 원인을 파악하고 고쳐줘.
```

**Antigravity 작업:**
- CSV 인제스천 및 파싱 단계에서 `uploadedAt` 필드 매핑이 누락되는 원인 디버깅
- `server/routers.ts` 내부의 데이터 검증 및 기본값 삽입 로직 보완 (NOT NULL 제약조건 우회 및 동적 시간 할당)
- 수정된 로직을 바탕으로 광고 상태 데이터 전체를 SQLite DB에 성공적으로 적재

---

### 4. CSV 업로드 컴포넌트(UI)와 통신 API 연결 버그 픽스

```text
[추정] 프런트엔드 대시보드 파일 선택 버튼을 눌러도 CSV 업로드가 작동하지 않아. Home.tsx의 CsvUploader와 백엔드 tRPC mutation 간 연결을 확인해줘.
```

**Antigravity 작업:**
- `client/src/pages/Home.tsx`의 `CsvUploader` 기능 점검
- 프런트엔드와 `server/routers.ts`의 `uploadCsvChunk` 간의 tRPC 요청 파라미터 불일치 및 이벤트 캡처 오류 디버깅
- 파일 청크 파싱과 백엔드 데이터베이스 영속화(persistence) 간 통신 복구 완료

---

## 커밋 히스토리

| 날짜 | 커밋(추정) | 설명 |
|------|------|------|
| 04/02 | `ag-001` | 프로젝트 분석 및 Antigravity 에코시스템 마이그레이션 |
| 04/08 | `ag-002` | SQLite 마이그레이션, 청크 업로더 및 다크 테마 UI 세팅 |
| 04/08 | `ag-003` | NOT NULL 제약조건 버그 픽스 및 데이터 적재 복구 |
| 04/08 | `ag-004` | CsvUploader 프론트엔드 통신 오류 패치 완료 |

---

## 기술 스택

- **Frontend**: React 19, Tailwind CSS 4 (Dark Theme), Recharts
- **Backend**: Express 4, tRPC 11, Drizzle ORM
- **Database**: SQLite (local)
- **Deployment**: Antigravity Local Environment

---

## 주요 기능 (Antigravity에서 개발된 항목)

1. **차세대 CSV 청크 분할 업로드 パ이프라인**
   - 파일 크기가 커도 서버 셧다운 없이 처리하는 분할 업로드
2. **SQLite 기반 경량화 백엔드**
   - 외부 DB 없이 로컬 인프라만으로 독립적 운용이 가능하도록 경량화
3. **모던 다크 테마 UI 컴포넌트**
   - 시인성이 우수하고 트렌디한 다크 테마 CSS 레이아웃
