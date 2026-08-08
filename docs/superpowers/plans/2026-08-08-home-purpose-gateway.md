# Home Purpose Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 추천 결과 나열 화면에서 세 가지 카드 탐색 목적을 안내하는 게이트웨이로 바꾸고, 저장된 탐색과 카드 연구소를 낮은 강도의 보조 영역으로 제공한다.

**Architecture:** `home-gateway.js`가 목적 경로, 장식 카드 선택, 소비 프로필·비교함 요약을 순수 함수로 제공하고 홈 DOM 갱신과 클릭 연결을 담당한다. `index.html`은 정적인 정보 구조와 기존 라우팅 함수 연결만 보유하며, `home-gateway.css`는 확정된 100/80/50/40/20 시각 위계를 책임진다. 기존 홈 추천 계산 모듈은 다른 소비자가 없음을 확인한 뒤 제거한다.

**Tech Stack:** 정적 HTML, CSS, 브라우저 JavaScript, Node.js `node:test`, 기존 `CardProfile`·`compareList`·`showSection()`

## Global Constraints

- `main`에 직접 작업하지 않고 `feature/home-purpose-gateway` 브랜치에서만 작업한다.
- 공통 파일 `index.html`을 수정하므로 구현 시작 전에 사용자에게 변경 사실을 알린다.
- `cards_list.json`, `benefits_structured.json`, `card_detail/`, `api/`는 수정하지 않는다.
- 기본 색상은 `#f5f7fa`, `#ffffff`, `#e8f0fd`, `#e2e8f0`, `#1e293b`, `#64748b`, `#145ce6`, `#0e47c0`을 사용한다.
- 노랑 `#f2c94c`은 현재 단계나 작은 배지에만 사용한다.
- 글꼴은 `GmarketSans`, `Noto Sans KR`, 시스템 폰트 순서를 유지한다.
- 홈의 시각 강도는 첫 장면 100, 목적 메뉴 80, 지난 탐색 50, 카드 연구소 40, 신뢰 정보 20 순서로 낮춘다.
- 목적 메뉴는 `calculator.html`, `/event`, `/card#benefit-filters`로 연결한다.
- 홈에서 추천 순위 계산, 오늘의 매치, 대표 카드 Top 3, 캐시백 순위를 렌더링하지 않는다.
- 모든 주요 링크와 버튼은 최소 44px 높이와 `focus-visible` 상태를 제공한다.
- 360px 모바일에서 가로 스크롤이 없어야 한다.
- `.env`, API 키, Redis 토큰, `node_modules`, 기존 미추적 사용자 파일을 커밋하지 않는다.

---

## File Structure

- Create: `home-gateway.js` — 목적 경로 정의, 카드 수·장식 카드·이어하기 상태 계산, 동적 홈 DOM 갱신, 클릭 연결
- Create: `home-gateway.css` — 확정된 Editorial Arena, 01·02·03 메뉴, 이어하기, 카드 연구소, 신뢰 정보 스타일
- Create: `src/picking/test_home_gateway.js` — 순수 함수, 렌더 HTML, 정적 마크업, 스타일, 런타임 배선 회귀 테스트
- Modify: `index.html` — 홈 마크업 교체, 혜택 필터 앵커 추가, 데이터·비교 상태를 `HomeGateway`에 전달
- Delete: `home-recommendation.js` — 제거되는 대표 카드·캐시백 순위·비교 패널 전용 렌더러
- Delete: `home-profile.js` — 제거되는 홈 Top 3와 오늘의 매치 전용 개인화 코드
- Delete: `home-match.js` — 제거되는 오늘의 매치 계산·렌더 코드
- Delete: `home-recommendation.css` — 새 `home-gateway.css`로 대체
- Delete: `src/picking/test_home_recommendation.js` — 제거되는 홈 기능 테스트
- Delete: `src/picking/test_home_match.js` — 제거되는 오늘의 매치 테스트

---

### Task 1: 홈 게이트웨이 상태 모델

**Files:**
- Create: `home-gateway.js`
- Create: `src/picking/test_home_gateway.js`

**Interfaces:**
- Produces: `HomeGateway.PURPOSE_ROUTES: Array<{id, number, icon, title, description, href}>`
- Produces: `HomeGateway.cardCountCopy(cards: Array): string`
- Produces: `HomeGateway.selectHeroCards(cards: Array, limit?: number): Array<{idx, card_name, card_img}>`
- Produces: `HomeGateway.buildResumeState(profile: object|null, compareList: Array): object|null`
- Produces: `HomeGateway.renderHeroCardsHtml(cards: Array): string`
- Produces: `HomeGateway.renderResumeHtml(state: object|null): string`
- Produces: `HomeGateway.updateCards(cards: Array): void`
- Produces: `HomeGateway.updateResume(profile: object|null, compareList: Array): void`
- Produces: `HomeGateway.init(options: {cards, profile, compareList, actions}): void`

