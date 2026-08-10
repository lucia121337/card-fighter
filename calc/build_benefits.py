# -*- coding: utf-8 -*-
"""혜택 텍스트(I열 top_benefit_summary) → 구조화 데이터. (하드코딩 X)

입력:  cards_list.json  (I열=top_benefit_summary, J열=benefit_categories)
출력:  benefits_structured.json
  {
    "<idx>": {
      "base_rate": 0.01,                     # 모든가맹점/기본 최대율
      "category_rates": {"여행/숙박":0.03},   # 카테고리별 최대율(파싱)
      "monthly_cap": 20000 | null,           # 월 할인한도(베스트에포트)
      "covered": [ ...J열 카테고리... ],
      "annual_fee": 15000,                   # 대표 연회비(최소)
      "pre_month_money": 300000
    }, ...
  }
의존성 없음(순수 파이썬). 팀원 누구나 재실행 가능.
※ 혜택율은 문구의 '최대 N%'라 과대추정 경향 → 화면에서 "예상·최대 기준" 명시할 것.
"""
import io, sys, os, re, json, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RATE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
WON_RE = re.compile(r"(\d[\d,]*)\s*만\s*원")   # "2만원" 형태 (할인 한도)
# 마일리지: "1,500원당 2마일", "1천원당 1마일", "1백만원당 200마일"
MILE_RE = re.compile(r"(\d[\d,]*)\s*(백만|천)?\s*원\s*당\s*(\d+(?:\.\d+)?)\s*마일")
# 연 보너스 마일: "7만마일 적립 (연 1회)", "1.5만마일" 등 (원당이 아닌 정액)
BONUS_MILE_RE = re.compile(r"(\d[\d.,]*)\s*(만)?\s*마일")


def detect_airline(text):
    """마일리지가 '항공사 직접 적립'인지 판별. 항공사명이 명시된 경우만 항공 마일로 본다.
    (예: 디지로카 트래블의 '트래블 마일'은 롯데 카드 프로그램이라 항공사 직접 마일이 아님 → '')"""
    t = text or ""
    if "대한항공" in t or "스카이패스" in t or "스카이 패스" in t or "SKYPASS" in t.upper():
        return "대한항공"
    if "아시아나" in t:
        return "아시아나"
    return ""   # '항공마일리지' 카테고리만으론 항공사 직접 마일로 단정 불가 → 카드/트래블 마일로 취급


def parse_miles(summary):
    """(원당 마일 적립률, 마일카드 여부, 연 보너스 마일). 원당율은 지출기반, 보너스는 정액."""
    s = summary or ""
    is_mile = "마일" in s
    best = 0.0
    for num, unit, mil in MILE_RE.findall(s):
        base = int(num.replace(",", "")) * (1_000_000 if unit == "백만" else 1000 if unit == "천" else 1)
        if base > 0:
            best = max(best, float(mil) / base)
    # 정액 보너스 마일 (원당 패턴은 제외)
    bonus = 0
    for m in BONUS_MILE_RE.finditer(s):
        if "당" in s[max(0, m.start() - 6):m.start()]:   # "원당 N마일"은 지출기반이므로 제외
            continue
        try:
            val = int(float(m.group(1).replace(",", "")) * (10000 if m.group(2) == "만" else 1))
        except ValueError:
            continue
        if 100 <= val <= 1_000_000:
            bonus = max(bonus, val)
    return round(best, 6), is_mile, bonus

# ── card_detail 월 한도 파싱 (card-reco build_benefits.py 검증 로직 이식) ──
DETAIL_DIR = os.path.join(ROOT, "card_detail")
_NUM = r"(\d[\d,]*만\s*\d*\s*천?|\d[\d,]*천|\d[\d,]*)"
_CAP_PATS = [
    re.compile(r"월\s*최대\s*" + _NUM + r"\s*(?:원)?\s*(?:캐시백|포인트|할인|적립)"),
    re.compile(_NUM + r"\s*(?:원)?\s*(?:캐시백|할인|적립)?\s*한도"),
    re.compile(r"할인\s*한도\s*" + _NUM),
]
CAP_MIN, CAP_MAX, CARD_CAP_CLAMP = 1000, 50000, 80000


