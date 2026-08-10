# Home Match Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home card count data-driven and make Today’s Match explain its recommendation basis, reveal the applied spending profile, and link each card to its detail page.

**Architecture:** Add a small UMD-style `home-match.js` pure module for standard spending, ranking, reason extraction, and HTML generation. Keep data loading and DOM event binding in `home-profile.js`, and use `cards_list.json` as the single candidate/count source. Extend the existing arena visual language in `home-recommendation.css` without adding dependencies.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS, Node.js built-in test runner

## Global Constraints

- Work only on `feature/home-recommendation-hub`; never push directly to `main`.
- Keep all changes local until the user explicitly asks to push.
- `cards_list.json` is the single source for the home count and Today’s Match candidates.
- The displayed count must come from the JSON array length, never a hard-coded number.
- Standard spend total is exactly 1,190,000 won across the seven approved categories.
- Today’s Match is deterministic rank 1 vs rank 2, not a daily random rotation.
- Ranking is monthly net benefit descending, then monthly fee ascending.
- Preserve keyboard focus, `aria-expanded`, and a mobile-friendly click target.
- Do not add packages or modify `package.json`.

---

### Task 1: Pure Home Match Model

**Files:**
- Create: `home-match.js`
- Create: `src/picking/test_home_match.js`

**Interfaces:**
- Consumes: card objects from `cards_list.json`, benefit records from `benefits_structured.json`, and `BenefitCalc.calc(benefit, spend, {prevMonth})`.
- Produces: `HomeMatch.STANDARD_SPEND`, `HomeMatch.totalSpend(spend)`, `HomeMatch.rankCards(cards, benefits, spend, prevMonth, calculator)`, and `HomeMatch.reasonLines(result, fallback)`.

- [ ] **Step 1: Write the failing model tests**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const HomeMatch = require('../../home-match.js');

test('표준 소비 합계는 월 119만원이다', () => {
  assert.equal(HomeMatch.totalSpend(HomeMatch.STANDARD_SPEND), 1190000);
});

test('후보는 순이득이 높고 동점이면 월 연회비가 낮은 순서다', () => {
  const cards = [{idx: 1}, {idx: 2}, {idx: 3}];
  const benefits = {'1': {}, '2': {}, '3': {}};
  const outcomes = {
    1: {money: 10000, net: 9000, feeMonthly: 1000, rows: []},
    2: {money: 10000, net: 12000, feeMonthly: 2000, rows: []},
    3: {money: 10000, net: 12000, feeMonthly: 500, rows: []}
  };
  const calculator = {calc: (_b, _s, opts) => outcomes[opts.cardIdx]};
  const ranked = HomeMatch.rankCards(cards, benefits, {}, 0, calculator);
  assert.deepEqual(ranked.map(item => Number(item.idx)), [3, 2, 1]);
});

test('추천 이유는 실제 적용 혜택이 큰 두 항목을 사용한다', () => {
  const lines = HomeMatch.reasonLines({rows: [
    {cat: '교통', rate: 0.1, shown: 7000},
    {cat: '온라인쇼핑', rate: 0.05, shown: 10000},
    {cat: '카페/디저트', rate: 0.02, shown: 0}
  ]}, '기본 혜택');
  assert.deepEqual(lines, [
    '온라인쇼핑 5%로 약 10,000원 혜택',
    '교통 10%로 약 7,000원 혜택'
  ]);
});

```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test src/picking/test_home_match.js`

Expected: FAIL with `Cannot find module '../../home-match.js'`.

- [ ] **Step 3: Implement the pure module**

Create a UMD module with these exact behaviors:

