# CSV 컬럼 → DB 컬럼 매핑 규칙

## 표준 컬럼 매핑

| CSV 헤더 (예시) | DB 컬럼 | 타입 | 비고 |
|---|---|---|---|
| Date / 날짜 | date | DATE | YYYY-MM-DD 정규화 |
| App / 앱 | app | VARCHAR(64) | 소문자 정규화 |
| ADPF | adpf | VARCHAR(64) | "3rd Party" / "PADNW" |
| Ad Network 1 | adnetwork1 | VARCHAR(128) | |
| Ad Network 2 | adnetwork2 | VARCHAR(128) | |
| Unit ID | unitId | VARCHAR(512) | |
| Unit Name | unitName | VARCHAR(256) | |
| Creative Type | creativeType | VARCHAR(64) | |
| Place 1 | place1 | VARCHAR(128) | |
| Place 2 | place2 | VARCHAR(128) | |
| Place 3 | place3 | VARCHAR(128) | |
| Requests | requests | BIGINT | 정수 변환 |
| Fills | fills | BIGINT | 정수 변환 |
| Impressions / 노출 | impressions | BIGINT | 정수 변환 |
| Clicks / 클릭 | clicks | BIGINT | 정수 변환 |
| Estimated Revenue | estimatedRevenue | DECIMAL(18,4) | 소수점 4자리 |
| Confirmed Revenue / 확정매출 | confirmedRevenue | DECIMAL(18,4) | 소수점 4자리 |
| Currency | currency | VARCHAR(8) | "KRW" 등 |

## 날짜 정규화 규칙

- `YYYY-MM-DD` 형식이 아닌 경우 `new Date(raw).toISOString().slice(0,10)` 으로 변환
- year/month/day 컬럼은 date에서 자동 파생: `new Date(date).getUTCFullYear()` 등

## 헤더 감지 전략

CSV 첫 행을 읽어 컬럼명을 소문자+공백제거 후 매핑. 알 수 없는 컬럼은 무시.