def strip_html(h):
    # &trade; &middot; &lsquo; 등 엔티티를 모두 풀어야 '1 메리어트 본보이&trade; 포인트' 같은 문구가 파싱된다
    h = html.unescape(re.sub(r"<[^>]+>", " ", h or ""))
    return re.sub(r"\s+", " ", h).strip()


def _parse_won(tok):
    t = tok.replace(",", "").replace(" ", "")
    for pat, f in [
        (r"^(\d+)만(\d+)천$", lambda m: int(m[1]) * 10000 + int(m[2]) * 1000),
        (r"^(\d+)만(\d+)$", lambda m: int(m[1]) * 10000 + int(m[2])),
        (r"^(\d+)만$", lambda m: int(m[1]) * 10000),
        (r"^(\d+)천$", lambda m: int(m[1]) * 1000),
        (r"^(\d+)$", lambda m: int(m[1])),
    ]:
        mm = re.match(pat, t)
        if mm:
            return f(mm)
    return None


def card_detail_cap(idx):
    """card_detail/{idx}.json 의 key_benefit 본문에서 월 할인한도(원) 추출. 실패 시 None."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return None
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return None
    # 카드의 월 한도는 보통 '합산'이 아니라 대표 한 값이므로, 과다계상을 피해 MAX를 취한다.
    best, found = 0, False
    for k in kb:
        info = strip_html(k.get("info"))
        for pat in _CAP_PATS:
            for m in pat.finditer(info):
                ctx = info[max(0, m.start() - 8):m.start()]
                if "이용" in ctx or "건당" in ctx or "전월" in ctx:   # 이용금액/전월실적은 한도 아님
                    continue
                w = _parse_won(m.group(1))
                if w and CAP_MIN <= w <= CAP_MAX:
                    best = max(best, w)
                    found = True
    return best if found else None


# ── 통합할인한도 2단 표(전월실적 tier별 한도) 파싱 ─────────────────────────
_TABLE_RE = re.compile(r"<table[^>]*>(.*?)</table>", re.S)
_TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
_CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)


def _won_in(text):
    t = strip_html(text).replace(" ", "")
    m = re.search(r"(\d[\d,]*만\d*천|\d[\d,]*만|\d[\d,]*천|\d[\d,]*)원?", t)
    return _parse_won(m.group(1).rstrip("원")) if m else None


def _min_prev_in(text):
    m = re.search(r"(\d[\d,]*)\s*만\s*원?\s*이상", strip_html(text))
    return int(m.group(1).replace(",", "")) * 10000 if m else 0


def _won_str(w):
    return f"{w // 10000}만원" if w % 10000 == 0 and w >= 10000 else f"{w:,}원"


def card_detail_tier_cap(idx):
    """card_detail 의 '이용금액 | 할인한도' 2단 표 → (tiers[(전월실적min원,한도원)], 최대한도, 설명).
    적립 금융거래표 등은 헤더에 '한도'+'이용금액'이 없어 자동 제외. 실패 시 (None,None,'')."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return None, None, ""
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return None, None, ""
    for k in kb:
        for tbl in _TABLE_RE.findall(k.get("info") or ""):
            rows = _TR_RE.findall(tbl)
            if len(rows) < 2:
                continue
            head = [strip_html(c) for c in _CELL_RE.findall(rows[0])]
            if len(head) != 2:
                continue
            has_cap = any("한도" in h for h in head)
            has_spend = any(("이용" in h and "금액" in h) or "실적" in h for h in head)
            if not (has_cap and has_spend):
                continue
            cap_i = 0 if "한도" in head[0] else 1
            spend_i = 1 - cap_i
            tiers = []
            for r in rows[1:]:
                cells = _CELL_RE.findall(r)
                if len(cells) != 2:
                    continue
                cap = _won_in(cells[cap_i])
                if not cap or not (5000 <= cap <= 500000):
                    continue
                tiers.append((_min_prev_in(cells[spend_i]), cap))
            if len(tiers) >= 2:
                tiers.sort()
                caps = [c for _, c in tiers]
                lo, hi = min(caps), max(caps)
                note = f"전월실적별 {_won_str(lo)}~{_won_str(hi)}" if lo != hi else f"월 최대 {_won_str(hi)}"
                return tiers, hi, note
    return None, None, ""


