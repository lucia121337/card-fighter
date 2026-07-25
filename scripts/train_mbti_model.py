# -*- coding: utf-8 -*-
"""소비 MBTI 찰떡카드 AI 예측 모델 학습 & 유사도 추출 스크립트 (10차원 신경망 모델 확장 버전).

작동 원리:
  1. cards_list.json 에서 카드 상품 데이터를 읽어옵니다.
  2. 3,000 명의 가상 지출 패턴 데이터를 생성합니다. (10대 세분화 지출 영역)
  3. 각 카드별 룰 베이스 혜택 계산기로 월 예상 할인액 정답지를 계산합니다.
     - 10차원 피처와 개별 카드사 카테고리 혜택 규칙을 1:1로 매핑하여 예측 정확도를 극대화합니다.
  4. scikit-learn MLPRegressor를 활용해 10대 피처별 혜택액 예측 모델을 학습합니다.
     - 가중치 W1 의 크기는 (10, 8)로 확장됩니다.
  5. 학습된 신경망 가중치(W1, b1, W2, b2)를 mbti_model.json에 저장합니다.
  6. 9가지 관심 키워드와 카드 혜택 텍스트 간의 연관 유사도를 계산하여 매핑 파일로 저장합니다.
"""
import os
import json
import numpy as np
import pandas as pd
from sklearn.neural_network import MLPRegressor

# 경로 설정
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_LIST_PATH = os.path.join(ROOT, "cards_list.json")
MODEL_OUTPUT_PATH = os.path.join(ROOT, "mbti_model.json")
SIMILARITY_OUTPUT_PATH = os.path.join(ROOT, "keyword_similarity.json")

# 취향 키워드 연관어 정의
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

def clean_benefit_text(card):
    text_parts = []
    if "benefit_categories" in card and card["benefit_categories"]:
        text_parts.append(card["benefit_categories"])
    if "top_benefit_summary" in card and card["top_benefit_summary"]:
        text_parts.append(card["top_benefit_summary"])
    if "card_name" in card and card["card_name"]:
        text_parts.append(card["card_name"])
    return " ".join(text_parts).lower()

def compute_keyword_similarity(cards):
    similarity_data = {}
    for card in cards:
        idx = str(card["idx"])
        card_text = clean_benefit_text(card)
        categories = [c.strip() for c in (card.get("benefit_categories") or "").split(",") if c.strip()]
        
        sim_scores = {}
        for keyword, related_words in KEYWORDS_MAP.items():
            cat_match = 0
            for cat in categories:
                if keyword in cat or any(w in cat for w in related_words if len(w) >= 2):
                    cat_match = 0.6
                    break
            
            word_count = sum(1 for w in related_words if w.lower() in card_text)
            text_match = min(word_count * 0.15, 0.4)
            
            total_score = cat_match + text_match
            if "모든가맹점" in categories or "무실적" in categories:
                total_score = max(total_score, 0.15)
                
            sim_scores[keyword] = round(min(total_score, 1.0), 3)
            
        similarity_data[idx] = sim_scores
        
    return similarity_data