- [ ] **Step 1: Write failing model tests**

Create `src/picking/test_home_gateway.js` with the first five tests:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const HomeGateway = require(path.join(ROOT, 'home-gateway.js'));

test('홈은 세 가지 공식 목적 경로만 제공한다', () => {
  assert.deepEqual(HomeGateway.PURPOSE_ROUTES.map(route => [route.id, route.href]), [
    ['calculator', 'calculator.html'],
    ['cashback', '/event'],
    ['benefits', '/card#benefit-filters']
  ]);
});

test('카드 수 문구는 cards_list 배열 길이를 표시한다', () => {
  assert.equal(HomeGateway.cardCountCopy(new Array(1276)), '1,276장의 카드 데이터');
  assert.equal(HomeGateway.cardCountCopy(null), '수많은 카드 데이터');
});

test('히어로 장식은 이미지가 있는 앞쪽 카드 세 장만 고른다', () => {
  const cards = [
    {idx: 1, card_name: '이미지 없음', card_img: ''},
    {idx: 2, card_name: 'A', card_img: 'a.png'},
    {idx: 3, card_name: 'B', card_img: 'b.png'},
    {idx: 4, card_name: 'C', card_img: 'c.png'},
    {idx: 5, card_name: 'D', card_img: 'd.png'}
  ];
  assert.deepEqual(HomeGateway.selectHeroCards(cards).map(card => card.idx), [2, 3, 4]);
});

test('저장된 탐색이 전혀 없으면 이어하기 상태를 만들지 않는다', () => {
  assert.equal(HomeGateway.buildResumeState(null, []), null);
});

test('비교함 두 장이 있으면 비교 이어보기가 주 행동이 된다', () => {
  const state = HomeGateway.buildResumeState(
    {spend: {'푸드': 400000, '마트/편의점': 250000}, prevMonth: 0},
    [{idx: 663, name: '롤라카드'}, {idx: 2416, name: '이마트Ⅱ'}]
  );
  assert.equal(state.profileTotal, 650000);
  assert.equal(state.compareCount, 2);
  assert.equal(state.primaryAction, 'compare');
  assert.equal(state.primaryLabel, '비교 이어보기');
});
```

- [ ] **Step 2: Run tests and confirm the missing-module failure**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: FAIL with `Cannot find module '../../home-gateway.js'`.

- [ ] **Step 3: Implement the pure data functions**

Create `home-gateway.js` as a UMD-style module matching the repository's existing browser-and-Node pattern:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HomeGateway = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PURPOSE_ROUTES = Object.freeze([
    Object.freeze({id:'calculator', number:'01', icon:'🧮', title:'매달 가장 이득인 카드', description:'내 소비금액으로 월 순이득 계산', href:'calculator.html'}),
    Object.freeze({id:'cashback', number:'02', icon:'💰', title:'지금 받을 수 있는 발급 혜택', description:'카드사별 캐시백과 조건 확인', href:'/event'}),
    Object.freeze({id:'benefits', number:'03', icon:'🔎', title:'원하는 혜택이 있는 카드', description:'카페·주유·교통 등으로 직접 탐색', href:'/card#benefit-filters'})
  ]);

  function cardCountCopy(cards) {
    return Array.isArray(cards) && cards.length
      ? `${cards.length.toLocaleString()}장의 카드 데이터`
      : '수많은 카드 데이터';
  }

  function selectHeroCards(cards, limit = 3) {
    return (Array.isArray(cards) ? cards : [])
      .filter(card => card && card.card_img)
      .slice(0, limit)
      .map(card => ({idx: card.idx, card_name: card.card_name || '', card_img: card.card_img}));
  }

  function profileTotal(profile) {
    return Object.values(profile && profile.spend || {})
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function buildResumeState(profile, compareList) {
    const cards = Array.isArray(compareList) ? compareList : [];
    if (!profile && cards.length === 0) return null;
    const compareCount = cards.length;
    const primaryAction = compareCount >= 2 ? 'compare'
      : profile ? 'calculator' : 'benefits';
    const primaryLabel = compareCount >= 2 ? '비교 이어보기'
      : profile ? '다시 계산' : '카드 한 장 더 찾기';
    return {
      hasProfile: Boolean(profile),
      profileTotal: profileTotal(profile),
      compareCount,
      compareNames: cards.slice(0, 3).map(card => card.name || card.card_name || ''),
      primaryAction,
      primaryLabel,
      secondaryAction: compareCount >= 2 && profile ? 'calculator' : null,
      secondaryLabel: compareCount >= 2 && profile ? '다시 계산' : ''
    };
  }
```

Keep `escapeHtml`, rendering functions, DOM functions, and the exported object in the same closure. Do not read `localStorage` inside the pure model functions.