# ── 포인트 적립률 파싱 (마일과 같은 구조, 단위만 다름 — 원 환산 금지) ──────
# "1천원당): 1 메리어트 본보이 포인트", "1,200원당 10포인트", "1천원당 30P", "10P/1,200원"
# 단위: 포인트 / 머니(하나) / MR(아멕스) / P.  '점'은 '가맹점·할인점' 오탐 위험이라 제외.
_PT_U = r"(포인트|머니|MR|P)"
_PT_NUM = r"(\d[\d,]*(?:\.\d+)?)"      # '5,000머니'처럼 쉼표 포함 값 허용
_PT_A = re.compile(r"(\d[\d,]*)\s*(천|만)?\s*원\s*당[^\d%]{0,10}" + _PT_NUM + r"\s*([가-힣A-Za-z™®·\s]{0,20}?)" + _PT_U + r"\b")
_PT_B = re.compile(r"(\d[\d,]*)\s*(천|만)?\s*원\s*당[^\d%]{0,10}" + _PT_NUM + r"\s*P\b")
_PT_C = re.compile(_PT_NUM + r"\s*" + _PT_U + r"\s*/\s*(\d[\d,]*)\s*(천|만)?\s*원")
_PT_BONUS = re.compile(r"(\d[\d,]{2,})\s*(?:[가-힣A-Za-z™®·\s]{0,20}?)포인트")
_PT_BASE_HDR = re.compile(r"기본\s*적립")


def _unit_won(num, unit):
    return int(num.replace(",", "")) * (10000 if unit == "만" else 1000 if unit == "천" else 1)


def parse_points(text):
    """(기본 포인트/원, 최대 포인트/원, 포인트명, 연 보너스 포인트).
    기본=가장 낮은 적립률(전 가맹점에 적용되는 값), 최대=특별적립 등 최고값."""
    t = text or ""
    rates, name = [], ""     # rates = [(문서상 위치, 적립률)]
    for mt in _PT_A.finditer(t):
        num, unit, pt, nm, u = mt.groups()
        w = _unit_won(num, unit)
        if w > 0:
            rates.append((mt.start(), float(pt.replace(",", "")) / w))
            if not name:
                name = (f"{(nm or '').strip()} {u}").strip()   # 예: "메리어트 본보이™ 포인트", "머니"
    for mt in _PT_B.finditer(t):
        num, unit, pt = mt.groups()
        w = _unit_won(num, unit)
        if w > 0:
            rates.append((mt.start(), float(pt.replace(",", "")) / w))
    for mt in _PT_C.finditer(t):
        pt, u, num, unit = mt.groups()
        w = _unit_won(num, unit)
        if w > 0:
            rates.append((mt.start(), float(pt.replace(",", "")) / w))
            if not name:
                name = u
    if not rates:
        return 0.0, 0.0, "", 0

    vals = [r for _, r in rates]
    # 기본적립: '기본적립' 표기 뒤 첫 적립률(추가/특별적립과 혼동 방지). 없으면 최솟값(보수적).
    base_rate_pt = min(vals)
    hdr = _PT_BASE_HDR.search(t)
    if hdr:
        after = [r for pos, r in sorted(rates) if pos > hdr.end()]
        if after:
            base_rate_pt = after[0]
    # 연 보너스(정액) — '원당'이 아닌 큰 정액 포인트
    bonus = 0
    for m in _PT_BONUS.finditer(t):
        if "당" in t[max(0, m.start() - 8):m.start()]:
            continue
        try:
            v = int(m.group(1).replace(",", ""))
        except ValueError:
            continue
        if 1000 <= v <= 200000:
            bonus = max(bonus, v)
    return round(base_rate_pt, 8), round(max(vals), 8), (name or "포인트"), bonus


