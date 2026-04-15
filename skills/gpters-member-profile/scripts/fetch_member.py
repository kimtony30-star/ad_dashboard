#!/usr/bin/env python3
"""
GPTers 멤버 프로필 수집 스크립트
Usage: python fetch_member.py <member_url> <output_json>
  member_url: https://www.gpters.org/member/<id>
  output_json: 결과를 저장할 JSON 파일 경로
"""

import sys
import json
import re
import time
from urllib.request import urlopen, Request
from urllib.error import URLError
from html.parser import HTMLParser

def fetch_page(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='replace')

def extract_json_data(html):
    """__BM_DATA__ 또는 window.__INITIAL_STATE__ 등에서 데이터 추출"""
    patterns = [
        r"window\['__BM_DATA__'\]\s*=\s*(\{.*?\});",
        r'__BM_DATA__\s*=\s*(\{.*?\});',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return {}

def parse_member_info(html, member_url):
    """HTML에서 멤버 기본 정보 추출"""
    info = {
        'url': member_url,
        'name': '',
        'badges': [],
        'posts': [],
        'post_count': 0,
        'reply_count': 0,
    }

    # 이름 추출
    name_patterns = [
        r'<h1[^>]*>([^<]+)</h1>',
        r'"name"\s*:\s*"([^"]+)"',
        r'<title>([^|<]+)',
    ]
    for pat in name_patterns:
        m = re.search(pat, html)
        if m:
            name = m.group(1).strip()
            if name and name != '지피터스 GPTers':
                info['name'] = name
                break

    # 배지 추출
    badge_pattern = r'(?:badge|Badge|역할|role)[^>]*>([^<]{2,30})</(?:span|div|p)'
    badges = re.findall(badge_pattern, html)
    info['badges'] = list(set([b.strip() for b in badges if b.strip()]))[:10]

    # 게시물 제목 추출 (og:title, h2, h3 등)
    post_titles = re.findall(r'<(?:h[23]|a)[^>]*>([^<]{10,100})</(?:h[23]|a)>', html)
    info['posts'] = list(dict.fromkeys([t.strip() for t in post_titles if len(t.strip()) > 10]))[:30]
    info['post_count'] = len(info['posts'])

    return info

def main():
    if len(sys.argv) < 3:
        print("Usage: python fetch_member.py <member_url> <output_json>")
        sys.exit(1)

    member_url = sys.argv[1]
    output_path = sys.argv[2]

    print(f"[fetch_member] Fetching: {member_url}")
    try:
        html = fetch_page(member_url)
    except URLError as e:
        print(f"[fetch_member] Error fetching page: {e}")
        sys.exit(1)

    bm_data = extract_json_data(html)
    member_info = parse_member_info(html, member_url)

    # BM_DATA에서 추가 정보 보완
    if bm_data:
        member_info['_bm_keys'] = list(bm_data.keys())[:20]

    result = {
        'member_url': member_url,
        'member_id': member_url.rstrip('/').split('/')[-1],
        'info': member_info,
        'html_length': len(html),
        'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[fetch_member] Saved to {output_path}")
    print(f"[fetch_member] Name: {member_info['name']}")
    print(f"[fetch_member] Posts found: {member_info['post_count']}")

if __name__ == '__main__':
    main()
