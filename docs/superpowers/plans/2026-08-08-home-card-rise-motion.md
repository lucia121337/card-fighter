# Home Card Rise Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 히어로에 중복 없는 무작위 카드 3장을 페이지 진입 시 한 번만 순차 등장시키고, 목적 메뉴의 특수문자를 A안 라인 아이콘으로 교체한다.

**Architecture:** `home-gateway.js`에 난수 주입이 가능한 순수 셔플 함수와 페이지 생명주기 캐시를 분리해 선택 로직을 테스트한다. 기존 카드 위치는 `home-gateway.css`의 사용자 정의 속성으로 보존하면서 단일 키프레임만 추가하고, 목적 메뉴 아이콘은 `index.html`의 장식용 인라인 SVG로 둔다.

**Tech Stack:** 정적 HTML, CSS 애니메이션, 바닐라 JavaScript, Node.js 내장 `node:test`

## Global Constraints

- 작업 브랜치는 `feature/home-card-rise`이며 `main`에 직접 커밋하거나 push하지 않는다.
- 외부 아이콘 라이브러리와 새 패키지를 추가하지 않는다.
- 카드 후보는 현재 활성 카드 목록 중 `card_img`가 있는 항목만 사용하고 한 조합 안에서 중복을 허용하지 않는다.
- 선택 결과는 페이지가 유지되는 동안 재사용하며 새로고침에서만 새로 선택할 수 있다.
- 등장 모션은 아래 120px, 불투명도 0, 크기 96%에서 시작해 0.7초 동안 `cubic-bezier(0.16, 1, 0.3, 1)`로 감속한다.
- 카드별 지연은 0초, 0.12초, 0.24초이며 튕김과 반복이 없다.
- `prefers-reduced-motion: reduce`에서는 즉시 최종 위치로 표시한다.
- 모바일 720px 이하에서는 기존처럼 세 번째 카드를 숨긴다.
- 목적 메뉴 아이콘은 28px 인라인 SVG, 약 1.8px 선, `currentColor`, `aria-hidden="true"`를 사용한다.
- `index.html`은 공통 파일이므로 이 계획에 적힌 목적 메뉴 세 줄 외 영역을 건드리지 않는다.
- 사용자가 만든 추적되지 않은 데이터·검수 파일과 `.superpowers/` 폴더는 스테이징하지 않는다.

---

### Task 1: 무작위 카드 선택과 페이지 생명주기 캐시

**Files:**
- Modify: `home-gateway.js:24-30,72-75,104-111,158-164`
- Test: `src/picking/test_home_gateway.js:134-173`

**Interfaces:**
- Consumes: 카드 객체 배열 `{idx, card_name, card_img}`와 `random(): number`
- Produces: `selectHeroCards(cards, limit = 3, random = Math.random): Card[]`, `createHeroCardPicker(random = Math.random): (cards, limit?) => Card[]`

- [ ] **Step 1: 무작위 선택이 이미지 없는 카드를 제외하고 입력 난수에 따라 달라지는 실패 테스트 작성**

```js
test('hero selection uses the supplied random source without duplicates', () => {
  const cards = [
    {idx: 0, card_name: 'no image', card_img: ''},
    {idx: 1, card_name: 'A', card_img: 'a.png'},
    {idx: 2, card_name: 'B', card_img: 'b.png'},
    {idx: 3, card_name: 'C', card_img: 'c.png'},
    {idx: 4, card_name: 'D', card_img: 'd.png'}
  ];

  const low = HomeGateway.selectHeroCards(cards, 3, () => 0).map(card => card.idx);
  const high = HomeGateway.selectHeroCards(cards, 3, () => 0.999).map(card => card.idx);

  assert.deepEqual(low, [2, 3, 4]);
  assert.deepEqual(high, [1, 2, 3]);
  assert.equal(new Set(low).size, 3);
  assert.ok(low.every(idx => idx !== 0));
});
```

- [ ] **Step 2: 선택 테스트를 실행해 기존 앞 3장 고정 로직 때문에 실패하는지 확인**

Run: `node --test --test-name-pattern="hero selection uses" src/picking/test_home_gateway.js`

Expected: `low`가 `[1, 2, 3]`으로 나와 FAIL한다.