- [ ] **Step 4: Run the model tests**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: 5 tests PASS.

- [ ] **Step 5: Add failing renderer tests**

Append:

```js
test('히어로 카드 이미지는 장식이며 링크를 만들지 않는다', () => {
  const html = HomeGateway.renderHeroCardsHtml([
    {idx: 1, card_name: '<위험>', card_img: 'a.png'},
    {idx: 2, card_name: 'B', card_img: 'b.png'}
  ]);
  assert.equal((html.match(/<img/g) || []).length, 2);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<a\b/);
  assert.doesNotMatch(html, /<위험>/);
});

test('이어하기 HTML은 저장 상태와 주 행동만 보여준다', () => {
  const state = HomeGateway.buildResumeState(
    {spend: {'푸드': 400000}, prevMonth: 0},
    [{idx: 1, name: 'A'}, {idx: 2, name: 'B'}]
  );
  const html = HomeGateway.renderResumeHtml(state);
  assert.match(html, /40만 원/);
  assert.match(html, /카드 비교 중/);
  assert.match(html, /data-home-route="compare"/);
  assert.match(html, /비교 이어보기/);
});

test('이어할 상태가 없으면 빈 패널을 만들지 않는다', () => {
  assert.equal(HomeGateway.renderResumeHtml(null), '');
});
```

- [ ] **Step 6: Implement safe renderers and DOM update methods**

Add these exact behavior rules:

```js
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
}

function shortWon(value) {
  const amount = Math.round(Number(value) || 0);
  return amount % 10000 === 0
    ? `${(amount / 10000).toLocaleString()}만 원`
    : `${amount.toLocaleString()}원`;
}

function renderHeroCardsHtml(cards) {
  return selectHeroCards(cards).map((card, index) =>
    `<img class="home-stack-card home-stack-card-${index + 1}" src="${escapeHtml(card.card_img)}" alt="" aria-hidden="true" onerror="this.hidden=true">`
  ).join('');
}

function renderResumeHtml(state) {
  if (!state) return '';
  const profileStep = state.hasProfile
    ? `<span class="home-journey-step is-done"><b>✓</b><span>소비 기준 저장<small>${shortWon(state.profileTotal)}</small></span></span>
       <span class="home-journey-line" aria-hidden="true"></span>
       <span class="home-journey-step is-done"><b>✓</b><span>추천 확인<small>다시 계산 가능</small></span></span>`
    : '';
  const compareLabel = state.compareCount >= 2 ? '카드 비교 중' : '카드 한 장 저장';
  const compareStep = state.compareCount
    ? `${state.hasProfile ? '<span class="home-journey-line" aria-hidden="true"></span>' : ''}
       <span class="home-journey-step is-current"><b>${state.compareCount}</b><span>${compareLabel}<small>${escapeHtml(state.compareNames.join(' · '))}</small></span></span>`
    : '';
  const secondary = state.secondaryAction
    ? `<button type="button" class="home-resume-secondary" data-home-route="${state.secondaryAction}">${state.secondaryLabel}</button>`
    : '';
  return `<div class="home-resume-copy"><span>MY CARD JOURNEY</span><h2>지난 탐색 이어하기</h2></div>
    <div class="home-journey">${profileStep}${compareStep}</div>
    <div class="home-resume-actions"><button type="button" class="home-resume-primary" data-home-route="${state.primaryAction}">${state.primaryLabel} →</button>${secondary}</div>`;
}

function updateCards(cards) {
  if (typeof document === 'undefined') return;
  const copy = cardCountCopy(cards);
  const count = document.getElementById('home-card-count-copy');
  const trust = document.getElementById('home-trust-count');
  const stack = document.getElementById('home-hero-cards');
  if (count) count.textContent = copy;
  if (trust) trust.textContent = copy;
  if (stack) stack.innerHTML = renderHeroCardsHtml(cards);
}

function updateResume(profile, compareList) {
  if (typeof document === 'undefined') return;
  const target = document.getElementById('home-resume');
  if (!target) return;
  const html = renderResumeHtml(buildResumeState(profile, compareList));
  target.innerHTML = html;
  target.hidden = !html;
}
```

Implement `init(options)` so it stores `options.actions`, calls `updateCards` and `updateResume`, then installs one delegated click handler on `#home-gateway`. For `[data-home-route]`, prevent the default only when a matching callback exists; otherwise allow the anchor's native `href` behavior.

- [ ] **Step 7: Run renderer tests**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: 8 tests PASS.

- [ ] **Step 8: Commit the state model**

```bash
git add home-gateway.js src/picking/test_home_gateway.js
git commit -m "feat: 홈 목적 게이트웨이 상태 모델 추가"
```

---

### Task 2: 목적 중심 홈 마크업과 시각 위계

