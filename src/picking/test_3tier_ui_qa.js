import fs from 'fs';
import path from 'path';

// calculator.js 로드
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');
const windowMock = {};
new Function('window', 'document', 'console', calcJsCode)(windowMock, {}, console);

console.log("==========================================");
console.log("🧪 3계층 캡핑 엔진 & UI / 역산 공식 마스터 검증");
console.log("==========================================");

// Test 1: 3계층 캡핑 순서 및 서브토탈 캡핑 알고리즘 검증 (Card 688: 카드의정석 POINT CHECK)
console.log("\n[Test 1] 서브토탈 캡핑 (Tier 1 ➔ Tier 2 ➔ Tier 3 순차 상한선) 검증:");
const card688 = JSON.parse(fs.readFileSync('card_detail/688.json', 'utf8'));
const items688 = windowMock.getStructuredBenefits(card688);

// 전월실적 30만 원 (통합한도 10,000원)
const capRes30 = windowMock.applyThreeLevelCap(items688, card688.total_limit_tiers, 300000);
console.log(`- 전월실적 30만 원 기준 (총 통합한도 10,000원):`);
console.log(`  * 잠재 합산액 (모든 혜택 적용 시): 4.8%`);
console.log(`  * 서브토탈 캡핑 적용 후 최종 혜택액: ${capRes30.totalSpent.toLocaleString()}원 (기대값: 10,000원 캡핑)`);

if (capRes30.totalSpent === 10000) {
  console.log("✅ Test 1 PASS! 서브토탈 캡핑 알고리즘 정상 작동 (10,000원 초과 차단)");
} else {
  console.error("❌ Test 1 FAIL!");
}

// Test 2: UI 시각적 그룹핑 및 👑 렌더링 검증
console.log("\n[Test 2] UI 👑 그룹/통합 한도 박스 렌더링 검증:");
const html688 = windowMock.buildCalc(card688.key_benefit, card688.pre_month_money, card688.pre_month_condition, card688);
const hasBanner = html688.includes('👑 총 통합 한도: 최대 10,000원 적용 중');
const hasGroupBox = html688.includes('calc-group-box');
console.log(`- 👑 통합 한도 텍스트 배너 존재 여부: ${hasBanner}`);
console.log(`- 시각적 그룹 박스 (calc-group-box) 생성 여부: ${hasGroupBox}`);

if (hasBanner && hasGroupBox) {
  console.log("✅ Test 2 PASS! UI 시각적 그룹핑 및 👑 배너 렌더링 정상 확인");
} else {
  console.error("❌ Test 2 FAIL!");
}

// Test 3: 정률 vs 정액 필요 결제액 역산 분기 로직 검증
console.log("\n[Test 3] 정률 / 정액 필요 결제액 역산 공식 검증:");
const rateAndFixedFixture = {
  total_limit_tiers: [],
  structured_benefits: [
    {
      title: '선물하기',
      detail: '선물하기 50% 할인',
      rate: '[{"perf":400000,"rate":0.5}]',
      item_limit: '5000',
      fixedAmount: 0,
      minPayment: 0
    },
    {
      title: '간편결제',
      detail: '간편결제 10% 할인',
      rate: '[{"perf":400000,"rate":0.1}]',
      item_limit: '5000',
      fixedAmount: 0,
      minPayment: 0
    }
  ]
};
const items2455 = windowMock.getStructuredBenefits(rateAndFixedFixture);

// 정액 혜택 항목 모킹 추가
items2455.push({
  id: 99,
  title: '영화 정액할인',
  summary: '1만2천원 이상 결제시 3천원 할인',
  rate: 0,
  fixedAmount: 3000,
  minPayment: 12000,
  amount: 3000,
  checked: true
});

const capRes2455 = windowMock.applyThreeLevelCap(items2455, rateAndFixedFixture.total_limit_tiers, 400000);
const reqPay2455 = windowMock.calculateMinRequiredPayment(items2455, capRes2455.results);

// 선물하기(50% 할인, 5천원 혜택 ➔ 1만원 필요), 카카오페이(10% 할인, 5천원 혜택 ➔ 5만원 필요), 영화(3천원 할인 ➔ minPayment 1.2만원 필요)
// 총 혜택 역산 필요액 = 10,000 + 50,000 + 12,000 = 72,000원
console.log(`- 혜택 역산 필요 결제액 (선물하기 1만 + 카카오페이 5만 + 영화 1.2만): ${reqPay2455.toLocaleString()}원 (기대값: 72,000원)`);

if (reqPay2455 === 72000) {
  console.log("✅ Test 3 PASS! 정률/정액 역산 공식 오차 없이 정상 검증 완료");
} else {
  console.error("❌ Test 3 FAIL!");
}

console.log("\n==========================================");
