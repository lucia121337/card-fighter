# 소비 MBTI 모델 재학습 및 benefits_structured.json 이식 설계서

## 1. 개요 및 목적
현재 카드연구소(`cardlab`) 내 소비 MBTI 찰떡카드 찾기 게임(`match_game.html`)은 `benefit_calculator_wide.sqlite` 데이터베이스의 텍스트 기반 정규식 파싱을 통해 13차원 MLPRegressor 인공신경망(`mbti_model.json`)을 학습시키고 있습니다.
이를 새로 수집 및 정제된 정밀 구조화 데이터셋 [benefits_structured.json](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/benefits_structured.json) 기반으로 재학습시켜, 예측 혜택의 정확도를 획기적으로 높이고 '간편결제' 등 최신 소비 트렌드를 예측 모델에 반영합니다.

---

## 2. 주요 변경 사항 및 설계 합의

### 2.1 마일리지 / 포인트형 카드 처리 방식
- **방침**: 마일리지 및 포인트 전용 카드는 원화(원) 가치 산출의 왜곡 방지를 위해 MLP 신경망 모델 학습 대상에서 제외하며, **소비 MBTI 퀴즈 추천 랭킹 리스트에서도 완전히 필터링하여 노출되지 않도록 처리합니다.**
- **대상**: `benefits_structured.json`에서 `is_mileage == true` 또는 `type == "마일리지"` 또는 원화 혜택율이 0인 카드는 `mbti_model.json` 생성 대상에서 배제합니다.
- **영향**: `mbti_model.json`에는 할인·적립형 카드 가중치만 저장되며, 프론트엔드 `match_game.html` 랭킹 루프 시 `!ML_MODEL[card.idx]`인 카드는 폴백 계산 없이 추천 랭킹 후보에서 배제됩니다.

### 2.2 Python 정밀 혜택 계산기 (`calc_structured_benefit`)
- [benefit-calc.js](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/benefit-calc.js)의 혜택 산출 알고리즘을 Python으로 포팅하여 10,000명의 synthetic robot 가상 지출 프로필에 대한 혜택 정답지(`y_target_raw`)를 정확히 계산합니다.
- **반영 규칙**:
  - `category_rates` (카테고리별 혜택율)
  - `cap_tiers` (전월실적 구간별 통합할인한도 적용)
  - `fixed_discounts` (정액 할인)
  - `pick_one` (선택형 혜택 중 최우선 1개 적용)
  - `base_rate` (기본 무실적/전가맹점 적립률)

### 2.3 14차원 입력 피처 확장 (`pay_spend` 추가)
- synthetic robot 지출 피처를 기존 13개에서 **14개**로 확장합니다.
  - 추가 피처: `pay_spend` (간편결제: 네이버페이, 삼성페이, 카카오페이 등 지출액)
- MLP 신경망 구조: 입력 14차원 $\rightarrow$ 은닉층 8노드(ReLU) $\rightarrow$ 출력 1차원 (`14 x 8 x 1`).
- `X_scaled` 14차원 정규화 스케일러 정의:
  `pay_spend / 500000.0` (최대 50만 원 상한 규격화)

### 2.4 프론트엔드 추론 로직 및 UI 연동
- **[match_game.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/match_game.html)**:
  - 소비 MBTI 퀴즈 단계에 **'간편결제 지출액'** 질문 문항 추가.
  - `predictMLP()` 순방향 전파 연산 함수를 14차원 스케일러 및 가중치 곱셈으로 업데이트.
  - 추천 랭킹 계산 시 `!ML_MODEL[card.idx]`(마일리지/학습제외 카드)는 랭킹 리스트에서 배제(완전 제외).
- **[shopping_dashboard.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/shopping_dashboard.html)**:
  - `predictMLP()`를 14차원 파라미터 구조로 동일 포팅.

---

## 3. 예상되는 리스크 및 검토 사항

| 구분 | 리스크 내용 | 대응 방안 |
|---|---|---|
| **학습 성능** | 10,000명 x 1,565개 카드의 복잡한 JSON 규칙 계산 시 파이썬 CPU 병목 | `ProcessPoolExecutor` 멀티코어 병렬화 및 카드별 규칙 pre-parsing으로 수십 초 내 완료 최적화 |
| **JS 호환성** | 입력 벡터 차원 변경(13 $\rightarrow$ 14)으로 인한 프론트엔드 `NaN` 발생 가능성 | `match_game.html`, `shopping_dashboard.html` 내 `predictMLP` 14차원 방어 코드 추가 |
| **마일리지 카드 추천** | MBTI 랭킹에서 마일리지 카드 제외에 따른 노출 부재 | UI 상에 '마일리지 혜택 카드는 전문 검색/카드 연구소 탭' 안내 문구 유지 |

---

## 4. 검증 계획
1. `python scripts/train_mbti_model.py` 실행을 통한 `mbti_model.json`, `keyword_similarity.json`, `cards_list.json` 정상 생성 확인.
2. `match_game.html` 소비 MBTI 퀴즈 진행 후 콘솔 오류 없이 14차원 `predictMLP` 전파 및 카드 매칭 결과 검증.
3. `shopping_dashboard.html`에서 카드별 예상 혜택 계산 검증.