**Files:**
- Create: `home-gateway.css`
- Modify: `index.html:10`
- Modify: `index.html:719-775`
- Modify: `index.html:807`
- Test: `src/picking/test_home_gateway.js`

**Interfaces:**
- Consumes: `HomeGateway` DOM ids `home-card-count-copy`, `home-trust-count`, `home-hero-cards`, `home-resume`, `home-gateway`
- Produces: `#benefit-filters` target for `/card#benefit-filters`
- Produces: `[data-home-route="cashback|benefits|compare|calculator"]` action hooks

- [ ] **Step 1: Add failing static structure tests**

Append to `src/picking/test_home_gateway.js`:

```js
test('index 홈은 목적 게이트웨이 구조만 포함한다', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /id="home-gateway"/);
  assert.match(index, /id="home-hero-cards"/);
  assert.match(index, /id="home-purpose-routes"/);
  assert.match(index, /href="calculator\.html"/);
  assert.match(index, /href="\/event"/);
  assert.match(index, /href="\/card#benefit-filters"/);
  assert.match(index, /id="home-resume"[^>]*hidden/);
  assert.match(index, /id="benefit-filters"/);
  assert.doesNotMatch(index, /id="hero-match"/);
  assert.doesNotMatch(index, /class="home-block home-featured"/);
  assert.doesNotMatch(index, /class="home-block home-cashback"/);
  assert.doesNotMatch(index, /id="home-compare-panel"/);
});

test('홈 CSS는 위계·모바일·동작 감소 규칙을 포함한다', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');
  assert.match(css, /\.home-editorial-hero/);
  assert.match(css, /\.home-purpose-grid/);
  assert.match(css, /\.home-resume/);
  assert.match(css, /\.home-lab-grid/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
```

- [ ] **Step 2: Run tests and confirm the old-home failures**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: structure test FAIL because the old home ids remain; CSS test FAIL because `home-gateway.css` does not exist.

- [ ] **Step 3: Replace the home stylesheet link**

In `index.html:10`, replace:

```html
<link rel="stylesheet" href="home-recommendation.css">
```

with:

```html
<link rel="stylesheet" href="home-gateway.css">
```

- [ ] **Step 4: Replace the old home markup**

Replace the content inside `#section-home` with this structure. Use the exact ids and route attributes because `home-gateway.js` and the tests depend on them:

```html
<div id="home-gateway" class="home-shell">
  <section class="home-editorial-hero" aria-labelledby="home-title">
    <div class="home-hero-number" aria-hidden="true">1276</div>
    <div class="home-hero-copy">
      <span class="home-kicker">CARD CHOICE STARTS WITH PURPOSE</span>
      <h2 id="home-title">카드를 고르기 전에,<br><strong>이유</strong>부터 고르세요.</h2>
      <p>혜택표를 끝없이 넘기지 않아도 됩니다. 지금 원하는 결과 하나만 선택하면 카드 파이터가 알맞은 경로를 열어드려요.</p>
      <span id="home-card-count-copy" class="home-card-count">수많은 카드 데이터</span>
    </div>
    <div id="home-hero-cards" class="home-card-stack" aria-hidden="true"></div>
    <span class="home-best-stamp" aria-hidden="true">BEST<br>MATCH</span>
  </section>

  <nav id="home-purpose-routes" class="home-purpose-grid" aria-label="카드 찾기 목적 선택">
    <a class="home-purpose is-primary" href="calculator.html" data-home-route="calculator"><span class="home-purpose-number">01</span><span class="home-purpose-icon" aria-hidden="true">🧮</span><strong>매달 가장 이득인 카드</strong><small>월 순이득 계산 →</small></a>
    <a class="home-purpose" href="/event" data-home-route="cashback"><span class="home-purpose-number">02</span><span class="home-purpose-icon" aria-hidden="true">💰</span><strong>지금 받을 수 있는 발급 혜택</strong><small>카드사별 캐시백 확인 →</small></a>
    <a class="home-purpose" href="/card#benefit-filters" data-home-route="benefits"><span class="home-purpose-number">03</span><span class="home-purpose-icon" aria-hidden="true">🔎</span><strong>원하는 혜택이 있는 카드</strong><small>혜택 카테고리로 직접 탐색 →</small></a>
  </nav>

  <section id="home-resume" class="home-resume" aria-label="지난 카드 탐색 이어하기" hidden></section>

  <section class="home-lab" aria-labelledby="home-lab-title">
    <div class="home-lab-head"><div><span>CARD LAB</span><h2 id="home-lab-title">취향으로 한 번 더 발견하기</h2></div><a href="/cardlab">카드 연구소 전체 →</a></div>
    <div class="home-lab-grid">
      <a class="home-lab-entry home-lab-mbti" href="/cardlab/match"><span class="home-lab-icon" aria-hidden="true">🧬</span><span><strong>나는 어떤 소비형일까?</strong><small>13문항 소비 MBTI</small></span><b aria-hidden="true">↗</b></a>
      <a class="home-lab-entry home-lab-worldcup" href="/cardlab/worldcup"><span class="home-lab-icon" aria-hidden="true">🏆</span><span><strong>마지막까지 살아남을 카드는?</strong><small>최대 32강 카드 월드컵</small></span><b aria-hidden="true">↗</b></a>
    </div>
  </section>

  <footer class="home-trust"><strong>데이터를 기준으로 비교합니다</strong><p><span id="home-trust-count">수많은 카드 데이터</span> · 월 순이득은 예상 혜택에서 월 환산 연회비를 뺀 값입니다 · 추천 조건과 원문 검수 내용을 확인할 수 있습니다. 신청 전 카드사 상품설명서와 약관을 확인해주세요.</p></footer>
</div>
```

