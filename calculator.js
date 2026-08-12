/**
 * calculator.js — JSON 직접 바인딩 및 benefits_structured.json 연동 기반 3계층 캡핑(Capping) 순수 수학 피킹률 엔진
 *
 * [수학 캡핑 3계층 순서]
 * 1차: Tier 1 (개별 한도) - 개별 혜택 항목별 독립 월 한도 적용 (item_limit / amount / limit)
 * 2차: Tier 2 (그룹 한도) - 특정 혜택 그룹 간 공유하는 월 통합 한도 적용 (group_id / group_limit)
 * 3차: Tier 3 (총 통합 한도) - 선택한 전월 실적 구간(tier_limits / cap_tiers / total_limit_tiers)에 따른 총 통합 한도 적용
 */

/* ═══════════════════════════════════════════════
 * 공통 유틸
 * ═══════════════════════════════════════════════ */

/** HTML 이스케이프 헬퍼 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/ me/g, ' ')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** HTML 태그 제거 헬퍼 */
function cleanHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 금액 텍스트 변환 (예: 500000 → 50만원) */
function moneyLabel(num) {
  if (!num || isNaN(num) || !isFinite(num)) return '0원';
  if (num >= 10000) {
    const man = Math.floor(num / 10000);
    const rest = num % 10000;
    return man + '만' + (rest ? ' ' + rest.toLocaleString() : '') + '원';
  }
  return num.toLocaleString() + '원';
}

/** 그룹 ID에서 시각적 그룹 이름 추출 */
function cleanGroupName(groupId) {
  if (!groupId || groupId === 'none') return '그룹';
  if (groupId.startsWith('group_')) {
    const parts = groupId.split('_');
    if (parts.length >= 3) {
      return parts.slice(2).join(' ');
    } else if (parts.length === 2) {
      const name = parts[1];
      if (name === 'shopping') return '쇼핑';
      if (name === 'gas') return '주유';
      if (name === 'cafe') return '카페';
      if (name === 'movie') return '영화';
      return name;
    }
  }
  return groupId;
}

/* ═══════════════════════════════════════════════
 * 순수 함수 모듈 1: 실적 구간 매칭 및 한도/요율 결정
 * ═══════════════════════════════════════════════ */

/**
 * 구간형 실적 조건 매칭 (min_perf <= perf <= max_perf)
 * @param {Array|number|string} rate 
 * @param {number} perf - 현재 선택된 전월 실적액
 * @returns {number} 적용 요율 (0~1 범위 또는 0)
 */
function getApplicableRate(rate, perf) {
  try {
    if (rate == null || perf == null || isNaN(perf)) return 0;

    let rateArray = rate;
    if (typeof rate === 'string') {
      try { rateArray = JSON.parse(rate); } catch { rateArray = 0; }
    }

    if (Array.isArray(rateArray)) {
      if (rateArray.length === 0) return 0;
      let matchedRate = 0;
      for (const tier of rateArray) {
        if (!tier || typeof tier !== 'object') continue;
        const minPerf = typeof tier.min_perf === 'number' ? tier.min_perf : (typeof tier.performance === 'number' ? tier.performance : (typeof tier.perf === 'number' ? tier.perf : 0));
        const maxPerf = typeof tier.max_perf === 'number' ? tier.max_perf : Infinity;
        const tierRate = typeof tier.rate === 'number' ? tier.rate : 0;

        if (perf >= minPerf && perf <= maxPerf) {
          matchedRate = tierRate;
        }
      }
      return matchedRate;
    }

    const n = Number(rateArray);
    return (isNaN(n) || !isFinite(n) || n < 0) ? 0 : n;
  } catch {
    return 0;
  }
}

/**
 * 개별 항목 한도(item_limit/amount) 매칭 (Tier 1)
 * @param {Array|number|string} itemLimit 
 * @param {number} perf 
 * @returns {number} Infinity (무제한) 또는 개별 월 한도 금액
 */
function getItemLimitForPerf(itemLimit, perf) {
  try {
    if (itemLimit === null || itemLimit === undefined || itemLimit === -1) return Infinity;

    let limitVal = itemLimit;
    if (typeof itemLimit === 'string') {
      const trimmed = itemLimit.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { limitVal = JSON.parse(trimmed); } catch { limitVal = itemLimit; }
      } else {
        limitVal = itemLimit;
      }
    }

    if (Array.isArray(limitVal)) {
      if (limitVal.length === 0) return Infinity;
      let best = 0;
      let found = false;
      for (const tier of limitVal) {
        if (!tier || typeof tier !== 'object') continue;
        const minPerf = typeof tier.min_perf === 'number' ? tier.min_perf : (typeof tier.performance === 'number' ? tier.performance : (typeof tier.perf === 'number' ? tier.perf : 0));
        const maxPerf = typeof tier.max_perf === 'number' ? tier.max_perf : Infinity;
        const tierLimit = typeof tier.item_limit === 'number' ? tier.item_limit : (typeof tier.limit === 'number' ? tier.limit : (typeof tier.amount === 'number' ? tier.amount : -1));

        if (perf >= minPerf && perf <= maxPerf) {
          if (tierLimit === -1 || tierLimit == null) return Infinity;
          best = tierLimit;
          found = true;
        }
      }
      return found ? best : (typeof limitVal[0] === 'number' ? limitVal[0] : 0);
    }

    const n = Number(limitVal);
    if (isNaN(n) || n < 0 || n === -1) return Infinity;
    return n;
  } catch {
    return Infinity;
  }
}

/**
 * tier_limits / cap_tiers / total_limit_tiers 배열 기반 총 통합 한도 (Tier 3) 산출
 * 예시: [[300000, 15000], [600000, 30000]] 또는 [{min_perf:300000, limit:15000}]
 */
function getTotalCapForPerf(totalLimitTiers, perf) {
  try {
    if (!totalLimitTiers) return Infinity;

    let tiers = totalLimitTiers;
    if (typeof tiers === 'string') {
      try { tiers = JSON.parse(tiers); } catch { tiers = null; }
    }

    if (!Array.isArray(tiers) || tiers.length === 0) return Infinity;

    let best = 0;
    let found = false;

    for (const tier of tiers) {
      if (!tier) continue;

      let minPerf = 0;
      let maxPerf = Infinity;
      let limitVal = Infinity;

      if (Array.isArray(tier) && tier.length >= 2) {
        minPerf = Number(tier[0]) || 0;
        limitVal = Number(tier[1]) || 0;
      } else if (typeof tier === 'object') {
        minPerf = typeof tier.min_perf === 'number' ? tier.min_perf : (typeof tier.performance === 'number' ? tier.performance : (typeof tier.perf === 'number' ? tier.perf : 0));
        maxPerf = typeof tier.max_perf === 'number' ? tier.max_perf : Infinity;
        limitVal = typeof tier.tier_limit === 'number' ? tier.tier_limit : (typeof tier.limit === 'number' ? tier.limit : (typeof tier.totalLimit === 'number' ? tier.totalLimit : (typeof tier.cap === 'number' ? tier.cap : Infinity)));
      }

      if (perf >= minPerf && perf <= maxPerf) {
        best = limitVal;
        found = true;
      }
    }
    return found ? best : 0;
  } catch {
    return Infinity;
  }
}

