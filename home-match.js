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
      const result = calculator.calc(benefit, spend, {prevMonth, cardIdx: card.idx});
      return result && result.money > 0 ? {idx: card.idx, card, r: result} : null;
    }).filter(Boolean).sort((a, b) => (
      b.r.net - a.r.net || a.r.feeMonthly - b.r.feeMonthly
    ));
  }

  function reasonLines(result, fallback) {
    const lines = (result && Array.isArray(result.rows) ? result.rows : [])
      .filter(row => Number(row.shown) > 0)
      .sort((a, b) => Number(b.shown) - Number(a.shown))
      .slice(0, 2)
      .map(row => {
        const label = row.isBase ? '그 외' : row.cat;
        const rate = Math.round(Number(row.rate) * 100);
        const amount = Math.round(Number(row.shown)).toLocaleString();
        return rate > 0
          ? `${label} ${rate}%로 약 ${amount}원 혜택`
          : `${label}에서 약 ${amount}원 혜택`;
      });
    return lines.length ? lines : [fallback || '상세 혜택을 확인해보세요.'];
  }

  return {STANDARD_SPEND, totalSpend, rankCards, reasonLines};
});
