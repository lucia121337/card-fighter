# Home Recommendation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 카드파이터 브랜드와 기능을 유지하면서 홈을 두 개의 추천 시작 경로, 대표 카드 1+2 구성, 캐시백 순위, 상태형 비교함 중심으로 재구성한다.

**Architecture:** `index.html`은 홈의 의미 구조와 기존 전역 기능 어댑터를 유지한다. `home-recommendation.js`의 순수 HTML 생성 함수가 대표 카드·캐시백 순위·비교 상태를 만들고, `home-recommendation.css`가 같은 데이터에 서로 다른 화면 리듬을 부여한다. 새로운 API나 저장 형식은 만들지 않는다.

**Tech Stack:** 정적 HTML5, CSS3, 브라우저 JavaScript, Node.js `node:test`, 로컬 정적 서버

## Global Constraints

- `feature/home-recommendation-hub` 브랜치에서만 작업한다.
- 공통 파일 `index.html`의 홈 영역과 홈 연결 코드만 수정한다.
- 기존 `DATA`, `getPlatformCompanies`, `compareList`, `showSection`, `activeCategories`, `applyFilters`, `toggleCompare`, `goCompare`를 재사용한다.
- 기존 파란색 `#145CE6`, 네이비 `#10244A`, GmarketSans, Noto Sans KR을 유지한다.
- 새로운 API, 패키지, 추천 알고리즘, 저장 형식을 추가하지 않는다.
- 모바일 390px에서 가로 스크롤이 없어야 하며 모든 홈 링크·버튼의 높이는 44px 이상이어야 한다.

---

### Task 1: 대표 카드·캐시백·비교 상태 렌더링 계약

**Files:**
- Modify: `src/picking/test_home_recommendation.js`
- Modify: `home-recommendation.js`

**Interfaces:**
- Consumes: 카드 배열, 캐시백 회사 배열, 기존 `compareList`
- Produces: `renderFeaturedCardsHtml(cards)`, `renderCashbackHtml(companies)`, `getCompareState(compareList)`, `renderCompare(compareList)`

- [ ] **Step 1: 새 화면 행동의 실패 테스트 작성**

다음 동작을 실제 HTML 반환값과 상태 객체로 검증한다.

```js
test('대표 카드 세 장을 큰 카드 한 장과 작은 후보 두 장으로 구분한다', () => {
  const cards = [
    {idx: 1, card_name: '생활 카드', company: 'A', homeReason: '생활비 추천'},
    {idx: 2, card_name: '쇼핑 카드', company: 'B', homeReason: '쇼핑 추천'},
    {idx: 3, card_name: '주유 카드', company: 'C', homeReason: '주유 추천'}
  ];
  const html = HomeRecommendation.renderFeaturedCardsHtml(cards);
  assert.equal((html.match(/is-lead/g) || []).length, 1);
  assert.equal((html.match(/is-compact/g) || []).length, 2);
});

test('캐시백 혜택을 금액순 순위 목록으로 만든다', () => {
  const html = HomeRecommendation.renderCashbackHtml([
    {name: 'A카드', maxAmount: 20, bestPlatform: 'A플랫폼'},
    {name: 'B카드', maxAmount: 85, bestPlatform: 'B플랫폼'},
    {name: 'C카드', maxAmount: 50, bestPlatform: 'C플랫폼'}
  ]);
  assert.match(html, /home-cashback-rank/);
  assert.ok(html.indexOf('B카드') < html.indexOf('C카드'));
  assert.ok(html.indexOf('C카드') < html.indexOf('A카드'));
});

test('비교함 카드 수에 따라 안내와 행동을 바꾼다', () => {
  assert.deepEqual(HomeRecommendation.getCompareState([]), {
    count: 0, tone: 'empty', title: '비교할 카드를 먼저 골라보세요', actionLabel: '비교할 카드 찾기'
  });
  assert.equal(HomeRecommendation.getCompareState([{idx: 1}]).tone, 'waiting');
  assert.equal(HomeRecommendation.getCompareState([{idx: 1}, {idx: 2}]).tone, 'ready');
  assert.equal(HomeRecommendation.getCompareState([{idx: 1}, {idx: 2}]).actionLabel, '바로 비교하기');
});
```

- [ ] **Step 2: 실패 이유 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `is-lead` 개수 불일치 또는 `getCompareState is not a function`으로 실패한다.