- [ ] **Step 3: Fisher–Yates 방식의 최소 무작위 선택 구현**

```js
function selectHeroCards(cards, limit = 3, random = Math.random) {
  const pool = (Array.isArray(cards) ? cards : [])
    .filter(card => card && card.card_img)
    .map(card => ({idx: card.idx, card_name: card.card_name || '', card_img: card.card_img}));

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, limit);
}
```

- [ ] **Step 4: 무작위 선택 테스트가 통과하는지 확인**

Run: `node --test --test-name-pattern="hero selection uses" src/picking/test_home_gateway.js`

Expected: PASS.

- [ ] **Step 5: 빈 데이터는 캐시하지 않고 첫 유효 조합만 재사용하는 실패 테스트 작성**

```js
test('hero picker keeps one non-empty combination for the page lifetime', () => {
  const cards = [
    {idx: 1, card_name: 'A', card_img: 'a.png'},
    {idx: 2, card_name: 'B', card_img: 'b.png'},
    {idx: 3, card_name: 'C', card_img: 'c.png'},
    {idx: 4, card_name: 'D', card_img: 'd.png'}
  ];
  let randomCalls = 0;
  const picker = HomeGateway.createHeroCardPicker(() => {
    randomCalls += 1;
    return 0;
  });

  assert.deepEqual(picker([]), []);
  const first = picker(cards);
  const second = picker(cards.slice().reverse());

  assert.deepEqual(second, first);
  assert.equal(randomCalls, 3);
});
```

- [ ] **Step 6: 캐시 테스트를 실행해 팩토리가 아직 없어 실패하는지 확인**

Run: `node --test --test-name-pattern="hero picker keeps" src/picking/test_home_gateway.js`

Expected: `HomeGateway.createHeroCardPicker is not a function`으로 FAIL한다.

- [ ] **Step 7: 페이지 전용 선택기와 렌더 연결 구현**

```js
function createHeroCardPicker(random = Math.random) {
  let cachedCards = null;
  return function pickHeroCards(cards, limit = 3) {
    if (cachedCards) return cachedCards;
    const selected = selectHeroCards(cards, limit, random);
    if (selected.length) cachedCards = selected;
    return selected;
  };
}

const pickHeroCardsForPage = createHeroCardPicker();

function renderHeroCardsHtml(cards) {
  return pickHeroCardsForPage(cards).map((card, index) =>
    `<img class="home-stack-card home-stack-card-${index + 1}" src="${escapeHtml(card.card_img)}" alt="" aria-hidden="true" onerror="this.hidden=true">`
  ).join('');
}
```

`createHeroCardPicker`를 반환 API에 추가하고 `updateCards()`가 기존 `renderHeroCardsHtml(cards)`를 그대로 호출하게 둔다.

- [ ] **Step 8: 카드 선택·캐시·기존 홈 테스트를 모두 실행**

Run: `node --test src/picking/test_home_gateway.js`

Expected: 모든 테스트 PASS, 실패 0개.

- [ ] **Step 9: 카드 선택 작업 커밋**

```bash
git add home-gateway.js src/picking/test_home_gateway.js
git commit -m "feat: 홈 카드 무작위 선택 추가"
```

### Task 2: 카드 순차 상승 모션

**Files:**
- Modify: `home-gateway.css:11-13,27-29`
- Test: `src/picking/test_home_gateway.js:224-232`

**Interfaces:**
- Consumes: 렌더된 `.home-stack-card-1`, `.home-stack-card-2`, `.home-stack-card-3`
- Produces: `home-card-rise` 키프레임과 카드별 `--card-rotate`, `--card-delay` 값

- [ ] **Step 1: 모션 계약과 움직임 줄이기 동작의 실패 테스트 작성**

```js
test('hero cards rise once with staggered delays and preserve reduced motion', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');

  assert.match(css, /@keyframes home-card-rise/);
  assert.match(css, /translateY\(120px\)[^}]*scale\(\.96\)/);
  assert.match(css, /animation:home-card-rise \.7s cubic-bezier\(\.16,1,\.3,1\)/);
  assert.match(css, /home-stack-card-1\{[^}]*--card-delay:0s/);
  assert.match(css, /home-stack-card-2\{[^}]*--card-delay:\.12s/);
  assert.match(css, /home-stack-card-3\{[^}]*--card-delay:\.24s/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^@]*\.home-stack-card\{[^}]*animation:none[^}]*opacity:1/);
});
```

