# 소비 MBTI 모델 재학습 및 benefits_structured.json 이식 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `benefits_structured.json` 데이터를 기반으로 소비 MBTI 예측 모델(`train_mbti_model.py`)을 14차원(`pay_spend` 추가)으로 재학습하고, 프론트엔드(`match_game.html`, `shopping_dashboard.html`) 추론 및 퀴즈 UI를 업데이트합니다.

**Architecture:**
1. `train_mbti_model.py`에서 `benefits_structured.json`을 읽고 `benefit-calc.js` 방식의 정밀 혜택 파이썬 계산기(`calc_structured_benefit`)를 구현합니다.
2. 14차원 가상 소비 지출 프로필(`pay_spend` 포함 10,000명)을 생성하여 마일리지 카드를 제외한 할인·적립형 카드 대상 `MLPRegressor` (14x8x1) 모델을 학습하고 `mbti_model.json`, `keyword_similarity.json`, `cards_list.json`을 재생성합니다.
3. `match_game.html` 퀴즈 단계에 간편결제 질문을 추가하고 14차원 `predictMLP` 전파 및 마일리지 카드 필터링을 적용합니다.

**Tech Stack:** Python 3.12, scikit-learn (MLPRegressor), numpy, pandas, Vanilla JS (Browser)

## Global Constraints
- **가상환경**: workspace 내 `.venv` 사용
- **상대경로**: 모든 자원 지정 시 상대경로 사용
- **언어**: 주석 및 설명문 한국어 작성

---

### Task 1: `train_mbti_model.py` 14차원 및 `benefits_structured.json` 이식

**Files:**
- Modify: `card-fighter/scripts/train_mbti_model.py`
- Target Data: `card-fighter/benefits_structured.json`
- Output Data: `card-fighter/mbti_model.json`, `card-fighter/keyword_similarity.json`, `card-fighter/cards_list.json`

**Interfaces:**
- Consumes: `benefits_structured.json` (`base_rate`, `category_rates`, `cap_tiers`, `fixed_discounts`, `pick_one`, `is_mileage` 등)
- Produces: 14차원 MLP 모델 가중치가 포함된 `mbti_model.json` (`W1`: 14x8, `b1`: 8, `W2`: 8x1, `b2`: 1)

- [ ] **Step 1: Python 정밀 혜택 산출 함수 및 14차원 synthetic robot 생성 작성**

`scripts/train_mbti_model.py` 내 `load_wide_db_data`를 대신하여 `benefits_structured.json`을 읽는 `load_structured_benefits()` 함수와 14차원(지출 피처 13개 + `pay_spend`) 시뮬레이션 생성 함수 `generate_synthetic_robots(n_samples=10000)` 구현.

- [ ] **Step 2: `calc_structured_benefit` 구현 및 마일리지 카드 학습 제외 처리**

`benefits_structured.json`의 `cap_tiers`, `category_rates`, `fixed_discounts`, `pick_one`을 반영하는 파이썬 혜택 계산 로직 구현 및 마일리지/원화 0율 카드 제외 구문 추가.

- [ ] **Step 3: 모델 학습 실행 및 결과 파일 검증**

Command: `python3 card-fighter/scripts/train_mbti_model.py`
Expected Output: `mbti_model.json` 생성 완료, W1의 입력 차원이 14임을 확인.

- [ ] **Step 4: Commit**

```bash
git add card-fighter/scripts/train_mbti_model.py card-fighter/mbti_model.json card-fighter/keyword_similarity.json card-fighter/cards_list.json
git commit -m "feat: retrain MBTI MLP model with 14D features and benefits_structured.json"
```

---

### Task 2: `match_game.html` 소비 MBTI 퀴즈 UI 및 14차원 `predictMLP` 연동

**Files:**
- Modify: `card-fighter/match_game.html`

**Interfaces:**
- Consumes: `mbti_model.json` (14차원 가중치)
- Produces: 14차원 입력 기반 추론 및 마일리지 카드 필터링된 AI 추천 결과

- [ ] **Step 1: 간편결제(`pay_spend`) 퀴즈 문항 추가 및 STEP_PROGRESS_MAP 업데이트**

`match_game.html` 퀴즈 흐름에 간편결제(네이버페이, 카카오페이, 삼성페이 등) 월 지출 선택 문항 추가 및 전체 퀴즈 단계 업데이트.

- [ ] **Step 2: `predictMLP()` 14차원 스케일러 연산 및 마일리지 카드 필터링 구현**

`predictMLP`에 `pay_spend / 500000.0` 스케일링 추가 및 랭킹 계산 루프에서 `!ML_MODEL[card.idx]`인 마일리지/미학습 카드를 랭킹 후보에서 배제.

- [ ] **Step 3: 로컬 테스트 확인**

`match_game.html` 퀴즈 완료 후 콘솔 에러 없이 정상적으로 14차원 추론이 동작하고 추천 결과가 출력되는지 검증.

- [ ] **Step 4: Commit**

```bash
git add card-fighter/match_game.html
git commit -m "feat: add pay_spend question step and 14D predictMLP to match_game.html"
```

---

### Task 3: `shopping_dashboard.html` 14차원 `predictMLP` 연동

**Files:**
- Modify: `card-fighter/shopping_dashboard.html`

**Interfaces:**
- Consumes: `mbti_model.json` (14차원 가중치)
- Produces: 14차원 입력 기반 쇼핑 다이내믹 혜택 예측

- [ ] **Step 1: `shopping_dashboard.html` 내 `predictMLP` 스케일링 14차원 호환 코드 반영**

`scaled_x` 14차원 스케일링 및 `model.W1[i][j]` (14회 루프) 반영.

- [ ] **Step 2: Commit**

```bash
git add card-fighter/shopping_dashboard.html
git commit -m "feat: update predictMLP to 14D in shopping_dashboard.html"
```

---

### Task 4: 통합 검증 및 시각적 브라우저 테스팅

**Files:**
- Verify: `card-fighter/match_game.html`, `card-fighter/shopping_dashboard.html`, `card-fighter/mbti_model.json`

- [ ] **Step 1: 브라우저에서 `http://localhost:5500/match_game.html` 접속 후 소비 MBTI 게임 전체 흐름 테스트**
- [ ] **Step 2: 커밋 상태 확인 및 구현 최종 보고서 작성**