- [ ] **Step 5: Add the benefit filter anchor**

Change `index.html:807` from:

```html
<div class="cat-filter-box">
```

to:

```html
<div id="benefit-filters" class="cat-filter-box" tabindex="-1">
```

- [ ] **Step 6: Implement `home-gateway.css`**

Create `home-gateway.css` with these selector groups and values:

```css
.home-shell{--home-blue:#145ce6;--home-blue-deep:#0e47c0;--home-navy:#10244a;--home-yellow:#f2c94c;--home-ink:#1e293b;--home-muted:#64748b;--home-line:#e2e8f0;--home-soft:#e8f0fd;width:min(1180px,calc(100% - 44px));margin:0 auto;padding:48px 0 72px}
.home-shell *,.home-shell *::before,.home-shell *::after{box-sizing:border-box}
.home-editorial-hero{position:relative;min-height:365px;overflow:hidden;border:1px solid #dce5f1;border-left:7px solid var(--home-blue);background:#fff}
.home-hero-number{position:absolute;right:-4px;top:-38px;color:#eef4ff;font-size:clamp(120px,15vw,190px);font-weight:900;line-height:1;letter-spacing:-.08em;pointer-events:none}
.home-hero-copy{position:relative;z-index:2;max-width:600px;padding:58px 48px}
.home-kicker{color:var(--home-blue);font-size:11px;font-weight:800;letter-spacing:.12em}
.home-hero-copy h2{margin:18px 0 14px;color:var(--home-ink);font-size:clamp(38px,4.2vw,54px);line-height:1.12;letter-spacing:-.055em}
.home-hero-copy h2 strong{color:var(--home-blue)}
.home-hero-copy p{max-width:490px;margin:0;color:var(--home-muted);font-family:"Noto Sans KR",sans-serif;font-size:14px;line-height:1.75}
.home-card-count{display:inline-flex;margin-top:18px;padding:6px 10px;border:1px solid #bfdbfe;border-radius:99px;background:var(--home-soft);color:var(--home-blue);font-size:11px;font-weight:800}
.home-card-stack{position:absolute;right:64px;top:62px;width:290px;height:235px}
.home-stack-card{position:absolute;width:138px;height:90px;object-fit:contain;filter:drop-shadow(0 14px 12px rgba(30,41,59,.2))}
.home-stack-card-1{left:0;top:82px;transform:rotate(-16deg)}.home-stack-card-2{right:0;top:30px;transform:rotate(11deg)}.home-stack-card-3{right:58px;bottom:4px;transform:rotate(1deg)}
.home-best-stamp{position:absolute;right:44px;bottom:28px;display:grid;width:50px;height:50px;place-items:center;border-radius:50%;background:var(--home-yellow);color:var(--home-navy);font-size:8px;font-weight:900;line-height:1.15;text-align:center;transform:rotate(7deg)}
.home-purpose-grid{display:grid;grid-template-columns:1.05fr 1fr 1fr;border:1px solid #dce5f1;border-top:0;background:#fff}
.home-purpose{position:relative;display:grid;min-height:130px;padding:25px;color:var(--home-ink);text-decoration:none;border-right:1px solid var(--home-line);transition:background .16s ease,color .16s ease,transform .16s ease}.home-purpose:last-child{border-right:0}.home-purpose.is-primary{background:var(--home-blue);color:#fff}.home-purpose:hover{z-index:1;transform:translateY(-2px);box-shadow:0 9px 22px rgba(20,92,230,.12)}
.home-purpose-number{position:absolute;right:15px;top:6px;color:#e8f0fd;font-size:35px;font-weight:900}.home-purpose.is-primary .home-purpose-number{color:rgba(255,255,255,.22)}
.home-purpose-icon{font-size:22px}.home-purpose strong{align-self:end;margin-top:12px;font-size:15px}.home-purpose small{margin-top:5px;color:var(--home-muted);font-family:"Noto Sans KR",sans-serif;font-size:11px}.home-purpose.is-primary small{color:#dbeafe}
.home-resume{display:grid;grid-template-columns:.72fr 1.25fr auto;align-items:center;gap:22px;margin-top:28px;padding:18px 20px;border:1px solid #dce5f1;border-left:5px solid var(--home-blue);background:#fff;box-shadow:0 5px 16px rgba(30,41,59,.05)}.home-resume[hidden]{display:none}
.home-resume-copy>span,.home-lab-head span{color:var(--home-blue);font-size:10px;font-weight:800;letter-spacing:.08em}.home-resume-copy h2,.home-lab-head h2{margin:5px 0 0;color:var(--home-ink);font-size:19px;letter-spacing:-.035em}
.home-journey{display:flex;align-items:center;min-width:0}.home-journey-step{display:flex;align-items:center;gap:8px;min-width:0}.home-journey-step>b{display:grid;width:28px;height:28px;flex:0 0 28px;place-items:center;border-radius:50%;font-size:11px}.home-journey-step.is-done>b{background:var(--home-soft);color:var(--home-blue)}.home-journey-step.is-current>b{background:#fff9ed;color:#a65e00}.home-journey-step span{font-size:11px;font-weight:800;white-space:nowrap}.home-journey-step small{display:block;max-width:130px;overflow:hidden;margin-top:2px;color:var(--home-muted);font:10px "Noto Sans KR",sans-serif;text-overflow:ellipsis}.home-journey-line{width:26px;height:1px;margin:0 8px;background:#cbd8ee}
.home-resume-actions{display:flex;gap:7px}.home-resume-actions button{min-height:44px;padding:9px 12px;border:1px solid #c9d8f4;background:#fff;color:var(--home-blue);font:inherit;font-size:11px;font-weight:800;cursor:pointer}.home-resume-primary{border-color:var(--home-blue)!important;background:var(--home-blue)!important;color:#fff!important}
.home-lab{margin-top:40px}.home-lab-head{display:flex;align-items:end;justify-content:space-between;gap:20px}.home-lab-head>a{color:var(--home-blue);font-size:12px;font-weight:800;text-decoration:none}.home-lab-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.home-lab-entry{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;min-height:86px;padding:18px 20px;border:1px solid var(--home-line);background:#fff;color:var(--home-ink);text-decoration:none;transition:border-color .16s ease,transform .16s ease}.home-lab-entry:hover{transform:translateY(-2px)}.home-lab-icon{display:grid;width:46px;height:46px;place-items:center;border-radius:50%;font-size:22px}.home-lab-mbti{border-color:#ddd6fe}.home-lab-mbti .home-lab-icon{background:#f5f1ff}.home-lab-mbti>b{color:#7c3aed}.home-lab-worldcup{border-color:#bfd0ee}.home-lab-worldcup .home-lab-icon{background:#eef4ff}.home-lab-worldcup>b{color:var(--home-blue)}.home-lab-entry strong{display:block;font-size:14px}.home-lab-entry small{display:block;margin-top:4px;color:var(--home-muted);font:11px "Noto Sans KR",sans-serif}
.home-trust{margin-top:34px;padding-top:20px;border-top:1px solid var(--home-line);color:var(--home-muted);font:12px/1.7 "Noto Sans KR",sans-serif}.home-trust strong{color:var(--home-ink)}.home-trust p{margin:5px 0 0}
.home-shell :focus-visible{outline:3px solid rgba(20,92,230,.38);outline-offset:3px}
```

