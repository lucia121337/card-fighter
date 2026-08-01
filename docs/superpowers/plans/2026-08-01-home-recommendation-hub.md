# Home Recommendation Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 카드파이터 디자인과 기능을 유지하면서 사용자가 추천·혜택 탐색·비교 경로를 바로 선택할 수 있는 홈 추천 허브를 구현한다.

**Architecture:** `index.html`에는 홈의 의미 구조와 기존 전역 기능 연결점만 둔다. 홈 전용 스타일은 `home-recommendation.css`, 데이터 선택과 DOM 렌더링은 `home-recommendation.js`로 분리한다. 기존 `cards_list.json`, `CASHBACK`, `compareList`, `showSection`, `toggleCatFilter`, `toggleCompare`를 재사용하며 새로운 API나 저장 형식은 만들지 않는다.

**Tech Stack:** 정적 HTML5, CSS3, 브라우저 JavaScript, Node.js 기본 `assert` 테스트, Python 정적 HTTP 서버

## Global Constraints

- `main`이 아닌 `feature/home-recommendation-hub` 브랜치에서만 작업한다.
- 공통 파일 `index.html`을 수정하되 기존 GNB, 검색, 전체카드, 캐시백, 할인가맹점 동작을 유지한다.
- 새 패키지와 새 추천 알고리즘을 추가하지 않는다.
- 홈은 기존 파란색 브랜드, 흰색 카드, 절제된 그림자와 둥근 모서리를 따른다.
- 자동 슬라이드와 장식용 대형 이미지를 사용하지 않는다.
- 대표 카드와 캐시백 로드가 실패해도 이동 가능한 복구 안내를 제공한다.
- 데스크톱과 모바일에서 가로 스크롤이 발생하지 않게 한다.

## File Structure

- Create: `home-recommendation.js` — 카테고리 매핑, 대표 카드·캐시백 선정, 홈 DOM 렌더링과 이벤트 연결
- Create: `home-recommendation.css` — 홈 추천 허브 전용 레이아웃, 상태, 반응형, 포커스 스타일
- Create: `src/picking/test_home_recommendation.js` — 순수 데이터 선택 로직과 필수 HTML/CSS 계약 검증
- Modify: `index.html:8-12` — 홈 스타일시트 연결
- Modify: `index.html:698-706` — 준비중 홈을 추천 허브 시맨틱 마크업으로 교체
- Modify: `index.html:854-910` — 비교함 상태 변경 시 홈 요약 갱신 이벤트 연결
- Modify: `index.html:1658-1674` — 카드 데이터 로드 후 홈 대표 카드 갱신
- Modify: `index.html`의 `</body>` 직전 — 홈 스크립트 로드와 기존 기능 어댑터 초기화

---

### Task 1: 홈 데이터 선택 모듈

**Files:**
- Create: `home-recommendation.js`
- Create: `src/picking/test_home_recommendation.js`

**Interfaces:**
- Consumes: 카드 배열 `{idx, card_name, company, card_img, benefit_categories, top_benefit_summary, pre_month_money, annual_fee}`와 캐시백 배열 `{name, maxAmount, bestPlatform}`
- Produces: `HomeRecommendation.CATEGORY_MAP`, `selectFeaturedCards(cards, limit)`, `selectCashbackHighlights(companies, limit)`, `formatPerformance(amount)`

- [ ] **Step 1: 순수 데이터 로직의 실패 테스트 작성**

`src/picking/test_home_recommendation.js`를 만들고 다음 계약을 작성한다.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HomeRecommendation = require(path.resolve(__dirname, '../../home-recommendation.js'));

assert.deepEqual(HomeRecommendation.CATEGORY_MAP, {
  '생활비': '공과금/렌탈',
  '쇼핑': '쇼핑',
  '교통': '교통',
  '주유': '주유',
  '카페·디저트': '카페/디저트',
  '여행·숙박': '여행/숙박',
  '항공마일리지': '항공마일리지',
  '프리미엄': '프리미엄'
});

