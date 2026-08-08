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
  const calculator = {calc: (_benefit, _spend, options) => outcomes[options.cardIdx]};

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

test('카드 수 문구는 배열 길이를 천 단위로 표시한다', () => {
  assert.equal(HomeMatch.cardCountCopy(new Array(1276)), '1,276장의 카드가 싸웁니다.');
  assert.equal(HomeMatch.cardCountCopy(null), '수많은 카드가 싸웁니다.');
});
