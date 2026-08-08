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

  function cardCountCopy(cards) {
    return Array.isArray(cards) && cards.length
      ? `${cards.length.toLocaleString()}장의 카드가 싸웁니다.`
      : '수많은 카드가 싸웁니다.';
  }

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
    const criteria = Object.entries(spend)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([name, amount]) => (
        `<div class="hm-criteria-item"><span>${escapeHtml(name)}</span><b>${won(amount)}</b></div>`
      )).join('');

    function cardHtml(item, winner) {
      const card = item.card || {};
      const result = item.r || {};
      const reasons = reasonLines(result, card.top_benefit_summary)
        .map(line => `<li>${escapeHtml(line)}</li>`).join('');
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

  return {
    STANDARD_SPEND,
    totalSpend,
    rankCards,
    reasonLines,
    cardCountCopy,
    renderHeroMatchHtml
  };
});
