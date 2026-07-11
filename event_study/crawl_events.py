# -*- coding: utf-8 -*-
"""card-gorilla 캐시백/이벤트 전체 크롤링 + 카드사 복원 + 정리.

출처: https://www.card-gorilla.com/event  (Vue SPA가 호출하는 공식 API)
API : https://api.card-gorilla.com:8080/v1/events
  -> {total, date, data:[ 이벤트... ]}  각 이벤트에 상세(detail HTML) 포함

카드사(company) 복원:
  card-gorilla 원본은 corp_name 이 '트래블/JCB/ALPHABET/추가캐시백' 처럼
  실제 카드사가 아닌 '기획전 그룹'인 경우가 많다. 그대로 쓰면 절반이 '기타'로 샌다.
  아래 우선순위로 실제 발급 카드사를 복원한다.
    1) corp_idx 가 실제 카드사 ID(REAL_CORP)면 그 카드사
    2) card_idxs 로 카드 상세 API 조회 → 발급 카드사
    3) 제목/부제의 카드사 별칭·브랜드명 매칭
    4) corp_name 이 JCB 등 실제 브랜드명이면 유지
    5) 상세 본문에서 카드사 언급 빈도 최다값
  전부 실패하면 company=None (사실상 없음).

산출:
  event_study/cashback_events.json  전체(상세 HTML/텍스트/이미지 포함, 분석용)
  ../cashback_events.json           프로덕션(상세 HTML 제외, index.html 이 fetch)
  event_study/cashback_events.csv   요약(엑셀용, UTF-8 BOM)
"""
import io, sys, os, re, csv, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import requests
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = "https://api.card-gorilla.com:8080/v1/events"
CARD_API = "https://api.card-gorilla.com:8080/v1/cards/{}"
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json",
     "Referer": "https://www.card-gorilla.com/event", "Origin": "https://www.card-gorilla.com"}

# ── 카드사 복원 규칙 ──────────────────────────────────────────────
# corp_idx(안정적 카드사 ID) → 정규화된 카드사명 (실제 카드사만)
REAL_CORP = {1: "삼성카드", 2: "신한카드", 3: "KB국민카드", 4: "롯데카드", 5: "우리카드",
             7: "현대카드", 8: "하나카드", 9: "NH농협카드", 10: "IBK기업은행카드", 32: "BC바로카드"}
# card 상세 API가 돌려주는 corp.name → 정규화
NORM = {"BC 바로카드": "BC바로카드", "IBK기업은행": "IBK기업은행카드", "비씨카드": "BC바로카드"}
# 테스트/등록용 노이즈 corp_idx (버림)
DROP_CORP = {67}  # '이벤트 등록용' (팝업구조 TEST 등)

# 제목/부제 → 카드사 (별칭)
ALIAS = [("삼성카드", "삼성카드"), ("삼성", "삼성카드"), ("신한", "신한카드"), ("현대카드", "현대카드"),
         ("KB국민", "KB국민카드"), ("국민카드", "KB국민카드"), ("롯데", "롯데카드"),
         ("농협", "NH농협카드"), ("NH", "NH농협카드"), ("우리카드", "우리카드"), ("하나카드", "하나카드"),
         ("BC 바로", "BC바로카드"), ("비씨", "BC바로카드"), ("바로카드", "BC바로카드"),
         ("기업은행", "IBK기업은행카드"), ("IBK", "IBK기업은행카드"),
         ("씨티", "씨티카드"), ("카카오뱅크", "카카오뱅크"), ("토스", "토스뱅크"), ("케이뱅크", "케이뱅크")]
# 카드사명이 안 드러나는 상품/브랜드명 → 카드사
BRAND = [("알파벳", "현대카드"), ("ALPHABET", "현대카드"), ("the Green", "현대카드"), ("the Pink", "현대카드"),
         ("the Orange", "현대카드"), ("the First", "현대카드"), ("대한항공카드", "현대카드"),
         ("American Express", "현대카드"), ("아메리칸", "현대카드"),
         ("THE iD", "삼성카드"), ("taptap", "삼성카드"), ("모니모", "삼성카드"),
         ("LOCA", "롯데카드"), ("로카", "롯데카드"),
         ("올바른", "NH농협카드"), ("zgm", "NH농협카드"), ("별다줄", "NH농협카드"), ("채움", "NH농협카드"),
         ("Mr.Life", "신한카드"), ("Globus", "신한카드"), ("Haru", "신한카드"),
         ("Point Plan", "신한카드"), ("Discount Plan", "신한카드"), ("Deep Dream", "신한카드"),
         ("굿데이", "우리카드"), ("카드의정석", "우리카드"),
         ("I-ALL", "IBK기업은행카드"), ("I-PET", "IBK기업은행카드"), ("IBK포인트", "IBK기업은행카드")]
# 실제 카드사가 아니지만 유지할 브랜드 그룹 (기타 아님)
KEEP_BRAND = {"JCB": "JCB"}
# 상세 본문 빈도 폴백용
DETAIL_PATS = {"삼성카드": ["삼성"], "신한카드": ["신한"], "현대카드": ["현대카드", "알파벳"],
               "KB국민카드": ["KB국민", "국민카드"], "롯데카드": ["롯데", "LOCA"],
               "NH농협카드": ["농협", "올바른"], "우리카드": ["우리카드", "카드의정석"],
               "하나카드": ["하나카드"], "BC바로카드": ["BC 바로", "비씨", "바로카드"],
               "IBK기업은행카드": ["IBK", "기업은행", "I-ALL", "I-PET"]}