const cards = [
  {idx: 1, card_name: '생활 카드', company: 'A', benefit_categories: '공과금/렌탈,교통', top_benefit_summary: '생활비 10% 할인'},
  {idx: 2, card_name: '쇼핑 카드', company: 'B', benefit_categories: '쇼핑', top_benefit_summary: '쇼핑 10% 할인'},
  {idx: 3, card_name: '주유 카드', company: 'C', benefit_categories: '주유', top_benefit_summary: '주유 10% 할인'},
  {idx: 4, card_name: '중복 카드', company: 'A', benefit_categories: '쇼핑', top_benefit_summary: '쇼핑 적립'}
];
const featured = HomeRecommendation.selectFeaturedCards(cards, 3);
assert.equal(featured.length, 3);
assert.deepEqual(featured.map(card => card.idx), [1, 2, 3]);

const cashback = HomeRecommendation.selectCashbackHighlights([
  {name: 'A카드', maxAmount: 20, bestPlatform: '네이버페이'},
  {name: 'B카드', maxAmount: 85, bestPlatform: '아정당카드'},
  {name: 'C카드', maxAmount: 50, bestPlatform: '카드고릴라'},
  {name: 'D카드', maxAmount: 0, bestPlatform: null}
], 3);
assert.deepEqual(cashback.map(item => item.name), ['B카드', 'C카드', 'A카드']);
assert.equal(HomeRecommendation.formatPerformance(300000), '30만원');
assert.equal(HomeRecommendation.formatPerformance(0), '조건 없음');

const source = fs.readFileSync(path.resolve(__dirname, '../../home-recommendation.js'), 'utf8');
assert.ok(source.includes('module.exports = HomeRecommendation'));
console.log('home recommendation data tests: PASS');
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `Cannot find module '../../home-recommendation.js'`

- [ ] **Step 3: 최소 데이터 선택 모듈 구현**

`home-recommendation.js`에 다음 순수 로직을 작성한다.

```js
(function (root) {
  'use strict';

  const CATEGORY_MAP = Object.freeze({
    '생활비': '공과금/렌탈', '쇼핑': '쇼핑', '교통': '교통', '주유': '주유',
    '카페·디저트': '카페/디저트', '여행·숙박': '여행/숙박',
    '항공마일리지': '항공마일리지', '프리미엄': '프리미엄'
  });
  const FEATURED_CATEGORIES = ['공과금/렌탈', '쇼핑', '주유', '여행/숙박', '항공마일리지'];

  function cardMatches(card, category) {
    const text = `${card.benefit_categories || ''} ${card.top_benefit_summary || ''}`;
    return text.includes(category);
  }

  function selectFeaturedCards(cards, limit = 3) {
    const picked = [];
    const companies = new Set();
    for (const category of FEATURED_CATEGORIES) {
      const card = cards.find(item => !picked.includes(item) && !companies.has(item.company) && cardMatches(item, category));
      if (!card) continue;
      picked.push({...card, homeReason: `${category} 혜택이 돋보이는 카드`});
      companies.add(card.company);
      if (picked.length === limit) break;
    }
    for (const card of cards) {
      if (picked.length === limit) break;
      if (picked.some(item => String(item.idx) === String(card.idx))) continue;
      picked.push({...card, homeReason: '다양한 생활 혜택을 제공하는 카드'});
    }
    return picked;
  }

  function selectCashbackHighlights(companies, limit = 3) {
    return [...companies]
      .filter(item => Number(item.maxAmount) > 0)
      .sort((a, b) => Number(b.maxAmount) - Number(a.maxAmount))
      .slice(0, limit);
  }

  function formatPerformance(amount) {
    return Number(amount) > 0 ? `${Math.round(Number(amount) / 10000).toLocaleString()}만원` : '조건 없음';
  }

  const HomeRecommendation = {CATEGORY_MAP, selectFeaturedCards, selectCashbackHighlights, formatPerformance};
  if (typeof module !== 'undefined' && module.exports) module.exports = HomeRecommendation;
  if (root) root.HomeRecommendation = HomeRecommendation;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 데이터 테스트 통과 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `home recommendation data tests: PASS`

- [ ] **Step 5: 커밋**

```powershell
git add home-recommendation.js src/picking/test_home_recommendation.js
git commit -m "feat: 홈 추천 데이터 선택 모듈 추가"
```

---

### Task 2: 홈 시맨틱 구조와 반응형 디자인

**Files:**
- Create: `home-recommendation.css`
- Modify: `index.html:8-12`
- Modify: `index.html:698-706`
- Modify: `src/picking/test_home_recommendation.js`

**Interfaces:**
- Consumes: Task 1의 `HomeRecommendation` 렌더링 대상 ID와 `data-home-action`, `data-home-category`
- Produces: `#home-recommendation`, `#home-featured-cards`, `#home-cashback-list`, `#home-compare-summary`, `#home-status` DOM 계약