def card_detail_points(idx):
    """card_detail 본문에서 포인트 적립률 파싱 (I열 요약보다 정확)."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return 0.0, 0.0, "", 0
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return 0.0, 0.0, "", 0
    return parse_points(" ".join(strip_html(k.get("info")) for k in kb))


# ── 연간 바우처/기프트 (기본 제공 베네핏) ────────────────────────────────
# I열 요약만 사용 — 상세 본문은 "상품권 구매 시 제외" 같은 부정 문맥 오탐 위험.
_VOUCHER_KW = ("바우처", "기프트", "상품권", "교환권")
_V_WON = re.compile(r"(\d[\d,]*)\s*만\s*원")          # "70만원", "20만원상당", "10만원권"
_V_MAN = re.compile(r"(\d[\d,]*)\s*만(?!\s*원)")       # "연간 6만 바우처" (원 생략형)


def parse_voucher(summary):
    """(연 바우처 금액(원), 표시 라벨). 마일/포인트 표기는 별도 필드 담당이라 제외."""
    best_won, label = 0, ""
    for seg in (summary or "").split("|"):
        seg = seg.strip()
        if not any(k in seg for k in _VOUCHER_KW):
            continue
        if "마일" in seg or "포인트" in seg or re.search(r"\dP\b", seg):
            continue   # 연 보너스 마일/포인트로 이미 구조화됨
        text = seg.split(":", 1)[1].strip() if ":" in seg else seg
        m = _V_WON.search(text) or _V_MAN.search(text)
        won = int(m.group(1).replace(",", "")) * 10000 if m else 0
        if not (0 < won <= 1_000_000):
            won = 0
        # 금액 있는 라벨 우선, 없으면 첫 라벨이라도 표시용으로 확보
        if won > best_won or (not label and text):
            label = text[:40]
        best_won = max(best_won, won)
    return best_won, label


_TIER_TXT = re.compile(r"(\d[\d,]*)\s*만\s*원\s*이상")


def card_detail_text_tiers(idx):
    """표가 아니라 텍스트 목록으로 쓰인 실적구간 한도 파싱.
       '전월 이용금액대별 통합 월 할인한도 - 30만원 이상: 10,000원 - 60만원 이상: 20,000원'
    혜택군이 여러 개면 구간별 최댓값을 취한다(카드 전체 상한 근사)."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return None, None, ""
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return None, None, ""
    pairs = {}
    for k in kb:
        t = strip_html(k.get("info"))
        if "한도" not in t:
            continue
        for m in _TIER_TXT.finditer(t):
            mn = int(m.group(1).replace(",", "")) * 10000
            tail = t[m.end():m.end() + 70]
            am = (re.search(r"한도[^\d]{0,10}([\d,]{3,})\s*원", tail)
                  or re.search(r"([\d,]{3,})\s*원", tail))
            if not am:
                continue
            cap = int(am.group(1).replace(",", ""))
            if not (1000 <= cap <= 500000):
                continue
            pairs[mn] = max(pairs.get(mn, 0), cap)
    if len(pairs) < 2:
        return None, None, ""
    tiers = sorted(pairs.items())
    caps = [c for _, c in tiers]
    lo, hi = min(caps), max(caps)
    if lo == hi:
        return None, None, ""          # 구간별로 다르지 않으면 tier 의미 없음
    note = f"전월실적별 {_won_str(lo)}~{_won_str(hi)}"
    return [(m, c) for m, c in tiers], hi, note


_LABEL_HDR = ("가맹점", "구분", "영역", "서비스", "대상", "업종", "점", "항목")