/* ═══════════════════════════════════════════════
 * 순수 함수 모듈 2: 동적 실적 구간 추출 & 구조화 데이터 바인딩
 * ═══════════════════════════════════════════════ */

/**
 * 카드 데이터로부터 실적 구간 목록 추출
 */
function extractPerfOptions(items, totalTiers) {
  const set = new Set();
  try {
    let tiers = totalTiers;
    if (typeof tiers === 'string') {
      try { tiers = JSON.parse(tiers); } catch { tiers = null; }
    }

    if (Array.isArray(tiers)) {
      tiers.forEach(t => {
        if (Array.isArray(t) && t.length >= 1 && typeof t[0] === 'number' && t[0] > 0) set.add(t[0]);
        else if (t && typeof t.perf === 'number' && t.perf > 0) set.add(t.perf);
        else if (t && typeof t.min_perf === 'number' && t.min_perf > 0) set.add(t.min_perf);
        else if (t && typeof t.performance === 'number' && t.performance > 0) set.add(t.performance);
      });
    }

    (items || []).forEach(it => {
      [it.rate, it.amount].forEach(attr => {
        let arr = attr;
        if (typeof arr === 'string') {
          try { arr = JSON.parse(arr); } catch { arr = null; }
        }
        if (Array.isArray(arr)) {
          arr.forEach(t => {
            if (t && typeof t.perf === 'number' && t.perf > 0) set.add(t.perf);
            if (t && typeof t.min_perf === 'number' && t.min_perf > 0) set.add(t.min_perf);
            if (t && typeof t.performance === 'number' && t.performance > 0) set.add(t.performance);
          });
        }
      });
    });
  } catch (e) {
    console.error('extractPerfOptions error:', e);
  }

  return Array.from(set).sort((a, b) => a - b);
}

/**
 * cardData 및 benefits_structured 객체를 독립적 상태로 완벽히 안전 파싱 및 깊은 복사 (Deep Copy)
 * 명시적 스키마 필드 우선 적용: is_calculable, item_limit, group_id, group_limit, is_excluded 등
 */

/**
 * localStorage 기반 복잡한 카드 패싱(제외) 및 검수 완료 카드 관리 헬퍼
 */
const PASSED_CARDS_STORAGE_KEY = 'card_fighter_passed_cards';
const VERIFIED_CARDS_STORAGE_KEY = 'card_fighter_verified_cards';

