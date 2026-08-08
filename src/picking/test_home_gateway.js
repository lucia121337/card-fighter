const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const HomeGateway = require(path.join(ROOT, 'home-gateway.js'));

test('phone header collapse covers common 360 to 412px widths with touch targets', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const match = index.match(/@media\(max-width:(\d+)px\)\{[\s\S]*?\.header-top\{[^}]*flex-wrap:wrap/);
  assert.ok(match, 'phone header collapse media query is present');
  const breakpoint = Number(match[1]);
  for (const width of [360, 375, 390, 412]) assert.ok(width <= breakpoint);
  assert.ok(breakpoint < 768, 'desktop header remains outside the phone breakpoint');
  assert.match(index, new RegExp(`@media\\(max-width:${breakpoint}px\\)\\{[\\s\\S]*?\\.gnb\\{[^}]*width:100%[^}]*flex-wrap:wrap`));
  assert.match(index, new RegExp(`@media\\(max-width:${breakpoint}px\\)\\{[\\s\\S]*?\\.gnb a\\{[^}]*min-height:44px`));
  assert.match(index, new RegExp(`@media\\(max-width:${breakpoint}px\\)\\{[\\s\\S]*?\\.header-search\\{[^}]*padding-left:0`));
  assert.doesNotMatch(index, /html\s*,?\s*body\{[^}]*overflow-x:hidden/);
});

test('profile resume routes calculator as primary and secondary actions', () => {
  const profileOnly = HomeGateway.buildResumeState({spend: {food: 300000}}, []);
  assert.equal(profileOnly.primaryAction, 'calculator');
  assert.equal(profileOnly.secondaryAction, null);
  assert.match(HomeGateway.renderResumeHtml(profileOnly), /data-home-route="calculator"/);

  const profileAndCompare = HomeGateway.buildResumeState(
    {spend: {food: 300000}},
    [{idx: 1, name: 'A'}, {idx: 2, name: 'B'}]
  );
  assert.equal(profileAndCompare.primaryAction, 'compare');
  assert.equal(profileAndCompare.secondaryAction, 'calculator');
  assert.equal((HomeGateway.renderResumeHtml(profileAndCompare).match(/data-home-route="calculator"/g) || []).length, 1);
});

test('malformed compare entries do not create resume steps or throw', () => {
  assert.equal(HomeGateway.buildResumeState(null, [null, {}, 'bad']), null);
  const state = HomeGateway.buildResumeState(null, [null, {idx: 1, name: 'A'}, {}, {idx: 2, card_name: 'B'}]);
  assert.equal(state.compareCount, 2);
  assert.deepEqual(state.compareNames, ['A', 'B']);
});

test('delegated routes preserve modified anchor clicks and handle buttons', () => {
  const previousDocument = global.document;
  let handler;
  let calls = 0;
  const root = {addEventListener(type, listener) { if (type === 'click') handler = listener; }};
  global.document = {getElementById(id) { return id === 'home-gateway' ? root : null; }};

  const fire = (target, overrides = {}) => {
    let prevented = false;
    handler({
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target,
      preventDefault() { prevented = true; },
      ...overrides
    });
    return prevented;
  };
  const anchor = {tagName: 'A', dataset: {homeRoute: 'calculator'}, closest() { return this; }};
  const button = {tagName: 'BUTTON', dataset: {homeRoute: 'calculator'}, closest() { return this; }};

  try {
    HomeGateway.init({actions: {calculator() { calls += 1; }}});
    assert.equal(fire(anchor, {ctrlKey: true}), false);
    assert.equal(fire(anchor, {button: 1}), false);
    assert.equal(calls, 0);
    assert.equal(fire(anchor), true);
    assert.equal(calls, 1);
    assert.equal(fire(button, {shiftKey: true}), true);
    assert.equal(calls, 2);
  } finally {
    global.document = previousDocument;
  }
});