Add responsive rules that preserve the hierarchy:

```css
@media(max-width:960px){.home-card-stack{right:22px;transform:scale(.82);transform-origin:right center}.home-hero-copy{max-width:58%;padding-left:36px}.home-resume{grid-template-columns:1fr}.home-resume-actions{justify-self:start}}
@media(max-width:720px){.home-shell{width:min(calc(100% - 28px),1180px);padding:28px 0 52px}.home-editorial-hero{min-height:470px}.home-hero-number{top:-10px;font-size:92px}.home-hero-copy{max-width:none;padding:34px 24px}.home-hero-copy h2{font-size:34px}.home-card-stack{right:50%;top:258px;transform:translateX(50%) scale(.72);transform-origin:center}.home-best-stamp{right:24px;bottom:22px}.home-purpose-grid{grid-template-columns:1fr}.home-purpose{min-height:100px;border-right:0;border-bottom:1px solid var(--home-line)}.home-purpose:last-child{border-bottom:0}.home-purpose strong{font-size:14px}.home-resume{gap:16px;margin-top:20px}.home-journey{align-items:flex-start;flex-direction:column;gap:9px}.home-journey-line{width:1px;height:12px;margin:0 0 0 14px}.home-resume-actions{width:100%}.home-resume-actions button{flex:1}.home-lab{margin-top:34px}.home-lab-head{align-items:flex-start;flex-direction:column}.home-lab-grid{grid-template-columns:1fr}.home-trust{font-size:11px}}
@media(prefers-reduced-motion:reduce){.home-purpose,.home-lab-entry{scroll-behavior:auto;transition:none}.home-purpose:hover,.home-lab-entry:hover{transform:none}}
```