- [ ] **Step 2: 모션 테스트를 실행해 키프레임이 없어 실패하는지 확인**

Run: `node --test --test-name-pattern="hero cards rise once" src/picking/test_home_gateway.js`

Expected: `@keyframes home-card-rise` 불일치로 FAIL한다.

- [ ] **Step 3: 회전값을 변수로 보존하며 최소 등장 모션 구현**

```css
.home-stack-card{--card-rotate:0deg;--card-delay:0s;position:absolute;width:138px;height:90px;object-fit:contain;opacity:0;filter:drop-shadow(0 14px 12px rgba(30,41,59,.2));transform:translateY(120px) rotate(var(--card-rotate)) scale(.96);animation:home-card-rise .7s cubic-bezier(.16,1,.3,1) var(--card-delay) both}
.home-stack-card-1{left:0;top:82px;--card-rotate:-16deg;--card-delay:0s}.home-stack-card-2{right:0;top:30px;--card-rotate:11deg;--card-delay:.12s}.home-stack-card-3{right:58px;bottom:4px;--card-rotate:1deg;--card-delay:.24s}
@keyframes home-card-rise{to{opacity:1;transform:translateY(0) rotate(var(--card-rotate)) scale(1)}}
```

기존 reduced-motion 블록에 다음 규칙을 함께 넣는다.

```css
.home-stack-card{animation:none;opacity:1;transform:rotate(var(--card-rotate)) scale(1)}
```

- [ ] **Step 4: 모션 테스트와 전체 홈 테스트 실행**

Run: `node --test src/picking/test_home_gateway.js`

Expected: 모든 테스트 PASS, 실패 0개.

- [ ] **Step 5: 등장 모션 작업 커밋**

```bash
git add home-gateway.css src/picking/test_home_gateway.js
git commit -m "feat: 홈 카드 순차 등장 모션 추가"
```

### Task 3: A안 목적 메뉴 라인 아이콘

**Files:**
- Modify: `index.html:744-749`
- Modify: `home-gateway.css:18`
- Test: `src/picking/test_home_gateway.js:197-219`

**Interfaces:**
- Consumes: 목적 메뉴의 기존 `.home-purpose-icon` 래퍼와 상속 색상
- Produces: 계산·발급 혜택·혜택 탐색 의미의 장식용 SVG 3개

- [ ] **Step 1: 특수문자 제거와 SVG 접근성 계약의 실패 테스트 작성**

```js
test('purpose routes use three decorative currentColor line icons', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nav = index.match(/<nav id="home-purpose-routes"[\s\S]*?<\/nav>/)[0];

  assert.equal((nav.match(/<svg\b/g) || []).length, 3);
  assert.equal((nav.match(/<svg\b[^>]*aria-hidden="true"/g) || []).length, 3);
  assert.equal((nav.match(/stroke="currentColor"/g) || []).length, 3);
  assert.doesNotMatch(nav, /▣|◒|◈/);
});
```

- [ ] **Step 2: 아이콘 테스트를 실행해 기존 특수문자 때문에 실패하는지 확인**

Run: `node --test --test-name-pattern="purpose routes use" src/picking/test_home_gateway.js`

Expected: SVG 개수가 0이라 FAIL한다.

- [ ] **Step 3: A안 인라인 SVG 세 개로 목적 메뉴 마크업 교체**

각 `.home-purpose-icon` 안에 공통 속성 `viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`를 가진 SVG를 넣는다.

```html
<!-- 01: 카드와 상승 화살표 -->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="8.5" width="17" height="14" rx="2.5"/><path d="M3.5 13h17M22 17l3-3 3 3M25 14v9"/></svg>

<!-- 02: 리본 선물상자 -->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 13h22v15H5zM3.5 9h25v4h-25zM16 9v19M16 9c-1.4-4.6-7.2-5.2-7.2-1.8C8.8 9 11 9 16 9Zm0 0c1.4-4.6 7.2-5.2 7.2-1.8C23.2 9 21 9 16 9Z"/></svg>

<!-- 03: 혜택 격자와 돋보기 -->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="6" height="6" rx="1"/><rect x="13" y="5" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><circle cx="20.5" cy="20.5" r="5.5"/><path d="m24.5 24.5 4 4"/></svg>
```

