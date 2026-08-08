# -*- coding: utf-8 -*-
"""benefits_structured.json 기반 소비 MBTI 찰떡카드 AI 예측 모델 학습 및 데이터 생성 스크립트.

작동 원리:
  1. benefits_structured.json 데이터에서 정제된 카드 혜택 규칙을 읽어옵니다.
  2. 10,000명의 고해상도 가상 소비자 지출 패턴 시뮬레이션을 생성합니다 (14차원 세분화 피처: pay_spend 포함).
  3. 마일리지/포인트형 카드는 모델 학습에서 제외하고, 할인·적립형 카드의 정밀 예상 혜택액 정답지를 계산합니다.
  4. ProcessPoolExecutor 멀티코어 병렬 연산으로 MLPRegressor (14x8x1) 회귀 신경망 모델을 학습합니다.
  5. mbti_model.json, keyword_similarity.json, cards_list.json을 유효한 JSON 포맷으로 생성/갱신합니다.
"""

import os
import json
import sqlite3
import re
import warnings
import numpy as np
import pandas as pd
from concurrent.futures import ProcessPoolExecutor
from sklearn.neural_network import MLPRegressor

warnings.filterwarnings('ignore')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRUCTURED_JSON_PATH = os.path.join(ROOT, "benefits_structured.json")
CARDS_JSON_PATH = os.path.join(ROOT, "cards.json")
MODEL_OUTPUT_PATH = os.path.join(ROOT, "mbti_model.json")
SIMILARITY_OUTPUT_PATH = os.path.join(ROOT, "keyword_similarity.json")
CARDS_LIST_PATH = os.path.join(ROOT, "cards_list.json")

KEYWORDS_MAP = {
    "해외여행": ["해외", "여행", "항공", "마일리지", "라운지", "면세점", "호텔", "숙박", "PP", "아시아나", "대한항공", "Travel", "Traveler"],
    "캠핑": ["캠핑", "레저", "스포츠", "골프", "아웃도어", "콘도", "펜션", "숙박", "여행", "글램핑"],
    "넷플릭스": ["넷플릭스", "구독", "디지털구독", "OTT", "스트리밍", "유튜브", "디즈니", "티빙", "웨이브", "왓챠", "멤버십"],
    "반려동물": ["반려동물", "애완동물", "동물병원", "펫", "강아지", "고양이", "동물용품"],
    "교육/육아": ["교육", "육아", "학원", "유치원", "학습지", "도서", "서점", "에듀", "EDU", "초등학교", "중학교", "고등학교"],
    "뷰티/피트니스": ["뷰티", "피트니스", "종합스포츠", "스포츠", "헬스", "미용", "화장품", "올리브영", "피부과"],
    "쇼핑": ["쇼핑", "백화점", "온라인쇼핑", "소매점", "쿠팡", "11번가", "G마켓", "옥션", "SSG", "마켓컬리", "컬리", "홈쇼핑"],
    "카페": ["카페", "디저트", "커피", "스타벅스", "투썸", "할리스", "이디야", "빽다방", "메가커피", "폴바셋"],
    "주유": ["주유", "충전", "휘발유", "경유", "LPG", "전기차", "GS칼텍스", "SK에너지", "S-OIL", "오일뱅크", "주유소"],
    "외식/배달": ["외식", "배달", "푸드", "음식점", "맛집", "요식", "배달의민족", "요기요", "쿠팡이츠", "한식", "중식", "일식", "양식", "패밀리레스토랑"],
    "마트": ["마트", "이마트", "홈플러스", "롯데마트", "농협", "하나로마트", "이마트트레이더스", "코스트코", "장보기"],
    "대중교통": ["교통", "대중교통", "버스", "지하철", "택시", "철도", "코레일", "KTX", "SRT", "티머니", "캐시비", "후불교통"],
    "통신비": ["통신", "휴대폰", "스마트폰", "SKT", "KT", "LGU+", "알뜰폰", "인터넷", "결합상품", "이동통신", "통신요금"],
    "병원/의료": ["병원", "의료", "약국", "한의원", "치과", "소아과", "종합병원", "건강검진", "의료기기"],
    "공과금": ["공과금", "아파트관리비", "관리비", "도시가스", "전기요금", "수도요금", "사회보험", "국민연금", "지방세", "세금"],
    "간편결제": ["간편결제", "네이버페이", "카카오페이", "삼성페이", "페이코", "스마일페이", "SSG페이", "L.pay", "엘페이", "Pay"]
}