def generate_synthetic_robots(n_samples=3000):
    """가상 지출 패턴 데이터를 생성합니다 (13차원 피처)."""
    np.random.seed(42)
    
    # 1. transit_type (0: 대중교통, 1: 자차)
    transit_type = np.random.choice([0, 1], size=n_samples, p=[0.55, 0.45])
    
    # 2. gas_spend (주유비, 자차일 때만 유의미)
    gas_spend = np.where(transit_type == 1, np.random.normal(loc=150000, scale=50000, size=n_samples), 0)
    gas_spend = np.clip(gas_spend, 0, 450000)
    
    # 3. transit_spend (대중교통 요금)
    transit_spend = np.where(transit_type == 0, np.random.normal(loc=80000, scale=20000, size=n_samples), np.random.normal(loc=15000, scale=5000, size=n_samples))
    transit_spend = np.clip(transit_spend, 0, 180000)
    
    # 4. shopping_spend (대형마트/쇼핑몰/e커머스)
    shopping_spend = np.random.exponential(scale=250000, size=n_samples)
    shopping_spend = np.clip(shopping_spend, 0, 1000000)
    
    # 5. convenience_spend (편의점/생활잡화/다이소/올리브영)
    convenience_spend = np.random.normal(loc=80000, scale=30000, size=n_samples)
    convenience_spend = np.clip(convenience_spend, 0, 300000)
    
    # 6. food_spend (외식/배달음식 식비)
    food_spend = np.random.normal(loc=300000, scale=120000, size=n_samples)
    food_spend = np.clip(food_spend, 0, 1000000)
    
    # 7. cafe_spend (카페/베이커리/스타벅스)
    cafe_spend = np.random.normal(loc=60000, scale=25000, size=n_samples)
    cafe_spend = np.clip(cafe_spend, 0, 300000)
    
    # 8. telecom_spend (순수 통신비)
    telecom_spend = np.random.normal(loc=60000, scale=20000, size=n_samples)
    telecom_spend = np.clip(telecom_spend, 0, 150000)
    
    # 9. digital_spend (디지털구독/OTT)
    digital_spend = np.random.choice([10000, 25000, 50000, 80000], size=n_samples, p=[0.4, 0.3, 0.2, 0.1])
    digital_spend = np.clip(digital_spend, 0, 150000)
    
    # 10. culture_spend (문화/도서/영화/공연)
    culture_spend = np.random.exponential(scale=60000, size=n_samples)
    culture_spend = np.clip(culture_spend, 0, 300000)
    
    # 11. travel_spend (국내외 여행/숙박/항공)
    travel_spend = np.random.exponential(scale=250000, size=n_samples)
    travel_spend = np.clip(travel_spend, 0, 1000000)
    
    # 12. utility_spend (공과금/아파트관리비/납부)
    utility_spend = np.random.normal(loc=200000, scale=60000, size=n_samples)
    utility_spend = np.clip(utility_spend, 0, 600000)
    
    # 13. education_spend (학원비/교육/도서)
    education_spend = np.random.exponential(scale=200000, size=n_samples)
    education_spend = np.clip(education_spend, 0, 1000000)
    
    df = pd.DataFrame({
        "transit_type": transit_type,
        "gas_spend": gas_spend,
        "transit_spend": transit_spend,
        "shopping_spend": shopping_spend,
        "convenience_spend": convenience_spend,
        "food_spend": food_spend,
        "cafe_spend": cafe_spend,
        "telecom_spend": telecom_spend,
        "digital_spend": digital_spend,
        "culture_spend": culture_spend,
        "travel_spend": travel_spend,
        "utility_spend": utility_spend,
        "education_spend": education_spend
    })
    
    df["total_spend"] = df[["gas_spend", "transit_spend", "shopping_spend", "convenience_spend", "food_spend", "cafe_spend", "telecom_spend", "digital_spend", "culture_spend", "travel_spend", "utility_spend", "education_spend"]].sum(axis=1)
    return df

