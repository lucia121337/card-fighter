const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HomeRecommendation = require(path.resolve(__dirname, '../../home-recommendation.js'));

test('생활 상황을 기존 혜택 필터 이름으로 정확히 변환한다', () => {
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
});

test('대표 카드는 혜택 주제와 카드사가 겹치지 않게 세 장을 고른다', () => {
  const cards = [
    {idx: 1, card_name: '생활 카드', company: 'A', benefit_categories: '공과금/렌탈,교통', top_benefit_summary: '생활비 10% 할인'},
    {idx: 2, card_name: '쇼핑 카드', company: 'B', benefit_categories: '쇼핑', top_benefit_summary: '쇼핑 10% 할인'},
    {idx: 3, card_name: '주유 카드', company: 'C', benefit_categories: '주유', top_benefit_summary: '주유 10% 할인'},
    {idx: 4, card_name: '중복 카드', company: 'A', benefit_categories: '쇼핑', top_benefit_summary: '쇼핑 적립'}
  ];

  const featured = HomeRecommendation.selectFeaturedCards(cards, 3);

  assert.deepEqual(featured.map(card => card.idx), [1, 2, 3]);
  assert.deepEqual(featured.map(card => card.company), ['A', 'B', 'C']);
  assert.match(featured[0].homeReason, /공과금\/렌탈/);
});

test('캐시백은 0원 혜택을 빼고 금액이 큰 순서로 세 개를 고른다', () => {
  const cashback = HomeRecommendation.selectCashbackHighlights([
    {name: 'A카드', maxAmount: 20, bestPlatform: '네이버페이'},
    {name: 'B카드', maxAmount: 85, bestPlatform: '아정당카드'},
    {name: 'C카드', maxAmount: 50, bestPlatform: '카드고릴라'},
    {name: 'D카드', maxAmount: 0, bestPlatform: null}
  ], 3);

  assert.deepEqual(cashback.map(item => item.name), ['B카드', 'C카드', 'A카드']);
});

test('전월실적을 만원 단위로 읽기 쉽게 표시한다', () => {
  assert.equal(HomeRecommendation.formatPerformance(300000), '30만원');
  assert.equal(HomeRecommendation.formatPerformance(0), '조건 없음');
});

test('대표 카드 HTML은 상세 링크를 만들고 카드 이름을 안전하게 표시한다', () => {
  const html = HomeRecommendation.renderFeaturedCardsHtml([
    {idx: 7, card_name: '<script>위험</script>', company: '테스트카드', image_url: 'card.png', annual_fee: 12000, previous_month_performance: 300000, homeReason: '쇼핑 혜택이 돋보이는 카드'}
  ]);

  assert.match(html, /detail\.html\?idx=7/);
  assert.match(html, /&lt;script&gt;위험&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-home-compare="7"/);
});

test('대표 카드가 없으면 다음 행동을 안내한다', () => {
  assert.match(HomeRecommendation.renderFeaturedCardsHtml([]), /전체카드/);
});

test('캐시백 HTML은 금액이 큰 혜택부터 보여준다', () => {
  const html = HomeRecommendation.renderCashbackHtml([
    {name: 'A카드', maxAmount: 20, bestPlatform: '네이버페이'},
    {name: 'B카드', maxAmount: 85, bestPlatform: '아정당카드'}
  ]);

  assert.ok(html.indexOf('B카드') < html.indexOf('A카드'));
  assert.match(html, /최대 85만원/);
});

test('비교함 상태에 맞는 안내 문구를 만든다', () => {
  assert.match(HomeRecommendation.getCompareCopy([]), /2장/);
  assert.match(HomeRecommendation.getCompareCopy([{idx: 1}]), /1장/);
  assert.match(HomeRecommendation.getCompareCopy([{idx: 1}, {idx: 2}]), /바로 비교/);
});
