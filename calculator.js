/**
 * calculator.js — JSON 직접 바인딩 기반 3계층 캡핑(Capping) 순수 수학 엔진
 *
 * [수학 캡핑 3계층 순서]
 * 1차: 개별 한도 캡핑 (item_limit)
 * 2차: 그룹 한도 캡핑 (group.limit)
 * 3차: 총 통합 한도 캡핑 (total_limit_tiers)
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
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** HTML 태그 제거 헬퍼 */
function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 금액 텍스트 변환 (예: 500000 → 50만원) */
function moneyLabel(num) {
  if (!num) return '0원';
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
 * 순수 함수 모듈 1: 한도 결정
 * ═══════════════════════════════════════════════ */

/**
 * rate (배열, 수치, JSON) 및 현재 실적(perf) 기준 동적 요율 반환
 */
function getApplicableRate(rate, perf) {
  if (rate == null) return 0;

  let rateArray = rate;
  if (typeof rate === 'string') {
    try { rateArray = JSON.parse(rate); } catch { rateArray = 0; }
  }

  if (Array.isArray(rateArray)) {
    if (rateArray.length === 0) return 0;
    let matchedRate = 0;
    // 조건에 부합하는 가장 높은 실적 구간의 요율 매칭
    for (const tier of rateArray) {
      if (typeof tier.perf === 'number' && typeof tier.rate === 'number') {
        if (perf >= tier.perf) {
          matchedRate = tier.rate;
        }
      }
    }
    return matchedRate;
  }

  const n = Number(rateArray);
  return isNaN(n) ? 0 : n;
}

/**
 * item_limit 값과 현재 실적(perf) 기준으로 적용할 개별 한도 반환.
 * -1, null, undefined ➡️ Infinity (무제한)
 */
function getItemLimitForPerf(itemLimit, perf) {
  if (itemLimit === null || itemLimit === undefined || itemLimit === -1) return Infinity;

  let limitVal = itemLimit;
  if (typeof itemLimit === 'string') {
    try { limitVal = JSON.parse(itemLimit); } catch { limitVal = itemLimit; }
  }

  if (Array.isArray(limitVal)) {
    if (limitVal.length === 0) return Infinity;
    let best = 0;
    let found = false;
    for (const tier of limitVal) {
      if (typeof tier.perf === 'number' && typeof tier.limit === 'number') {
        if (perf >= tier.perf) {
          best = tier.limit;
          found = true;
        }
      }
    }
    return found ? best : 0;
  }

  const n = Number(limitVal);
  if (isNaN(n) || n < 0) return Infinity;
  return n;
}

/**
 * total_limit_tiers 배열과 현재 실적 기준으로 총 통합 한도 반환.
 */
function getTotalCapForPerf(totalLimitTiers, perf) {
  if (!Array.isArray(totalLimitTiers) || totalLimitTiers.length === 0) return Infinity;

  let best = 0;
  let found = false;
  for (const tier of totalLimitTiers) {
    if (typeof tier.perf === 'number' && perf >= tier.perf) {
      best = tier.limit;
      found = true;
    }
  }
  return found ? best : 0;
}

/* ═══════════════════════════════════════════════
 * 순수 함수 모듈 2: 동적 실적 옵션 추출
 * ═══════════════════════════════════════════════ */

function extractPerfOptions(items, totalTiers) {
  const set = new Set();

  if (Array.isArray(totalTiers)) {
    totalTiers.forEach(t => {
      if (typeof t.perf === 'number' && t.perf > 0) set.add(t.perf);
    });
  }

  (items || []).forEach(it => {
    let rateArr = it.rate;
    if (typeof rateArr === 'string') {
      try { rateArr = JSON.parse(rateArr); } catch { rateArr = null; }
    }
    if (Array.isArray(rateArr)) {
      rateArr.forEach(t => {
        if (typeof t.perf === 'number' && t.perf > 0) set.add(t.perf);
      });
    }

    let limArr = it.amount;
    if (typeof limArr === 'string') {
      try { limArr = JSON.parse(limArr); } catch { limArr = null; }
    }
    if (Array.isArray(limArr)) {
      limArr.forEach(t => {
        if (typeof t.perf === 'number' && t.perf > 0) set.add(t.perf);
      });
    }
  });

  return Array.from(set).sort((a, b) => a - b);
}

function getStructuredBenefits(cardData, fallbackKb) {
  try {
    let benefits = cardData ? cardData.structured_benefits : null;

    if (typeof benefits === 'string') {
      try {
        benefits = JSON.parse(benefits);
      } catch (e) {
        benefits = null;
      }
    }

    if (!benefits || !Array.isArray(benefits) || benefits.length === 0) {
      const kb = (cardData && Array.isArray(cardData.key_benefit)) ? cardData.key_benefit : (Array.isArray(fallbackKb) ? fallbackKb : []);
      if (kb.length > 0) {
        benefits = kb.map(b => {
          let rate = 0.05;
          const txt = String(b.title || '') + ' ' + cleanHtml(b.info || b.summary || '');
          const rMatch = txt.match(/(\d+(?:\.\d+)?)%/);
          if (rMatch) rate = parseFloat(rMatch[1]) / 100;
          return {
            title: b.title || '혜택',
            detail: cleanHtml(b.info || b.summary || ''),
            rate: rate,
            fixedAmount: 0,
            minPayment: 0,
            item_limit: -1
          };
        });
      }
    }

    if (!Array.isArray(benefits)) return [];

    return benefits.map((b, idx) => {
      const groupObj = b.group || null;
      const groupId = (groupObj && groupObj.id) ? groupObj.id : (b.group_id || 'none');
      const groupLimit = (groupObj && typeof groupObj.limit === 'number') ? groupObj.limit : -1;

      return {
        id: idx,
        title: b.title || '혜택',
        summary: b.detail || b.summary || '',
        rate: b.rate !== undefined ? b.rate : 0,
        fixedAmount: typeof b.fixedAmount === 'number' ? b.fixedAmount : 0,
        minPayment: typeof b.minPayment === 'number' ? b.minPayment : 0,
        amount: b.item_limit !== undefined ? b.item_limit : -1,
        group: groupObj,
        groupId,
        groupLimit,
        checked: true
      };
    });

  } catch (err) {
    console.error('getStructuredBenefits 오류:', err);
    return [];
  }
}

/* ═══════════════════════════════════════════════
 * 순수 함수 모듈 3: 3계층 순수 수학 캡핑 엔진
 * ═══════════════════════════════════════════════ */

function applyThreeLevelCap(items, totalTiers, perf, cappingMode = 'HYBRID') {
  const mode = (cappingMode || 'HYBRID').toUpperCase();
  const totalCap = (mode === 'INDIVIDUAL_TIER') ? Infinity : getTotalCapForPerf(totalTiers, perf);
  const groupSpentMap = {};
  let totalSpent = 0;
  const results = [];

  for (const it of items) {
    const currentItemLimit = (mode === 'TOTAL_TIER') ? Infinity : getItemLimitForPerf(it.amount, perf);
    const applicableRate = getApplicableRate(it.rate, perf);

    if (perf === 0 || !it.checked) {
      results.push({ id: it.id, applied: 0, currentItemLimit, applicableRate, cap1: 0, cap2: 0 });
      continue;
    }

    // 0차: 잠재 혜택 산출 (정액 혜택 / 동적 요율 적용 분기)
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

    // 2차: Tier 2 그룹 한도 캡핑 (group.limit)
    let cap2 = cap1;
    if (mode !== 'TOTAL_TIER' && it.groupId && it.groupId !== 'none') {
      const gLimit = (it.groupLimit === -1 || it.groupLimit == null) ? Infinity : it.groupLimit;
      const gSpent = groupSpentMap[it.groupId] || 0;
      const gRemain = isFinite(gLimit) ? Math.max(0, gLimit - gSpent) : Infinity;
      cap2 = isFinite(gRemain) ? Math.min(cap1, gRemain) : cap1;
      groupSpentMap[it.groupId] = gSpent + cap2;
    }

    // 3차: Tier 3 총 통합 한도 캡핑 (total_limit_tiers)
    const totalRemain = isFinite(totalCap) ? Math.max(0, totalCap - totalSpent) : Infinity;
    const applied = (mode !== 'INDIVIDUAL_TIER' && isFinite(totalRemain)) ? Math.min(cap2, totalRemain) : cap2;

    totalSpent += applied;
    results.push({ id: it.id, applied, currentItemLimit, applicableRate, cap1, cap2 });
  }

  return { results, totalSpent, groupSpentMap, totalCap };
}

/**
 * minPayment 및 rate 기반 혜택별 최소 필요 사용 금액 역산 및 합산 함수
 * @param {Array} items - 혜택 항목 배열 (checked 상태 포함)
 * @param {Array} results - 3계층 캡핑 결과 배열
 * @returns {number} totalRequiredSum - 혜택을 받기 위한 실질 필요 사용 금액 합계
 */
function calculateMinRequiredPayment(items, results) {
  let totalRequiredSum = 0;
  if (!Array.isArray(results) || !Array.isArray(items)) return 0;

  results.forEach(r => {
    const it = items.find(x => x.id === r.id);
    if (!it || it.checked === false) return;

    let needed = 0;
    if (r.applied > 0) {
      if (it.fixedAmount > 0) {
        needed = it.minPayment > 0 ? it.minPayment : r.applied;
      } else if (r.applicableRate > 0) {
        needed = r.applied / r.applicableRate;
      } else {
        needed = r.applied;
      }
    }
    if (!isFinite(needed) || isNaN(needed)) needed = 0;
    totalRequiredSum += Math.round(needed);
  });

  return totalRequiredSum;
}

/* ═══════════════════════════════════════════════
 * 혜택 계산기 UI 렌더링
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

    // is_calc_supported 유연한 조건 검사
    const isSupported = cardData.is_calc_supported == null || String(cardData.is_calc_supported).trim().toUpperCase() === 'TRUE';
    if (!isSupported) {
      return '';
    }

    // total_limit_tiers 파싱
    let totalLimitTiers = null;
    if (cardData.total_limit_tiers) {
      const raw = cardData.total_limit_tiers;
      if (typeof raw === 'string') {
        try { totalLimitTiers = JSON.parse(raw); } catch { totalLimitTiers = null; }
      } else {
        totalLimitTiers = raw;
      }
    }

    const items = getStructuredBenefits(cardData, kb);

    // total_limit_tiers 및 item_limit 배열 기반 동적 실적 구간 추출
    let perfOptions = extractPerfOptions(items, totalLimitTiers);

    if (perfOptions.length === 0) {
      const base = Number(preMonthMoney) || 0;
      if (base > 0) perfOptions = [base];
    }

    const basePerf = Number(preMonthMoney) || (perfOptions.length > 0 ? perfOptions[0] : 0);

    // 그룹 분류
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

    /* ── 실시간 렌더 및 3계층 캡핑 업데이트 ── */
    function renderTotal() {
      try {
        const selEl = document.getElementById('calc-perf-select');
        const currentPerf = selEl ? Number(selEl.value) : basePerf;

        // 실적 뱃지 동기화
        const badgeEl = document.querySelector('.calc-perf-badge');
        if (badgeEl) badgeEl.textContent = `기준 ${moneyLabel(currentPerf)}`;

        // 3계층 순수 수학 캡핑 엔진 실행
        const cappingMode = cardData.capping_mode || 'HYBRID';
        const { results, totalSpent, groupSpentMap, totalCap } =
          applyThreeLevelCap(items, totalLimitTiers, currentPerf, cappingMode);

        // minPayment 및 요율 기반 실질 필요 사용 금액 역산
        const totalRequiredSum = calculateMinRequiredPayment(items, results);

        results.forEach(r => {
          const it = items.find(x => x.id === r.id);
          if (!it) return;

          // 개별 UI 출력
          const displayEl = document.getElementById('calc-amt-' + r.id);
          if (displayEl) {
            if (currentPerf === 0) {
              displayEl.textContent = '혜택 없음';
              displayEl.className = 'calc-amount zero';
            } else if (!it.checked) {
              displayEl.textContent = '선택 해제';
              displayEl.className = 'calc-amount zero';
            } else if (r.applied === 0) {
              displayEl.textContent = '0원 (한도 도달)';
              displayEl.className = 'calc-amount zero';
            } else {
              const capText = isFinite(r.currentItemLimit)
                ? ` / 한도 ${r.currentItemLimit.toLocaleString()}원`
                : '';
              displayEl.textContent = it.fixedAmount > 0
                ? `${r.applied.toLocaleString()}원 할인`
                : `최대 ${r.applied.toLocaleString()}원${capText}`;
              displayEl.className = 'calc-amount';
            }
          }
        });

        // 2차: 그룹 한도 도달 경고 노출
        Object.values(groupMap).forEach(g => {
          const spent = groupSpentMap[g.groupId] || 0;
          const gLimit = (g.groupLimit === -1 || g.groupLimit == null) ? Infinity : g.groupLimit;
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

        // 연회비 월할 계산
        let annualFee = 0;
        const rawFee = cardData.annual_fee || cardData.annual_fee_detail || '';
        const feeM = rawFee.replace(/,/g, '').match(/\d+/);
        if (feeM) annualFee = parseInt(feeM[0], 10);
        const monthlyAnnualFee = annualFee / 12;

        let realSpending = 0;
        if (currentPerf === 0 || totalSpent === 0) {
          realSpending = 0;
        } else {
          // 부문장님 원본 PRD 기획 룰: 선택한 전월 실적 구간 금액 + 선택된 개별 혜택 필수 필요 금액 합산 (총액)
          realSpending = currentPerf + totalRequiredSum;
        }
        realSpending = Math.round(realSpending);

        // 피킹률 연산
        let pickingRate = 0;
        if (realSpending > 0 && totalSpent > 0) {
          pickingRate = ((totalSpent - monthlyAnnualFee) / realSpending) * 100;
        }
        if (pickingRate < 0 || isNaN(pickingRate) || !isFinite(pickingRate)) pickingRate = 0;

        // 하단 대시보드 3대 지표 순수 숫자 및 단일 단위 출력
        const totalAmtEl = document.getElementById('calc-total-amt');
        if (totalAmtEl) {
          totalAmtEl.textContent = (currentPerf === 0 || totalSpent === 0) ? '0원' : `최대 ${totalSpent.toLocaleString()}원`;
        }

        const reqAmtEl = document.getElementById('calc-required-amt');
        if (reqAmtEl) {
          if (currentPerf === 0 || totalSpent === 0) {
            reqAmtEl.textContent = '0원';
          } else {
            reqAmtEl.textContent = `${realSpending.toLocaleString()}원`;
          }
        }

        const pickRateEl = document.getElementById('calc-picking-rate');
        if (pickRateEl) {
          pickRateEl.textContent = (currentPerf === 0 || totalSpent === 0) ? '0.00%' : `${pickingRate.toFixed(2)}%`;
        }

        const gauge = document.getElementById('calc-gauge-bar');
        if (gauge) {
          if (currentPerf === 0) {
            gauge.style.width = '0%';
            gauge.className = 'gauge-bar level-0';
          } else {
            gauge.style.width = Math.min(pickingRate * 10, 100) + '%';
            gauge.className = 'gauge-bar '
              + (pickingRate < 1 ? 'level-1' : pickingRate < 3 ? 'level-2' : pickingRate < 5 ? 'level-3' : 'level-4');
          }
        }

        console.log('[3계층 순수 수학 엔진]', { perf: currentPerf, totalSpent, realSpending, pickingRate });

      } catch (e) {
        console.error('renderTotal 오류:', e);
      }
    }

    // 전역 핸들러 등록
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

    // inline onchange 사용으로 문서 레벨 이중 바인딩 불필요

    /* ── HTML 행 생성 ── */
    function makeRow(it) {
      const lim = getItemLimitForPerf(it.amount, basePerf);
      let displayAmt = '';
      if (basePerf === 0) {
        displayAmt = '혜택 없음';
      } else {
        displayAmt = it.fixedAmount > 0
          ? `${it.fixedAmount.toLocaleString()}원 할인`
          : (lim === Infinity ? '한도 없음' : `최대 ${lim.toLocaleString()}원`);
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
            <div class="benefit-title">${esc(it.title)}</div>
            <div class="benefit-summary">${esc(it.summary)}</div>
          </span>
          <span id="calc-amt-${it.id}" class="calc-amount ${!isChecked ? 'zero' : ''}">
            ${isChecked ? displayAmt : '선택 해제'}
          </span>
        </div>`;
    }

    /* ── 그룹 박스 HTML ── */
    let groupsHTML = '';
    Object.values(groupMap).forEach(g => {
      const gLimLabel = (g.groupLimit === -1 || g.groupLimit == null)
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

    /* ── 총 통합 한도 박스 HTML (Total Limit Tiers 공유 시 시각적 그룹핑) ── */
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
            <span class="db-value text-brand" id="calc-total-amt">0원</span>
          </div>
          <div class="dashboard-row">
            <span class="db-label">실질 필요 사용 금액 (최소)</span>
            <span class="db-value" id="calc-required-amt">0원</span>
          </div>
          <div class="dashboard-row picking-rate-row">
            <span class="db-label">실질 체감 피킹률</span>
            <span class="db-value highlight" id="calc-picking-rate">0.00%</span>
          </div>
          <div class="gauge-container">
            <div class="gauge-bar level-0" id="calc-gauge-bar" style="width: 0%;"></div>
          </div>
        </div>
      </div>`;

  } catch (err) {
    console.error('buildCalc 오류:', err);
    return '';
  }
}

/* ── 브라우저 글로벌 노출 ── */
window.buildPickingCalc = buildPickingCalc;
window.buildCalc = buildPickingCalc;
window.getStructuredBenefits = getStructuredBenefits;
window.applyThreeLevelCap = applyThreeLevelCap;
window.calculateMinRequiredPayment = calculateMinRequiredPayment;
window.getItemLimitForPerf = getItemLimitForPerf;
window.extractPerfOptions = extractPerfOptions;
