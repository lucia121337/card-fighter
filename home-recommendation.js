(function (root) {
  'use strict';

  const CATEGORY_MAP = Object.freeze({
    '생활비': '공과금/렌탈',
    '쇼핑': '쇼핑',
    '교통': '교통',
    '주유': '주유',
    '카페·디저트': '카페/디저트',
    '여행·숙박': '여행/숙박',
    '항공마일리지': '항공마일리지',
    '프리미엄': '프리미엄'
  });

  const FEATURED_CATEGORIES = [
    '공과금/렌탈',
    '쇼핑',
    '주유',
    '여행/숙박',
    '항공마일리지'
  ];

  function cardMatches(card, category) {
    const text = `${card.benefit_categories || ''} ${card.top_benefit_summary || ''}`;
    return text.includes(category);
  }

  function selectFeaturedCards(cards, limit = 3) {
    const source = Array.isArray(cards) ? cards : [];
    const picked = [];
    const companies = new Set();

    for (const category of FEATURED_CATEGORIES) {
      const card = source.find(item => (
        !picked.some(selected => String(selected.idx) === String(item.idx))
        && !companies.has(item.company)
        && cardMatches(item, category)
      ));
      if (!card) continue;
      picked.push({...card, homeReason: `${category} 혜택이 돋보이는 카드`});
      companies.add(card.company);
      if (picked.length === limit) break;
    }

    for (const card of source) {
      if (picked.length === limit) break;
      if (picked.some(item => String(item.idx) === String(card.idx))) continue;
      picked.push({...card, homeReason: '다양한 생활 혜택을 제공하는 카드'});
    }

    return picked;
  }

  function selectCashbackHighlights(companies, limit = 3) {
    return [...(Array.isArray(companies) ? companies : [])]
      .filter(item => Number(item.maxAmount) > 0)
      .sort((a, b) => Number(b.maxAmount) - Number(a.maxAmount))
      .slice(0, limit);
  }

  function formatPerformance(amount) {
    return Number(amount) > 0
      ? `${Math.round(Number(amount) / 10000).toLocaleString()}만원`
      : '조건 없음';
  }

  const HomeRecommendation = {
    CATEGORY_MAP,
    selectFeaturedCards,
    selectCashbackHighlights,
    formatPerformance
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomeRecommendation;
  }
  if (root) root.HomeRecommendation = HomeRecommendation;
})(typeof window !== 'undefined' ? window : globalThis);
