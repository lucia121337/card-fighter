# 소비 MBTI 간편결제(Pay) 동적 연동 및 결과 뷰 전수 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소비 MBTI 진단 알고리즘에 지출 비율 기반 간편결제(Pay) 동적 가중 분배를 적용하고, 퀴즈 결과 대시보드, 1위 추천 사유, 세부 혜택 모달, 레이더 차트 전 분야에 간편결제를 완벽히 연동한다.

**Architecture:** [match_game.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/match_game.html) 내 `diagnoseMBTI`, `renderSpendingSummary`, `selectBestCardItem`, `openBreakdownInspector`, `calculateDetailedBenefits`, `calculateCategoryBreakdown`, `renderRadarChart` 함수를 14차원 `pay_spend` 수치에 맞추어 통합 갱신한다.

**Tech Stack:** HTML5, Vanilla JavaScript, Chart.js.

## Global Constraints

- 간편결제 지출액은 사용자의 야외 대 실내 지출 비율에 맞추어 동적으로 분배 계산한다.
- 혜택 명세서 및 칩 목록에서 14차원 간편결제(`x[13]`)가 누락 없이 정상 렌더링되도록 한다.

---

### Task 1: 프론트엔드 MBTI 동적 지출 가중치 및 결과 뷰 간편결제(Pay) 연동 구현

**Files:**
- Modify: [match_game.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/match_game.html)

**Interfaces:**
- Consumes: `userAnswers.pay_spend`, `features[13]` (`x[13]`)
- Produces: 동적 MBTI 진단 코드, 지출 칩, 1위 추천 사유, 명세서 모달 항목, 레이더 차트 점수

- [ ] **Step 1: `diagnoseMBTI` 동적 가중치 알고리즘 업데이트**

`match_game.html` 3456~3540 라인의 `diagnoseMBTI`를 수정하여:
- `const pay = answers.pay_spend || 0;`
- `total`에 `pay` 합산 및 `catSpends`에 `{ name: "간편결제", val: pay }` 포함
- `outdoorRatio` / `indoorRatio` 계산으로 `pay_spend`를 야외/실내 점수에 동적 분배 가산.

- [ ] **Step 2: `renderSpendingSummary` 및 `selectBestCardItem` 간편결제 칩 연동**

`renderSpendingSummary` 4073 라인 근처 `items` 배열에 `{ label: "💳 간편결제(Pay)", val: features[13] || 0 }` 추가.
`selectBestCardItem` 3814 라인 근처 `spendItems` 배열에 `{ name: "간편결제", val: feats[13] || 0 }` 추가.

- [ ] **Step 3: `openBreakdownInspector` 모달 및 혜택 산출 함수 14차원 확장**

- `openBreakdownInspector` 내 `x` 배열 14번째 요소 `userAnswers.pay_spend` 포함 (`x[13]`).
- `calculateDetailedBenefits` 4424 라인에 `13. 💳 간편결제(Pay)` 혜택 항목 추가 (`["간편결제", "네이버페이", "카카오페이", "삼성페이", "페이코", "스마일페이", "SSG페이", "L.pay", "Pay"]` 카테고리 매칭).
- `calculateCategoryBreakdown` 4030 라인 근처 `spendMap`에 `"💳 간편결제(Pay)": x[13]` 추가.

- [ ] **Step 4: `renderRadarChart` 레이더 차트 간편결제 연동**

- `digitalScore` 및 `shoppingScore` 축 계산 시 `features[13]` 지출액을 합산 스케일링.

---

### Task 2: 프론트엔드 연동 종합 검증

**Files:**
- Test: [scratch/test_mbti_pay_integration.js](file:///Users/yonghee/.gemini/antigravity-ide/brain/412bc546-e42b-46cf-b192-63855dfed6f3/scratch/test_mbti_pay_integration.js)

- [ ] **Step 1: Node.js 단위 테스트 스크립트 작성 및 14차원 연동 검증**

Run: `node /Users/yonghee/.gemini/antigravity-ide/brain/412bc546-e42b-46cf-b192-63855dfed6f3/scratch/test_mbti_pay_integration.js`
Expected: `diagnoseMBTI` 및 `calculateDetailedBenefits`가 `pay_spend` 수치를 포함하여 정상 동작함을 통과.