- [ ] **Step 1: 필수 HTML/CSS 계약의 실패 테스트 추가**

테스트 파일 하단에 다음 검증을 추가한다.

```js
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const homeCss = fs.readFileSync(path.resolve(__dirname, '../../home-recommendation.css'), 'utf8');
[
  'id="home-recommendation"', 'id="home-featured-cards"', 'id="home-cashback-list"',
  'id="home-compare-summary"', 'data-home-action="calculator"',
  'data-home-action="benefits"', 'data-home-action="compare"'
].forEach(contract => assert.ok(indexHtml.includes(contract), `missing ${contract}`));
assert.ok(indexHtml.includes('home-recommendation.css'));
assert.ok(homeCss.includes('@media (max-width: 720px)'));
assert.ok(homeCss.includes(':focus-visible'));
assert.ok(!homeCss.includes('overflow-x: scroll'));
```

- [ ] **Step 2: 계약 테스트 실패 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `ENOENT: no such file or directory, open 'home-recommendation.css'`

- [ ] **Step 3: `index.html`의 준비중 홈을 추천 허브 마크업으로 교체**

`<head>`에 다음을 추가한다.

```html
<link rel="stylesheet" href="home-recommendation.css">
```

`#section-home` 안을 다음 의미 구조로 교체한다.