test('index refreshes stored profile and compare state on pageshow and relevant storage events', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /function readStoredCompareList\(\)\s*\{\s*try\s*\{/);
  assert.match(index, /function refreshStoredHomeState\(\)[\s\S]*?compareList = readStoredCompareList\(\);[\s\S]*?refreshCompareButtons\(\);/);
  assert.match(index, /window\.addEventListener\('pageshow', refreshStoredHomeState\)/);
  assert.equal((index.match(/addEventListener\('pageshow'/g) || []).length, 1);
  assert.match(index, /event\.key === null \|\| event\.key === 'compareList' \|\| event\.key === CardProfile\.KEY/);
  assert.match(index, /HomeGateway\.updateResume\(CardProfile\.load\(\), compareList\)/);
  assert.match(index, /calculator\(\)\s*\{\s*window\.location\.href = 'calculator\.html';\s*\}/);
});

test('mobile hero and trust copy follow the approved design specification', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(css, /@media \(max-width:720px\)\{[^@]*\.home-stack-card-3\{display:none\}/);
  assert.match(index, /월 순이득은 예상 혜택에서 월 환산 연회비를 뺀 값/);
  assert.match(index, /추천 조건을 공개하고 카드사 상품설명서 원문을 검수/);
});

test('index wires only the purpose gateway home', () => {
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

test('index no longer references removed recommendation home modules', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const oldName of ['HomeRecommendation', 'hero-match', 'home-featured-cards', 'home-cashback-list']) {
    assert.doesNotMatch(index, new RegExp(oldName));
  }
});

test('세 가지 공식 목적 경로만 제공한다', () => {
  assert.deepEqual(HomeGateway.PURPOSE_ROUTES.map(route => [route.id, route.href]), [
    ['calculator', 'calculator.html'],
    ['cashback', '/event'],
    ['benefits', '/card#benefit-filters']
  ]);
});

test('카드 총 문구는 cards_list 배열 길이를 표시한다', () => {
  assert.equal(HomeGateway.cardCountCopy(new Array(1276)), '1,276장의 카드 데이터');
  assert.equal(HomeGateway.cardCountCopy(null), '수많은 카드 데이터');
});

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

test('hero selection removes duplicate card ids before shuffling', () => {
  const cards = [
    {idx: 1, card_name: 'A', card_img: 'a.png'},
    {idx: 1, card_name: 'A duplicate', card_img: 'a-duplicate.png'},
    {idx: 2, card_name: 'B', card_img: 'b.png'},
    {idx: 3, card_name: 'C', card_img: 'c.png'},
    {idx: 4, card_name: 'D', card_img: 'd.png'}
  ];

  const selected = HomeGateway.selectHeroCards(cards, 4, () => 0.999).map(card => card.idx);

  assert.deepEqual(selected, [1, 2, 3, 4]);
  assert.equal(new Set(selected).size, selected.length);
});

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

test('저장된 탐색이 전혀 없으면 이어하기 상태를 만들지 않는다', () => {
  assert.equal(HomeGateway.buildResumeState(null, []), null);
});

test('비교 카드가 둘이면 비교 이어보기가 주 행동이 된다', () => {
  const state = HomeGateway.buildResumeState(
    {spend: {'마트': 400000, '식비/외식': 250000}, prevMonth: 0},
    [{idx: 663, name: '로카카드'}, {idx: 2416, name: '삼성카드'}]
  );
  assert.equal(state.profileTotal, 650000);
  assert.equal(state.compareCount, 2);
  assert.equal(state.primaryAction, 'compare');
  assert.equal(state.primaryLabel, '비교 이어보기');
});

test('히어로 카드 이미지는 장식용이고 링크를 만들지 않는다', () => {
  const html = HomeGateway.renderHeroCardsHtml([
    {idx: 1, card_name: '<위험>', card_img: 'a.png'},
    {idx: 2, card_name: 'B', card_img: 'b.png'}
  ]);
  assert.equal((html.match(/<img/g) || []).length, 2);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<a\b/);
  assert.doesNotMatch(html, /<위험>/);
});

test('이어하기 HTML은 저장된 상태와 주 행동만 보여준다', () => {
  const state = HomeGateway.buildResumeState(
    {spend: {'마트': 400000}, prevMonth: 0},
    [{idx: 1, name: 'A'}, {idx: 2, name: 'B'}]
  );
  const html = HomeGateway.renderResumeHtml(state);
  assert.match(html, /40만원/);
  assert.match(html, /카드 비교 중/);
  assert.match(html, /data-home-route="compare"/);
  assert.match(html, /비교 이어보기/);
});

test('이어할 상태가 없으면 빈 마크업을 만들지 않는다', () => {
  assert.equal(HomeGateway.renderResumeHtml(null), '');
});

test('외부 이어하기 상태의 행동 값과 문구를 HTML로 해석하지 않는다', () => {
  const html = HomeGateway.renderResumeHtml({
    hasProfile: false,
    profileTotal: 0,
    compareCount: 0,
    compareNames: [],
    primaryAction: 'compare" autofocus onfocus="alert(1)',
    primaryLabel: '<img src=x>',
    secondaryAction: 'calculator" onclick="alert(1)',
    secondaryLabel: '<script>alert(1)</script>'
  });

  assert.match(html, /data-home-route="compare&quot; autofocus onfocus=&quot;alert\(1\)"/);
  assert.match(html, /data-home-route="calculator&quot; onclick=&quot;alert\(1\)"/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img src=x>|<script>alert\(1\)<\/script>/);
});

test('index includes only the purpose gateway home structure', () => {
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

test('the gateway stylesheet includes hierarchy, mobile, and reduced-motion rules', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');
  assert.match(css, /\.home-editorial-hero/);
  assert.match(css, /\.home-purpose-grid/);
  assert.match(css, /\.home-resume/);
  assert.match(css, /\.home-lab-grid/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('the Card Lab link provides a 44px keyboard and touch target', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');
  assert.match(css, /.home-lab-head>a{[^}]*display:inline-flex[^}]*min-height:44px[^}]*padding:/);
});

test('the Card Lab uses the site blue-gray palette and natural tournament copy', () => {
  const css = fs.readFileSync(path.join(ROOT, 'home-gateway.css'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(css, /#ddd6fe|#f5f1ff|#7c3aed/);
  assert.match(index, /마지막까지 살아남을 카드는?/);
  assert.doesNotMatch(index, /마음 마지막까지 남아있는 카드는?/);
});
