(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HomeGateway = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PURPOSE_ROUTES = Object.freeze([
    Object.freeze({id: 'calculator', number: '01', icon: '🧮', title: '매달 가장 이득인 카드', description: '내 소비금액으로 월 순이득 계산', href: 'calculator.html'}),
    Object.freeze({id: 'cashback', number: '02', icon: '💰', title: '지금 받을 수 있는 발급 혜택', description: '카드사별 캐시백과 조건 확인', href: '/event'}),
    Object.freeze({id: 'benefits', number: '03', icon: '🔎', title: '원하는 혜택이 있는 카드', description: '카페·주유·교통 등으로 직접 탐색', href: '/card#benefit-filters'})
  ]);

  function cardCountCopy(cards) {
    return Array.isArray(cards) && cards.length
      ? `${cards.length.toLocaleString()}장의 카드 데이터`
      : '수많은 카드 데이터';
  }

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

  function createHeroCardPicker(random = Math.random) {
    let cachedCards = null;
    return function pickHeroCards(cards, limit = 3) {
      if (cachedCards) return cachedCards;
      const selected = selectHeroCards(cards, limit, random);
      if (selected.length) cachedCards = selected;
      return selected;
    };
  }

  function profileTotal(profile) {
    return Object.values((profile && profile.spend) || {})
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function normalizeCompareCards(compareList) {
    return (Array.isArray(compareList) ? compareList : [])
      .filter(card => card && typeof card === 'object' && card.idx != null);
  }

  function buildResumeState(profile, compareList) {
    const cards = normalizeCompareCards(compareList);
    if (!profile && cards.length === 0) return null;

    const compareCount = cards.length;
    const primaryAction = compareCount >= 2 ? 'compare'
      : profile ? 'calculator' : 'benefits';
    const primaryLabel = compareCount >= 2 ? '비교 이어보기'
      : profile ? '다시 계산' : '카드 혜택 찾아보기';

    return {
      hasProfile: Boolean(profile),
      profileTotal: profileTotal(profile),
      compareCount,
      compareNames: cards.slice(0, 3).map(card => card.name || card.card_name || ''),
      primaryAction,
      primaryLabel,
      secondaryAction: compareCount >= 2 && profile ? 'calculator' : null,
      secondaryLabel: compareCount >= 2 && profile ? '다시 계산' : ''
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function shortWon(value) {
    const amount = Math.round(Number(value) || 0);
    return amount % 10000 === 0
      ? `${(amount / 10000).toLocaleString()}만원`
      : `${amount.toLocaleString()}원`;
  }

  const pickHeroCardsForPage = createHeroCardPicker();

  function renderHeroCardsHtml(cards) {
    return pickHeroCardsForPage(cards).map((card, index) =>
      `<img class="home-stack-card home-stack-card-${index + 1}" src="${escapeHtml(card.card_img)}" alt="" aria-hidden="true" onerror="this.hidden=true">`
    ).join('');
  }

  function renderResumeHtml(state) {
    if (!state) return '';

    const profileStep = state.hasProfile
      ? `<span class="home-journey-step is-done"><b>✓</b><span>소비 기준 저장<small>${shortWon(state.profileTotal)}</small></span></span>
         <span class="home-journey-line" aria-hidden="true"></span>
         <span class="home-journey-step is-done"><b>✓</b><span>추천 확인<small>다시 계산 가능</small></span></span>`
      : '';
    const compareLabel = state.compareCount >= 2 ? '카드 비교 중' : '카드 한 장 저장';
    const compareStep = state.compareCount
      ? `${state.hasProfile ? '<span class="home-journey-line" aria-hidden="true"></span>' : ''}
         <span class="home-journey-step is-current"><b>${state.compareCount}</b><span>${compareLabel}<small>${escapeHtml(state.compareNames.join(' · '))}</small></span></span>`
      : '';
    const secondary = state.secondaryAction
      ? `<button type="button" class="home-resume-secondary" data-home-route="${escapeHtml(state.secondaryAction)}">${escapeHtml(state.secondaryLabel)}</button>`
      : '';

    return `<div class="home-resume-copy"><span>MY CARD JOURNEY</span><h2>지난 탐색 이어하기</h2></div>
      <div class="home-journey">${profileStep}${compareStep}</div>
      <div class="home-resume-actions"><button type="button" class="home-resume-primary" data-home-route="${escapeHtml(state.primaryAction)}">${escapeHtml(state.primaryLabel)} →</button>${secondary}</div>`;
  }

  function updateCards(cards) {
    if (typeof document === 'undefined') return;

    const copy = cardCountCopy(cards);
    const count = document.getElementById('home-card-count-copy');
    const trust = document.getElementById('home-trust-count');
    const stack = document.getElementById('home-hero-cards');

    if (count) count.textContent = copy;
    if (trust) trust.textContent = copy;
    if (stack) stack.innerHTML = renderHeroCardsHtml(cards);
  }

  function updateResume(profile, compareList) {
    if (typeof document === 'undefined') return;

    const target = document.getElementById('home-resume');
    if (!target) return;

    const html = renderResumeHtml(buildResumeState(profile, compareList));
    target.innerHTML = html;
    target.hidden = !html;
  }

  const state = {actions: {}, ready: false};

  function shouldHandleRoute(event, target) {
    if (String(target.tagName).toUpperCase() !== 'A') return true;
    return event.button === 0
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && !event.altKey;
  }

  function init(options = {}) {
    if (typeof document === 'undefined') return;
    state.actions = options.actions || {};
    updateCards(options.cards || []);
    updateResume(options.profile || null, options.compareList || []);
    const root = document.getElementById('home-gateway');
    if (!root || state.ready) return;
    state.ready = true;
    root.addEventListener('click', event => {
      const target = event.target && event.target.closest
        ? event.target.closest('[data-home-route]')
        : null;
      if (!target) return;
      const action = state.actions[target.dataset.homeRoute];
      if (typeof action !== 'function') return;
      if (!shouldHandleRoute(event, target)) return;
      event.preventDefault();
      action();
    });
  }

  return {
    PURPOSE_ROUTES,
    cardCountCopy,
    selectHeroCards,
    createHeroCardPicker,
    buildResumeState,
    renderHeroCardsHtml,
    renderResumeHtml,
    updateCards,
    updateResume,
    init
  };
});