def calculate_card_benefits(df_robots, card):
    """카드 혜택 정합성 계산기 (13차원 퀴즈 피처와 1:1 매핑 정산)."""
    categories = [c.strip() for c in (card.get("benefit_categories") or "").split(",") if c.strip()]
    pre_month_limit = float(card.get("pre_month_money") or 0)
    
    if "무실적" in categories:
        qualify_mask = np.ones(len(df_robots), dtype=bool)
    else:
        qualify_mask = df_robots["total_spend"] >= pre_month_limit
        
    benefit = np.zeros(len(df_robots))
    
    # 1) 주유
    if "주유" in categories:
        gas_benefit = np.minimum(df_robots["gas_spend"] * 0.1, 20000)
        benefit += np.where(qualify_mask, gas_benefit, 0)
        
    # 2) 교통
    if "교통" in categories:
        transit_benefit = np.minimum(df_robots["transit_spend"] * 0.1, 10000)
        benefit += np.where(qualify_mask, transit_benefit, 0)
        
    # 3) 쇼핑
    if "쇼핑" in categories:
        shopping_benefit = np.minimum(df_robots["shopping_spend"] * 0.06, 25000)
        benefit += np.where(qualify_mask, shopping_benefit, 0)
        
    # 4) 마트/편의점 (편의점/생활잡화 추가 매핑)
    if "마트/편의점" in categories:
        conv_benefit = np.minimum(df_robots["convenience_spend"] * 0.08, 15000)
        benefit += np.where(qualify_mask, conv_benefit, 0)
        
    # 5) 푸드
    if "푸드" in categories:
        food_benefit = np.minimum(df_robots["food_spend"] * 0.07, 25000)
        benefit += np.where(qualify_mask, food_benefit, 0)
        
    # 6) 카페/디저트
    if "카페/디저트" in categories:
        cafe_benefit = np.minimum(df_robots["cafe_spend"] * 0.1, 10000)
        benefit += np.where(qualify_mask, cafe_benefit, 0)
        
    # 7) 통신
    if "통신" in categories:
        telecom_benefit = np.minimum(df_robots["telecom_spend"] * 0.1, 10000)
        benefit += np.where(qualify_mask, telecom_benefit, 0)
        
    # 8) OTT/영화/문화 (디지털구독 및 문화생활 매핑)
    if "OTT/영화/문화" in categories:
        digital_benefit = np.minimum(df_robots["digital_spend"] * 0.15, 6000)
        culture_benefit = np.minimum(df_robots["culture_spend"] * 0.1, 12000)
        benefit += np.where(qualify_mask, digital_benefit + culture_benefit, 0)
        
    # 9) 모든가맹점 기본 할인
    if "모든가맹점" in categories:
        all_benefit = df_robots["total_spend"] * 0.008
        benefit += np.where(qualify_mask, all_benefit, 0)
        
    # 10) 항공마일리지 및 프리미엄, 여행/숙박
    if "항공마일리지" in categories or "프리미엄" in categories or "여행/숙박" in categories:
        travel_benefit = np.minimum(df_robots["travel_spend"] * 0.05, 50000)
        benefit += np.where(qualify_mask, travel_benefit, 0)
        
    # 11) 공과금
    if "공과금" in categories or "공과금/납부" in categories:
        utility_benefit = np.minimum(df_robots["utility_spend"] * 0.1, 10000)
        benefit += np.where(qualify_mask, utility_benefit, 0)
        
    # 13) 통합 할인 한도 (Total Limit) 적용
    # 모든 카드에 대해 실적 비례 한도를 일괄 적용하되, 연회비 10만원 이상 초고가 프리미엄만 특별 가중치 한도를 줍니다.
    import re
    fee_str = str(card.get("annual_fee") or "")
    fees = [int(s.replace(",", "")) for s in re.findall(r'[\d,]+', fee_str) if s.replace(",", "").isdigit()]
    max_fee = max(fees) if fees else 0

    if pre_month_limit == 0:
        total_limit = 15000
    elif pre_month_limit <= 300000:
        total_limit = 20000
    elif pre_month_limit <= 500000:
        total_limit = 35000
    else:
        total_limit = 50000
        
    # 연회비 10만원 이상 프리미엄 카드 한도 상향
    if max_fee >= 100000:
        total_limit = max(total_limit, 80000)
        
    benefit = np.minimum(benefit, total_limit)
        
    return np.round(benefit, -1)

def scale_features(X_raw):
    """13차원 피처 데이터를 개별 규격에 맞추어 MinMax 정규화 스케일링합니다."""
    X_scaled = np.zeros_like(X_raw, dtype=float)
    X_scaled[:, 0] = X_raw[:, 0]  # transit_type (0 or 1)
    X_scaled[:, 1] = X_raw[:, 1] / 450000.0  # gas_spend
    X_scaled[:, 2] = X_raw[:, 2] / 180000.0  # transit_spend
    X_scaled[:, 3] = X_raw[:, 3] / 1000000.0  # shopping_spend
    X_scaled[:, 4] = X_raw[:, 4] / 300000.0  # convenience_spend
    X_scaled[:, 5] = X_raw[:, 5] / 1000000.0  # food_spend
    X_scaled[:, 6] = X_raw[:, 6] / 300000.0  # cafe_spend
    X_scaled[:, 7] = X_raw[:, 7] / 150000.0  # telecom_spend
    X_scaled[:, 8] = X_raw[:, 8] / 150000.0  # digital_spend
    X_scaled[:, 9] = X_raw[:, 9] / 300000.0  # culture_spend
    X_scaled[:, 10] = X_raw[:, 10] / 1000000.0  # travel_spend
    X_scaled[:, 11] = X_raw[:, 11] / 600000.0  # utility_spend
    X_scaled[:, 12] = X_raw[:, 12] / 1000000.0  # education_spend
    return X_scaled

