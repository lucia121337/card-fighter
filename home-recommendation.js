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

  const state = {actions: {}};

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

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

  function compactFee(value) {
    return String(value || '정보 확인 필요')
      .replace(/\[([\d,]+)\]원/g, '$1원')
      .replace(/\s*\/\s*/g, ' / ');
  }

  function renderFeaturedCardsHtml(cards) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return '<div class="home-empty">추천 카드를 준비하지 못했어요. <button type="button" data-home-action="benefits">전체카드에서 찾아보기</button></div>';
    }

    return cards.map(card => {
      const performance = card.pre_month_money ?? card.previous_month_performance ?? 0;
      return `<article class="home-feature-card">
        <img loading="lazy" src="${escapeHtml(card.card_img || card.image_url || '')}" alt="${escapeHtml(card.card_name || '')} 카드 이미지" onerror="this.style.visibility='hidden'">
        <div>
          <small>${escapeHtml(card.company || '')}</small>
          <h3>${escapeHtml(card.card_name || '')}</h3>
          <p>${escapeHtml(card.top_benefit_summary || '상세 혜택을 확인해보세요.')}</p>
          <dl><div><dt>전월실적</dt><dd>${escapeHtml(formatPerformance(performance))}</dd></div><div><dt>연회비</dt><dd>${escapeHtml(compactFee(card.annual_fee))}</dd></div></dl>
        </div>
        <strong class="home-card-reason">${escapeHtml(card.homeReason || '내 생활에 맞는 혜택 카드')}</strong>
        <div class="home-card-actions"><a href="detail.html?idx=${encodeURIComponent(card.idx)}">상세 보기</a><button type="button" data-home-compare="${escapeHtml(card.idx)}" data-card-name="${escapeHtml(card.card_name || '')}" data-card-img="${escapeHtml(card.card_img || card.image_url || '')}">비교함 담기</button></div>
      </article>`;
    }).join('');
  }

  function renderCashbackHtml(companies) {
    const highlights = selectCashbackHighlights(companies);
    if (highlights.length === 0) {
      return '<div class="home-empty">현재 확인 가능한 캐시백 혜택이 없어요.</div>';
    }

    return highlights.map(company => `<article class="home-cashback-card">
      <span>${escapeHtml(company.bestPlatform || '캐시백 혜택')}</span>
      <strong>${escapeHtml(company.name || '')}</strong>
      <b>최대 ${escapeHtml(company.maxAmount)}만원</b>
      <button type="button" data-home-action="cashback">혜택 확인하기</button>
    </article>`).join('');
  }

  function getCompareCopy(compareList) {
    const count = Array.isArray(compareList) ? compareList.length : 0;
    if (count >= 2) return `${count}장을 담았어요. 지금 바로 비교할 수 있어요.`;
    if (count === 1) return '1장을 담았어요. 한 장만 더 고르면 비교할 수 있어요.';
    return '카드를 2장 이상 담으면 혜택과 조건을 나란히 볼 수 있어요.';
  }

  function renderCards(cards) {
    const target = typeof document !== 'undefined' && document.getElementById('home-featured-cards');
    if (target) target.innerHTML = renderFeaturedCardsHtml(selectFeaturedCards(cards));
  }

  function renderCashback(companies) {
    const target = typeof document !== 'undefined' && document.getElementById('home-cashback-list');
    if (target) target.innerHTML = renderCashbackHtml(companies);
  }

  function renderCompare(compareList) {
    if (typeof document === 'undefined') return;
    const count = Array.isArray(compareList) ? compareList.length : 0;
    const badge = document.getElementById('home-compare-count');
    const summary = document.getElementById('home-compare-summary');
    if (badge) badge.textContent = count ? `${count}장 담김` : '비교함 확인';
    if (summary) summary.textContent = getCompareCopy(compareList);
  }

  function init(options = {}) {
    if (typeof document === 'undefined') return;
    state.actions = options.actions || {};
    renderCards(options.cards || []);
    renderCashback(options.cashback || []);
    renderCompare(options.compareList || []);

    const rootElement = document.getElementById('home-recommendation');
    if (!rootElement || rootElement.dataset.homeReady === 'true') return;
    rootElement.dataset.homeReady = 'true';
    rootElement.addEventListener('click', event => {
      const compareButton = event.target.closest('[data-home-compare]');
      if (compareButton && state.actions.toggleCompare) {
        state.actions.toggleCompare(Number(compareButton.dataset.homeCompare), compareButton.dataset.cardName, compareButton.dataset.cardImg);
        return;
      }

      const categoryButton = event.target.closest('[data-home-category]');
      if (categoryButton && state.actions.category) {
        state.actions.category(CATEGORY_MAP[categoryButton.dataset.homeCategory] || categoryButton.dataset.homeCategory);
        return;
      }

      const actionButton = event.target.closest('[data-home-action]');
      const actionName = actionButton && actionButton.dataset.homeAction;
      if (actionButton && actionButton.tagName !== 'A' && state.actions[actionName]) {
        state.actions[actionName]();
      }
    });
  }

  const HomeRecommendation = {
    CATEGORY_MAP,
    selectFeaturedCards,
    selectCashbackHighlights,
    formatPerformance,
    renderFeaturedCardsHtml,
    renderCashbackHtml,
    getCompareCopy,
    renderCards,
    renderCashback,
    renderCompare,
    init
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomeRecommendation;
  }
  if (root) root.HomeRecommendation = HomeRecommendation;
})(typeof window !== 'undefined' ? window : globalThis);
