# -*- coding: utf-8 -*-
"""card-gorilla 첫 페이지 데이터 수집 검증 (Scrapling 사용)"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from scrapling.fetchers import Fetcher

API = "https://api.card-gorilla.com/v1/cards"
HEADERS = {
    "Accept": "application/json",
    "Referer": "https://www.card-gorilla.com/card?cate=CRD",
    "Origin": "https://www.card-gorilla.com",
}

params = {"cate": "CRD", "p": 1, "perPage": 30, "sort": "ranking"}

# Scrapling Fetcher: 브라우저 TLS 지문 위장(impersonate)으로 안정적 요청
resp = Fetcher.get(API, params=params, headers=HEADERS,
                   impersonate="chrome", stealthy_headers=True)
print("HTTP status:", resp.status)

payload = json.loads(resp.body) if hasattr(resp, "body") else resp.json
if isinstance(payload, str):
    payload = json.loads(payload)

total = payload["total"]
data = payload["data"]
print("전체 카드 수(total):", total, "| 이번 페이지 수신:", len(data))
print("=" * 70)

def fee(s):
    return (s or "").replace("\n", " ")

for it in data[:5]:
    tb = it.get("top_benefit") or []
    benefits = " / ".join(
        f"{b.get('title','')}:{' '.join(b.get('tags',[]))}".strip() for b in tb[:3]
    )
    print("카드명     :", it["name"])
    print("카드사     :", it["corp"]["name"])
    print("연회비     :", fee(it["annual_fee_basic"]))
    print("전월실적   :", f"{it['pre_month_money']:,}원" if it.get("pre_month_money") else "없음")
    print("주요혜택   :", benefits)
    print("-" * 70)
