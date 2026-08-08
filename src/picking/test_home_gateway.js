const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const HomeGateway = require(path.join(ROOT, 'home-gateway.js'));

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