_card_cache = {}


def strip_html(h):
    h = re.sub(r"<!--.*?-->", "", h or "", flags=re.S)
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", h, flags=re.S | re.I)
    h = re.sub(r"<br\s*/?>", "\n", h)
    h = re.sub(r"</(p|div|li|tr|h\d)>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    h = re.sub(r"&nbsp;", " ", h).replace("&amp;", "&")
    h = re.sub(r"[ \t]+", " ", h)
    h = re.sub(r"\n\s*\n+", "\n", h)
    return h.strip()


def imgs(h):
    return re.findall(r'<img[^>]+src="([^"]+)"', h or "")


def card_corp(cid):
    """card_idxs → 발급 카드사명."""
    if cid in _card_cache:
        return _card_cache[cid]
    name = None
    try:
        d = requests.get(CARD_API.format(cid), headers=H, timeout=15).json()
        d = d.get("data", d)
        name = (d.get("corp") or {}).get("name")
    except Exception:
        name = None
    name = NORM.get(name, name)
    _card_cache[cid] = name
    return name


def by_text(t):
    t = t or ""
    for a, n in ALIAS:
        if a in t:
            return n
    for a, n in BRAND:
        if a in t:
            return n
    return None


def by_detail(detail_text):
    cnt = Counter()
    for co, pats in DETAIL_PATS.items():
        for p in pats:
            cnt[co] += detail_text.count(p)
    cnt = Counter({k: v for k, v in cnt.items() if v})
    return cnt.most_common(1)[0][0] if cnt else None


def resolve_company(e, detail_text):
    """이벤트 → 실제 카드사명(복원). 실패 시 None."""
    ci = e.get("corp_idx")
    if ci in REAL_CORP:
        return REAL_CORP[ci]
    cids = e.get("card_idxs") or []
    if isinstance(cids, list) and cids:
        c = card_corp(cids[0])
        if c:
            return c
    c = by_text((e.get("title") or "") + " " + (e.get("subject") or ""))
    if c:
        return c
    if e.get("corp_name") in KEEP_BRAND:
        return KEEP_BRAND[e["corp_name"]]
    return by_detail(detail_text)


def main():
    r = requests.get(API, headers=H, timeout=30)
    r.raise_for_status()
    j = r.json()
    events = j.get("data", [])
    print(f"수집 이벤트: {len(events)}건 (기준일 {j.get('date')})")

    rows = []
    dropped = 0
    for e in events:
        if e.get("corp_idx") in DROP_CORP:
            dropped += 1
            continue
        detail_html = e.get("detail") or ""
        detail_text = strip_html(detail_html)
        company = resolve_company(e, detail_text)
        cids = e.get("card_idxs")
        cids = cids if isinstance(cids, list) else []
        rows.append({
            "idx": e.get("idx"),
            "type": e.get("type_txt"),                 # 캐시백 등
            "company": company,                        # ★ 복원한 실제 카드사
            "corp_name": e.get("corp_name"),           # 원본 그룹명(트래블/JCB 등)
            "card_idxs": cids,                         # ★ 이벤트 대상 카드 idx(우리 카드 DB 연결용)
            "title": e.get("title"),
            "subject": e.get("subject"),
            "start": e.get("evt_start_time"),
            "end": e.get("evt_end_time"),
            "is_live": e.get("is_live"),
            "status": e.get("evt_status_txt"),
            "event_url": e.get("event_url"),
            "detail_url": f"https://www.card-gorilla.com/event/detail/{e.get('eid')}",
            "logo_img": (e.get("logo_img") or {}).get("url"),
            "detail_text": detail_text,
            "detail_images": imgs(detail_html),
            "detail_html": detail_html,
        })

    unresolved = [x for x in rows if not x["company"]]
    print(f"정리: {len(rows)}건 (노이즈 {dropped}건 제외) / 카드사 미복원 {len(unresolved)}건")
    print("카드사 분포:", dict(Counter(x["company"] for x in rows).most_common()))
    if unresolved:
        for x in unresolved:
            print("  [미복원]", x["corp_name"], "|", x["title"])

    # 사이트에 노출할 카드사는 우리가 실제로 다루는 10개뿐 (JCB, 현대백화점 등 제휴/브랜드 그룹은 제외).
    VALID_COMPANIES = set(REAL_CORP.values())
    excluded = [x for x in rows if x["company"] not in VALID_COMPANIES]
    if excluded:
        print(f"제외(10개 카드사 아님): {len(excluded)}건 —", dict(Counter(x["company"] for x in excluded).most_common()))
    rows = [x for x in rows if x["company"] in VALID_COMPANIES]

    meta = {"total": len(rows), "date": j.get("date")}

    # 1) 분석용(전체, detail_html 포함)
    with open(os.path.join(HERE, "cashback_events.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "events": rows}, f, ensure_ascii=False, indent=1)

    # 2) 프로덕션(index.html 용, detail_html 제외)
    prod = [{k: v for k, v in x.items() if k != "detail_html"} for x in rows]
    with open(os.path.join(ROOT, "cashback_events.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "events": prod}, f, ensure_ascii=False, indent=1)

    # 3) 요약 CSV
    cols = ["idx", "type", "company", "corp_name", "card_idxs", "title", "subject", "start", "end",
            "status", "is_live", "detail_url", "logo_img"]
    with open(os.path.join(HERE, "cashback_events.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)

    print(f"저장: event_study/cashback_events.json(분석) · cashback_events.json(프로덕션 {len(prod)}건) · .csv")


if __name__ == "__main__":
    main()
