import fs from 'fs';
import path from 'path';

console.log("==========================================");
console.log("🚀 혜택 계산기 자동 스크리닝 & 대량 적재 파이프라인 가동");
console.log("==========================================");

// 1. calculator.js 엔진 로드
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');
const windowMock = {};
const evalFunc = new Function('window', 'document', 'console', calcJsCode);
evalFunc(windowMock, { getElementById: () => null, querySelector: () => null }, console);

// 2. 데이터셋 로드
const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let qualifiedCount = 0;
let excludedCount = 0;
const supportedCards = [];
const dbCards = [];
const dbBenefitItems = [];
const dbPerfTiers = [];

cardsFull.forEach(c => {
  const summary = c.top_benefit_summary || '';
  const detailed = c.detailed_benefits || '';
  const itemLimitStr = String(c.item_limit || '');

  // 자동 스크리닝 필터링 조건
  // A. 무제한(-1) 적립/할인 카드 제외
  const isUnlimited = summary.includes('무제한') || detailed.includes('무제한') || itemLimitStr.includes('-1');
  // B. 복잡한 선택형 예외 구조 카드 제외
  const isComplex = summary.includes('내맘대로') || summary.includes('선택') || summary.includes('맞춤') || summary.includes('팩');
  
  if (isUnlimited || isComplex) {
    c.is_calc_supported = 'FALSE';
    excludedCount++;
    return;
  }

  // C. 혜택 구조화 (structured_benefits 생성/파싱)
  let bItems = c.structured_benefits;
  if (!bItems && c.detailed_benefits) {
    const summaryItems = String(c.detailed_benefits).split('|').map(s => s.trim()).filter(Boolean);
    const rawLimits = itemLimitStr.split('|').map(s => s.trim());
    
    bItems = summaryItems.map((sumText, i) => {
      const parts = sumText.split(':');
      const title = parts[0] ? parts[0].trim() : '혜택';
      const detail = parts[1] ? parts[1].trim() : sumText;
      
      let parsedLimit = -1;
      if (rawLimits[i] !== undefined && rawLimits[i] !== '') {
        try {
          parsedLimit = JSON.parse(rawLimits[i]);
        } catch (e) {
          parsedLimit = rawLimits[i];
        }
      }
      
      let rateVal = 0;
      const rateMatch = detail.match(/(\d+(?:\.\d+)?)%/);
      if (rateMatch) {
        rateVal = parseFloat(rateMatch[1]) / 100;
      }

      return {
        card_id: c.idx,
        title: title,
        detail: detail,
        group_id: null,
        rate: [{ perf: Number(c.pre_month_money) || 300000, rate: rateVal }],
        item_limit: parsedLimit,
        fixedAmount: 0,
        minPayment: 0
      };
    });
    c.structured_benefits = bItems;
  } else if (bItems && Array.isArray(bItems)) {
    // 혜택 항목의 item_limit이 원본 cards_full.json의 c.item_limit 원본과 1:1 보존되도록 동기화
    const rawLimits = itemLimitStr.split('|').map(s => s.trim());
    bItems.forEach((it, i) => {
      if (rawLimits[i] !== undefined && rawLimits[i] !== '') {
        try {
          it.item_limit = JSON.parse(rawLimits[i]);
        } catch (e) {
          it.item_limit = rawLimits[i];
        }
      }
    });
  }

  if (!bItems || bItems.length === 0) {
    c.is_calc_supported = 'FALSE';
    excludedCount++;
    return;
  }

  c.structured_benefits = bItems;
  const items = windowMock.getStructuredBenefits(c);
  const perf = Number(c.pre_month_money) || 300000;

  // D. 수학적 역산 및 3계층 캡핑 정합성 검증
  try {
    const capRes = windowMock.applyThreeLevelCap(items, c.total_limit_tiers, perf);
    const reqPay = windowMock.calculateMinRequiredPayment(items, capRes.results);

    if (isFinite(reqPay) && !isNaN(reqPay) && capRes.totalSpent >= 0) {
      c.is_calc_supported = 'TRUE';
      qualifiedCount++;
      supportedCards.push(c);

      // DB 적재 데이터 생성
      dbCards.push({
        card_id: c.idx,
        card_name: c.card_name,
        company: c.company || '기타',
        annual_fee: Number(c.annual_fee) || 0,
        is_calc_supported: 'TRUE'
      });

      items.forEach(it => {
        let itemLimitVal = it.amount;
        if (typeof itemLimitVal === 'object' && itemLimitVal !== null) {
          itemLimitVal = JSON.stringify(itemLimitVal);
        } else {
          itemLimitVal = String(itemLimitVal);
        }

        dbBenefitItems.push({
          card_id: c.idx,
          title: it.title,
          detail: it.summary || it.detail,
          group_id: it.groupId && it.groupId !== 'none' ? it.groupId : null,
          rate: typeof it.rate === 'object' ? JSON.stringify(it.rate) : String(it.rate),
          item_limit: itemLimitVal,
          fixedAmount: it.fixedAmount || 0,
          minPayment: it.minPayment || 0
        });
      });

      if (Array.isArray(c.total_limit_tiers)) {
        c.total_limit_tiers.forEach(t => {
          dbPerfTiers.push({
            card_id: c.idx,
            perf: t.perf,
            total_limit: t.limit
          });
        });
      }

    } else {
      c.is_calc_supported = 'FALSE';
      excludedCount++;
    }
  } catch (err) {
    console.error(`[Error card ${c.idx}]:`, err);
    c.is_calc_supported = 'FALSE';
    excludedCount++;
  }
});

// 3. cards_full.json, cards_list.json, card_detail/ 및 calculator_data.json 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');

const cardsListPath = path.resolve('cards_list.json');
fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');

const dbData = {
  cards: dbCards,
  performance_tiers: dbPerfTiers,
  benefit_groups: [],
  benefit_items: dbBenefitItems
};

const dbDataPath = path.resolve('src/picking/calculator_data.json');
fs.writeFileSync(dbDataPath, JSON.stringify(dbData, null, 2), 'utf8');

console.log(`[파이프라인 결과] 전체 카드 수: ${cardsFull.length}개`);
console.log(`[파이프라인 결과] 지원 확정 카드 (is_calc_supported = TRUE): ${qualifiedCount}개`);
console.log(`[파이프라인 결과] 지원 제외 카드 (is_calc_supported = FALSE): ${excludedCount}개`);
console.log(`[파이프라인 결과] 혜택 계산 지원률: ${((qualifiedCount / cardsFull.length) * 100).toFixed(2)}%`);
console.log(`[SUCCESS] JSON 및 calculator_data.json 갱신 완료.`);