```javascript
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HomeMatch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STANDARD_SPEND = Object.freeze({
    '푸드': 400000,
    '카페/디저트': 100000,
    '마트/편의점': 250000,
    '온라인쇼핑': 200000,
    '교통': 70000,
    '주유': 100000,
    '통신': 70000
  });

  function totalSpend(spend) {
    return Object.values(spend || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function rankCards(cards, benefits, spend, prevMonth, calculator) {
    return (Array.isArray(cards) ? cards : []).map(card => {
      const benefit = benefits && benefits[String(card.idx)];
      if (!benefit) return null;
      const r = calculator.calc(benefit, spend, {prevMonth, cardIdx: card.idx});
      return r && r.money > 0 ? {idx: card.idx, card, r} : null;
    }).filter(Boolean).sort((a, b) => b.r.net - a.r.net || a.r.feeMonthly - b.r.feeMonthly);
  }

  function reasonLines(result, fallback) {
    const lines = (result && Array.isArray(result.rows) ? result.rows : [])
      .filter(row => Number(row.shown) > 0)
      .sort((a, b) => Number(b.shown) - Number(a.shown))
      .slice(0, 2)
      .map(row => {
        const label = row.isBase ? '그 외' : row.cat;
        const rate = Math.round(Number(row.rate) * 100);
        return rate > 0
          ? `${label} ${rate}%로 약 ${Math.round(Number(row.shown)).toLocaleString()}원 혜택`
          : `${label}에서 약 ${Math.round(Number(row.shown)).toLocaleString()}원 혜택`;
      });
    return lines.length ? lines : [fallback || '상세 혜택을 확인해보세요.'];
  }

  return {STANDARD_SPEND, totalSpend, rankCards, reasonLines};
});
```

- [ ] **Step 4: Run the model tests to verify GREEN**

Run: `node --test src/picking/test_home_match.js`

Expected: all HomeMatch tests pass with 0 failures.

- [ ] **Step 5: Commit the pure module**

```powershell
git add home-match.js src/picking/test_home_match.js
git commit -m "feat: 오늘의 매치 추천 근거 모델 추가"
```

---

### Task 2: Wire Current Card Data and Profile Basis

**Files:**
- Modify: `index.html:722`
- Modify: `index.html:2364-2366`
- Modify: `home-profile.js:172-270`
- Test: `src/picking/test_home_match.js`

**Interfaces:**
- Consumes: `window.HomeMatch` from Task 1, `CardProfile`, `BenefitCalc`, `cards_list.json`, and `benefits_structured.json`.
- Produces: a data-driven hero count, Today’s Match candidate ranking from all 1,276 current cards, and a working criteria toggle.

- [ ] **Step 1: Add a failing count-copy test**

```javascript
test('카드 수 문구는 배열 길이를 천 단위로 표시한다', () => {
  assert.equal(HomeMatch.cardCountCopy(new Array(1276)), '1,276장의 카드가 싸웁니다.');
  assert.equal(HomeMatch.cardCountCopy(null), '수많은 카드가 싸웁니다.');
});
```

- [ ] **Step 2: Run the count test to verify RED**

Run: `node --test src/picking/test_home_match.js`

Expected: FAIL because `cardCountCopy` does not yet return the required copy.

- [ ] **Step 3: Implement data and DOM wiring**

Add `cardCountCopy` to `home-match.js` and export it:

```javascript
function cardCountCopy(cards) {
  return Array.isArray(cards) && cards.length
    ? `${cards.length.toLocaleString()}장의 카드가 싸웁니다.`
    : '수많은 카드가 싸웁니다.';
}

return {STANDARD_SPEND, totalSpend, rankCards, reasonLines, cardCountCopy};
```

Then make these exact page changes:

```html
<h2 id="home-title">당신의 지갑을 두고,<br><strong id="home-card-count-copy">수많은 카드가 싸웁니다.</strong></h2>
```

Load `home-match.js` after `benefit-calc.js` and before `home-profile.js`.

In `home-profile.js`, replace the `cards.json` fetch with `cards_list.json`, retain both the array and `idx` lookup, then update the heading:

