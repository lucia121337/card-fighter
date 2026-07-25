import fs from 'fs';
import path from 'path';

// calculator.js 읽기
const calcJsPath = path.resolve('../../calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');

// 가상 브라우저 환경 (window 객체 모킹)
const windowMock = {};
const evalFunc = new Function('window', 'document', 'console', calcJsCode);

// document 헬퍼 모킹
const docMock = {
  getElementById: () => null,
  querySelector: () => null
};

evalFunc(windowMock, docMock, console);

// calculator_data.json 읽기
const jsonPath = path.resolve('./calculator_data.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const dbData = JSON.parse(rawData);

console.log("==========================================");
console.log("🧪 1차 QA (Quality Assurance) 자동 테스트 시작");
console.log("==========================================");

// QA Test 1: LG U+ 우리카드 (Card ID: 2523) - 영화 혜택
const card2523 = dbData.cards.find(c => c.card_id === 2523);
card2523.structured_benefits = dbData.benefit_items.filter(b => b.card_id === 2523);

const items2523 = windowMock.getStructuredBenefits(card2523);
const movieItem = items2523.find(b => b.title === '영화');

const capRes2523 = windowMock.applyThreeLevelCap(items2523, [], 300000);
const movieRes = capRes2523.results.find(r => r.id === movieItem.id);

let movieNeeded = 0;
if (movieRes.applied > 0) {
  if (movieItem.fixedAmount > 0) {
    movieNeeded = movieItem.minPayment > 0 ? movieItem.minPayment : movieRes.applied;
  } else if (movieRes.applicableRate > 0) {
    movieNeeded = movieRes.applied / movieRes.applicableRate;
  }
}

console.log("\n[Test Case 1] LG U+ 우리카드 - 영화 정액 혜택 역산 검증:");
console.log(`- 혜택명: ${movieItem.title}`);
console.log(`- 적용 혜택액 (applied): ${movieRes.applied.toLocaleString()}원 (기대값: 3,000원)`);
console.log(`- 필요 사용 금액 (needed): ${movieNeeded.toLocaleString()}원 (기대값: 12,000원)`);

if (movieRes.applied === 3000 && movieNeeded === 12000) {
  console.log("✅ Test Case 1 PASS!");
} else {
  console.error("❌ Test Case 1 FAIL!");
}

// QA Test 2: 만나 우리카드 (Card ID: 2525) - 주유소 혜택
const card2525 = dbData.cards.find(c => c.card_id === 2525);
card2525.structured_benefits = dbData.benefit_items.filter(b => b.card_id === 2525);
const items2525 = windowMock.getStructuredBenefits(card2525);
const gasItem = items2525.find(b => b.title === '주유소');

// 30만 원 실적 시
const capRes30 = windowMock.applyThreeLevelCap(items2525, [], 300000);
const gasRes30 = capRes30.results.find(r => r.id === gasItem.id);

// 100만 원 실적 시
const capRes100 = windowMock.applyThreeLevelCap(items2525, [], 1000000);
const gasRes100 = capRes100.results.find(r => r.id === gasItem.id);

console.log("\n[Test Case 2] 만나 우리카드 - 주유소 동적 요율 및 캡핑 검증:");
console.log(`- 30만원 실적 적용 요율: ${(gasRes30.applicableRate * 100).toFixed(2)}% (기대값: 3.75%)`);
console.log(`- 30만원 실적 잠재 혜택(30만 * 3.75% = 11,250원) ➔ 개별한도 캡핑 혜택액: ${gasRes30.applied.toLocaleString()}원 (기대값: 7,000원)`);
console.log(`- 100만원 실적 적용 요율: ${(gasRes100.applicableRate * 100).toFixed(2)}% (기대값: 6.25%)`);
console.log(`- 100만원 실적 개별한도 캡핑 혜택액: ${gasRes100.applied.toLocaleString()}원 (기대값: 15,000원)`);

if (
  gasRes30.applicableRate === 0.0375 &&
  gasRes30.applied === 7000 &&
  gasRes100.applicableRate === 0.0625 &&
  gasRes100.applied === 15000
) {
  console.log("✅ Test Case 2 PASS!");
} else {
  console.error("❌ Test Case 2 FAIL!");
}

// QA Test 3: LGU+ 통신요금 (Card ID: 2523) - 계단식 동적 item_limit 검증
const lguItem = items2523.find(b => b.title === 'LGU+');
const lguLim300k = windowMock.getItemLimitForPerf(lguItem.amount, 300000);
const lguLim700k = windowMock.getItemLimitForPerf(lguItem.amount, 700000);

console.log("\n[Test Case 3] LG U+ 우리카드 - LGU+ 동적 개별한도(item_limit) 검증:");
console.log(`- 30만원 실적 시 적용 한도: ${lguLim300k.toLocaleString()}원 (기대값: 10,000원)`);
console.log(`- 70만원 실적 시 적용 한도: ${lguLim700k.toLocaleString()}원 (기대값: 15,000원)`);

if (lguLim300k === 10000 && lguLim700k === 15000) {
  console.log("✅ Test Case 3 PASS!");
} else {
  console.error("❌ Test Case 3 FAIL!");
}

console.log("\n==========================================");