```html
<div id="home-recommendation" class="home-shell">
  <section class="home-hero" aria-labelledby="home-title">
    <div class="home-hero-copy">
      <span class="home-eyebrow">내 소비에 맞춘 카드 선택</span>
      <h2 id="home-title">어떤 카드가 좋은지가 아니라,<br><strong>나에게 어떤 카드가 유리한지</strong> 찾아보세요.</h2>
      <p>소비패턴과 원하는 혜택을 기준으로 계산하고 비교해 카드 선택을 도와드려요.</p>
      <div class="home-hero-actions">
        <a class="home-btn home-btn-primary" href="calculator.html" data-home-action="calculator">1분 맞춤 추천 시작</a>
        <button class="home-btn home-btn-secondary" type="button" data-home-action="benefits">혜택으로 직접 찾기</button>
      </div>
    </div>
    <aside class="home-result-preview" aria-label="추천 결과 예시">
      <span>추천 결과에서 확인할 수 있어요</span>
      <strong>예상 월 혜택 · 전월실적 · 추천 이유</strong>
      <ul><li>내 지출 기준 예상 혜택</li><li>연회비를 뺀 실질 이득</li><li>비교 카드별 유리한 영역</li></ul>
    </aside>
  </section>

  <section class="home-block" aria-labelledby="home-path-title">
    <div class="home-section-head"><span>STEP 1</span><h2 id="home-path-title">어떤 방식으로 찾아볼까요?</h2></div>
    <div class="home-path-grid">
      <a class="home-path-card is-primary" href="calculator.html" data-home-action="calculator"><b>내 소비로 추천받기</b><span>월 지출을 입력하면 예상 혜택을 계산해요</span><em>약 1분</em></a>
      <button class="home-path-card" type="button" data-home-action="benefits"><b>원하는 혜택으로 찾기</b><span>쇼핑·주유·여행 등 필요한 혜택으로 좁혀요</span><em>24개 혜택 필터</em></button>
      <button class="home-path-card" type="button" data-home-action="compare"><b>후보 카드 비교하기</b><span>담아둔 카드를 조건별로 나란히 비교해요</span><em id="home-compare-count">비교함 확인</em></button>
    </div>
  </section>

  <section class="home-block home-quick" aria-labelledby="home-quick-title">
    <div class="home-section-head"><span>QUICK PICK</span><h2 id="home-quick-title">생활에 맞는 혜택부터 골라보세요</h2></div>
    <div class="home-category-list" aria-label="상황별 카드 추천">
      <button type="button" data-home-category="생활비">📄 생활비</button><button type="button" data-home-category="쇼핑">🎁 쇼핑</button>
      <button type="button" data-home-category="교통">🚌 교통</button><button type="button" data-home-category="주유">⛽ 주유</button>
      <button type="button" data-home-category="카페·디저트">☕ 카페·디저트</button><button type="button" data-home-category="여행·숙박">🧳 여행·숙박</button>
      <button type="button" data-home-category="항공마일리지">✈️ 항공마일리지</button><button type="button" data-home-category="프리미엄">💎 프리미엄</button>
    </div>
  </section>

  <section class="home-block" aria-labelledby="home-featured-title">
    <div class="home-section-head home-head-row"><div><span>RECOMMENDED</span><h2 id="home-featured-title">지금 주목할 카드</h2></div><button type="button" data-home-action="benefits">전체카드 보기</button></div>
    <div id="home-featured-cards" class="home-featured-grid" aria-live="polite"><p id="home-status">추천 카드를 불러오고 있어요.</p></div>
  </section>

  <section class="home-block home-cashback" aria-labelledby="home-cashback-title">
    <div class="home-section-head home-head-row"><div><span>THIS MONTH</span><h2 id="home-cashback-title">이번 달 놓치기 아까운 혜택</h2></div><button type="button" data-home-action="cashback">캐시백 전체 보기</button></div>
    <div id="home-cashback-list" class="home-cashback-grid" aria-live="polite"></div>
  </section>

  <section class="home-tools" aria-labelledby="home-tools-title">
    <div><span>DECISION TOOLS</span><h2 id="home-tools-title">계산하고 비교하면 선택이 쉬워져요</h2><div id="home-compare-summary"></div></div>
    <a href="calculator.html">혜택 계산하기</a><button type="button" data-home-action="compare">비교 이어하기</button>
  </section>

  <section class="home-lab" aria-labelledby="home-lab-title"><div><span>CARD LAB</span><h2 id="home-lab-title">재미있게 찾는 나의 카드 취향</h2><p>카드 MBTI와 카드 월드컵으로 선택 기준을 발견해보세요.</p></div><a href="cardlab.html">카드 연구소 가기</a></section>
  <footer class="home-trust"><strong>데이터를 기준으로 비교합니다</strong><p>카드 정보는 카드고릴라 공개 데이터를 기준으로 하며, 신청 전 카드사 상품설명서와 약관을 확인해주세요.</p></footer>
</div>
```

- [ ] **Step 4: 기존 디자인과 맞는 전용 CSS 작성**

`home-recommendation.css`에 다음 토큰과 레이아웃을 구현한다.