```javascript
fetch('cards_list.json').then(function (r) { return r.json(); })

var countCopy = el('home-card-count-copy');
if (countCopy) countCopy.textContent = HomeMatch.cardCountCopy(rs[1]);
DATA = {BEN: rs[0], CARD_LIST: rs[1], CARDS: byIdx};
```

Replace the local preset and ranking duplication with:

```javascript
var spend = p ? p.spend : HomeMatch.STANDARD_SPEND;
var prev = p && p.prevMonth > 0 ? p.prevMonth : HomeMatch.totalSpend(spend);
var ranked = HomeMatch.rankCards(d.CARD_LIST, d.BEN, spend, prev, BenefitCalc);
```

Keep the existing match-card markup for this task; Task 3 replaces it with the explanatory clickable markup.

- [ ] **Step 4: Run the tests**

Run: `node --test src/picking/test_home_match.js src/picking/test_home_recommendation.js`

Expected: all tests pass with 0 failures.

- [ ] **Step 5: Commit the data wiring**

```powershell
git add home-match.js index.html home-profile.js src/picking/test_home_match.js
git commit -m "fix: 홈 카드 수와 매치 후보를 최신 데이터로 통일"
```

---

### Task 3: Arena Explanation and Responsive Interaction

**Files:**
- Modify: `home-recommendation.css:63-79`
- Test: `src/picking/test_home_match.js`

**Interfaces:**
- Consumes: class names emitted by `HomeMatch.renderHeroMatchHtml`: `.hm-head`, `.hm-basis-toggle`, `.hm-criteria`, `.hm-criteria-item`, `.hm-reasons`, `.hm-equation`, `.hm-card-link`.
- Produces: accessible, responsive match cards that preserve the existing blue/gold arena identity.

- [ ] **Step 1: Add a failing HTML behavior test**

```javascript
test('추천 이유와 순이득 계산식을 카드 안에 보여준다', () => {
  const html = HomeMatch.renderHeroMatchHtml({
    ranked: [
      {idx: 1, card: {idx: 1, card_name: 'A카드', company: 'A사', top_benefit_summary: '쇼핑 할인'}, r: {
        money: 20000, net: 19000, feeMonthly: 1000,
        rows: [{cat: '온라인쇼핑', rate: 0.05, shown: 10000}]
      }},
      {idx: 2, card: {idx: 2, card_name: 'B카드', company: 'B사'}, r: {money: 15000, net: 14000, feeMonthly: 1000, rows: []}}
    ],
    spend: HomeMatch.STANDARD_SPEND,
    personal: false
  });
  assert.match(html, /온라인쇼핑 5%로 약 10,000원 혜택/);
  assert.match(html, /예상 혜택 20,000원/);
  assert.match(html, /월 연회비 1,000원/);
  assert.match(html, /월 순이득 19,000원/);
});

test('계산 가능한 카드가 두 장 미만이면 계산기 안내를 보여준다', () => {
  const html = HomeMatch.renderHeroMatchHtml({ranked: [], spend: HomeMatch.STANDARD_SPEND, personal: false});
  assert.match(html, /계산 가능한 카드가 부족해요/);
  assert.match(html, /calculator\.html/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test src/picking/test_home_match.js`

Expected: FAIL because the detailed reason/equation copy is not yet complete.

- [ ] **Step 3: Complete match markup and CSS**

Use one visual signature: the gold winner belt plus a compact “why it wins” ledger. Keep the rest restrained.

Add and export the following renderer in `home-match.js`:

```javascript
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString()}원`;
}

function basisWon(value) {
  const amount = Math.round(Number(value) || 0);
  return amount % 10000 === 0 ? `${(amount / 10000).toLocaleString()}만 원` : won(amount);
}

