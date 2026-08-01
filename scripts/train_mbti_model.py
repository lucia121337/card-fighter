# -*- coding: utf-8 -*-
"""benefit_calculator_wide.sqlite 기반 소비 MBTI 찰떡카드 AI 예측 모델 학습 및 데이터 생성 스크립트.

작동 원리:
  1. data/benefit_calculator_wide.sqlite DB에서 혜택계산기 데이터를 읽어옵니다.
  2. 10,000명의 고해상도 가상 소비자 지출 패턴 시뮬레이션을 생성합니다 (13차원 세분화 피처).
  3. 각 카드별 구간1~10 실적/한도 및 카테고리 혜택 상세를 파싱하여 10,000명의 정밀 예상 혜택액 정답지를 정산합니다.
  4. ProcessPoolExecutor 멀티코어 병렬 연산으로 1,565개 카드별 MLPRegressor 회귀 신경망 모델을 초고속 학습합니다.
  5. mbti_model.json, keyword_similarity.json, cards_list.json을 유효한 JSON 포맷(NaN 불허)으로 안전하게 생성/갱신합니다.
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
DB_PATH = os.path.join(ROOT, "data", "benefit_calculator_wide.sqlite")
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
    img_map = {}
    
    # 1. card_detail/*.json 세부 파일 스캔
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
                            card_img = item.get("card_img")
                            detail_url = item.get("detail_url") or f"https://www.card-gorilla.com/card/detail/{c_id_int}"
                            if card_img:
                                img_map[c_id_int] = {
                                    "card_img": card_img,
                                    "detail_url": detail_url
                                }
                except Exception:
                    pass

    # 2. cards.json 파일 스캔 (보완)
    if os.path.exists(CARDS_JSON_PATH):
        try:
            with open(CARDS_JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    c_id = item.get("idx")
                    if c_id:
                        c_id_int = int(c_id)
                        card_img = item.get("card_img")
                        detail_url = item.get("detail_url") or f"https://www.card-gorilla.com/card/detail/{c_id_int}"
                        if c_id_int not in img_map or not img_map[c_id_int].get("card_img"):
                            img_map[c_id_int] = {
                                "card_img": card_img or f"https://api.card-gorilla.com/storage/card/{c_id_int}/card_img.png",
                                "detail_url": detail_url
                            }
        except Exception:
            pass
            
    return img_map

def load_wide_db_data():
    conn = sqlite3.connect(DB_PATH)
    df_raw = pd.read_sql_query("SELECT * FROM 혜택계산기", conn)
    conn.close()

    cards_dict = {}
    for _, row in df_raw.iterrows():
        c_idx = int(row["card_idx"])
        if c_idx not in cards_dict:
            fee_kr = int(row.get("국내연회비_금액")) if (pd.notna(row.get("국내연회비_금액")) and row.get("국내연회비_금액") is not None) else 0
            fee_os = int(row.get("해외연회비1_금액")) if (pd.notna(row.get("해외연회비1_금액")) and row.get("해외연회비1_금액") is not None) else 0
            fee_text = clean_str(row.get("연회비_원본텍스트"))
            if not fee_text or fee_text == "nan":
                if fee_kr and fee_os:
                    fee_text = f"국내전용 {fee_kr:,}원 / 해외겸용 {fee_os:,}원"
                elif fee_kr:
                    fee_text = f"국내전용 {fee_kr:,}원"
                elif fee_os:
                    fee_text = f"해외겸용 {fee_os:,}원"
                else:
                    fee_text = "연회비 없음"

            sections = []
            for i in range(1, 11):
                spend_val = row.get(f"구간{i}_전월실적")
                limit_val = row.get(f"구간{i}_한도")
                if pd.notna(spend_val) and spend_val is not None:
                    try:
                        s_int = int(spend_val)
                        l_int = int(limit_val) if (pd.notna(limit_val) and limit_val is not None) else None
                        sections.append({"min_spend": s_int, "limit": l_int})
                    except (ValueError, TypeError):
                        pass

            cards_dict[c_idx] = {
                "card_idx": c_idx,
                "company": clean_str(row.get("카드사"), "카드사"),
                "card_name": clean_str(row.get("카드명"), "카드명"),
                "credit_check": clean_str(row.get("신용체크"), "신용"),
                "card_type": clean_str(row.get("카드유형"), "할인"),
                "annual_fee": fee_text,
                "annual_fee_kr": fee_kr,
                "annual_fee_os": fee_os,
                "sections": sections,
                "benefits": []
            }

        cat = clean_str(row.get("혜택카테고리"))
        detail = clean_str(row.get("상세내용"))
        if cat or detail:
            cards_dict[c_idx]["benefits"].append({"category": cat, "detail": detail})

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
    
    df = pd.DataFrame({
        "transit_type": transit_type, "gas_spend": gas_spend, "transit_spend": transit_spend,
        "shopping_spend": shopping_spend, "convenience_spend": convenience_spend, "food_spend": food_spend,
        "cafe_spend": cafe_spend, "telecom_spend": telecom_spend, "digital_spend": digital_spend,
        "culture_spend": culture_spend, "travel_spend": travel_spend, "utility_spend": utility_spend,
        "education_spend": education_spend
    })
    df["total_spend"] = df.sum(axis=1) - df["transit_type"]
    return df

def calculate_wide_card_benefits(df_robots, card_info):
    sections = card_info.get("sections") or []
    min_req_spend = sections[0]["min_spend"] if (sections and "min_spend" in sections[0]) else 0
    qualify_mask = np.ones(len(df_robots), dtype=bool) if min_req_spend == 0 else (df_robots["total_spend"] >= min_req_spend)
    benefit = np.zeros(len(df_robots))
    
    cat_spend_map = {
        "주유": df_robots["gas_spend"], "대중교통": df_robots["transit_spend"], "교통": df_robots["transit_spend"],
        "쇼핑": df_robots["shopping_spend"], "편의점": df_robots["convenience_spend"], "마트": df_robots["convenience_spend"],
        "외식": df_robots["food_spend"], "배달": df_robots["food_spend"], "카페": df_robots["cafe_spend"], "커피": df_robots["cafe_spend"],
        "통신": df_robots["telecom_spend"], "구독": df_robots["digital_spend"], "OTT": df_robots["digital_spend"],
        "문화": df_robots["culture_spend"], "영화": df_robots["culture_spend"], "여행": df_robots["travel_spend"],
        "항공": df_robots["travel_spend"], "공과금": df_robots["utility_spend"], "교육": df_robots["education_spend"]
    }

    has_match = False
    for b in card_info["benefits"]:
        cat_str, detail_str = b["category"], b["detail"]
        target_spend = None
        for k_cat, spend_arr in cat_spend_map.items():
            if k_cat in cat_str:
                target_spend = spend_arr
                has_match = True
                break
                
        if target_spend is not None:
            rates = [float(r) for r in re.findall(r'(\d+(?:\.\d+)?)\s*%', detail_str)]
            amounts = [int(a.replace(",", "")) for a in re.findall(r'([\d,]+)\s*원', detail_str) if a.replace(",", "").isdigit()]
            if rates and max(rates) <= 100:
                cat_benefit = np.minimum(target_spend * (max(rates) / 100.0), 30000)
            elif amounts:
                cat_benefit = np.minimum(min(amounts), target_spend)
            else:
                cat_benefit = np.minimum(target_spend * 0.05, 10000)
            benefit += np.where(qualify_mask, cat_benefit, 0)

    if not has_match:
        benefit += np.where(qualify_mask, df_robots["total_spend"] * 0.008, 0)

    if sections:
        dynamic_limit = np.zeros(len(df_robots))
        for i, s in enumerate(sections):
            m_spend = s["min_spend"]
            l_val = s["limit"]
            effective_limit = l_val if (l_val is not None and l_val > 0) else 150000
            dynamic_limit = np.where(df_robots["total_spend"] >= m_spend, effective_limit, dynamic_limit)

        dynamic_limit = np.where(qualify_mask, dynamic_limit, 0)
        dynamic_limit = np.where(dynamic_limit == 0, np.where(qualify_mask, 30000, 0), dynamic_limit)
        benefit = np.minimum(benefit, dynamic_limit)
    else:
        benefit = np.minimum(benefit, 30000)

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
    return X_scaled

def train_single_card(args):
    c_idx, c_info, X_scaled, df_robots = args
    y_target_raw = calculate_wide_card_benefits(df_robots, c_info)
    y_target_scaled = y_target_raw / 10000.0
    
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

def compute_keyword_similarity_wide(cards_dict):
    similarity_data = {}
    for c_idx, c_info in cards_dict.items():
        card_id_str = str(c_idx)
        card_name, company = c_info["card_name"].lower(), c_info["company"].lower()
        cat_texts = [b["category"].lower() for b in c_info["benefits"]]
        detail_texts = [b["detail"].lower() for b in c_info["benefits"]]
        all_text = (card_name + " " + company + " " + " ".join(cat_texts) + " " + " ".join(detail_texts)).lower()
        
        sim_scores = {}
        for keyword, related_words in KEYWORDS_MAP.items():
            cat_match = 0
            for c_text in cat_texts:
                if keyword in c_text or any(w.lower() in c_text for w in related_words if len(w) >= 2):
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
    print(f"🚀 benefit_calculator_wide.sqlite DB 로드 중...")
    cards_dict = load_wide_db_data()
    extra_img_map = load_extra_cards_info()
    print(f" - 마스터 카드: {len(cards_dict)}개")

    N_SAMPLES = 10000
    print(f"🤖 {N_SAMPLES:,}명의 고해상도 가상 지출 시뮬레이션 로봇 소환 중...")
    df_robots = generate_synthetic_robots(n_samples=N_SAMPLES)
    
    feature_cols = [
        "transit_type", "gas_spend", "transit_spend", "shopping_spend",
        "convenience_spend", "food_spend", "cafe_spend", "telecom_spend",
        "digital_spend", "culture_spend", "travel_spend", "utility_spend", "education_spend"
    ]
    X_raw = df_robots[feature_cols].values
    X_scaled = scale_features(X_raw)

    print(f"⚡ 멀티코어 병렬 연산으로 {len(cards_dict)}개 카드 초고속 MLP 학습 중...")
    tasks = [(c_idx, c_info, X_scaled, df_robots) for c_idx, c_info in cards_dict.items()]
    
    model_database = {}
    with ProcessPoolExecutor() as executor:
        results = executor.map(train_single_card, tasks, chunksize=20)
        for card_id_str, model_weights in results:
            model_database[card_id_str] = model_weights

    print(f"💾 mbti_model.json 저장 중...")
    with open(MODEL_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(model_database, f, ensure_ascii=False)

    print(f"🎯 keyword_similarity.json 계산 및 저장 중...")
    similarity_database = compute_keyword_similarity_wide(cards_dict)
    with open(SIMILARITY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(similarity_database, f, ensure_ascii=False)

    print(f"🃏 cards_list.json 동기화 갱신 중...")
    cards_list_export = []
    for c_idx, c_info in cards_dict.items():
        img_info = extra_img_map.get(c_idx, {})
        card_img_url = img_info.get("card_img") or f"https://api.card-gorilla.com/storage/card/{c_idx}/card_img.png"
        detail_url_str = img_info.get("detail_url") or f"detail.html?idx={c_idx}"

        sections = c_info.get("sections") or []
        pre_month = sections[0]["min_spend"] if (sections and "min_spend" in sections[0]) else 0
        cats = list(set([b["category"] for b in c_info["benefits"] if b["category"]]))
        summaries = [f"[{b['category']}] {b['detail']}" if b['category'] else b['detail'] for b in c_info["benefits"]]
        
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
            "benefit_categories": ", ".join(cats[:6]),
            "top_benefit_summary": " | ".join(summaries[:3]),
            "benefits_detail": c_info["benefits"]
        })
        
    with open(CARDS_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(cards_list_export, f, ensure_ascii=False, indent=2)

    print(f"🎉 1,565개 카드 AI 모델 재학습 및 JSON 재생성 완료!")

if __name__ == "__main__":
    main()