```css
#section-home{padding:0 0 64px}
.home-shell{max-width:1180px;margin:0 auto;padding:32px 24px 72px;color:var(--txt)}
.home-shell *{box-sizing:border-box}
.home-hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:28px;align-items:stretch;padding:52px;border:1px solid #dbe7ff;border-radius:24px;background:linear-gradient(135deg,#f7faff 0%,#edf4ff 100%)}
.home-eyebrow,.home-section-head>span,.home-tools>div>span,.home-lab>div>span{display:block;margin-bottom:10px;color:var(--brand);font-size:12px;font-weight:800;letter-spacing:.08em}
.home-hero h2{margin:0;font-size:clamp(30px,4vw,48px);line-height:1.25;letter-spacing:-.045em}
.home-hero h2 strong{color:var(--brand)}
.home-hero p{max-width:600px;margin:20px 0 28px;color:var(--muted);font-size:16px;line-height:1.8}
.home-hero-actions{display:flex;flex-wrap:wrap;gap:10px}
.home-btn{min-height:48px;padding:13px 20px;border-radius:12px;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}
.home-btn-primary{border:1px solid var(--brand);background:var(--brand);color:#fff}
.home-btn-secondary{border:1px solid #c9d8f4;background:#fff;color:var(--brand)}
.home-result-preview{display:flex;flex-direction:column;justify-content:center;padding:28px;border:1px solid #d8e3f5;border-radius:18px;background:#fff;box-shadow:var(--shadow)}
.home-result-preview span{color:var(--muted);font-size:12px}.home-result-preview strong{margin:8px 0 16px;font-size:18px}.home-result-preview ul{margin:0;padding-left:20px;color:#475569;line-height:2}
.home-block{padding-top:58px}.home-section-head h2,.home-tools h2,.home-lab h2{margin:0;font-size:26px;letter-spacing:-.035em}.home-head-row{display:flex;justify-content:space-between;align-items:end;gap:16px}.home-head-row button{border:0;background:none;color:var(--brand);font:inherit;font-weight:800;cursor:pointer}
.home-path-grid,.home-featured-grid,.home-cashback-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:22px}
.home-path-card{display:flex;min-height:180px;flex-direction:column;align-items:flex-start;padding:24px;border:1px solid var(--line);border-radius:18px;background:#fff;color:var(--txt);font:inherit;text-align:left;text-decoration:none;cursor:pointer;box-shadow:0 8px 24px rgba(20,92,230,.05)}
.home-path-card b{font-size:18px}.home-path-card span{margin-top:12px;color:var(--muted);line-height:1.65}.home-path-card em{margin-top:auto;color:var(--brand);font-size:12px;font-style:normal;font-weight:800}
.home-path-card.is-primary{border-color:#a9c6ff;background:#f3f7ff}
.home-category-list{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.home-category-list button{min-height:44px;padding:10px 16px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--txt);font:inherit;font-weight:700;cursor:pointer}
.home-feature-card,.home-cashback-card{padding:22px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow)}
.home-tools,.home-lab{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:58px;padding:30px;border-radius:20px}.home-tools{background:#12264d;color:#fff}.home-lab{border:1px solid var(--line);background:#fff}.home-tools a,.home-tools button,.home-lab a{min-height:44px;padding:11px 16px;border-radius:11px;border:1px solid rgba(255,255,255,.35);background:#fff;color:#123;white-space:nowrap;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}
.home-trust{margin-top:42px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.7}.home-trust strong{color:var(--txt)}
.home-shell :focus-visible{outline:3px solid rgba(20,92,230,.35);outline-offset:3px}
@media (max-width:900px){.home-hero{grid-template-columns:1fr;padding:36px}.home-path-grid,.home-featured-grid{grid-template-columns:1fr 1fr}.home-cashback-grid{grid-template-columns:1fr}}
@media (max-width:720px){.home-shell{padding:20px 16px 52px}.home-hero{padding:28px 22px;border-radius:18px}.home-path-grid,.home-featured-grid{grid-template-columns:1fr}.home-head-row,.home-tools,.home-lab{align-items:flex-start;flex-direction:column}.home-hero-actions,.home-btn{width:100%}.home-btn{text-align:center}.home-block{padding-top:44px}}
```