function getPassedCardIds() {
  try {
    const raw = localStorage.getItem(PASSED_CARDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function getVerifiedCardIds() {
  try {
    const raw = localStorage.getItem(VERIFIED_CARDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isCardVerified(cardId) {
  if (!cardId) return false;
  const verified = getVerifiedCardIds();
  return verified.includes(String(cardId));
}

function isCardPassed(cardId) {
  if (!cardId) return false;
  const passed = getPassedCardIds();
  return passed.includes(String(cardId));
}

function togglePassCard(cardId, forceState) {
  if (!cardId) return false;
  try {
    const cidStr = String(cardId);
    let passed = getPassedCardIds();
    const exists = passed.includes(cidStr);

    let targetState = (forceState !== undefined) ? Boolean(forceState) : !exists;
    if (targetState) {
      if (!exists) passed.push(cidStr);
    } else {
      passed = passed.filter(id => id !== cidStr);
    }
    localStorage.setItem(PASSED_CARDS_STORAGE_KEY, JSON.stringify(passed));

    // 이벤트를 발생시켜 동기화
    window.dispatchEvent(new CustomEvent('cardPassChanged', { detail: { cardId: cidStr, passed: targetState } }));
    return targetState;
  } catch (e) {
    console.error('togglePassCard 오류:', e);
    return false;
  }
}

/**
 * 정형화 데이터(item_limit, tier_limits, category_rates 등) 존재 여부 및 계산 가능성 엄격 검증
 * 자연어 cap_note에만 의존하거나 수치화된 정형 필드가 누락된 카드는 is_calculable: false 및 원천 필터링
 */
function checkIsCalculable(cardData) {
  try {
    if (!cardData || typeof cardData !== 'object') return false;

    const cardId = String(cardData.id || cardData.idx || cardData.card_id || '');
    // 0-1) localStorage 패싱 카드 리스트 검증
    if (cardId && isCardPassed(cardId)) {
      return false;
    }

    // 1) 명시적 is_calculable / is_calc_supported false 플래그 검증
    if (cardData.is_calculable === false) return false;
    if (cardData.is_calc_supported === 'FALSE' || cardData.is_calc_supported === false) return false;

    const bs = cardData.bs || (window._CALC_BS ? window._CALC_BS : null) || cardData;
    if (bs && bs.is_calculable === false) return false;

    // 2) 명시적 정형화 데이터(structured_benefits 또는 bs 필드들) 검사
    const hasStructuredBenefits = Array.isArray(cardData.structured_benefits) && cardData.structured_benefits.length > 0;

    let hasBsFields = false;
    if (bs && typeof bs === 'object') {
      const hasBenefitsArr = Array.isArray(bs.benefits) && bs.benefits.length > 0;
      const hasCatRates = bs.category_rates && typeof bs.category_rates === 'object' && Object.keys(bs.category_rates).length > 0;
      const hasFixedDiscounts = Array.isArray(bs.fixed_discounts) && bs.fixed_discounts.length > 0;
      const hasFuelDiscounts = Array.isArray(bs.fuel_discounts) && bs.fuel_discounts.length > 0;
      const hasBaseRate = typeof bs.base_rate === 'number' && bs.base_rate > 0;

      hasBsFields = hasBenefitsArr || hasCatRates || hasFixedDiscounts || hasFuelDiscounts || hasBaseRate;
    }

    // 정형화 데이터(structured_benefits 또는 bs)가 전무하고 자연어 cap_note / key_benefit에만 의존하는 카드는 원천 필터링 (is_calculable: false)
    if (!hasStructuredBenefits && !hasBsFields) {
      return false;
    }

    return true;
  } catch (e) {
    console.error('checkIsCalculable 검증 오류:', e);
    return false;
  }
}

function getStructuredBenefits(cardData, fallbackKb) {
  try {
    // 원본 데이터 보호를 위한 깊은 복사 (Deep Copy)
    const rawCard = cardData ? JSON.parse(JSON.stringify(cardData)) : {};

    // 1) is_calculable 및 정형화 데이터 존재 검증: 미충족 시 원천 배제 (빈 배열 반환)
    if (!checkIsCalculable(rawCard)) {
      return [];
    }

    // 카드 전체 텍스트 기반 전월 실적 제외 키워드 자동 판별 (Hidden State)
    const fullCardText = JSON.stringify(rawCard);
    const isCardLevelExcluded = /(?:할인|청구할인|혜택|적립)(?: 서비스)?\s*받은\s*(?:이용건|매출|이용금액)|할인\(적립\)받은\s*매출|이용실적\s*제외대상.*할인/i.test(fullCardText);

    let benefits = rawCard.structured_benefits || null;
    if (typeof benefits === 'string') {
      try { benefits = JSON.parse(benefits); } catch { benefits = null; }
    }

    // benefits_structured.json 통합 바인딩
    const bs = rawCard.bs || (window._CALC_BS ? JSON.parse(JSON.stringify(window._CALC_BS)) : null);

    if ((!benefits || !Array.isArray(benefits) || benefits.length === 0) && bs) {
      benefits = [];

      // 1-1) bs.benefits 배열 형태 우선 파싱
      if (Array.isArray(bs.benefits)) {
        bs.benefits.forEach(b => {
          benefits.push({
            title: b.title || b.category || '혜택',
            detail: b.detail || b.summary || b.targets || '',
            rate: b.rate !== undefined ? b.rate : 0,
            fixedAmount: b.fixedAmount !== undefined ? b.fixedAmount : (b.fixed_amount || b.won || 0),
            minPayment: b.minPayment !== undefined ? b.minPayment : (b.min_payment || b.min_txn_won || b.won || 0),
            item_limit: b.item_limit !== undefined ? b.item_limit : (b.amount !== undefined ? b.amount : (b.monthly_cap !== undefined ? b.monthly_cap : -1)),
            isExcluded: Boolean(b.is_excluded || b.isExcluded),
            group_id: b.group_id || (b.group && b.group.id) || 'none',
            group_limit: b.group_limit !== undefined ? b.group_limit : ((b.group && typeof b.group.limit === 'number') ? b.group.limit : -1),
            exclusiveGroup: b.exclusive_group || b.exclusiveGroup || null,
            priority: b.priority || 0
          });
        });
      }

      // 1-2) category_rates 파싱
      if (bs.category_rates && typeof bs.category_rates === 'object') {
        Object.entries(bs.category_rates).forEach(([cat, rateVal]) => {
          const capVal = (bs.category_caps && bs.category_caps[cat] != null) ? bs.category_caps[cat] : (bs.item_limit != null ? bs.item_limit : -1);
          const groupInfo = (bs.category_groups && bs.category_groups[cat]) ? bs.category_groups[cat] : null;
          benefits.push({
            title: cat,
            detail: `${cat} ${Math.round(rateVal * 100)}% 할인/적립`,
            rate: rateVal,
            fixedAmount: 0,
            minPayment: 0,
            item_limit: capVal,
            isExcluded: Boolean(bs.excluded_categories && bs.excluded_categories.includes(cat)),
            group_id: groupInfo ? groupInfo.id : 'none',
            group_limit: groupInfo ? groupInfo.limit : -1,
            exclusiveGroup: null
          });
        });
      }

      // 1-3) fixed_discounts 파싱
      if (Array.isArray(bs.fixed_discounts)) {
        bs.fixed_discounts.forEach(fd => {
          benefits.push({
            title: fd.category || fd.title || '정액 할인',
            detail: fd.targets || fd.detail || `${fd.won || 0}원 정액 할인`,
            rate: 0,
            fixedAmount: fd.won || fd.fixedAmount || 0,
            minPayment: fd.min_txn_won || fd.min_payment || fd.minPayment || fd.won || 0,
            item_limit: fd.item_limit !== undefined ? fd.item_limit : (fd.monthly_cap !== undefined ? fd.monthly_cap : -1),
            isExcluded: Boolean(fd.is_excluded || fd.isExcluded),
            group_id: fd.group_id || (fd.group && fd.group.id) || 'none',
            group_limit: fd.group_limit !== undefined ? fd.group_limit : ((fd.group && typeof fd.group.limit === 'number') ? fd.group.limit : -1),
            exclusiveGroup: fd.exclusive_group || fd.exclusiveGroup || null
          });
        });
      }

      // 1-4) base_rate 파싱
      if (bs.base_rate && bs.base_rate > 0 && benefits.length === 0) {
        benefits.push({
          title: '모든 가맹점',
          detail: `전가맹점 ${Math.round(bs.base_rate * 100)}% 기본 할인`,
          rate: bs.base_rate,
          fixedAmount: 0,
          minPayment: 0,
          item_limit: bs.base_cap !== undefined ? bs.base_cap : -1,
          isExcluded: false,
          group_id: 'none',
          group_limit: -1,
          exclusiveGroup: null
        });
      }
    }

    // Fallback key_benefit
    if (!benefits || !Array.isArray(benefits) || benefits.length === 0) {
      const kb = Array.isArray(rawCard.key_benefit) ? rawCard.key_benefit : (Array.isArray(fallbackKb) ? fallbackKb : []);
      if (kb.length > 0) {
        benefits = kb.map(b => {
          let rate = 0.05;
          const txt = String(b.title || '') + ' ' + cleanHtml(b.info || b.summary || '');
          const rMatch = txt.match(/(\d+(?:\.\d+)?)%/);
          if (rMatch) rate = parseFloat(rMatch[1]) / 100;

          let fixedAmt = 0;
          let minPay = 0;
          const fixMatch = txt.match(/([\d,]+)원\s*(?:할인|적립|청구할인)/);
          if (fixMatch && !rMatch) {
            fixedAmt = parseInt(fixMatch[1].replace(/,/g, ''), 10) || 0;
            const minPayMatch = txt.match(/(?:건당|최소)\s*([\d,]+)원/);
            minPay = minPayMatch ? (parseInt(minPayMatch[1].replace(/,/g, ''), 10) || fixedAmt) : fixedAmt;
          }

          return {
            title: b.title || '혜택',
            detail: cleanHtml(b.info || b.summary || ''),
            rate: b.rate !== undefined ? b.rate : rate,
            fixedAmount: b.fixedAmount !== undefined ? b.fixedAmount : fixedAmt,
            minPayment: b.minPayment !== undefined ? b.minPayment : minPay,
            item_limit: b.item_limit !== undefined ? b.item_limit : (b.amount !== undefined ? b.amount : -1),
            isExcluded: Boolean(b.is_excluded || b.isExcluded || txt.includes('실적 제외')),
            group_id: b.group_id || (b.group && b.group.id) || 'none',
            group_limit: b.group_limit !== undefined ? b.group_limit : ((b.group && typeof b.group.limit === 'number') ? b.group.limit : -1),
            exclusiveGroup: b.exclusive_group || b.exclusiveGroup || null
          };
        });
      }
    }

    if (!Array.isArray(benefits)) return [];

    const cardIdStr = String(rawCard.id || rawCard.idx || rawCard.card_id || '');
    let itemOverrides = {};
    try { itemOverrides = JSON.parse(localStorage.getItem('card_fighter_item_overrides') || '{}'); } catch {}
    const globalItemOverrides = itemOverrides[cardIdStr] || {};

    return benefits.map((b, idx) => {
      const groupObj = b.group || null;
      let groupId = b.group_id || (groupObj && groupObj.id ? groupObj.id : 'none');
      let groupLimit = (b.group_limit !== undefined && b.group_limit !== null)
        ? b.group_limit
        : ((groupObj && typeof groupObj.limit === 'number' && groupObj.limit > 0) ? groupObj.limit : -1);

      const itemOv = globalItemOverrides[idx] || {};
      if (itemOv.rate !== undefined) b.rate = Number(itemOv.rate) / 100;
      if (itemOv.limit !== undefined) b.item_limit = itemOv.limit === -1 ? Infinity : itemOv.limit;
      if (itemOv.group !== undefined) groupId = itemOv.group;
      if (itemOv.subtitle !== undefined) b.detail = itemOv.subtitle;

      // 삭제 처리된 항목 체크
      const isDeleted = Boolean(itemOv.deleted);

      // 세부 월 한도 (Sub-limit) 파싱 및 홍보용 한도 분리 보정
      const txt = (b.title || '') + ' ' + (b.detail || b.summary || '');
      let parsedSubLimit = null;
      const subCapMatch = txt.match(/(?:통합\s*월|영역별\s*월|월\s*최대|월\s*통합|월)\s*([\d,]+)(만|천)?\s*원\s*한도/);
      if (subCapMatch) {
        let val = parseInt(subCapMatch[1].replace(/,/g, ''), 10);
        if (subCapMatch[2] === '만') val *= 10000;
        else if (subCapMatch[2] === '천') val *= 1000;
        if (!isNaN(val) && val > 0) {
          parsedSubLimit = val;
        }
      }

      let finalLimit = b.item_limit !== undefined ? b.item_limit : (b.amount !== undefined ? b.amount : (b.limit !== undefined ? b.limit : -1));
      if (parsedSubLimit !== null) {
        if (finalLimit === -1 || finalLimit === Infinity) {
          finalLimit = parsedSubLimit;
        }
      }

      let rateProp = b.rate !== undefined ? b.rate : 0;

      return {
        id: idx,
        title: b.title || '혜택',
        summary: b.detail || b.summary || '',
        rate: rateProp,
        fixedAmount: typeof b.fixedAmount === 'number' ? b.fixedAmount : 0,
        minPayment: typeof b.minPayment === 'number' ? b.minPayment : 0,
        item_limit: finalLimit,
        amount: finalLimit,
        group: groupObj,
        groupId,
        groupLimit,
        isExcluded: Boolean(b.isExcluded || b.is_excluded || txt.includes('실적 제외') || isCardLevelExcluded),
        exclusiveGroup: b.exclusiveGroup || b.exclusive_group || null,
        priority: typeof b.priority === 'number' ? b.priority : 0,
        checked: !isDeleted
      };
    });

  } catch (err) {
    console.error('getStructuredBenefits 오류:', err);
    return [];
  }
}

/* ═══════════════════════════════════════════════
 * 순수 함수 모듈 3: 3계층 순수 수학 캡핑 & 상호 배타 제어 엔진
 * ═══════════════════════════════════════════════ */

/**
 * 3단 계층 한도(3-Tier Limits) 캡핑 & 상호 배타적 혜택 제어
 * 1) Tier 1 (개별 한도): item_limit
 * 2) Tier 2 (그룹 한도): group_limit (group_id)
 * 3) Tier 3 (총 통합 한도): tier_limits / cap_tiers
 */
function applyThreeLevelCap(items, totalTiers, perf, cappingMode = 'HYBRID', cardIdStr = '') {
  try {
    const mode = (cappingMode || 'HYBRID').toUpperCase();
    
    // total_cap_overrides 확인 (특정 실적 전용 오버라이드 > 카드 대표 오버라이드 > DB 기본 계산)
    let totalCap = (mode === 'INDIVIDUAL_TIER') ? Infinity : getTotalCapForPerf(totalTiers, perf);
    if (cardIdStr) {
      try {
        const totalCapOverrides = JSON.parse(localStorage.getItem('card_fighter_total_cap_overrides') || '{}');
        if (totalCapOverrides[`${cardIdStr}_${perf}`] !== undefined) {
          totalCap = Number(totalCapOverrides[`${cardIdStr}_${perf}`]) || Infinity;
        } else if (totalCapOverrides[cardIdStr] !== undefined) {
          totalCap = Number(totalCapOverrides[cardIdStr]) || Infinity;
        }
      } catch {}
    }

    const groupSpentMap = {};
    const exclusiveAppliedMap = {}; // 상호 배타적 혜택 그룹 선택 상태
    let totalSpent = 0;
    const results = [];

    // 그룹 한도 오버라이드 로드
    let groupOverrides = {};
    if (cardIdStr) {
      try { groupOverrides = JSON.parse(localStorage.getItem('card_fighter_group_overrides') || '{}'); } catch {}
    }

    // 항목 한도/요율 실적 구간별 오버라이드 로드
    let itemOverrides = {};
    if (cardIdStr) {
      try { itemOverrides = JSON.parse(localStorage.getItem('card_fighter_item_overrides') || '{}'); } catch {}
    }
    const perfSpecificOverrides = cardIdStr ? (itemOverrides[`${cardIdStr}_${perf}`] || {}) : {};

    // 상호 배타적 혜택 우선순위 정렬 복사본
    const sortedItems = [...(items || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const it of sortedItems) {
      const itemOv = perfSpecificOverrides[it.id] || {};
      const overrideRate = itemOv.rate !== undefined ? (Number(itemOv.rate) / 100) : undefined;
      const overrideLimit = itemOv.limit !== undefined ? (itemOv.limit === -1 ? Infinity : itemOv.limit) : undefined;
      const isDeleted = Boolean(itemOv.deleted);

      const rawItemLimit = (mode === 'TOTAL_TIER') ? Infinity : getItemLimitForPerf(it.amount, perf);
      const currentItemLimit = overrideLimit !== undefined ? overrideLimit : rawItemLimit;
      const applicableRate = overrideRate !== undefined ? overrideRate : getApplicableRate(it.rate, perf);

      if (perf === 0 || !it.checked || isDeleted) {
        results.push({ id: it.id, applied: 0, currentItemLimit, applicableRate, cap1: 0, cap2: 0, isExclusiveBlocked: false });
        continue;
      }

      // 상호 배타적 혜택 (Exclusive Group) 제어
      if (it.exclusiveGroup) {
        if (exclusiveAppliedMap[it.exclusiveGroup]) {
          results.push({ id: it.id, applied: 0, currentItemLimit, applicableRate, cap1: 0, cap2: 0, isExclusiveBlocked: true });
          continue;
        }
      }

      // 0차: 잠재 혜택 산출 (정액 / 정률 분기)
      let potBenefit = 0;
      if (it.fixedAmount > 0) {
        potBenefit = it.fixedAmount;
      } else if (applicableRate > 0) {
        potBenefit = perf * applicableRate;
      } else if (isFinite(currentItemLimit) && currentItemLimit > 0) {
        potBenefit = currentItemLimit;
      }

      // 1차: Tier 1 개별 한도 캡핑 (item_limit)
      let cap1 = potBenefit;
      if (mode !== 'TOTAL_TIER' && isFinite(currentItemLimit) && currentItemLimit >= 0) {
        cap1 = Math.min(potBenefit, currentItemLimit);
      }

      // 2차: Tier 2 그룹 공유 통합 한도 캡핑 (group_limit)
      let cap2 = cap1;
      if (mode !== 'TOTAL_TIER' && it.groupId && it.groupId !== 'none') {
        let gLimit = (it.groupLimit === -1 || it.groupLimit == null || it.groupLimit <= 0) ? Infinity : it.groupLimit;
        if (cardIdStr && groupOverrides[`${cardIdStr}_${it.groupId}`] !== undefined) {
          gLimit = Number(groupOverrides[`${cardIdStr}_${it.groupId}`]) || Infinity;
        }

        const gSpent = groupSpentMap[it.groupId] || 0;
        const gRemain = isFinite(gLimit) ? Math.max(0, gLimit - gSpent) : Infinity;
        cap2 = isFinite(gRemain) ? Math.min(cap1, gRemain) : cap1;
        groupSpentMap[it.groupId] = gSpent + cap2;
      }

      // 3차: Tier 3 총 통합 한도 캡핑 (tier_limits / cap_tiers)
      const totalRemain = isFinite(totalCap) ? Math.max(0, totalCap - totalSpent) : Infinity;
      const applied = (mode !== 'INDIVIDUAL_TIER' && isFinite(totalRemain)) ? Math.min(cap2, totalRemain) : cap2;

      if (applied > 0 && it.exclusiveGroup) {
        exclusiveAppliedMap[it.exclusiveGroup] = true;
      }

      totalSpent += applied;
      results.push({ id: it.id, applied, currentItemLimit, applicableRate, cap1, cap2, isExclusiveBlocked: false });
    }

    // 원래 items 순서대로 결과 정렬
    const sortedResults = items.map(it => results.find(r => r.id === it.id) || { id: it.id, applied: 0, currentItemLimit: Infinity, applicableRate: 0, cap1: 0, cap2: 0, isExclusiveBlocked: false });

    return { results: sortedResults, totalSpent, groupSpentMap, totalCap };
  } catch (e) {
    console.error('applyThreeLevelCap 오류:', e);
    return { results: [], totalSpent: 0, groupSpentMap: {}, totalCap: Infinity };
  }
}

/**
 * [역산 및 분기 로직 & 실적 제외 매출 산정]
 * - 정률 혜택 (rate > 0): (적용 혜택 금액 / rate) 역산
 * - 정액 혜택 (fixedAmount > 0): minPayment 표준 단가를 기준 필요 결제액으로 고정 사용하여 뻥튀기 원천 차단
 * - isExcluded: 실적 제외 혜택 항목의 필요 사용 금액 구분 산정
 */
function calculateMinRequiredPayment(items, results) {
  let totalRequiredSum = 0;
  let excludedRequiredSum = 0;

  try {
    if (!Array.isArray(results) || !Array.isArray(items)) {
      return { totalRequiredSum: 0, excludedRequiredSum: 0, combinedRequiredSum: 0 };
    }

    results.forEach(r => {
      const it = items.find(x => x.id === r.id);
      if (!it || it.checked === false || r.applied <= 0) return;

      let needed = 0;
      if (it.fixedAmount > 0) {
        // 정액 혜택: 절대 rate로 나누지 말고 minPayment 표준 단가 연동
        needed = (it.minPayment > 0) ? it.minPayment : (it.fixedAmount > 0 ? it.fixedAmount : r.applied);
      } else if (r.applicableRate > 0) {
        // 정률 혜택: (적용 혜택 금액 / rate) 역산
        needed = r.applied / r.applicableRate;
      } else {
        needed = r.applied;
      }

      if (!isFinite(needed) || isNaN(needed) || needed < 0) needed = 0;
      needed = Math.round(needed);

      if (it.isExcluded) {
        excludedRequiredSum += needed;
      } else {
        totalRequiredSum += needed;
      }
    });
  } catch (e) {
    console.error('calculateMinRequiredPayment 오류:', e);
  }

  return {
    totalRequiredSum,
    excludedRequiredSum,
    combinedRequiredSum: totalRequiredSum + excludedRequiredSum
  };
}

/* ═══════════════════════════════════════════════
 * 피킹률 계산기 UI 렌더링 및 메인 구동 모듈
 * ═══════════════════════════════════════════════ */

function buildPickingCalc(kb, preMonthMoney, preMonthCondition, cardData) {
  try {
    if (kb && typeof kb === 'object' && !Array.isArray(kb) && !cardData) {
      cardData = kb;
      kb = cardData.key_benefit || [];
      preMonthMoney = cardData.pre_month_money;
      preMonthCondition = cardData.pre_month_condition;
    }
    if (!cardData && Array.isArray(kb)) {
      cardData = { key_benefit: kb, pre_month_money: preMonthMoney, pre_month_condition: preMonthCondition, is_calc_supported: 'TRUE' };
    }
    if (!cardData) return '';

    // is_calculable 검증: 정형 데이터 누락 및 자연어 cap_note 의존 카드 원천 배제 (필터링)
    if (!checkIsCalculable(cardData)) {
      return '';
    }

    // tier_limits / cap_tiers / total_limit_tiers 파싱
    let totalLimitTiers = cardData.tier_limits || cardData.cap_tiers || cardData.total_limit_tiers || (cardData.bs ? (cardData.bs.tier_limits || cardData.bs.cap_tiers) : null);
    if (typeof totalLimitTiers === 'string') {
      try { totalLimitTiers = JSON.parse(totalLimitTiers); } catch { totalLimitTiers = null; }
    }

    // 원본 데이터 보호 독립 복사본으로 혜택 바인딩
    const items = getStructuredBenefits(cardData, kb);
    if (!items || items.length === 0) return '';

    // 수치화된 유효 혜택(rate > 0 또는 fixedAmount > 0 또는 유효한 item_limit) 항목 존재 여부 2차 검증
    const hasCalculableItem = items.some(it =>
      (typeof it.rate === 'number' && it.rate > 0) ||
      (typeof it.fixedAmount === 'number' && it.fixedAmount > 0) ||
      (typeof it.amount === 'number' && it.amount > 0 && it.amount !== Infinity)
    );
    if (!hasCalculableItem) {
      return '';
    }

    let perfOptions = extractPerfOptions(items, totalLimitTiers);
    if (perfOptions.length === 0) {
      const base = Number(preMonthMoney) || 0;
      if (base > 0) perfOptions = [base];
    }

    const basePerf = Number(preMonthMoney) || (perfOptions.length > 0 ? perfOptions[0] : 0);

    const groupMap = {};
    const soloItems = [];

    items.forEach(it => {
      if (it.groupId && it.groupId !== 'none') {
        if (!groupMap[it.groupId]) {
          groupMap[it.groupId] = {
            groupId: it.groupId,
            groupLimit: it.groupLimit,
            groupName: cleanGroupName(it.groupId),
            items: []
          };
        }
        groupMap[it.groupId].items.push(it);
      } else {
        soloItems.push(it);
      }
    });

    /* ── 초기 캡핑 연산 ── */
    const cardIdStr = String(cardData.id || cardData.idx || cardData.card_id || '');
    const initialCappingMode = cardData.capping_mode || 'HYBRID';
    const initCapObj = applyThreeLevelCap(items, totalLimitTiers, basePerf, initialCappingMode, cardIdStr);
    const initResults = initCapObj.results || [];
    const initTotalSpent = initCapObj.totalSpent || 0;
    const initReqPayment = calculateMinRequiredPayment(items, initResults);
    const initRealSpending = (basePerf === 0 || initTotalSpent === 0) ? 0 : Math.round(Math.max(basePerf, initReqPayment.totalRequiredSum) + initReqPayment.excludedRequiredSum);

    // 연회비 월할 산정
    let initAnnualFee = 0;
    const rawFeeStr = cardData.annual_fee || cardData.annual_fee_detail || '';
    if (typeof rawFeeStr === 'number') {
      initAnnualFee = rawFeeStr;
    } else if (typeof rawFeeStr === 'string') {
      const feeM = rawFeeStr.replace(/,/g, '').match(/\d+/);
      if (feeM) initAnnualFee = parseInt(feeM[0], 10);
    }
    const initMonthlyFee = initAnnualFee / 12;

    let initPickingRate = 0;
    if (initRealSpending > 0 && initTotalSpent > 0) {
      initPickingRate = ((initTotalSpent - initMonthlyFee) / initRealSpending) * 100;
    }
    if (isNaN(initPickingRate) || !isFinite(initPickingRate) || initPickingRate < 0 || initRealSpending <= 0) {
      initPickingRate = 0;
    }

    /* ── 실시간 피킹률 계산 및 대시보드 업데이트 ── */
    function renderTotal() {
      try {
        const selEl = document.getElementById('calc-perf-select');
        const currentPerf = selEl ? Number(selEl.value) : basePerf;

        const badgeEl = document.querySelector('.calc-perf-badge');
        if (badgeEl) badgeEl.textContent = `기준 ${moneyLabel(currentPerf)}`;

        const cappingMode = cardData.capping_mode || 'HYBRID';
        const { results, totalSpent, groupSpentMap, totalCap } =
          applyThreeLevelCap(items, totalLimitTiers, currentPerf, cappingMode, cardIdStr);

        const { totalRequiredSum, excludedRequiredSum } = calculateMinRequiredPayment(items, results);

        // 개별 UI Row 업데이트: 원본 한도/잠재 수치가 아닌 3단계 캡핑이 최종 적용된 r.applied 수치만 렌더링
        results.forEach(r => {
          const it = items.find(x => x.id === r.id);
          if (!it) return;

          const displayEl = document.getElementById('calc-amt-' + r.id);
          if (displayEl) {
            if (currentPerf === 0) {
              displayEl.textContent = '혜택 없음';
              displayEl.className = 'calc-amount zero';
            } else if (!it.checked) {
              displayEl.textContent = '선택 해제';
              displayEl.className = 'calc-amount zero';
            } else if (r.isExclusiveBlocked) {
              displayEl.textContent = '중복 제외';
              displayEl.className = 'calc-amount zero';
            } else if (r.applied === 0) {
              displayEl.textContent = '0원 (통합 한도 도달)';
              displayEl.className = 'calc-amount zero';
            } else {
              const exTag = it.isExcluded ? ' (실적제외)' : '';
              displayEl.textContent = `${r.applied.toLocaleString()}원 적용${exTag}`;
              displayEl.className = 'calc-amount';
            }
          }
        });

        // 2차: 그룹 한도 도달 경고 노출
        Object.values(groupMap).forEach(g => {
          const spent = groupSpentMap[g.groupId] || 0;
          const gLimit = (g.groupLimit === -1 || g.groupLimit == null || g.groupLimit <= 0) ? Infinity : g.groupLimit;
          const isCapped = isFinite(gLimit) && spent >= gLimit;
          const warnEl = document.getElementById(`calc-group-warning-${g.groupId}`);
          if (warnEl) {
            if (isCapped) {
              warnEl.textContent = `⚠️ 그룹 통합 한도 도달! (최대 ${gLimit.toLocaleString()}원 적용)`;
              warnEl.style.display = 'block';
            } else {
              warnEl.style.display = 'none';
            }
          }
        });

        // 3차: 총 통합 한도 동적 배너 및 도달 경고 노출
        const totalBannerEl = document.getElementById('calc-total-banner-text');
        if (totalBannerEl) {
          if (isFinite(totalCap) && totalCap > 0) {
            totalBannerEl.textContent = `👑 총 통합 한도: 최대 ${totalCap.toLocaleString()}원 적용 중`;
          } else {
            totalBannerEl.textContent = `👑 총 통합 한도: 한도 없이 혜택 제공`;
          }
        }

        const totalWarnEl = document.getElementById('calc-total-warning');
        if (totalWarnEl) {
          const isTotalCapped = isFinite(totalCap) && totalCap > 0 && totalSpent >= totalCap;
          if (isTotalCapped) {
            totalWarnEl.textContent = `⚠️ 총 통합 할인한도 도달! (최대 ${totalCap.toLocaleString()}원 적용)`;
            totalWarnEl.style.display = 'block';
          } else {
            totalWarnEl.style.display = 'none';
          }
        }

        // 연회비 월할 산정
        let annualFee = 0;
        const rawFee = cardData.annual_fee || cardData.annual_fee_detail || '';
        if (typeof rawFee === 'number') {
          annualFee = rawFee;
        } else if (typeof rawFee === 'string') {
          const feeM = rawFee.replace(/,/g, '').match(/\d+/);
          if (feeM) annualFee = parseInt(feeM[0], 10);
        }
        const monthlyAnnualFee = annualFee / 12;

        // 실질 사용 금액 (Real Needed Spending) 산정
        let realSpending = 0;
        if (currentPerf === 0 || totalSpent === 0) {
          realSpending = 0;
        } else {
          realSpending = Math.max(currentPerf, totalRequiredSum) + excludedRequiredSum;
        }
        realSpending = Math.round(realSpending);

        // [최종 피킹률 공식 적용 & 방어적 예외 처리]
        let pickingRate = 0;
        if (realSpending > 0 && totalSpent > 0) {
          const netMonthlyBenefit = totalSpent - monthlyAnnualFee;
          pickingRate = (netMonthlyBenefit / realSpending) * 100;
        }

        // 방어적 예외 처리 (Silent Fallback): NaN, Infinity, 음수, 분모0 발생 시 즉시 0.00%
        if (isNaN(pickingRate) || !isFinite(pickingRate) || pickingRate < 0 || realSpending <= 0) {
          pickingRate = 0;
        }

        // 대시보드 지표 업데이트
        const totalAmtEl = document.getElementById('calc-total-amt');
        if (totalAmtEl) {
          totalAmtEl.textContent = (currentPerf === 0 || totalSpent === 0) ? '0원' : `최대 ${totalSpent.toLocaleString()}원`;
        }

        const reqAmtEl = document.getElementById('calc-required-amt');
        if (reqAmtEl) {
          reqAmtEl.textContent = (currentPerf === 0 || totalSpent === 0) ? '0원' : `${realSpending.toLocaleString()}원`;
        }

        const pickRateEl = document.getElementById('calc-picking-rate');
        if (pickRateEl) {
          pickRateEl.textContent = (currentPerf === 0 || totalSpent === 0 || pickingRate <= 0) ? '0.00%' : `${pickingRate.toFixed(2)}%`;
        }

        const gauge = document.getElementById('calc-gauge-bar');
        if (gauge) {
          if (currentPerf === 0 || pickingRate <= 0) {
            gauge.style.width = '0%';
            gauge.className = 'gauge-bar level-0';
          } else {
            gauge.style.width = Math.min(pickingRate * 10, 100) + '%';
            gauge.className = 'gauge-bar '
              + (pickingRate < 1 ? 'level-1' : pickingRate < 3 ? 'level-2' : pickingRate < 5 ? 'level-3' : 'level-4');
          }
        }

        console.log('[🎯 피킹률 계산기 엔진 디버깅]', {
          cardName: cardData.card_name || cardData.name || '카드',
          selectedPerf: currentPerf,
          perfOptions: perfOptions,
          tier3TotalCap: isFinite(totalCap) ? totalCap : '무제한',
          cappingResults: results,
          finalTotalBenefit: totalSpent,
          minRequiredSpending: totalRequiredSum,
          excludedSpending: excludedRequiredSum,
          realSpending: realSpending,
          monthlyAnnualFee: Math.round(monthlyAnnualFee),
          pickingRate: pickingRate.toFixed(2) + '%'
        });

      } catch (e) {
        console.error('renderTotal 전역 핸들링 오류:', e);
      }
    }

    window._calcItems = items;
    window._calcRender = renderTotal;
    window._changePerfLimit = function () { renderTotal(); };
    window._toggleBenefitItem = function (id, checked) {
      if (window._calcItems) {
        const item = window._calcItems.find(x => String(x.id) === String(id) || Number(x.id) === Number(id));
        if (item) {
          item.checked = (checked !== undefined && checked !== null) ? Boolean(checked) : !item.checked;
        }
      }
      if (window._calcRender) {
        window._calcRender();
      }
    };

    /* ── HTML 행 생성 (최종 3계층 적용 금액 applied 바인딩) ── */
    function makeRow(it) {
      const initR = initResults.find(r => r.id === it.id);
      const appliedAmt = initR ? initR.applied : 0;
      const isBlocked = initR ? initR.isExclusiveBlocked : false;

      let displayAmt = '';
      if (basePerf === 0) {
        displayAmt = '혜택 없음';
      } else if (isBlocked) {
        displayAmt = '중복 제외';
      } else if (appliedAmt === 0) {
        displayAmt = '0원 (통합 한도 도달)';
      } else {
        const exTag = it.isExcluded ? ' (실적제외)' : '';
        displayAmt = `${appliedAmt.toLocaleString()}원 적용${exTag}`;
      }

      const isChecked = it.checked !== false;

      return `
        <div class="calc-row">
          <label class="calc-toggle">
            <input type="checkbox" id="calc-${it.id}" class="calc-checkbox" data-benefit-id="${it.id}" ${isChecked ? 'checked' : ''}
              onchange="if(window._toggleBenefitItem) window._toggleBenefitItem(${it.id}, this.checked)">
            <span class="calc-slider"></span>
          </label>
          <span class="calc-name">
            <div class="benefit-title">${esc(it.title)}${it.isExcluded ? ' <span style="font-size:11px;color:#ef4444;font-weight:bold;">[실적제외]</span>' : ''}</div>
            <div class="benefit-summary">${esc(it.summary)}</div>
          </span>
          <span id="calc-amt-${it.id}" class="calc-amount ${(!isChecked || appliedAmt === 0 || isBlocked || basePerf === 0) ? 'zero' : ''}">
            ${isChecked ? displayAmt : '선택 해제'}
          </span>
        </div>`;
    }

    /* ── 그룹 박스 HTML ── */
    let groupsHTML = '';
    Object.values(groupMap).forEach(g => {
      const gLimLabel = (g.groupLimit === -1 || g.groupLimit == null || g.groupLimit <= 0)
        ? '무제한' : `최대 ${g.groupLimit.toLocaleString()}원`;
      groupsHTML += `
        <div class="calc-group-box">
          <div class="calc-group-header">
            <span>👑 [${esc(g.groupName)}] 그룹 통합 한도</span>
            <span class="calc-group-limit-badge" id="calc-group-title-${g.groupId}">${gLimLabel}</span>
          </div>
          ${g.items.map(makeRow).join('')}
          <div id="calc-group-warning-${g.groupId}" class="calc-group-warn" style="display:none"></div>
        </div>`;
    });

    /* ── 실적 셀렉트 박스 HTML ── */
    let perfSelectHTML = '';
    if (perfOptions.length > 0) {
      const optionsHTML = [
        `<option value="0">실적 미충족 (혜택 없음)</option>`,
        ...perfOptions.map(v => {
          const sel = (v === basePerf) ? 'selected' : '';
          return `<option value="${v}" ${sel}>${esc(moneyLabel(v))} 이상</option>`;
        })
      ].join('');

      perfSelectHTML = `
        <div class="calc-perf-wrap">
          <div class="calc-perf-label">
            <span>📊</span>
            <span>전월 실적 구간 선택</span>
            <span class="calc-perf-badge">기준 ${moneyLabel(basePerf)}</span>
          </div>
          <select id="calc-perf-select" class="calc-perf-select"
            onchange="window._changePerfLimit(this.value)"
            aria-label="전월 실적 구간 선택">
            ${optionsHTML}
          </select>
        </div>`;
    }

    /* ── 총 통합 한도 박스 HTML ── */
    let totalCapLabel = '무제한';
    const initTotalCap = getTotalCapForPerf(totalLimitTiers, basePerf);
    if (isFinite(initTotalCap) && initTotalCap > 0) {
      totalCapLabel = `최대 ${initTotalCap.toLocaleString()}원`;
    }

    const hasTotalTiers = Array.isArray(totalLimitTiers) && totalLimitTiers.length > 0;

    let itemsContentHTML = '';
    if (hasTotalTiers && soloItems.length > 0) {
      itemsContentHTML = `
        <div class="calc-group-box">
          <div class="calc-group-header">
            <span id="calc-total-banner-text">👑 총 통합 한도: ${totalCapLabel} 적용 중</span>
            <span class="calc-group-limit-badge">${totalCapLabel}</span>
          </div>
          ${soloItems.map(makeRow).join('')}
        </div>`;
    } else {
      itemsContentHTML = soloItems.map(makeRow).join('');
    }

    const initTotalDisplay = (basePerf === 0 || initTotalSpent === 0) ? '0원' : `최대 ${initTotalSpent.toLocaleString()}원`;
    const initReqDisplay = (basePerf === 0 || initTotalSpent === 0) ? '0원' : `${initRealSpending.toLocaleString()}원`;
    const initPickRateDisplay = (basePerf === 0 || initTotalSpent === 0 || initPickingRate <= 0) ? '0.00%' : `${initPickingRate.toFixed(2)}%`;
    const initGaugeWidth = (basePerf === 0 || initPickingRate <= 0) ? '0%' : (Math.min(initPickingRate * 10, 100) + '%');
    const initGaugeLevel = (basePerf === 0 || initPickingRate <= 0) ? 'level-0' : (initPickingRate < 1 ? 'level-1' : initPickingRate < 3 ? 'level-2' : initPickingRate < 5 ? 'level-3' : 'level-4');

    return `
      <div class="calc-box">
        <h3>🎯 피킹률 계산기</h3>
        ${perfSelectHTML}
        ${groupsHTML}
        ${itemsContentHTML}
        <div id="calc-total-warning" class="calc-group-warn" style="display:none; margin-bottom:12px;"></div>
        <div class="calc-total-dashboard">
          <div class="dashboard-row">
            <span class="db-label">최종 예상 혜택 합계</span>
            <span class="db-value text-brand" id="calc-total-amt">${initTotalDisplay}</span>
          </div>
          <div class="dashboard-row">
            <span class="db-label">실질 필요 사용 금액 (최소)</span>
            <span class="db-value" id="calc-required-amt">${initReqDisplay}</span>
          </div>
          <div class="dashboard-row picking-rate-row">
            <span class="db-label">실질 체감 피킹률</span>
            <span class="db-value highlight" id="calc-picking-rate">${initPickRateDisplay}</span>
          </div>
          <div class="gauge-container">
            <div class="gauge-bar ${initGaugeLevel}" id="calc-gauge-bar" style="width: ${initGaugeWidth};"></div>
          </div>
        </div>
      </div>`;

  } catch (err) {
    console.error('buildCalc 오류:', err);
    return '';
  }
}

/* ── 브라우저/Node 글로벌 노출 ── */
if (typeof window !== 'undefined') {
  window.checkIsCalculable = checkIsCalculable;
  window.buildPickingCalc = buildPickingCalc;
  window.buildCalc = buildPickingCalc;
  window.getStructuredBenefits = getStructuredBenefits;
  window.applyThreeLevelCap = applyThreeLevelCap;
  window.calculateMinRequiredPayment = calculateMinRequiredPayment;
  window.getItemLimitForPerf = getItemLimitForPerf;
  window.getApplicableRate = getApplicableRate;
  window.getTotalCapForPerf = getTotalCapForPerf;
  window.extractPerfOptions = extractPerfOptions;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkIsCalculable,
    buildPickingCalc,
    getStructuredBenefits,
    applyThreeLevelCap,
    calculateMinRequiredPayment,
    getItemLimitForPerf,
    getApplicableRate,
    getTotalCapForPerf,
    extractPerfOptions
  };
}