function renderHeroMatchHtml(options) {
  const ranked = Array.isArray(options && options.ranked) ? options.ranked : [];
  if (ranked.length < 2) {
    return '<div class="hm-loading">계산 가능한 카드가 부족해요 — <a href="calculator.html">계산기에서 직접 확인 →</a></div>';
  }
  const spend = options.spend || STANDARD_SPEND;
  const personal = Boolean(options.personal);
  const basis = personal ? '내 소비 기준' : '표준 소비 기준';
  const criteria = Object.entries(spend).filter(([, amount]) => Number(amount) > 0).map(([name, amount]) =>
    `<div class="hm-criteria-item"><span>${escapeHtml(name)}</span><b>${won(amount)}</b></div>`
  ).join('');

  function cardHtml(item, winner) {
    const card = item.card || {};
    const result = item.r || {};
    const reasons = reasonLines(result, card.top_benefit_summary).map(line => `<li>${escapeHtml(line)}</li>`).join('');
    return `<a class="hm-card hm-card-link${winner ? ' hm-win' : ''}" href="detail.html?idx=${encodeURIComponent(card.idx)}">
      ${winner ? '<span class="hm-belt">🏆 WINNER</span>' : ''}
      <img loading="lazy" src="${escapeHtml(card.card_img || '')}" alt="" onerror="this.style.visibility='hidden'">
      <div class="hm-card-copy"><small>${escapeHtml(card.company || '')}</small><b>${escapeHtml(card.card_name || '')}</b>
        <ul class="hm-reasons">${reasons}</ul>
        <p class="hm-equation">예상 혜택 ${won(result.money)} − 월 연회비 ${won(result.feeMonthly)}</p>
      </div>
      <span class="hm-net">월 순이득 <strong>${won(result.net)}</strong></span>
    </a>`;
  }

  return `<div class="hm-head"><div class="hm-label">🥊 오늘의 매치 <small>${basis} · 월 ${basisWon(totalSpend(spend))}</small></div>
    <button type="button" class="hm-basis-toggle" aria-expanded="false" aria-controls="hm-criteria">기준 보기</button></div>
    <div class="hm-criteria" id="hm-criteria" hidden>${criteria}</div>
    ${cardHtml(ranked[0], true)}<div class="hm-vs">VS</div>${cardHtml(ranked[1], false)}
    <a class="hm-more" href="calculator.html">전체 랭킹 보기 →</a>`;
}