- [ ] **Step 5: HTML/CSS 계약 테스트 통과 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `home recommendation data tests: PASS`

- [ ] **Step 6: 커밋**

```powershell
git add index.html home-recommendation.css src/picking/test_home_recommendation.js
git commit -m "feat: 홈 추천 허브 구조와 디자인 추가"
```

---

### Task 3: 기존 카드·캐시백·비교 기능 연결

**Files:**
- Modify: `home-recommendation.js`
- Modify: `index.html:854-910`
- Modify: `index.html:1658-1674`
- Modify: `index.html`의 `</body>` 직전
- Modify: `src/picking/test_home_recommendation.js`

**Interfaces:**
- Consumes: `HomeRecommendation.init({cards, cashback, compareList, actions})`, `renderCards(cards)`, `renderCompare(compareList)`
- Produces: 기존 `showSection`, `activeCategories`, `toggleCatFilter`, `applyFilters`, `toggleCompare`, `goCompare`를 호출하는 어댑터

- [ ] **Step 1: 렌더링·이동 계약 테스트 추가**

테스트 파일에 다음 검증을 추가한다.

```js
const requiredFunctions = ['init', 'renderCards', 'renderCashback', 'renderCompare'];
requiredFunctions.forEach(name => assert.equal(typeof HomeRecommendation[name], 'function', `${name} missing`));
assert.ok(indexHtml.includes('HomeRecommendation.init({'));
assert.ok(indexHtml.includes('HomeRecommendation.renderCards(DATA)'));
assert.ok(indexHtml.includes('HomeRecommendation.renderCompare(compareList)'));
assert.ok(indexHtml.includes('home-recommendation.js'));
```

- [ ] **Step 2: 렌더링 계약 테스트 실패 확인**

Run: `node src/picking/test_home_recommendation.js`

Expected: `AssertionError: init missing`

- [ ] **Step 3: 홈 렌더링 함수 구현**

`home-recommendation.js`의 공개 객체에 다음 동작을 추가한다.

```js
let state = {actions: {}, cards: [], cashback: [], compareList: []};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function renderCards(cards) {
  state.cards = cards || [];
  const root = typeof document !== 'undefined' && document.getElementById('home-featured-cards');
  if (!root) return;
  const featured = selectFeaturedCards(state.cards, 3);
  root.innerHTML = featured.length ? featured.map(card => `
    <article class="home-feature-card">
      <span class="home-card-reason">${escapeHtml(card.homeReason)}</span>
      <img src="${escapeHtml(card.card_img || '')}" alt="${escapeHtml(card.card_name)} 카드 이미지" loading="lazy">
      <div><small>${escapeHtml(card.company || '')}</small><h3>${escapeHtml(card.card_name || '')}</h3>
      <p>${escapeHtml((card.top_benefit_summary || '').split('|')[0] || '대표 혜택은 상세에서 확인하세요.')}</p>
      <dl><div><dt>전월실적</dt><dd>${formatPerformance(card.pre_month_money)}</dd></div></dl></div>
      <div class="home-card-actions"><a href="detail.html?idx=${encodeURIComponent(card.idx)}">상세 보기</a><button type="button" data-home-compare="${escapeHtml(card.idx)}">비교함 담기</button></div>
    </article>`).join('') : '<div class="home-empty"><strong>추천 카드를 불러오지 못했어요.</strong><button type="button" data-home-action="benefits">전체카드에서 찾아보기</button></div>';
}

function renderCashback(companies) {
  state.cashback = companies || [];
  const root = typeof document !== 'undefined' && document.getElementById('home-cashback-list');
  if (!root) return;
  const offers = selectCashbackHighlights(state.cashback, 3);
  root.innerHTML = offers.length ? offers.map(item => `<article class="home-cashback-card"><span>${escapeHtml(item.bestPlatform || '캐시백')}</span><strong>${escapeHtml(item.name)}</strong><b>최대 ${Number(item.maxAmount).toLocaleString()}만원</b><button type="button" data-home-action="cashback">조건 확인하기</button></article>`).join('') : '<div class="home-empty"><strong>캐시백 정보를 준비하고 있어요.</strong><button type="button" data-home-action="cashback">캐시백 화면으로 이동</button></div>';
}

function renderCompare(list) {
  state.compareList = list || [];
  const count = state.compareList.length;
  const summary = typeof document !== 'undefined' && document.getElementById('home-compare-summary');
  const badge = typeof document !== 'undefined' && document.getElementById('home-compare-count');
  if (badge) badge.textContent = count >= 2 ? `${count}장 비교 가능` : count === 1 ? '1장 더 담으면 비교 가능' : '비교함이 비어 있어요';
  if (summary) summary.textContent = count >= 2 ? `담아둔 카드 ${count}장을 바로 비교할 수 있어요.` : '카드를 2장 이상 담으면 혜택과 조건을 나란히 볼 수 있어요.';
}
```

