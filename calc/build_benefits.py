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
import io, sys, os, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RATE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
WON_RE = re.compile(r"(\d[\d,]*)\s*만\s*원")   # "2만원" 형태 (할인 한도)
# 마일리지: "1,500원당 2마일", "1천원당 1마일", "1백만원당 200마일"
MILE_RE = re.compile(r"(\d[\d,]*)\s*(백만|천)?\s*원\s*당\s*(\d+(?:\.\d+)?)\s*마일")
# 연 보너스 마일: "7만마일 적립 (연 1회)", "1.5만마일" 등 (원당이 아닌 정액)
BONUS_MILE_RE = re.compile(r"(\d[\d.,]*)\s*(만)?\s*마일")


def detect_airline(text):
    """마일리지가 어느 항공사인지. 항공사가 아니면 '' (카드·제휴 포인트성 마일)."""
    t = text or ""
    if "대한항공" in t or "스카이패스" in t or "스카이 패스" in t or "SKYPASS" in t.upper():
        return "대한항공"
    if "아시아나" in t:
        return "아시아나"
    if "항공마일리지" in t or "항공 마일" in t:
        return "항공"
    return ""


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
    h = re.sub(r"<[^>]+>", " ", h or "").replace("&nbsp;", " ").replace("&amp;", "&")
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
# 특정 카테고리가 아닌 '기본/전체' 성격 라벨 → base_rate 로
BASE_LABELS = {"적립", "할인", "캐시백", "국내외가맹점", "국내외 가맹점", "모든가맹점",
               "전가맹점", "기본", "국내", "해외겸용", "바우처", "혜택"}


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

    for seg in summary.split("|"):
        label = seg.split(":")[0].strip() if ":" in seg else ""
        rates = [float(x) / 100 for x in RATE_RE.findall(seg)]
        r = max(rates) if rates else 0.0
        # 월 한도(만원) 추출 — 할인/캐시백 맥락일 때만
        if any(k in seg for k in ("할인", "캐시백", "청구")):
            for w in WON_RE.findall(seg):
                won = int(w.replace(",", "")) * 10000
                if 5000 <= won <= 100000:
                    caps.append(won)
        if r <= 0:
            continue
        cat = None if label in BASE_LABELS else map_category(label, covered)
        if cat:
            category_rates[cat] = max(category_rates.get(cat, 0.0), r)
        else:
            base_rate = max(base_rate, r)

    # 연회비 대표값(최소 금액). 형식이 "국내전용 [20,000]원" 처럼 대괄호라 숫자만 추출.
    fee_nums = []
    for x in re.findall(r"[\d,]{3,}", card.get("annual_fee") or ""):
        v = x.replace(",", "")
        if v.isdigit() and int(v) >= 1000:
            fee_nums.append(int(v))
    annual_fee = min(fee_nums) if fee_nums else 0

    # 월 한도: card_detail(정확) 우선, 없으면 I열에서 뽑은 값
    cap_detail = card_detail_cap(card.get("idx"))
    cap_summary = max(caps) if caps else None
    monthly_cap = cap_detail or cap_summary

    # 마일리지(원과 별개 단위) + 항공사 + 카드 성격
    miles_per_won, is_mile, bonus_miles = parse_miles(summary)
    airline = detect_airline(f"{card.get('card_name','')} {summary} {card.get('benefit_categories') or ''}") if is_mile else ""
    has_money = bool(category_rates) or base_rate > 0
    if has_money and is_mile:
        card_type = "적립+마일"
    elif is_mile:
        card_type = "마일리지"
    elif has_money:
        card_type = "할인·적립"
    else:
        card_type = "기타"

    return {
        "base_rate": round(base_rate, 4),
        "category_rates": {k: round(v, 4) for k, v in category_rates.items()},
        "monthly_cap": monthly_cap,
        "miles_per_won": miles_per_won,     # 지출 1원당 마일 (원 아님)
        "bonus_miles": bonus_miles,         # 연 정액 보너스 마일
        "airline": airline,                 # 대한항공/아시아나/항공 or '' (카드·제휴 마일)
        "is_mileage": is_mile,
        "type": card_type,                  # 할인·적립 / 마일리지 / 적립+마일 / 기타
        "covered": covered,
        "annual_fee": annual_fee,
        "pre_month_money": card.get("pre_month_money") or 0,
    }


def main():
    cards = json.load(open(os.path.join(ROOT, "cards_list.json"), encoding="utf-8"))
    out = {}
    stat_rate = stat_cap = stat_cat = 0
    for c in cards:
        b = parse_card(c)
        out[str(c["idx"])] = b
        if b["base_rate"] or b["category_rates"]:
            stat_rate += 1
        if b["monthly_cap"]:
            stat_cap += 1
        if b["category_rates"]:
            stat_cat += 1
    json.dump(out, open(os.path.join(ROOT, "benefits_structured.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print(f"카드 {len(cards)}장 구조화 완료 → benefits_structured.json")
    print(f"  혜택율 파싱됨: {stat_rate} · 카테고리별 율 있음: {stat_cat} · 월한도 파싱됨: {stat_cap}")


if __name__ == "__main__":
    main()