def clean_str(val, default=""):
    if pd.isna(val) or val is None or str(val).lower() == "nan":
        return default
    return str(val).strip()

def load_extra_cards_info():
    cards_map = {}

    # cards.json 읽기
    if os.path.exists(CARDS_JSON_PATH):
        try:
            with open(CARDS_JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    c_id = item.get("idx")
                    if c_id:
                        c_id_int = int(c_id)
                        cards_map[c_id_int] = item
        except Exception:
            pass

    # card_detail/*.json 세부 파일 스캔
    detail_dir = os.path.join(ROOT, "card_detail")
    if os.path.exists(detail_dir):
        for fname in os.listdir(detail_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(detail_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        item = json.load(f)
                        c_id = item.get("idx")
                        if c_id:
                            c_id_int = int(c_id)
                            if c_id_int not in cards_map:
                                cards_map[c_id_int] = item
                            else:
                                if item.get("card_img"):
                                    cards_map[c_id_int]["card_img"] = item["card_img"]
                except Exception:
                    pass

    return cards_map

def load_structured_cards_data():
    if not os.path.exists(STRUCTURED_JSON_PATH):
        raise FileNotFoundError(f"{STRUCTURED_JSON_PATH} 파일이 존재하지 않습니다.")

    with open(STRUCTURED_JSON_PATH, "r", encoding="utf-8") as f:
        structured_raw = json.load(f)

    extra_cards_info = load_extra_cards_info()
    cards_dict = {}

    for c_id_str, b_data in structured_raw.items():
        c_idx = int(c_id_str)
        extra = extra_cards_info.get(c_idx, {})

        is_mileage = b_data.get("is_mileage", False) or (b_data.get("type") in ["마일리지", "포인트"]) or (b_data.get("miles_per_won", 0) > 0) or (b_data.get("point_name") not in ["", None])
        
        card_name = extra.get("card_name") or extra.get("name") or f"카드_{c_idx}"
        company = extra.get("company") or extra.get("card_company") or "카드사"
        card_type = b_data.get("type", "할인·적립")
        
        # 법인 / 비즈니스 / 사업자 전용 카드 키워드 필터링
        BIZ_KEYWORDS = ["법인", "비즈니스", "biz", "사업자", "기업", "corporate", "b2b", "ceo", "소호", "soho", "사장님"]
        cats_str = " ".join(b_data.get("covered") or []) + " " + b_data.get("cap_note", "")
        is_biz = any(k in card_name.lower() for k in BIZ_KEYWORDS) or any(k in cats_str.lower() for k in BIZ_KEYWORDS) or card_type in ["비즈니스", "법인"]

        is_mileage = b_data.get("is_mileage", False) or (b_data.get("type") in ["마일리지", "포인트", "비즈니스", "법인"]) or (b_data.get("miles_per_won", 0) > 0) or (b_data.get("point_name") not in ["", None]) or is_biz
        annual_fee = b_data.get("annual_fee", 0)
        pre_month_money = b_data.get("pre_month_money", 0)

        # cap_tiers 파싱
        cap_tiers = b_data.get("cap_tiers") or []
        sections = []
        if cap_tiers:
            for tier in cap_tiers:
                if isinstance(tier, (list, tuple)) and len(tier) >= 2:
                    sections.append({"min_spend": tier[0], "limit": tier[1]})
        else:
            m_cap = b_data.get("monthly_cap")
            sections.append({"min_spend": pre_month_money, "limit": m_cap if m_cap else 30000})

        cards_dict[c_idx] = {
            "card_idx": c_idx,
            "card_name": card_name,
            "company": company,
            "card_type": card_type,
            "is_mileage": is_mileage,
            "annual_fee": f"{annual_fee:,}원" if isinstance(annual_fee, int) and annual_fee > 0 else "연회비 없음",
            "pre_month_money": pre_month_money,
            "sections": sections,
            "b_data": b_data
        }

    return cards_dict

def generate_synthetic_robots(n_samples=10000):
    np.random.seed(42)
    transit_type = np.random.choice([0, 1], size=n_samples, p=[0.55, 0.45])
    gas_spend = np.clip(np.where(transit_type == 1, np.random.normal(loc=150000, scale=50000, size=n_samples), 0), 0, 450000)
    transit_spend = np.clip(np.where(transit_type == 0, np.random.normal(loc=80000, scale=20000, size=n_samples), 0), 0, 180000)
    shopping_spend = np.clip(np.random.exponential(scale=250000, size=n_samples), 0, 1000000)
    convenience_spend = np.clip(np.random.normal(loc=80000, scale=30000, size=n_samples), 0, 300000)
    food_spend = np.clip(np.random.normal(loc=300000, scale=120000, size=n_samples), 0, 1000000)
    cafe_spend = np.clip(np.random.normal(loc=60000, scale=25000, size=n_samples), 0, 300000)
    telecom_spend = np.clip(np.random.normal(loc=60000, scale=20000, size=n_samples), 0, 150000)
    digital_spend = np.clip(np.random.choice([10000, 25000, 50000, 80000], size=n_samples, p=[0.4, 0.3, 0.2, 0.1]), 0, 150000)
    culture_spend = np.clip(np.random.exponential(scale=60000, size=n_samples), 0, 300000)
    travel_spend = np.clip(np.random.exponential(scale=250000, size=n_samples), 0, 1000000)
    utility_spend = np.clip(np.random.normal(loc=200000, scale=60000, size=n_samples), 0, 600000)
    education_spend = np.clip(np.random.exponential(scale=200000, size=n_samples), 0, 1000000)
    pay_spend = np.clip(np.random.normal(loc=120000, scale=50000, size=n_samples), 0, 500000)

    df = pd.DataFrame({
        "transit_type": transit_type, "gas_spend": gas_spend, "transit_spend": transit_spend,
        "shopping_spend": shopping_spend, "convenience_spend": convenience_spend, "food_spend": food_spend,
        "cafe_spend": cafe_spend, "telecom_spend": telecom_spend, "digital_spend": digital_spend,
        "culture_spend": culture_spend, "travel_spend": travel_spend, "utility_spend": utility_spend,
        "education_spend": education_spend, "pay_spend": pay_spend
    })
    df["total_spend"] = df.sum(axis=1) - df["transit_type"]
    return df

def calculate_structured_card_benefits(df_robots, card_info):
    b_data = card_info["b_data"]
    if card_info["is_mileage"]:
        return np.zeros(len(df_robots))

    base_rate = min(float(b_data.get("base_rate") or 0.0), 0.02)
    category_rates = b_data.get("category_rates") or {}
    category_caps = b_data.get("category_caps") or {}
    cap_tiers = b_data.get("cap_tiers") or []
    fixed_discounts = b_data.get("fixed_discounts") or []
    pick_one = b_data.get("pick_one") or None

    pre_month_money = card_info.get("pre_month_money", 0)
    qualify_mask = (df_robots["total_spend"] >= pre_month_money) if pre_month_money > 0 else np.ones(len(df_robots), dtype=bool)

    cat_spend_map = {
        "주유": df_robots["gas_spend"],
        "대중교통": df_robots["transit_spend"], "교통": df_robots["transit_spend"],
        "쇼핑": df_robots["shopping_spend"], "온라인쇼핑": df_robots["shopping_spend"],
        "편의점": df_robots["convenience_spend"], "마트": df_robots["convenience_spend"],
        "외식": df_robots["food_spend"], "배달": df_robots["food_spend"], "푸드": df_robots["food_spend"],
        "카페": df_robots["cafe_spend"], "커피": df_robots["cafe_spend"],
        "통신": df_robots["telecom_spend"],
        "구독": df_robots["digital_spend"], "OTT": df_robots["digital_spend"], "OTT/영화/문화": df_robots["digital_spend"],
        "문화": df_robots["culture_spend"], "영화": df_robots["culture_spend"],
        "여행": df_robots["travel_spend"], "여행/숙박": df_robots["travel_spend"], "항공": df_robots["travel_spend"],
        "공과금": df_robots["utility_spend"],
        "교육": df_robots["education_spend"],
        "간편결제": df_robots["pay_spend"]
    }

    benefit = np.zeros(len(df_robots))
    covered_spends = np.zeros(len(df_robots))

    # 카테고리 혜택 계산
    for cat_name, rate_val in category_rates.items():
        rate = min(float(rate_val), 0.10)
        target_spend = None
        for k, arr in cat_spend_map.items():
            if k in cat_name or cat_name in k:
                target_spend = arr
                break
        if target_spend is not None:
            cat_cap = float(category_caps.get(cat_name) or 0.0)
            c_benefit = target_spend * rate
            if cat_cap > 0:
                c_benefit = np.minimum(c_benefit, cat_cap)
            benefit += c_benefit
            covered_spends += target_spend

    # pick_one 혜택 계산 (가장 이득이 큰 하나 선택)
    if pick_one and isinstance(pick_one, dict):
        po_cats = pick_one.get("cats") or []
        po_rate = min(float(pick_one.get("rate") or 0.0), 0.10)
        po_max_benefit = np.zeros(len(df_robots))
        for po_cat in po_cats:
            target_spend = None
            for k, arr in cat_spend_map.items():
                if k in po_cat or po_cat in k:
                    target_spend = arr
                    break
            if target_spend is not None:
                po_benefit = target_spend * po_rate
                po_max_benefit = np.maximum(po_max_benefit, po_benefit)
        benefit += po_max_benefit

    # fixed_discounts 정액 할인 계산
    for fd in fixed_discounts:
        won = float(fd.get("won") or 0.0)
        cycle = fd.get("cycle", "month")
        if won > 0:
            m_won = won / 12.0 if cycle == "year" else won
            benefit += np.where(qualify_mask, m_won, 0)

    # 기본 적립률 계산 (미커버 잔여 지출 기준)
    if base_rate > 0:
        rem_spend = np.maximum(0, df_robots["total_spend"] - covered_spends)
        benefit += rem_spend * base_rate

    # cap_tiers (통합 한도) 적용
    if cap_tiers:
        dynamic_cap = np.zeros(len(df_robots))
        for tier in cap_tiers:
            if isinstance(tier, (list, tuple)) and len(tier) >= 2:
                req_spend, cap_val = tier[0], float(tier[1])
                dynamic_cap = np.where(df_robots["total_spend"] >= req_spend, cap_val, dynamic_cap)
        benefit = np.minimum(benefit, dynamic_cap)
    else:
        m_cap = float(b_data.get("monthly_cap") or 30000)
        benefit = np.minimum(benefit, m_cap)

    benefit = np.where(qualify_mask, benefit, 0)
    return np.round(benefit, -1)

def scale_features(X_raw):
    X_scaled = np.zeros_like(X_raw, dtype=np.float64)
    X_scaled[:, 0] = X_raw[:, 0]
    X_scaled[:, 1] = X_raw[:, 1] / 450000.0
    X_scaled[:, 2] = X_raw[:, 2] / 180000.0
    X_scaled[:, 3] = X_raw[:, 3] / 1000000.0
    X_scaled[:, 4] = X_raw[:, 4] / 300000.0
    X_scaled[:, 5] = X_raw[:, 5] / 1000000.0
    X_scaled[:, 6] = X_raw[:, 6] / 300000.0
    X_scaled[:, 7] = X_raw[:, 7] / 150000.0
    X_scaled[:, 8] = X_raw[:, 8] / 150000.0
    X_scaled[:, 9] = X_raw[:, 9] / 300000.0
    X_scaled[:, 10] = X_raw[:, 10] / 1000000.0
    X_scaled[:, 11] = X_raw[:, 11] / 600000.0
    X_scaled[:, 12] = X_raw[:, 12] / 1000000.0
    X_scaled[:, 13] = X_raw[:, 13] / 500000.0
    return X_scaled

def train_single_card(args):
    c_idx, c_info, X_scaled, df_robots = args
    if c_info["is_mileage"]:
        return str(c_idx), None

    y_target_raw = calculate_structured_card_benefits(df_robots, c_info)
    y_target_scaled = y_target_raw / 10000.0
    
    if np.max(y_target_scaled) == 0:
        return str(c_idx), None

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mlp = MLPRegressor(
            hidden_layer_sizes=(8,),
            activation='relu',
            solver='adam',
            max_iter=30,
            random_state=42,
            early_stopping=True,
            n_iter_no_change=2
        )
        mlp.fit(X_scaled, y_target_scaled)
    
    return str(c_idx), {
        "W1": mlp.coefs_[0].tolist(),
        "b1": mlp.intercepts_[0].tolist(),
        "W2": mlp.coefs_[1].tolist(),
        "b2": mlp.intercepts_[1].tolist()
    }

def compute_keyword_similarity_structured(cards_dict):
    similarity_data = {}
    for c_idx, c_info in cards_dict.items():
        card_id_str = str(c_idx)
        card_name, company = c_info["card_name"].lower(), c_info["company"].lower()
        b_data = c_info["b_data"]
        cat_texts = list(b_data.get("category_rates", {}).keys()) + b_data.get("covered", [])
        detail_texts = [b_data.get("cap_note", "")]
        all_text = (card_name + " " + company + " " + " ".join(cat_texts) + " " + " ".join(detail_texts)).lower()
        
        sim_scores = {}
        for keyword, related_words in KEYWORDS_MAP.items():
            cat_match = 0
            for c_text in cat_texts:
                c_text_l = c_text.lower()
                if keyword in c_text_l or any(w.lower() in c_text_l for w in related_words if len(w) >= 2):
                    cat_match = 0.6
                    break
            word_count = sum(1 for w in related_words if w.lower() in all_text)
            text_match = min(word_count * 0.15, 0.4)
            total_score = cat_match + text_match
            if "모든가맹점" in all_text or "무실적" in all_text:
                total_score = max(total_score, 0.15)
            sim_scores[keyword] = round(min(total_score, 1.0), 3)
        similarity_data[card_id_str] = sim_scores
    return similarity_data

def main():
    print(f"🚀 benefits_structured.json 로드 중...")
    cards_dict = load_structured_cards_data()
    extra_cards_map = load_extra_cards_info()
    print(f" - 전체 카드: {len(cards_dict)}개")

    N_SAMPLES = 10000
    print(f"🤖 {N_SAMPLES:,}명의 고해상도 가상 지출 시뮬레이션 로봇 소환 중 (14차원)...")
    df_robots = generate_synthetic_robots(n_samples=N_SAMPLES)
    
    feature_cols = [
        "transit_type", "gas_spend", "transit_spend", "shopping_spend",
        "convenience_spend", "food_spend", "cafe_spend", "telecom_spend",
        "digital_spend", "culture_spend", "travel_spend", "utility_spend", "education_spend", "pay_spend"
    ]
    X_raw = df_robots[feature_cols].values
    X_scaled = scale_features(X_raw)

    print(f"⚡ 멀티코어 병렬 연산으로 카드 초고속 MLP 학습 중...")
    tasks = [(c_idx, c_info, X_scaled, df_robots) for c_idx, c_info in cards_dict.items()]
    
    model_database = {}
    with ProcessPoolExecutor() as executor:
        results = executor.map(train_single_card, tasks, chunksize=20)
        for card_id_str, model_weights in results:
            if model_weights is not None:
                model_database[card_id_str] = model_weights

    print(f"💾 mbti_model.json 저장 중 ({len(model_database)}개 카드 모델)...")
    with open(MODEL_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(model_database, f, ensure_ascii=False)

    print(f"🎯 keyword_similarity.json 계산 및 저장 중...")
    similarity_database = compute_keyword_similarity_structured(cards_dict)
    with open(SIMILARITY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(similarity_database, f, ensure_ascii=False)

    print(f"🃏 cards_list.json 동기화 갱신 중...")
    cards_list_export = []
    for c_idx, c_info in cards_dict.items():
        extra = extra_cards_map.get(c_idx, {})
        card_img_url = extra.get("card_img") or f"https://api.card-gorilla.com/storage/card/{c_idx}/card_img.png"
        detail_url_str = extra.get("detail_url") or f"detail.html?idx={c_idx}"

        b_data = c_info["b_data"]
        sections = c_info.get("sections") or []
        pre_month = c_info.get("pre_month_money", 0)
        cats = b_data.get("covered", [])
        
        cards_list_export.append({
            "idx": c_idx,
            "card_name": c_info["card_name"],
            "company": c_info["company"],
            "card_type": c_info["card_type"],
            "annual_fee": c_info["annual_fee"],
            "pre_month_money": pre_month,
            "card_img": card_img_url,
            "detail_url": detail_url_str,
            "sections": sections,
            "is_mileage": c_info["is_mileage"],
            "benefit_categories": ", ".join(cats[:6]),
            "top_benefit_summary": b_data.get("cap_note", "")
        })
        
    with open(CARDS_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(cards_list_export, f, ensure_ascii=False, indent=2)

    print(f"🎉 14차원 AI 모델 재학습 및 JSON 재생성 완료!")

if __name__ == "__main__":
    main()