- [ ] **Step 4: 이벤트 위임과 기존 기능 어댑터 구현**

`init`은 `#home-recommendation`에 한 번만 클릭 리스너를 등록한다. `data-home-action`은 전달받은 `actions`에서 같은 이름의 함수를 호출하고, `data-home-category`는 `actions.category(CATEGORY_MAP[label])`를 호출한다. `data-home-compare`는 카드 ID로 `state.cards`에서 카드를 찾아 `actions.toggleCompare(idx, card_name, card_img)`를 호출한 뒤 `renderCompare`를 갱신한다.

```js
function init(config) {
  state = {...state, ...config};
  const root = typeof document !== 'undefined' && document.getElementById('home-recommendation');
  if (!root || root.dataset.homeReady === 'true') return;
  root.dataset.homeReady = 'true';
  root.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-home-action]');
    if (actionTarget && actionTarget.tagName !== 'A') {
      const action = state.actions[actionTarget.dataset.homeAction];
      if (typeof action === 'function') action();
      return;
    }
    const categoryTarget = event.target.closest('[data-home-category]');
    if (categoryTarget && typeof state.actions.category === 'function') state.actions.category(CATEGORY_MAP[categoryTarget.dataset.homeCategory]);
    const compareTarget = event.target.closest('[data-home-compare]');
    if (compareTarget && typeof state.actions.toggleCompare === 'function') {
      const card = state.cards.find(item => String(item.idx) === String(compareTarget.dataset.homeCompare));
      if (card) state.actions.toggleCompare(card.idx, card.card_name, card.card_img || '');
    }
  });
  renderCards(state.cards);
  renderCashback(state.cashback);
  renderCompare(state.compareList);
}
```

Task 1에서 만든 파일 하단의 공개 객체·내보내기 블록을 다음으로 교체해 렌더링 함수도 동일한 인터페이스로 노출한다.

```js
const HomeRecommendation = {
  CATEGORY_MAP,
  selectFeaturedCards,
  selectCashbackHighlights,
  formatPerformance,
  init,
  renderCards,
  renderCashback,
  renderCompare
};
if (typeof module !== 'undefined' && module.exports) module.exports = HomeRecommendation;
if (root) root.HomeRecommendation = HomeRecommendation;
```
`index.html`의 카드 로드 성공 블록 마지막에 추가한다.

```js
if (window.HomeRecommendation) HomeRecommendation.renderCards(DATA);
```

`updateCompareBar()` 마지막에 추가한다.

```js
if (window.HomeRecommendation) HomeRecommendation.renderCompare(compareList);
```

`</body>` 직전에 홈 스크립트와 어댑터를 추가한다.

