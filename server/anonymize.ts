/**
 * 사외 발표용 익명화 모듈
 *
 * 앱 이름: OCB → A사, Syrup → B사, Olock → C사
 * 애드네트워크: 원본 이름의 알파벳 prefix + "사" 형식
 *   - 1글자 prefix로 충돌 없으면 "X사"
 *   - 충돌 시 2글자 "XY사", 그래도 충돌 시 3글자 "XYZ사"
 *   - 3글자까지도 충돌 시 "XYZ사-2", "XYZ사-3" suffix 추가
 */

// ── 앱 이름 매핑 ──────────────────────────────────────────────
export const APP_MAP: Record<string, string> = {
  ocb: "A사",
  syrup: "B사",
  olock: "C사",
  OCB: "A사",
  Syrup: "B사",
  Olock: "C사",
};

export function anonymizeApp(name: string): string {
  if (!name) return name;
  return APP_MAP[name] ?? APP_MAP[name.toLowerCase()] ?? name;
}

// ── 애드네트워크 이름 매핑 ────────────────────────────────────

/** 이름에서 알파벳만 추출하여 대문자 prefix 반환 */
function prefixOf(name: string, len: number): string {
  const clean = name.replace(/[^a-zA-Z]/g, "");
  if (!clean) return name.slice(0, len).toUpperCase();
  return clean.slice(0, len).toUpperCase();
}

/**
 * 재귀적으로 prefix 길이를 늘려가며 충돌 없는 매핑을 생성한다.
 * maxLen까지 늘려도 충돌 시 suffix 번호를 붙인다.
 */
function resolveGroup(
  names: string[],
  prefixLen: number,
  maxLen: number,
  result: Map<string, string>
): void {
  if (names.length === 1) {
    result.set(names[0], `${prefixOf(names[0], prefixLen)}사`);
    return;
  }

  // prefix 기준으로 그룹화
  const subGroups = new Map<string, string[]>();
  for (const name of names) {
    const p = prefixOf(name, prefixLen);
    const g = subGroups.get(p) ?? [];
    g.push(name);
    subGroups.set(p, g);
  }

  Array.from(subGroups.entries()).forEach(([p, group]) => {
    if (group.length === 1) {
      // 충돌 없음 → 확정
      result.set(group[0], `${p}사`);
    } else if (prefixLen < maxLen) {
      // 더 긴 prefix로 재시도
      resolveGroup(group, prefixLen + 1, maxLen, result);
    } else {
      // maxLen에서도 충돌 → suffix 번호 부여
      group.forEach((name: string, idx: number) => {
        result.set(name, idx === 0 ? `${p}사` : `${p}사-${idx + 1}`);
      });
    }
  });
}

export function buildNetworkAnonMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  resolveGroup(names, 1, 4, map); // 최대 4글자까지 확장
  return map;
}

// ── 싱글턴 캐시 (서버 기동 후 최초 1회 빌드) ─────────────────
let _networkMap: Map<string, string> | null = null;

export function setNetworkAnonMap(names: string[]): void {
  _networkMap = buildNetworkAnonMap(names);
}

export function anonymizeNetwork(name: string): string {
  if (!name) return name;
  if (!_networkMap) return name;
  return _networkMap.get(name) ?? name;
}

export function getNetworkAnonMap(): Map<string, string> | null {
  return _networkMap;
}

/** 익명화 모드 여부 (환경변수 ANON_MODE=true 로 제어) */
export function isAnonMode(): boolean {
  return process.env.ANON_MODE === "true";
}