- [ ] **Step 7: Run structure and CSS tests**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: all tests PASS.

- [ ] **Step 8: Run a local static preview for this task**

Run:

```bash
node serve.js
```

Open `http://127.0.0.1:5501/index.html` and confirm the static hero, purpose routes, card research section, and trust footer render without the old home sections. The dynamic card stack and resume section may still be empty until Task 3.

- [ ] **Step 9: Commit the home structure and styles**

```bash
git add index.html home-gateway.css src/picking/test_home_gateway.js
git commit -m "feat: 목적 중심 홈 화면 구조와 스타일 추가"
```

---

### Task 3: 런타임 연결과 기존 홈 추천 코드 제거

**Files:**
- Modify: `home-gateway.js`
- Modify: `index.html:987`
- Modify: `index.html:1796-1810`
- Modify: `index.html:2340-2367`
- Modify: `src/picking/test_home_gateway.js`
- Delete: `home-recommendation.js`
- Delete: `home-profile.js`
- Delete: `home-match.js`
- Delete: `home-recommendation.css`
- Delete: `src/picking/test_home_recommendation.js`
- Delete: `src/picking/test_home_match.js`

**Interfaces:**
- Consumes: existing global `DATA`, `CardProfile`, `compareList`, `showSection`, `goCompare`
- Consumes: existing `updateCompareUI()` after every compare-list mutation
- Produces: `HomeGateway.updateCards(DATA)` after `cards_list.json` load
- Produces: `HomeGateway.updateResume(CardProfile.load(), compareList)` at initialization and compare changes

- [ ] **Step 1: Add failing integration-wiring tests**

Append:

```js
test('index는 새 홈 런타임만 연결한다', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /<script src="profile\.js"><\/script>/);
  assert.match(index, /<script src="home-gateway\.js"><\/script>/);
  assert.match(index, /HomeGateway\.updateCards\(DATA\)/);
  assert.match(index, /HomeGateway\.updateResume\(CardProfile\.load\(\), compareList\)/);
  assert.match(index, /HomeGateway\.init\(/);
  assert.doesNotMatch(index, /home-recommendation\.js/);
  assert.doesNotMatch(index, /home-profile\.js/);
  assert.doesNotMatch(index, /home-match\.js/);
  assert.doesNotMatch(index, /benefit-calc\.js/);
});

test('제거한 홈 추천 파일을 어떤 런타임도 참조하지 않는다', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const oldName of ['HomeRecommendation', 'hero-match', 'home-featured-cards', 'home-cashback-list']) {
    assert.doesNotMatch(index, new RegExp(oldName));
  }
});
```

- [ ] **Step 2: Run tests and confirm old-script references fail**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: integration tests FAIL because old scripts and calls still exist.

- [ ] **Step 3: Wire card data into the gateway**

In the `cards_list.json` fetch success callback, replace:

```js
if(window.HomeRecommendation) HomeRecommendation.renderCards(DATA);
```

with:

```js
if (window.HomeGateway) HomeGateway.updateCards(DATA);
```

Do not add another fetch. The home and card list must share the existing `DATA` array.

- [ ] **Step 4: Wire compare changes into the conditional resume section**

In `updateCompareUI()`, replace:

```js
if(window.HomeRecommendation) HomeRecommendation.renderCompare(compareList);
```

with:

```js
if (window.HomeGateway && window.CardProfile) {
  HomeGateway.updateResume(CardProfile.load(), compareList);
}
```

This call must run after `compareList` mutations so the resume section appears, changes action, or disappears without a reload.

- [ ] **Step 5: Replace the old home initialization block**

Delete the `home-recommendation.js` include, the `HomeRecommendation.init(...)` inline block, and the `benefit-calc.js`, `home-match.js`, `home-profile.js` includes. Load and initialize only:

```html
<script src="profile.js"></script>
<script src="home-gateway.js"></script>
<script>
HomeGateway.init({
  cards: Array.isArray(DATA) ? DATA : [],
  profile: CardProfile.load(),
  compareList,
  actions: {
    cashback() { showSection('cashback'); },
    benefits() {
      showSection('cards');
      requestAnimationFrame(() => {
        const target = document.getElementById('benefit-filters');
        if (!target) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'});
        target.focus({preventScroll: true});
      });
    },
    compare() {
      compareList.length >= 2 ? goCompare() : showSection('cards');
    }
  }
});
</script>
```

`calculator`에는 callback을 만들지 않는다. 해당 목적 링크는 `calculator.html`의 기본 이동을 사용한다.