return {STANDARD_SPEND, totalSpend, rankCards, reasonLines, cardCountCopy, renderHeroMatchHtml};
```

In `home-profile.js`, replace the old match HTML construction with `renderHeroMatchHtml`, then bind the basis toggle:

```javascript
box.innerHTML = HomeMatch.renderHeroMatchHtml({ranked: ranked.slice(0, 2), spend: spend, personal: Boolean(p)});
var basisToggle = box.querySelector('.hm-basis-toggle');
var criteria = box.querySelector('#hm-criteria');
if (basisToggle && criteria) {
  basisToggle.onclick = function () {
    var open = basisToggle.getAttribute('aria-expanded') === 'true';
    basisToggle.setAttribute('aria-expanded', String(!open));
    criteria.hidden = open;
    basisToggle.textContent = open ? '기준 보기' : '기준 닫기';
  };
}
```

Required behavior:

- `.hm-card-link` fills the card, inherits text color, has no underline, and receives a visible `:focus-visible` outline.
- `.hm-reasons` uses at most two short lines and truncates only the card name, not the recommendation reason.
- `.hm-equation` visually separates expected benefit, monthly fee, and net benefit without adding another button.
- `.hm-criteria` is a two-column compact grid on desktop and one column below 520px.
- `.hm-basis-toggle` has a minimum 44px mobile tap target.
- Respect `prefers-reduced-motion` and avoid decorative continuous animation.

Implement those rules with this CSS shape, adjusting only spacing values during visual verification:

```css
.hm-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.hm-basis-toggle{min-height:44px;padding:8px 10px;border:0;background:transparent;color:var(--home-blue);font:800 12px "Noto Sans KR",sans-serif;cursor:pointer}
.hm-criteria{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;padding:10px 12px;border-radius:12px;background:#f5f8ff}
.hm-criteria[hidden]{display:none}
.hm-criteria-item{display:flex;justify-content:space-between;gap:8px;color:var(--home-muted);font:700 11px "Noto Sans KR",sans-serif}
.hm-criteria-item b{color:var(--home-ink)}
.hm-card-link{color:inherit;text-decoration:none;cursor:pointer;transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease}
.hm-card-link:hover{transform:translateY(-1px);border-color:#9bb7ea;box-shadow:0 8px 18px rgba(19,42,88,.1)}
.hm-card-link:focus-visible{outline:3px solid #2f6fed;outline-offset:3px}
.hm-card-copy{flex:1;min-width:0}
.hm-reasons{margin:7px 0 0;padding:0;list-style:none;color:#42526e;font:700 11px/1.45 "Noto Sans KR",sans-serif}
.hm-equation{margin:6px 0 0;color:#64748b;font:700 10.5px/1.35 "Noto Sans KR",sans-serif}
.hm-net{display:flex;flex-direction:column;align-items:flex-end;font-size:10px}
.hm-net strong{font-size:14px}
@media (max-width:520px){.hm-criteria{grid-template-columns:1fr}.hm-card-link{align-items:flex-start}.hm-net{width:100%;margin-left:68px;align-items:flex-start}}
@media (prefers-reduced-motion:reduce){.hm-card-link{transition:none}.hm-card-link:hover{transform:none}}
```

- [ ] **Step 4: Run the tests again**

Run: `node --test src/picking/test_home_match.js src/picking/test_home_recommendation.js`

Expected: all tests pass with 0 failures.

- [ ] **Step 5: Commit the UI enhancement**

```powershell
git add home-match.js home-profile.js home-recommendation.css src/picking/test_home_match.js
git commit -m "feat: 오늘의 매치 추천 이유와 기준 보기 추가"
```

---

### Task 4: Full Local Verification

**Files:**
- Verify: `index.html`
- Verify: `home-match.js`
- Verify: `home-profile.js`
- Verify: `home-recommendation.css`
- Verify: `src/picking/test_home_match.js`

**Interfaces:**
- Consumes: the completed local implementation from Tasks 1-3.
- Produces: evidence that the local feature works without pushing the branch.

- [ ] **Step 1: Run the full JavaScript checks**

Run:

```powershell
node --test src/picking/test_home_match.js src/picking/test_home_recommendation.js src/picking/test_card688_qa.js src/picking/test_calculator_qa.js src/picking/test_3tier_ui_qa.js
```

Expected: 0 failed tests.

- [ ] **Step 2: Check JSON counts and current candidate coverage**

Run:

```powershell
node -e "const fs=require('fs');const cards=JSON.parse(fs.readFileSync('cards_list.json','utf8'));const benefits=JSON.parse(fs.readFileSync('benefits_structured.json','utf8'));console.log({cards:cards.length,benefits:Object.keys(benefits).length});"
```

Expected: `cards: 1276` and `benefits: 1563` for the current local data snapshot.

- [ ] **Step 3: Run the local preview server and verify routes**

Start `node serve.js`, then verify status 200 for:

- `/index.html`
- `/detail?idx=663`
- `/compare`
- `/calculator`

Confirm manually on desktop and mobile widths:

- the heading displays `1,276장의 카드가 싸웁니다`;
- the basis details open and close;
- both match cards navigate to their detail pages;
- reasons and net calculations remain readable at 360px width;
- no local-only ZIP, HTML review files, cashback research, or Olive Young research files are staged.

- [ ] **Step 4: Inspect the final diff and status**

Run:

```powershell
git diff --check
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: no whitespace errors; only planned files are committed, and pre-existing untracked research/review artifacts remain untracked.

- [ ] **Step 5: Stop with local-only handoff**

Report the local commit hashes, test results, and preview results. Do not push or update PR #49 until the user explicitly asks.