def card_detail_category_rates(idx, covered):
    """card_detail 의 카테고리별 표('가맹점|할인율|한도' 등) → ({cat:율}, {cat:개별월한도}).
    율 파싱 성공 + 카테고리 매핑 성공 행만 채택(노이즈 차단). 실패 시 ({},{})."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return {}, {}
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return {}, {}
    rates, caps = {}, {}
    for k in kb:
        for tbl in _TABLE_RE.findall(k.get("info") or ""):
            rows = _TR_RE.findall(tbl)
            if len(rows) < 2:
                continue
            head = [strip_html(c) for c in _CELL_RE.findall(rows[0])]
            n = len(head)
            if n < 2:
                continue
            rate_col = next((i for i, h in enumerate(head) if "율" in h or "률" in h), None)
            if rate_col is None:
                continue
            cap_col = next((i for i, h in enumerate(head) if "한도" in h), None)
            label_col = next((i for i, h in enumerate(head)
                              if i != rate_col and any(w in h for w in _LABEL_HDR)), None)
            if label_col is None:
                continue
            for r in rows[1:]:
                cells = _CELL_RE.findall(r)
                if len(cells) != n:              # 병합셀/불규칙 행은 스킵
                    continue
                rvals = [float(x) / 100 for x in RATE_RE.findall(strip_html(cells[rate_col]))]
                if not rvals:
                    continue
                rate = max(rvals)
                if not (0.001 <= rate <= 0.70):
                    continue
                label = strip_html(cells[label_col])
                if not label or any(w in label for w in ("합계", "유의", "비고", "합산", "구분")):
                    continue
                cat = map_category(label, covered)
                if not cat:
                    continue
                rates[cat] = max(rates.get(cat, 0.0), rate)
                if cap_col is not None:
                    cap = _won_in(cells[cap_col])
                    if cap and 1000 <= cap <= 500000:
                        caps[cat] = max(caps.get(cat, 0), cap)
    return rates, caps


# I열 라벨/키워드 → card-fighter 카테고리 별칭 (라벨이 카테고리와 다를 때)
LABEL_ALIAS = {
    "디지털구독": "OTT/영화/문화", "스트리밍": "OTT/영화/문화", "영화": "OTT/영화/문화",
    "홈쇼핑": "쇼핑", "온라인쇼핑": "온라인쇼핑", "쇼핑": "쇼핑",
    "통신": "통신", "이동통신": "통신",
    "카페": "카페/디저트", "커피": "카페/디저트", "디저트": "카페/디저트",
    "간편결제": "간편결제", "주유": "주유", "대중교통": "교통", "교통": "교통",
    "여행": "여행/숙박", "숙박": "여행/숙박", "항공": "항공마일리지", "항공마일리지": "항공마일리지",
    "해외": "해외", "면세": "해외", "마트": "마트/편의점", "편의점": "마트/편의점",
    "푸드": "푸드", "음식점": "푸드", "배달": "푸드",
    "공과금": "공과금/렌탈", "렌탈": "공과금/렌탈",
    "병원": "병원/약국", "약국": "병원/약국", "교육": "교육/육아", "육아": "교육/육아",
    "자동차": "자동차/하이패스", "하이패스": "자동차/하이패스",
}
# 진짜 '전 가맹점' 스코프 라벨만 base_rate 로 (혜택 '종류' 라벨과 구분)
ALL_MERCHANT_LABELS = {"국내외가맹점", "국내외 가맹점", "모든가맹점", "전가맹점", "기본"}
# 종류 라벨(스코프 정보 없음) — 본문 텍스트를 보고 판단해야 한다
TYPE_LABELS = {"적립", "할인", "캐시백", "청구할인", "혜택", "바우처", "기타", "선택형"}
# 본문에 이런 표현이 있으면 전 가맹점 스코프
ALL_MERCHANT_RE = re.compile(r"(모든|전)\s*가맹점|국내외\s*가맹점|국내\s*가맹점|전\s*업종|모든\s*업종")
# '택1(자동 맞춤)' 구조 — 여러 영역 중 이용금액이 가장 큰 1곳에만 적용
PICK_RE = re.compile(r"자동\s*맞춤|많이\s*쓰는\s*영역|중\s*1개|택\s*1|가장\s*큰\s*1개")


def cats_from_text(text, covered):
    """본문 텍스트에서 카테고리 추출. '교통·이동통신·스트리밍 10%' → [교통, 통신, OTT/영화/문화].
    오탐을 막기 위해 J열(covered)에 실제로 있는 카테고리만 인정한다."""
    found = []
    for tok in re.split(r"[/·,、\s]+", text):
        tok = tok.strip()
        if len(tok) < 2:
            continue
        c = map_category(tok, covered)
        if c and c in covered and c not in found:
            found.append(c)
    return found


def card_detail_pick_one(idx, covered):
    """상세 본문의 택1 구조 파싱.
    '커피전문점·배달앱·델리 영역 중 월 이용금액이 가장 큰 1개 영역에 대해 30% 할인'
      → {"rate":0.30, "cats":["카페/디저트","푸드"]}"""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    if not os.path.isfile(path):
        return None
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return None
    pat = re.compile(r"([가-힣A-Za-z·,/\s]{4,40}?)\s*영역\s*중[^.]{0,40}?(\d+(?:\.\d+)?)\s*%")
    for k in kb:
        t = strip_html(k.get("info"))
        if not PICK_RE.search(t):
            continue
        m = pat.search(t)
        if not m:
            continue
        cats = cats_from_text(m.group(1), covered)
        rate = float(m.group(2)) / 100
        if cats and 0 < rate <= 0.70:
            return {"rate": round(rate, 4), "cats": cats}
    return None


# ── 신규 혜택군 규칙 파서 (오케스트라 표준 기반) ─────────────────────────
_FUEL_RE = re.compile(r"(?:리터|L|ℓ)\s*당\s*(\d[\d,]*)\s*원|(\d[\d,]*)\s*원\s*/\s*(?:리터|L|ℓ)")
_FIXED_WON = re.compile(r"(\d[\d,]*만\s*\d*\s*천?|\d[\d,]*천|\d[\d,]*)\s*원")
_SERVICE_KW = [("발레파킹", "발레파킹"), ("발렛파킹", "발레파킹"), ("발렛", "발레파킹"),
               ("공항라운지", "공항 라운지"), ("공항 라운지", "공항 라운지"),
               ("PP카드", "공항라운지(PP)"), ("프리미엄패스", "공항라운지(PP)"), ("라운지", "라운지"),
               ("무료주차", "무료주차"), ("무료 주차", "무료주차"),
               ("특급호텔", "특급호텔"), ("테마파크", "테마파크"), ("워터파크", "워터파크")]
_INST_RE = re.compile(r"무이자\s*할부|부분\s*무이자")


def card_detail_families(idx, covered):
    """card_detail 에서 fuel/service/installment 규칙 추출 (fixed는 I열에서 별도)."""
    path = os.path.join(DETAIL_DIR, f"{idx}.json")
    fuel, service, inst = [], [], None
    if not os.path.isfile(path):
        return fuel, service, inst
    try:
        kb = (json.load(open(path, encoding="utf-8")).get("key_benefit")) or []
    except Exception:
        return fuel, service, inst
    seen_sv = set()
    for k in kb:
        info = strip_html(k.get("info"))
        if not info:
            continue
        cat = map_category((k.get("title") or "").strip(), covered) or (k.get("title") or "").strip()
        for m in _FUEL_RE.finditer(info):
            wpl = int((m.group(1) or m.group(2)).replace(",", ""))
            if 10 <= wpl <= 500 and len(fuel) < 3:
                fuel.append({"targets": "", "won_per_liter": wpl, "monthly_cap_won": 0, "min_prev_spend": 0})
        for kw, label in _SERVICE_KW:
            if kw in info and label not in seen_sv:
                seen_sv.add(label)
                cm = re.search(r"(?:월|연|일)\s*\d+\s*회", info)
                service.append({"category": cat, "label": label, "count_limit": cm.group(0) if cm else ""})
        if inst is None and _INST_RE.search(info):
            mm = re.search(r"\d+\s*~\s*\d+\s*개월|\d+\s*개월", info)
            inst = {"label": "무이자 할부" + (" " + mm.group(0) if mm else "")}
    return fuel, service, inst


def map_category(label, covered):
    lb = label.strip()
    if lb in covered:
        return lb
    for key, cat in LABEL_ALIAS.items():
        if key in lb:
            return cat if cat in covered or True else None
    # 라벨이 커버 카테고리를 부분 포함하면 그걸로
    for cat in covered:
        head = cat.split("/")[0]
        if head and head in lb:
            return cat
    return None


def parse_card(card):
    covered = [x.strip() for x in (card.get("benefit_categories") or "").split(",") if x.strip()]
    summary = card.get("top_benefit_summary") or ""
    base_rate = 0.0
    category_rates = {}
    caps = []
    fixed_discounts = []

    for seg in summary.split("|"):
        label = seg.split(":")[0].strip() if ":" in seg else ""
        text = seg.split(":", 1)[1].strip() if ":" in seg else seg
        rates = [float(x) / 100 for x in RATE_RE.findall(seg)]
        r = max(rates) if rates else 0.0
        # 월 한도(만원) 추출 — 할인/캐시백 맥락일 때만
        if any(k in seg for k in ("할인", "캐시백", "청구")):
            for w in WON_RE.findall(seg):
                won = int(w.replace(",", "")) * 10000
                if 5000 <= won <= 100000:
                    caps.append(won)
        if r <= 0:
            # 정액 원 할인 (% 없는 세그먼트) — 통신 2만원·영화 5천원 등
            if any(k in seg for k in ("할인", "캐시백", "청구")) and \
               not re.search(r"수수료|환율|무이자|한도|이용|이상|적립|바우처", seg):
                fc = map_category(label, covered) if label and label not in TYPE_LABELS else None
                if not fc:
                    cl = cats_from_text(text, covered)
                    fc = cl[0] if cl else None
                m = _FIXED_WON.search(text)
                won = _parse_won(m.group(1)) if m else None
                if fc and won and 1000 <= won <= 100000:
                    fixed_discounts.append({"category": fc, "won": won, "cycle": "month",
                        "count_limit": "", "per_txn_cap_won": 0, "min_prev_spend": 0, "targets": ""})
            continue
        # 수수료·환율의 %는 '수수료의 N%'라 지출 대비 적립률이 아니다.
        # ('수수료 100% 청구할인'을 전 가맹점 100% 할인으로 읽던 오류)
        if re.search(r"수수료|환율", label) or \
           re.search(r"(수수료|환율)[^%]{0,8}\d+(?:\.\d+)?\s*%", text) or \
           (re.search(r"면제|할부|이자", seg) and not re.search(r"적립|할인|캐시백|청구", seg)):
            continue

        # ① 진짜 전 가맹점 스코프만 기본율로
        if label in ALL_MERCHANT_LABELS or ALL_MERCHANT_RE.search(text):
            base_rate = max(base_rate, r)
            continue
        # ② 라벨로 카테고리 매핑 (종류 라벨은 건너뛰고 본문을 본다)
        cats = []
        if label and label not in TYPE_LABELS:
            c = map_category(label, covered)
            if c:
                cats = [c]
        # ③ 라벨로 못 잡으면 본문에서 (복수 카테고리 나열 대응)
        if not cats:
            cats = cats_from_text(text, covered)
        # ④ 그래도 못 잡으면 버린다. 예전엔 base_rate 로 흘려보내
        #    '미용실 60% 할인'이 '전 가맹점 60%'가 되는 심각한 과대추정이 있었다.
        for c in cats:
            category_rates[c] = max(category_rates.get(c, 0.0), r)

    # card_detail 카테고리별 표에서 정확한 율/개별한도 보강 (I열 요약보다 정밀)
    det_rates, det_caps = card_detail_category_rates(card.get("idx"), covered)
    for cat, r in det_rates.items():
        category_rates[cat] = max(category_rates.get(cat, 0.0), r)

    # 연회비 대표값(최소 금액). 형식이 "국내전용 [20,000]원" 처럼 대괄호라 숫자만 추출.
    fee_nums = []
    for x in re.findall(r"[\d,]{3,}", card.get("annual_fee") or ""):
        v = x.replace(",", "")
        if v.isdigit() and int(v) >= 1000:
            fee_nums.append(int(v))
    annual_fee = min(fee_nums) if fee_nums else 0

    # 월 한도: 통합할인한도 표(tier·최정확) > 텍스트형 구간표 > card_detail 문구 > I열
    cap_tiers, cap_tier_max, cap_note = card_detail_tier_cap(card.get("idx"))
    if not cap_tiers:
        cap_tiers, cap_tier_max, cap_note = card_detail_text_tiers(card.get("idx"))
    cap_detail = card_detail_cap(card.get("idx"))
    cap_summary = max(caps) if caps else None
    monthly_cap = cap_tier_max or cap_detail or cap_summary

    # 마일리지(원과 별개 단위) + 항공사 + 카드 성격
    miles_per_won, is_mile, bonus_miles = parse_miles(summary)
    airline = detect_airline(f"{card.get('card_name','')} {summary} {card.get('benefit_categories') or ''}") if is_mile else ""
    # 택1(자동 맞춤) 구조 — 여러 영역 중 이용금액 1위 1곳에만 적용.
    # category_rates 에 넣으면 모든 영역에 동시 적용돼 과대추정되므로 분리해 둔다.
    pick_one = card_detail_pick_one(card.get("idx"), covered)
    if pick_one:
        for c in pick_one["cats"]:
            if category_rates.get(c, 0.0) <= pick_one["rate"]:
                category_rates.pop(c, None)

    # 신규 혜택군 (주유·서비스·무이자) — card_detail 규칙
    fuel_discounts, service_benefits, installment_free = card_detail_families(card.get("idx"), covered)

    # 연간 바우처/기프트 (I열 요약 기반)
    voucher_won, voucher_label = parse_voucher(summary)

    # 포인트 적립(마일과 같은 별도 단위) — 상세 우선, 없으면 I열 요약
    pt_base, pt_top, pt_name, pt_bonus = card_detail_points(card.get("idx"))
    if pt_base <= 0:
        pt_base, pt_top, pt_name, pt_bonus = parse_points(summary)

    has_money = bool(category_rates) or base_rate > 0 or bool(fixed_discounts) or bool(fuel_discounts)
    has_point = pt_base > 0
    if has_money and is_mile:
        card_type = "적립+마일"
    elif is_mile:
        card_type = "마일리지"
    elif has_money:
        card_type = "할인·적립"
    elif has_point:
        card_type = "포인트"
    elif service_benefits:
        card_type = "서비스"
    else:
        card_type = "기타"

    return {
        "base_rate": round(base_rate, 4),
        "category_rates": {k: round(v, 4) for k, v in category_rates.items()},
        "category_caps": {k: int(v) for k, v in det_caps.items()},  # 카테고리별 개별 월한도(원)
        "monthly_cap": monthly_cap,
        "cap_tiers": [[m, c] for m, c in cap_tiers] if cap_tiers else [],  # 전월실적별 한도
        "cap_note": cap_note,               # 예: "전월실적별 1만원~10만원"
        "miles_per_won": miles_per_won,     # 지출 1원당 마일 (원 아님)
        "bonus_miles": bonus_miles,         # 연 정액 보너스 마일
        "airline": airline,                 # 대한항공/아시아나/항공 or '' (카드·제휴 마일)
        "pick_one": pick_one,               # {rate, cats} — 여러 영역 중 이용 1위 1곳만 적용
        "fixed_discounts": fixed_discounts, # 정액 원 할인 (통신 2만원 등)
        "fuel_discounts": fuel_discounts,   # 리터당 주유할인
        "service_benefits": service_benefits,  # 발레파킹·라운지 등 (계산 불가, 칩만)
        "installment_free": installment_free,  # 무이자 할부 (칩만) or None
        "voucher_won": voucher_won,         # 연 바우처/기프트 금액(원) — 기본 제공 베네핏
        "voucher_label": voucher_label,     # 표시용 문구 (금액 미상이어도 존재 가능)
        "points_per_won": pt_base,          # 지출 1원당 포인트(기본적립 기준·보수적)
        "points_top_per_won": pt_top,       # 특별적립 등 최고 적립률
        "point_name": pt_name,              # 예: "메리어트 본보이", "TOP" / 기본 "포인트"
        "bonus_points": pt_bonus,           # 연 정액 보너스 포인트
        "is_mileage": is_mile,
        "type": card_type,                  # 할인·적립 / 마일리지 / 적립+마일 / 기타
        "covered": covered,
        "annual_fee": annual_fee,
        "pre_month_money": card.get("pre_month_money") or 0,
    }


def main():
    cards = json.load(open(os.path.join(ROOT, "cards_list.json"), encoding="utf-8"))
    out_path = os.path.join(ROOT, "benefits_structured.json")
    # 오케스트라 LLM 추출 카드(_src:"llm")는 정답이므로 규칙으로 덮어쓰지 않고 보존
    existing = {}
    if os.path.isfile(out_path):
        try:
            existing = json.load(open(out_path, encoding="utf-8"))
        except Exception:
            existing = {}
    out = {}
    kept_llm = 0
    stat_rate = stat_cap = stat_tier = stat_fixed = stat_svc = 0
    for c in cards:
        idx = str(c["idx"])
        if existing.get(idx, {}).get("_src") == "llm":
            out[idx] = existing[idx]
            kept_llm += 1
        else:
            out[idx] = parse_card(c)
        b = out[idx]
        if b.get("base_rate") or b.get("category_rates"):
            stat_rate += 1
        if b.get("monthly_cap"):
            stat_cap += 1
        if b.get("cap_tiers"):
            stat_tier += 1
        if b.get("fixed_discounts"):
            stat_fixed += 1
        if b.get("service_benefits"):
            stat_svc += 1
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"카드 {len(cards)}장 구조화 완료 (LLM 보존 {kept_llm}) → benefits_structured.json")
    print(f"  혜택율 {stat_rate} · 월한도 {stat_cap} · tier {stat_tier} · 정액할인 {stat_fixed} · 서비스 {stat_svc}")


if __name__ == "__main__":
    main()