def main():
    print("1. 카드 상품 리스트 로딩...")
    if not os.path.exists(CARDS_LIST_PATH):
        print(f"오류: {CARDS_LIST_PATH} 파일이 존재하지 않습니다.")
        return
        
    with open(CARDS_LIST_PATH, "r", encoding="utf-8") as f:
        cards = json.load(f)
    print(f"총 {len(cards)}개의 카드를 읽어왔습니다.")
    
    # 2. 키워드 유사도 연산 및 내보내기
    print("2. 취향 키워드 유사도 연산 중...")
    similarity_data = compute_keyword_similarity(cards)
    with open(SIMILARITY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(similarity_data, f, ensure_ascii=False, indent=2)
    print(f"유사도 매핑 저장 완료: {SIMILARITY_OUTPUT_PATH}")
    
    # 3. 13차원 3,000 지출 데이터 생성
    print("3. 13차원 가상 지출 패턴 로봇 3,000개 생성 중...")
    df_robots = generate_synthetic_robots(3000)
    
    X_raw = df_robots[[
        "transit_type", "gas_spend", "transit_spend", "shopping_spend",
        "convenience_spend", "food_spend", "cafe_spend", "telecom_spend",
        "digital_spend", "culture_spend", "travel_spend", "utility_spend", "education_spend"
    ]].values
    X = scale_features(X_raw)
    
    # 4. 카드 필터링 및 인공신경망(MLP) 학습
    trained_count = 0
    model_data = {}
    
    # 이미지와 카테고리가 선언된 모든 카드 필터링
    valid_cards = []
    for c in cards:
        if c.get("benefit_categories") and c.get("card_img") and c.get("card_name"):
            valid_cards.append(c)
            
    print(f"학습 가능한 유효 카드 개수: {len(valid_cards)}개")
    
    for i, card in enumerate(valid_cards):
        idx = str(card["idx"])
        
        Y = calculate_card_benefits(df_robots, card)
        
        # 혜택이 완전히 0인 카드는 학습 생략
        if Y.max() == 0:
            model_data[idx] = {
                "W1": [[0.0]*8 for _ in range(13)],
                "b1": [0.0]*8,
                "W2": [[0.0]]*8,
                "b2": [0.0]
            }
            continue
            
        # MLPRegressor 학습 (13대 피처 예측 구조)
        mlp = MLPRegressor(
            hidden_layer_sizes=(8,),
            activation='relu',
            solver='lbfgs',
            max_iter=100,
            random_state=42
        )
        mlp.fit(X, Y)
        
        # 가중치 행렬 직렬화
        W1 = mlp.coefs_[0].tolist()
        b1 = mlp.intercepts_[0].tolist()
        W2 = mlp.coefs_[1].tolist()
        b2 = mlp.intercepts_[1].tolist()
        
        # 소수점 4째자리 반올림
        W1_round = [[round(val, 4) for val in row] for row in W1]
        b1_round = [round(val, 4) for val in b1]
        W2_round = [[round(val, 4) for val in row] for row in W2]
        b2_round = [round(val, 4) for val in b2]
        
        model_data[idx] = {
            "W1": W1_round,
            "b1": b1_round,
            "W2": W2_round,
            "b2": b2_round
        }
        
        trained_count += 1
        if (i + 1) % 150 == 0 or (i + 1) == len(valid_cards):
            print(f"진행 상황: {i + 1}/{len(valid_cards)} 카드 학습 완료...")
            
    # mbti_model.json에 결과 저장
    with open(MODEL_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(model_data, f, ensure_ascii=False)
        
    print(f"\nAI 추천 예측 모델 13차원 확장 완료! 총 {trained_count}개 카드 신경망 모델 저장.")
    print(f"모델 파일 저장 위치: {MODEL_OUTPUT_PATH}")

if __name__ == "__main__":
    main()
