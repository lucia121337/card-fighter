/**
 * 혜택 계산기 핵심 계산 엔진 (calculator.js)
 * 
 * [피킹률 공식 및 변수명 정의]
 * - 분자 = benefitAmount(할인/적립액) - monthlyAnnualFee(연회비/12)
 * - 분모 = realSpending(실질 사용 금액)
 * - 공식: ((benefitAmount - monthlyAnnualFee) / realSpending) * 100
 */

// HTML 이스케이프 헬퍼
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 금액 텍스트 변환 (예: 500000 -> 50만원)
function moneyLabel(num) {
  if (!num) return '0원';
  if (num >= 10000) {
    const man = Math.floor(num / 10000);
    const rest = num % 10000;
    return man + '만' + (rest ? ' ' + rest.toLocaleString() : '') + '원';
  }
  return num.toLocaleString() + '원';
}

// 실적 제외 조항 판별 (전체 key_benefit 대상)
function checkExcluded(kb) {
  if (!kb || !Array.isArray(kb)) return false;
  for (const b of kb) {
    const html = b.info || '';
    if (html.includes('제외') || html.includes('포함되지 않') || html.includes('제외됩니다')) {
      return true;
    }
  }
  return false;
}

// 한글 금액 파싱 (통합 실적 구간 파싱용)
function parseKoreanAmount(str) {
  if (!str) return 0;
  let total = 0;
  const cleaned = str.replace(/,/g, '').replace(/\s+/g, '').trim();

  const manMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*만/);
  const chunMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*천/);

  if (manMatch) {
    total += parseFloat(manMatch[1]) * 10000;
    const restChun = cleaned.match(/만\s*(\d+(?:\.\d+)?)\s*(?:천)?/);
    if (restChun && cleaned.includes('천')) {
      total += parseFloat(restChun[1]) * 1000;
    } else if (restChun && restChun[1]) {
      const val = parseFloat(restChun[1]);
      if (val < 10) {
        total += val * 1000;
      } else {
        total += val;
      }
    }
  } else if (chunMatch) {
    total += parseFloat(chunMatch[1]) * 1000;
  } else {
    const numOnly = cleaned.match(/\d+/);
    if (numOnly) {
      total = parseInt(numOnly[0], 10);
    }
  }
  return total;
}

// 정제된 top_benefit_summary 파싱
function parseFromSummary(summaryText) {
  let rate = 0.0;
  let amount = -1; // 디폴트: 무제한 플래그 (-1)

  const text = summaryText.trim();
  
  // 1. 할인율/적립률 (%) 추출
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    rate = parseFloat(pctMatch[1]) / 100;
  }

  // 2. 최대 혜택 금액(원) 추출
  const wonMatch = text.match(/(\d+)\s*원/);
  if (wonMatch) {
    amount = parseInt(wonMatch[1], 10);
  }

  // 숫자가 없거나 '무제한' 단어가 포함된 경우 확실하게 -1 보장
  const hasNumber = /\d+/.test(text);
  if (!hasNumber || text.includes('무제한')) {
    amount = -1;
  }

  return { rate, amount };
}

// 혜택 상세 구조화 함수
// 혜택 상세 구조화 함수 (CSV detailed_benefits 기반 단순 매핑)
function getStructuredBenefits(cardData) {
  if (!cardData) return [];
  const summaryText = cardData.top_benefit_summary || '';
  const rawItems = summaryText.split('|').map(s => s.trim()).filter(Boolean);
  
  // detailed_benefits 파싱
  const detailedText = cardData.detailed_benefits || '';
  const detailedItems = detailedText.split('|').map(s => s.trim()).filter(Boolean);

  return rawItems.map((raw, idx) => {
    const colonIdx = raw.indexOf(':');
    const title = colonIdx > -1 ? raw.slice(0, colonIdx).trim() : '혜택';
    const originalSummary = colonIdx > -1 ? raw.slice(colonIdx + 1).trim() : raw;

    const baseParsed = parseFromSummary(originalSummary); // { rate, amount }

    // detailed_benefits에서 상세 조건을 우선 가져오며 없으면 기존 요약을 fallback으로 사용
    const uiSummary = (detailedItems[idx] !== undefined && detailedItems[idx] !== '') 
                      ? detailedItems[idx] 
                      : originalSummary;

    let structured = {
      id: idx,
      title: title,
      summary: uiSummary,               // UI 텍스트 출력에 사용
      rate: baseParsed.rate,            // 계산용 할인율/적립율
      amount: baseParsed.amount,        // 계산용 한도 금액
      fixedAmount: 0,                   // 계산용 정액 할인 금액
      tiers: [],                        // HTML 파싱 제거로 빈 배열
      isIntegratedLimit: false
    };

    // 정액 할인 판별 (계산용)
    if (!originalSummary.includes('%') && (originalSummary.includes('원') || originalSummary.includes('점'))) {
      const wonMatch = originalSummary.match(/(\d+,?\d*)\s*원/);
      if (wonMatch) {
        structured.fixedAmount = parseInt(wonMatch[1].replace(/,/g, ''), 10);
      }
    }

    // 통합 한도 여부 가볍게 체크
    const INTEGRATED_KW = ['통합할인한도', '통합 할인한도', '통합한도', '통합 한도'];
    if (INTEGRATED_KW.some(k => uiSummary.includes(k) || title.includes(k))) {
      structured.isIntegratedLimit = true;
    }

    return structured;
  });
}

