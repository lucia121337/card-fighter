import fs from 'fs';
import path from 'path';

// calculator.js 읽기
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');

// 가상 브라우저 환경 (window 객체 모킹)
const windowMock = {};
const evalFunc = new Function('window', 'document', 'console', calcJsCode);
evalFunc(windowMock, { getElementById: () => null, querySelector: () => null }, console);

// 1. cards_list.json 읽기
const listPath = path.resolve('cards_list.json');
const cardsList = JSON.parse(fs.readFileSync(listPath, 'utf8'));

// 2. calculator_data.json 읽기
const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

console.log("==========================================");
console.log("🧪 대량 적재 카드 자동 검증 (Unit Test)");
console.log("==========================================");

const supportedInList = cardsList.filter(c => String(c.is_calc_supported).toUpperCase() === 'TRUE');
console.log(`- cards_list.json 내 활성화 (is_calc_supported = TRUE) 카드 수: ${supportedInList.length}개`);
console.log(`- SQLite 데이터마트 Cards 테이블 적재 카드 수: ${dbData.cards.length}개`);

let passCount = 0;
let failCount = 0;
const failList = [];

dbData.cards.forEach(card => {
  const idx = card.card_id;
  card.structured_benefits = dbData.benefit_items.filter(b => b.card_id === idx);
  const items = windowMock.getStructuredBenefits(card);
  const tiers = dbData.performance_tiers.filter(t => t.card_id === idx);

  const perfOptions = windowMock.extractPerfOptions ? windowMock.extractPerfOptions(items, tiers) : [];
  const basePerf = perfOptions.length > 0 ? perfOptions[0] : (card.pre_month_money || 300000);

  try {
    const capRes = windowMock.applyThreeLevelCap(items, tiers, basePerf);
    const reqPay = windowMock.calculateMinRequiredPayment(items, capRes.results);

    if (isFinite(reqPay) && !isNaN(reqPay) && capRes.totalSpent >= 0) {
      passCount++;
    } else {
      failCount++;
      failList.push({ idx, name: card.card_name, reason: 'NaN/Infinite reqPay' });
    }
  } catch (err) {
    failCount++;
    failList.push({ idx, name: card.card_name, reason: err.message });
  }
});

const passRate = ((passCount / dbData.cards.length) * 100).toFixed(2);
console.log("\n[검증 결과 상세]");
console.log(`- 총 적재 카드: ${dbData.cards.length}개`);
console.log(`- 수학적 역산 및 3계층 캡핑 통과 (PASS): ${passCount}개`);
console.log(`- 실패 (FAIL): ${failCount}개`);
console.log(`- 검증 통과율: ${passRate}%`);

if (failList.length > 0) {
  console.log("\n[예외(에러) 리스트]");
  failList.forEach(f => console.log(` ❌ [${f.idx}] ${f.name}: ${f.reason}`));
} else {
  console.log("\n✅ 모든 적재 카드가 에러 없이 수학적 역산 및 3계층 캡핑 통과 완료!");
}

console.log("==========================================");