- [ ] **Step 3: 최소 렌더링 구현**

`renderFeaturedCardsHtml`에서 첫 카드에 `is-lead`, 나머지 카드에 `is-compact`를 붙인다. `renderCashbackHtml`은 상위 세 개를 다음 구조로 반환한다.

```html
<ol class="home-cashback-rank">
  <li class="home-cashback-row">
    <span class="home-rank-number">1</span>
    <div><strong>카드사</strong><small>플랫폼</small></div>
    <b>최대 85만원</b>
    <button type="button" data-home-action="cashback">혜택 확인</button>
  </li>
</ol>
```

`getCompareState`는 카드 수에 따라 다음 값을 반환한다.

```js
function getCompareState(compareList) {
  const count = Array.isArray(compareList) ? compareList.length : 0;
  if (count >= 2) return {count, tone: 'ready', title: `${count}장을 바로 비교할 수 있어요`, actionLabel: '바로 비교하기'};
  if (count === 1) return {count, tone: 'waiting', title: '한 장 더 담으면 비교할 수 있어요', actionLabel: '카드 더 찾기'};
  return {count, tone: 'empty', title: '비교할 카드를 먼저 골라보세요', actionLabel: '비교할 카드 찾기'};
}
```

`renderCompare`는 `#home-compare-panel`에 `data-compare-tone`, 제목, 설명, 버튼 문구를 반영하고 기존 `#home-compare-count`가 존재하면 함께 갱신한다.

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: 11개 테스트가 모두 통과한다.

- [ ] **Step 5: 커밋**

```powershell
git add home-recommendation.js src/picking/test_home_recommendation.js
git commit -m "refactor: 홈 추천 콘텐츠 표현 개선"
```

---

### Task 2: 홈 의미 구조 재배치

**Files:**
- Modify: `index.html:700-765`
- Modify: `home-recommendation.css`

**Interfaces:**
- Consumes: Task 1의 `#home-featured-cards`, `#home-cashback-list`, `#home-compare-panel`
- Produces: 히어로 → 혜택 빠른 선택 → 대표 카드 → 캐시백 순위 → 비교함 → 카드 연구소 → 신뢰 정보 순서의 DOM

- [ ] **Step 1: 현재 브라우저에서 구조 실패 상태 기록**

다음 값을 확인한다.

```js
({
  pathGrid: document.querySelectorAll('.home-path-grid').length,
  sectionOrder: [...document.querySelectorAll('#home-recommendation > section')]
    .map(section => section.querySelector('h2')?.textContent.trim()),
  comparePanel: Boolean(document.querySelector('#home-compare-panel'))
})
```

Expected: `pathGrid`가 `1`, 빠른 혜택 영역이 경로 카드 뒤에 있으며 `comparePanel`이 `false`다.

- [ ] **Step 2: `index.html` 홈 구조 교체**

- 기존 `.home-path-grid` 영역을 제거한다.
- 히어로에는 CTA 두 개와 `카드고릴라 공개 데이터 기준 · 결과는 참고용` 신뢰 요약을 둔다.
- 빠른 혜택 제목을 `혜택으로 바로 찾기`로 바꾸고 히어로 다음에 둔다.
- 대표 카드 제목을 `생활 상황별 대표 카드`로 바꾼다.
- 캐시백 영역의 렌더링 대상은 유지하되 순위 목록을 담는 컨테이너로 사용한다.
- 비교 영역에 `id="home-compare-panel"`과 `id="home-compare-title"`, `id="home-compare-summary"`, `id="home-compare-action"`을 둔다.
- 카드 연구소와 데이터 신뢰 정보는 마지막에 유지한다.

- [ ] **Step 3: 구조 브라우저 검증**

Expected:

- `.home-path-grid`가 `0`이다.
- `#home-quick-title`이 `#home-featured-title`보다 먼저 나온다.
- `#home-compare-panel`이 존재한다.
- 카테고리 버튼은 8개다.

- [ ] **Step 4: 커밋**

```powershell
git add index.html
git commit -m "refactor: 홈 추천 흐름을 두 경로로 단순화"
```

---

### Task 3: 화면 리듬과 모바일 디자인

**Files:**
- Modify: `home-recommendation.css`