// 실적 구간별 값 조회 헬퍼 함수
function getTierValuesForPerf(tiers, perf, defaultRate, defaultAmount, defaultFixedAmount) {
  if (perf === 0) return { rate: 0, amount: 0, fixedAmount: 0 };
  if (!tiers || tiers.length === 0) {
    return { rate: defaultRate, amount: defaultAmount, fixedAmount: defaultFixedAmount };
  }
  let best = null;
  for (const t of tiers) {
    if (perf >= t.condition) {
      best = t;
    }
  }
  if (best) {
    return {
      rate: best.rate,
      amount: best.limit,
      fixedAmount: best.fixedAmount
    };
  }
  // 최하 실적에도 미달한 경우
  return { rate: 0, amount: 0, fixedAmount: 0 };
}

// 통합 할인 한도 실적 구간 분석
function parseCardTiers(kb, baseMoney) {
  const plains = (kb || []).map(b => {
    const raw = b.info || '';
    return raw.replace(/<[^>]+>/g, ' ')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ');
  });
  const fullText = plains.join(' ');

  const map = {};

  // 패턴 A: 30~50만원 : 월 5천원
  const reRange = /([\d]+(?:\.[\d]+)?)\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*[^:：\d]{0,25}[:：]\s*(?:월\s*)?([\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+\s*(?:원|점|천|만)?)/gi;
  let m;
  let safeCount = 0;
  while ((m = reRange.exec(fullText)) !== null && safeCount++ < 300) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const lim = parseKoreanAmount(m[3]);
    if (lo > 0 && lim > 0 && lim < 5000000) {
      if (!map[lo]) map[lo] = lim;
    }
  }

  // 패턴 B: 100만원 이상 : 월 2만원
  const reSingle = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)[^:：\d]{0,25}[:：]\s*(?:월\s*)?([\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+)\s*(?:원|점|이상|만원|천원)?/gi;
  safeCount = 0;
  while ((m = reSingle.exec(fullText)) !== null && safeCount++ < 300) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const lim = parseKoreanAmount(m[2]);
    if (lo > 0 && lim > 0 && lim < 5000000) {
      if (!map[lo]) map[lo] = lim;
    }
  }

  // 패턴 C: 구간형 통합한도
  if (Object.keys(map).length === 0) {
    const headerRe = /(\d+)구간\s*\((\d+(?:\.\d+)?)\s*만\s*원?\s*이상\)/gi;
    const condList = [];
    safeCount = 0;
    while ((m = headerRe.exec(fullText)) !== null && safeCount++ < 50) {
      condList.push(Math.round(parseFloat(m[2]) * 10000));
    }
    if (condList.length > 0) {
      const limitRowRe = /통합할인한도\s*((?:(?:[\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+)\s*(?:원|점)?\s*){1,10})/gi;
      const lm = limitRowRe.exec(fullText);
      if (lm) {
        const limNums = [];
        const numRe = /([\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+)\s*(?:원|점)?/g;
        let nm;
        safeCount = 0;
        while ((nm = numRe.exec(lm[1])) !== null && safeCount++ < 20) {
          const v = parseKoreanAmount(nm[1]);
          if (v > 0 && v < 5000000) limNums.push(v);
        }
        condList.forEach((c, i) => {
          if (limNums[i] && !map[c]) map[c] = limNums[i];
        });
      } else {
        condList.forEach(c => { if (!map[c]) map[c] = 0; });
      }
    }
  }

  const result = Object.entries(map)
    .map(([c, l]) => ({ condition: Number(c), limit: l }))
    .filter(t => t.condition > 0)
    .sort((a, b) => a.condition - b.condition);

  if (result.length === 0 && baseMoney > 0) {
    return [{ condition: baseMoney, limit: Infinity }];
  }
  return result;
}

// 실적별 통합 한도 조회
function getLimitForPerf(tiers, perf) {
  if (perf === 0) return 0;
  let best = null;
  for (const t of tiers) {
    if (perf >= t.condition) best = t;
  }
  return best ? best.limit : (tiers.length > 0 ? 0 : Infinity);
}

// 메인 계산기 생성기
function buildCalc(kb, preMonthMoney, preMonthCondition, cardData) {
  try {
    const basePerf = preMonthMoney || 0;
    const cardTiers = parseCardTiers(kb, basePerf);

    const perfOptions = cardTiers.length > 0
      ? cardTiers.map(t => t.condition)
      : (basePerf > 0 ? [basePerf] : []);

    const structuredBenefits = getStructuredBenefits(cardData);
    const isExcludedGlobal = checkExcluded(kb);

    const items = structuredBenefits.map((b) => {
      return {
        id: b.id,
        origTitle: b.title,
        title: b.title,
        summary: b.summary,
        amount: b.amount, // -1 (무제한) 또는 기본 한도 금액
        fixedAmount: b.fixedAmount,
        rate: b.rate,
        tiers: b.tiers,
        checked: true,
        isGroup: b.isIntegratedLimit,
        isExcluded: isExcludedGlobal
      };
    });

    if (items.length === 0) return '';

    const groupItems = items.filter(it => it.isGroup);
    const soloItems = items.filter(it => !it.isGroup);

    // 실시간 렌더링 함수
    function renderTotal() {
      const selEl = document.getElementById('calc-perf-select');
      const currentPerf = selEl ? Number(selEl.value) : basePerf;
      const groupCap = getLimitForPerf(cardTiers, currentPerf);

      let groupSubtotal = 0;
      let groupRequiredSum = 0;
      let hasExcluded = false;

      // 1. 통합 한도 그룹 혜택 계산
      groupItems.forEach(it => {
        const { rate, amount, fixedAmount } = getTierValuesForPerf(it.tiers, currentPerf, it.rate, it.amount, it.fixedAmount);

        const el = document.getElementById('calc-amt-' + it.id);
        if (el) {
          if (currentPerf === 0 || (it.tiers.length > 0 && amount === 0 && fixedAmount === 0 && rate === 0)) {
            el.textContent = '혜택 없음';
            el.className = 'calc-amount zero';
          } else {
            const displayLimit = amount === -1 || amount === Infinity ? '한도 없음' : '최대 ' + amount.toLocaleString() + '원';
            el.textContent = fixedAmount > 0 ? fixedAmount.toLocaleString() + '원 할인' : displayLimit;
            el.className = 'calc-amount';
          }
        }

        let applied = 0;
        if (it.checked && currentPerf > 0) {
          let potBenefit = 0;
          if (fixedAmount > 0) {
            potBenefit = fixedAmount;
          } else if (rate > 0) {
            potBenefit = currentPerf * rate;
          }

          if (amount !== -1 && amount !== Infinity) {
            potBenefit = Math.min(amount, potBenefit);
          }

          const remaining = groupCap - groupSubtotal;
          if (remaining > 0) {
            applied = Math.min(potBenefit, remaining);
            groupSubtotal += applied;
          }
        }

        // 역산 결제금액 계산
        let needed = 0;
        if (fixedAmount > 0) {
          needed = fixedAmount;
        } else if (rate > 0) {
          needed = applied / rate;
        }
        if (!isFinite(needed) || isNaN(needed)) needed = 0;
        groupRequiredSum += needed;

        if (it.checked && it.isExcluded) {
          hasExcluded = true;
        }
      });

      // 통합 한도 헤더 업데이트
      const titleEl = document.getElementById('calc-group-title');
      if (titleEl && groupItems.length > 0) {
        if (groupCap === Infinity || groupCap === 0) {
          titleEl.style.display = 'none';
        } else {
          titleEl.style.display = 'inline-block';
          titleEl.textContent = `최대 ${groupCap.toLocaleString()}원`;
        }
      }

      // 캡핑 경고
      const warnEl = document.getElementById('calc-group-warning');
      if (warnEl) {
        const isCapped = groupCap !== Infinity && groupCap > 0 && groupSubtotal >= groupCap;
        if (isCapped) {
          warnEl.textContent = `⚠️ 통합 한도 도달! (적용: ${groupCap.toLocaleString()}원 / 선택 합계: ${groupSubtotal.toLocaleString()}원)`;
          warnEl.style.display = 'block';
        } else {
          warnEl.style.display = 'none';
        }
      }

      // 2. 독립 혜택 계산
      let soloTotal = 0;
      let soloRequiredSum = 0;
      soloItems.forEach(it => {
        const { rate, amount, fixedAmount } = getTierValuesForPerf(it.tiers, currentPerf, it.rate, it.amount, it.fixedAmount);

        const el = document.getElementById('calc-amt-' + it.id);
        if (el) {
          if (currentPerf === 0 || (it.tiers.length > 0 && amount === 0 && fixedAmount === 0 && rate === 0)) {
            el.textContent = '혜택 없음';
            el.className = 'calc-amount zero';
          } else {
            const displayLimit = amount === -1 || amount === Infinity ? '한도 없음' : '최대 ' + amount.toLocaleString() + '원';
            el.textContent = fixedAmount > 0 ? fixedAmount.toLocaleString() + '원 할인' : displayLimit;
            el.className = 'calc-amount';
          }
        }

        let applied = 0;
        if (it.checked && currentPerf > 0) {
          let potBenefit = 0;
          if (fixedAmount > 0) {
            potBenefit = fixedAmount;
          } else if (rate > 0) {
            potBenefit = currentPerf * rate;
          }

          if (amount !== -1 && amount !== Infinity) {
            potBenefit = Math.min(amount, potBenefit);
          }
          applied = potBenefit;
          soloTotal += applied;
        }

        // 역산 결제금액 계산
        let needed = 0;
        if (fixedAmount > 0) {
          needed = fixedAmount;
        } else if (rate > 0) {
          needed = applied / rate;
        }
        if (!isFinite(needed) || isNaN(needed)) needed = 0;
        soloRequiredSum += needed;

        if (it.checked && it.isExcluded) {
          hasExcluded = true;
        }
      });

      // 최종 혜택 합계 검증
      let finalTotal = soloTotal + groupSubtotal;
      if (!isFinite(finalTotal) || isNaN(finalTotal) || finalTotal < 0) {
        finalTotal = 0;
      }

      // 연회비 추출
      let annualFee = 0;
      if (cardData) {
        const rawFee = cardData.annual_fee || cardData.annual_fee_detail || cardData.annual_fee_basic || '';
        const feeMatch = rawFee.replace(/,/g, '').match(/\d+/);
        if (feeMatch) {
          annualFee = parseInt(feeMatch[0], 10);
        }
      }

      let totalRequiredSum = groupRequiredSum + soloRequiredSum;
      if (!isFinite(totalRequiredSum) || isNaN(totalRequiredSum)) {
        totalRequiredSum = 0;
      }

      // 실질 필요 사용 금액 (realSpending) 계산
      let realRequiredAmount = 0;
      if (currentPerf > 0) {
        if (hasExcluded) {
          realRequiredAmount = currentPerf + totalRequiredSum;
        } else {
          realRequiredAmount = Math.max(currentPerf, totalRequiredSum);
        }
      }
      if (!isFinite(realRequiredAmount) || isNaN(realRequiredAmount) || realRequiredAmount < 0) {
        realRequiredAmount = 0;
      }

      // 최종 피킹률 계산
      const benefitAmount = finalTotal;
      const monthlyAnnualFee = annualFee / 12;
      const realSpending = realRequiredAmount;
      
      let pickingRate = 0;
      if (realSpending > 0) {
        pickingRate = ((benefitAmount - monthlyAnnualFee) / realSpending) * 100;
      }
      if (pickingRate < 0 || isNaN(pickingRate) || !isFinite(pickingRate)) {
        pickingRate = 0;
      }

      // DOM 업데이트
      document.getElementById('calc-total-amt').textContent =
        currentPerf === 0 ? '혜택 없음'
          : finalTotal ? '최대 ' + finalTotal.toLocaleString() + '원' : '0원';

      const reqAmtEl = document.getElementById('calc-required-amt');
      if (reqAmtEl) {
        reqAmtEl.textContent = currentPerf === 0 ? '혜택 없음'
          : realRequiredAmount ? realRequiredAmount.toLocaleString() + '원' : '0원';
      }

      const pickRateEl = document.getElementById('calc-picking-rate');
      if (pickRateEl) {
        pickRateEl.textContent = currentPerf === 0 ? '0.00%' : pickingRate.toFixed(2) + '%';
      }

      const gauge = document.getElementById('calc-gauge-bar');
      if (gauge) {
        if (currentPerf === 0) {
          gauge.style.width = '0%';
          gauge.className = 'gauge-bar level-0';
        } else {
          const displayPercent = Math.min(pickingRate * 10, 100);
          gauge.style.width = displayPercent + '%';

          if (pickingRate < 1) {
            gauge.className = 'gauge-bar level-1';
          } else if (pickingRate < 3) {
            gauge.className = 'gauge-bar level-2';
          } else if (pickingRate < 5) {
            gauge.className = 'gauge-bar level-3';
          } else {
            gauge.className = 'gauge-bar level-4';
          }
        }
      }

      // 필수 피킹률 검증용 디버깅 로그
      console.log('실적:', currentPerf, '혜택합계:', finalTotal, '필요금액:', realRequiredAmount, '피킹률:', pickingRate);
    }

    // 전역 변수 및 핸들러 등록
    window._calcItems = items;
    window._calcRender = renderTotal;
    window._changePerfLimit = function () { renderTotal(); };

    // HTML 조립
    function makeRow(it) {
      const { rate, amount, fixedAmount } = getTierValuesForPerf(it.tiers, basePerf, it.rate, it.amount, it.fixedAmount);
      
      let displayAmt = '';
      if (basePerf === 0 && it.tiers.length > 0) {
        displayAmt = '혜택 없음';
      } else {
        displayAmt = fixedAmount > 0 ? fixedAmount.toLocaleString() + '원 할인' 
                     : (amount === -1 || amount === Infinity ? '한도 없음' : '최대 ' + amount.toLocaleString() + '원');
      }
      return `
        <div class="calc-row">
          <label class="calc-toggle">
            <input type="checkbox" id="calc-${it.id}" checked
              onchange="window._calcItems.find(x=>x.id===${it.id}).checked=this.checked; window._calcRender();">
            <span class="calc-slider"></span>
          </label>
          <span class="calc-name">
            <div class="benefit-title">${esc(it.title)}</div>
            <div class="benefit-summary">${esc(it.summary)}</div>
          </span>
          <span id="calc-amt-${it.id}" class="calc-amount">
            ${displayAmt}
          </span>
        </div>`;
    }

    let groupBoxHTML = '';
    if (groupItems.length > 0) {
      const initCap = getLimitForPerf(cardTiers, basePerf);
      const hasCap = initCap !== Infinity && initCap > 0;
      groupBoxHTML = `
        <div class="calc-group-box">
          <div class="calc-group-header">
            <span>👑 통합 한도 그룹</span>
            <span class="calc-group-limit-badge" id="calc-group-title" style="${hasCap ? '' : 'display: none;'}">최대 ${initCap.toLocaleString()}원</span>
          </div>
          ${groupItems.map(makeRow).join('')}
          <div id="calc-group-warning" class="calc-group-warn" style="display:none"></div>
        </div>`;
    }

    const soloHTML = soloItems.map(makeRow).join('');

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

    return `
      <div class="calc-box">
        <h3>🧮 혜택 계산기</h3>
        ${perfSelectHTML}
        ${groupBoxHTML}
        ${soloHTML}
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
    console.error('Error in buildCalc:', err);
    return '';
  }
}

// 브라우저 로딩 대비 전역 노출
window.buildCalc = buildCalc;
window.getStructuredBenefits = getStructuredBenefits;