- [ ] **Step 6: Finish `HomeGateway.init` click delegation**

The delegated handler must follow this logic:

```js
const state = {actions: {}, ready: false};

function init(options = {}) {
  if (typeof document === 'undefined') return;
  state.actions = options.actions || {};
  updateCards(options.cards || []);
  updateResume(options.profile || null, options.compareList || []);
  const root = document.getElementById('home-gateway');
  if (!root || state.ready) return;
  state.ready = true;
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-home-route]');
    if (!target) return;
    const action = state.actions[target.dataset.homeRoute];
    if (typeof action !== 'function') return;
    event.preventDefault();
    action();
  });
}
```

Export `updateCards`, `updateResume`, and `init` with the pure functions from Task 1.

- [ ] **Step 7: Remove superseded home-only files**

Delete only these files after confirming `rg` finds no non-test consumer:

```bash
rg -n "HomeRecommendation|HomeMatch|home-profile|home-match|home-recommendation" --glob "!docs/**" --glob "!.superpowers/**"
```

Then delete:

```text
home-recommendation.js
home-profile.js
home-match.js
home-recommendation.css
src/picking/test_home_recommendation.js
src/picking/test_home_match.js
```

- [ ] **Step 8: Run the gateway tests**

Run:

```bash
node --test src/picking/test_home_gateway.js
```

Expected: all gateway model, renderer, structure, CSS, and integration tests PASS.

- [ ] **Step 9: Run the full remaining test suite**

Run:

```bash
node --test src/picking/test_home_gateway.js src/picking/test_card688_qa.js src/picking/test_calculator_qa.js src/picking/test_3tier_ui_qa.js
```

Expected: 0 failures. Existing `MODULE_TYPELESS_PACKAGE_JSON` warnings may remain; do not change `package.json` for this work.

- [ ] **Step 10: Verify data integrity without modifying JSON**

Run:

```bash
node -e "const fs=require('fs');const list=JSON.parse(fs.readFileSync('cards_list.json','utf8'));const full=JSON.parse(fs.readFileSync('cards_full.json','utf8'));console.log({cards_list:list.length,cards_full:full.length,missing:list.filter(c=>c.idx==null||!c.card_name||!c.company).length});"
```

Expected: `cards_list: 1276`, `cards_full: 1276`, `missing: 0` for the current repository snapshot.

- [ ] **Step 11: Perform desktop browser verification**

Start the repository preview:

```bash
node serve.js
```

At `http://127.0.0.1:5501/index.html`, verify:

1. The editorial hero shows dynamic card count and three real decorative card images.
2. 01 opens `calculator.html`.
3. 02 shows the existing cashback section.
4. 03 shows the existing card section, scrolls to `#benefit-filters`, and focuses it.
5. With `cf_profile_v1` and `compareList` absent, `#home-resume` is hidden.
6. With a saved profile, the resume row appears with the spend total and `다시 계산`.
7. With two compare cards, `비교 이어보기` is the primary action.
8. 소비 MBTI and 카드 월드컵 links open the existing routes.
9. Browser console contains no new home-gateway error.

- [ ] **Step 12: Perform mobile and accessibility verification**

Set the viewport to 360×800 and verify:

1. No horizontal overflow: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
2. Hero copy, decorative cards, and 01·02·03 routes stack in that order.
3. Resume steps become vertical and buttons remain at least 44px high.
4. Card research entries become one column.
5. Tab order follows purpose routes → resume actions when present → card research links.
6. `prefers-reduced-motion: reduce` removes hover transforms and uses instant filter scrolling.

- [ ] **Step 13: Check diff scope and commit the integration**

Run:

```bash
git diff --check
git status --short
```

Confirm that no JSON, `.env`, API, `.superpowers/`, review shard, event study, or oliveyoung study file is staged. Then commit:

```bash
git add index.html home-gateway.js home-gateway.css src/picking/test_home_gateway.js home-recommendation.js home-profile.js home-match.js home-recommendation.css src/picking/test_home_recommendation.js src/picking/test_home_match.js
git commit -m "refactor: 홈 추천 화면을 목적 게이트웨이로 전환"
```

The explicit file list stages deletions and intended replacements only. If Git reports a deleted path is absent from the pathspec, stage intended changes with `git add -u -- <deleted-path>` and then add the four new or modified files by exact path.

---

## Final Verification

- [ ] Run `git diff --check origin/main...HEAD` and confirm no new whitespace errors.
- [ ] Run the full remaining test suite and confirm 0 failures.
- [ ] Confirm `git diff --name-only origin/main...HEAD` contains only the design document, implementation plan, home HTML/CSS/JS, home tests, and deletions of superseded home-only files.
- [ ] Confirm the current branch is `feature/home-purpose-gateway` and do not push or merge until the user asks.
