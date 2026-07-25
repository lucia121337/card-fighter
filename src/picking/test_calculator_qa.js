import fs from 'fs';
import path from 'path';

// calculator.js 읽기
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');

// 가상 브라우저 환경 (window 객체 모킹)
const windowMock = {};
const evalFunc = new Function('window', 'document', 'console', calcJsCode);
const docMock = { getElementById: () => null, querySelector: () => null };
evalFunc(windowMock, docMock, console);

// calculator_data.json 읽기
const jsonPath = path.resolve('src/picking/calculator_data.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const dbData = JSON.parse(rawData);

console.log("==========================================");
console.log("🧪 2차 골든 데이터셋 (7종 모범 카드) QA 자동 테스트");
console.log("==========================================");

const goldenIdxs = [2455, 2718, 2522, 2296, 2297, 2298, 2299];
let passCount = 0;

goldenIdxs.forEach(idx => {
  const card = dbData.cards.find(c => c.card_id === idx);
  if (!card) {
    console.error(`❌ Card ID ${idx} NOT FOUND in calculator_data.json`);
    return;
  }
  card.structured_benefits = dbData.benefit_items.filter(b => b.card_id === idx);
  const items = windowMock.getStructuredBenefits(card);
  const tiers = dbData.performance_tiers.filter(t => t.card_id === idx);

  // 실적 구간 검증
  const perfOptions = windowMock.extractPerfOptions ? windowMock.extractPerfOptions(items, tiers) : [400000];
  const basePerf = perfOptions.length > 0 ? perfOptions[0] : 300000;
  
  const capRes = windowMock.applyThreeLevelCap(items, tiers, basePerf);
  const totalApplied = capRes.totalSpent;
  const reqPay = windowMock.calculateMinRequiredPayment(items, capRes.results);
  const totalMin = basePerf + reqPay;

  console.log(`\n[Card ${idx}] ${card.card_name} (${card.company})`);
  console.log(` - is_calc_supported: ${card.is_calc_supported}`);
  console.log(` - 혜택 항목 수: ${items.length}개`);
  console.log(` - [실적 ${basePerf.toLocaleString()}원] 총 적용 혜택액: ${totalApplied.toLocaleString()}원 | 역산 필요 결제액: ${reqPay.toLocaleString()}원 | 최종 필요 금액: ${totalMin.toLocaleString()}원`);

  if (card.is_calc_supported === 'TRUE' && items.length > 0 && totalApplied > 0) {
    passCount++;
    console.log(` ✅ Card ${idx} PASS!`);
  } else {
    console.error(` ❌ Card ${idx} FAIL!`);
  }
});

console.log("\n==========================================");
console.log(`결과: 7개 중 ${passCount}개 카드 통과`);
console.log("==========================================");