- [ ] **Step 4: SVG를 28px로 정렬하고 문자열 아이콘용 글자 크기 제거**

```css
.home-purpose-icon{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center}.home-purpose-icon svg{display:block;width:28px;height:28px}
```

- [ ] **Step 5: 아이콘 테스트와 전체 홈 테스트 실행**

Run: `node --test src/picking/test_home_gateway.js`

Expected: 모든 테스트 PASS, 실패 0개.

- [ ] **Step 6: A안 아이콘 작업 커밋**

```bash
git add index.html home-gateway.css src/picking/test_home_gateway.js
git commit -m "feat: 목적 메뉴 라인 아이콘 적용"
```

### Task 4: 통합 검증과 로컬 미리보기

**Files:**
- Verify: `index.html`
- Verify: `home-gateway.js`
- Verify: `home-gateway.css`
- Verify: `src/picking/test_home_gateway.js`

**Interfaces:**
- Consumes: Tasks 1–3의 완성된 홈 화면
- Produces: 자동화 테스트 결과와 데스크톱·모바일 시각 확인 기록

- [ ] **Step 1: 전체 관련 자동화 테스트 실행**

Run: `node --test src/picking/test_home_gateway.js src/picking/test_calculator_qa.js`

Expected: 모든 테스트 PASS, 실패 0개.

- [ ] **Step 2: 공백 오류와 의도하지 않은 파일 변경 확인**

Run: `git diff --check`

Expected: 출력 없이 종료 코드 0.

Run: `git status --short`

Expected: 추적 파일 변경은 Tasks 1–3에서 커밋되어 없고, 기존 사용자 소유의 추적되지 않은 파일만 남는다.

- [ ] **Step 3: 프로젝트 권장 서버로 로컬 미리보기 실행**

Run: `python serve.py`

Expected: `http://localhost:5500/index.html`에서 홈 화면을 열 수 있다.

- [ ] **Step 4: 데스크톱에서 페이지 진입과 새로고침 확인**

브라우저 폭 1280px에서 다음을 확인한다.

- 세 카드가 아래에서 0초, 0.12초, 0.24초 순서로 올라와 한 번만 멈춘다.
- 세 카드의 최종 회전과 위치가 기존 디자인과 같다.
- 같은 페이지 안에서 섹션을 오갔을 때 카드 조합과 모션이 다시 시작되지 않는다.
- 새로고침을 여러 번 하면 이미지가 있는 활성 카드 중 서로 다른 조합이 나타날 수 있다.
- 이미지 하나가 실패해도 나머지 카드와 홈 레이아웃은 유지된다.
- 01·02·03 아이콘이 각각 계산, 선물, 혜택 탐색으로 읽히며 첫 메뉴는 흰색, 나머지는 네이비다.

- [ ] **Step 5: 모바일과 움직임 줄이기 확인**

브라우저 폭 360px, 375px, 390px, 412px에서 가로 스크롤이 없고 세 번째 카드가 숨겨지는지 확인한다. 운영체제 또는 개발자 도구에서 `prefers-reduced-motion: reduce`를 켠 뒤 두 카드가 이동 없이 최종 위치에 즉시 표시되는지 확인한다.

- [ ] **Step 6: 검증에서 발견된 문제가 있을 때만 회귀 테스트부터 추가**

발견된 문제를 재현하는 단일 실패 테스트를 `src/picking/test_home_gateway.js`에 먼저 추가하고 FAIL을 확인한 뒤, 해당 문제를 만드는 최소 코드만 수정하고 전체 테스트를 다시 실행한다.

- [ ] **Step 7: 검증 수정이 생긴 경우에만 커밋**

```bash
git add index.html home-gateway.js home-gateway.css src/picking/test_home_gateway.js
git commit -m "fix: 홈 카드 등장 화면 회귀 수정"
```