**Interfaces:**
- Consumes: Task 2의 새 홈 클래스와 Task 1의 `is-lead`, `is-compact`, `.home-cashback-rank`, `data-compare-tone`
- Produces: 데스크톱 대표 카드 1+2 구성, 세로 캐시백 순위, 상태형 비교 패널, 모바일 1열 화면

- [ ] **Step 1: 기존 스타일과 새 DOM 사이 시각 결함 확인**

새 구조를 브라우저로 열어 대표 카드가 동일한 3열로 보이거나 캐시백 행이 정렬되지 않는 상태를 확인한다.

- [ ] **Step 2: 데스크톱 스타일 구현**

- 히어로 높이와 여백을 줄여 다음 영역의 시작이 첫 화면 하단에 보이게 한다.
- `.home-featured-grid`를 2열로 만들고 `.is-lead`를 첫 열 전체 높이, 두 `.is-compact`를 오른쪽 위·아래에 배치한다.
- `.home-cashback-rank`는 하나의 흰색 표면 안에 세로 행으로 만들고 행 사이를 구분선으로 나눈다.
- `.home-compare-panel`은 상태에 따라 네이비 강조 또는 차분한 빈 상태를 사용한다.
- `home-lab`은 카드 그림자를 제거하고 선과 여백으로 구분한다.
- 모든 홈 링크와 버튼의 최소 높이를 44px로 맞춘다.

- [ ] **Step 3: 모바일 스타일 구현**

`@media (max-width: 720px)`에서 다음을 적용한다.

- 히어로를 한 열로 압축하고 제목 크기를 31px 이하로 제한한다.
- 혜택 버튼을 2열로 배치한다.
- 대표 카드 세 장과 캐시백 행을 한 열로 배치한다.
- 캐시백 금액과 행동 버튼이 줄바꿈돼도 읽는 순서가 유지되게 한다.
- 상단 메뉴를 제외한 문서 전체 가로 넘침이 없게 한다.

- [ ] **Step 4: 접근성·반응형 브라우저 검증**

Desktop `1440×900`과 Mobile `390×844`에서 다음을 확인한다.

- 문서 가로 넘침 `0`
- 홈 링크·버튼 높이 최솟값 `44`
- 추천 카드 수 `3`, 캐시백 행 수 `3`, 카테고리 수 `8`
- 모바일 히어로 높이가 `700px` 미만

- [ ] **Step 5: 커밋**

```powershell
git add home-recommendation.css
git commit -m "style: 홈 추천 화면 리듬과 모바일 구성 개선"
```

---

### Task 4: 전체 기능 회귀 검증과 마무리

**Files:**
- Modify only if a verified defect requires it: `index.html`, `home-recommendation.css`, `home-recommendation.js`, `src/picking/test_home_recommendation.js`

**Interfaces:**
- Consumes: 완성된 홈과 기존 카드·캐시백·비교·계산기 기능
- Produces: 데스크톱·모바일에서 검증된 홈 재구성

- [ ] **Step 1: 자동 테스트 실행**

Run:

```powershell
node --check home-recommendation.js
node src/picking/test_home_recommendation.js
node src/picking/test_calculator_qa.js
node src/picking/test_3tier_ui_qa.js
node src/picking/test_card688_qa.js
```

Expected: 모든 명령 exit code `0`, 홈 테스트 실패 `0`, 기존 계산 검증 실패 `0`.

- [ ] **Step 2: 실제 상호작용 확인**

- `혜택으로 빠르게 찾기`가 전체카드를 연다.
- `주유`가 전체카드의 주유 필터 하나를 활성화한다.
- 대표 카드 상세 링크가 `detail.html?idx=...`를 가진다.
- 캐시백 `혜택 확인`이 기존 캐시백 섹션을 연다.
- 비교함 상태 문구가 카드 수에 따라 갱신된다.

- [ ] **Step 3: 브라우저 오류와 Git 상태 확인**

Run:

```powershell
git diff --check
git status --short
```

정적 서버의 `/api/naver-trends` 404는 서버리스 API를 띄우지 않았을 때의 기존 제한으로 분리해 기록한다. 새로운 홈 관련 브라우저 오류는 없어야 한다.

- [ ] **Step 4: 검증 중 수정이 있다면 테스트를 먼저 추가하고 커밋**

```powershell
git add index.html home-recommendation.css home-recommendation.js src/picking/test_home_recommendation.js
git commit -m "fix: 홈 추천 재구성 검증 문제 보정"
```
