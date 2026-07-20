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

    # 연회비 대표값(최소 금액)
    fee_nums = [int(x.replace(",", "")) for x in re.findall(r"([\d,]{3,})\s*원", card.get("annual_fee") or "")]
    annual_fee = min(fee_nums) if fee_nums else 0

    return {
        "base_rate": round(base_rate, 4),
        "category_rates": {k: round(v, 4) for k, v in category_rates.items()},
        "monthly_cap": max(caps) if caps else None,
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