```html
<script src="home-recommendation.js"></script>
<script>
HomeRecommendation.init({
  cards: DATA,
  cashback: getPlatformCompanies('전체보기'),
  compareList,
  actions: {
    benefits(){ showSection('cards'); },
    cashback(){ showSection('cashback'); },
    compare(){ compareList.length >= 2 ? goCompare() : showSection('cards'); },
    category(category){
      showSection('cards');
      activeCategories.clear();
      activeCategories.add(category);
      document.querySelectorAll('.cat-pill').forEach(button => button.classList.toggle('active', button.dataset.cat === category));
      applyFilters();
    },
    toggleCompare
  }
});
</script>
```

- [ ] **Step 5: 전체 단위 테스트와 문법 검사**

Run: `node --check home-recommendation.js`

Expected: exit code `0`

Run: `node src/picking/test_home_recommendation.js`

Expected: `home recommendation data tests: PASS`

- [ ] **Step 6: 커밋**

```powershell
git add index.html home-recommendation.js src/picking/test_home_recommendation.js
git commit -m "feat: 홈 추천 허브를 기존 카드 기능과 연결"
```

---

### Task 4: 로컬 브라우저 검증과 마무리

**Files:**
- Modify if required by verified defects only: `index.html`, `home-recommendation.css`, `home-recommendation.js`, `src/picking/test_home_recommendation.js`

**Interfaces:**
- Consumes: 완성된 홈 추천 허브와 기존 섹션 전환·비교 기능
- Produces: 데스크톱·모바일에서 검증된 로컬 홈 화면

- [ ] **Step 1: 전체 자동 검증 실행**

Run: `node --check home-recommendation.js`

Run: `node src/picking/test_home_recommendation.js`

Run: `node src/picking/test_calculator_qa.js`

Expected: 모든 명령 exit code `0`, 홈 테스트 PASS, 계산기 검증 실패 `0개`

- [ ] **Step 2: 로컬 서버에서 홈 응답 확인**

Run: `py -3.12 -m http.server 5500`

Open: `http://localhost:5500/index.html`

Expected: HTTP `200`; 홈 첫 화면에 헤드라인, CTA 3개, 카테고리 8개, 대표 카드 3개, 캐시백 최대 3개가 표시된다.

- [ ] **Step 3: 데스크톱 상호작용 검증**

브라우저에서 다음을 순서대로 확인한다.

1. `혜택으로 직접 찾기` 클릭 시 전체카드 섹션이 열린다.
2. 홈으로 돌아와 `주유` 클릭 시 전체카드의 `주유` 필터 하나만 활성화된다.
3. 대표 카드 `상세 보기` 링크가 `detail.html?idx=...`로 연결된다.
4. 대표 카드 `비교함 담기` 클릭 시 기존 비교함 배지가 갱신된다.
5. 비교 카드가 2장 이상이면 `후보 카드 비교하기`가 기존 비교 화면을 연다.
6. `캐시백 전체 보기` 클릭 시 기존 캐시백 섹션이 열린다.

- [ ] **Step 4: 모바일·접근성 검증**

브라우저 폭을 `390×844`로 바꿔 다음을 확인한다.

1. 가로 스크롤이 없다.
2. 히어로, 경로 카드, 대표 카드가 한 열로 배치된다.
3. 주요 버튼 높이가 최소 44px이다.
4. Tab 키로 모든 링크와 버튼에 접근할 수 있고 포커스가 보인다.
5. 이미지 로드 실패와 카드 데이터 실패 상태에도 텍스트와 이동 버튼이 남는다.

- [ ] **Step 5: Git 상태와 변경 범위 확인**

Run: `git diff --check`

Run: `git status --short`

Expected: 충돌 표식과 의도하지 않은 추적 파일 변경이 없으며 미추적 사용자 파일은 그대로 남아 있다.

- [ ] **Step 6: 검증 중 수정이 있었다면 커밋**

```powershell
git add index.html home-recommendation.css home-recommendation.js src/picking/test_home_recommendation.js
git commit -m "fix: 홈 추천 허브 반응형과 상호작용 보정"
```

