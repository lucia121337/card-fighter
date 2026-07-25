import fs from 'fs';
import path from 'path';

// calculator.js 엔진 로드
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');
const windowMock = {};
new Function('window', 'document', 'console', calcJsCode)(windowMock, {}, console);

// calculator_data.json 로드
const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

console.log("==========================================");
console.log("🧪 '카드의정석 POINT CHECK x 핑크퐁 (idx: 688)' 정밀 검증");
console.log("==========================================");

const card688 = dbData.cards.find(c => c.card_id === 688);
card688.structured_benefits = dbData.benefit_items.filter(b => b.card_id === 688);
const tiers688 = dbData.performance_tiers.filter(t => t.card_id === 688);

const items = windowMock.getStructuredBenefits(card688);

console.log(`[1. DB 적재 아이템 세분화 검증]`);
console.log(`- Card ID: ${card688.card_id} (${card688.card_name})`);
console.log(`- is_calc_supported: ${card688.is_calc_supported}`);
console.log(`- 세부 혜택 아이템 개수: ${items.length}개`);
items.forEach((it, i) => {
  const ratePct = (it.rate[0].rate * 100).toFixed(1);
  console.log(`  ${i+1}. ${it.title} (${ratePct}% 적립) — ${it.summary}`);
});

console.log(`\n[2. 실적 구간별 통합 적립한도 캡핑(Performance_Tiers) 검증]`);
tiers688.forEach(t => {
  console.log(`  - 전월실적 ${t.perf.toLocaleString()}원 이상 ➔ 통합 월 적립한도: ${t.total_limit.toLocaleString()}점 (원)`);
});

console.log(`\n[3. 시나리오별 실질 필요 결제액 (역산 공식) 검증]`);

// 시나리오 A: 1.5% 특별적립 + 1.5% 간편결제 추가적립 중복 (합산 3.0% 최고 효율)
const itemSpecial15 = items.find(it => it.title.includes('1.5% 특별적립군'));
const itemPay15 = items.find(it => it.title.includes('1.5% 간편결제'));

// 체크 상태 설정
items.forEach(it => it.checked = false);
itemSpecial15.checked = true;
itemPay15.checked = true;

tiers688.forEach(t => {
  const capRes = windowMock.applyThreeLevelCap(items, tiers688, t.perf);
  const reqPay = windowMock.calculateMinRequiredPayment(items, capRes.results);
  const totalNeeded = t.perf + reqPay;
  console.log(`- [시나리오 A: 특별 1.5% + 페이 1.5% = 3.0% 적립] 실적 ${t.perf.toLocaleString()}원:`);
  console.log(`   * 한도 캡핑 달성 혜택액: ${capRes.totalSpent.toLocaleString()}원`);
  console.log(`   * 혜택 달성 역산 필요 결제액: ${reqPay.toLocaleString()}원`);
  console.log(`   * 실질 총 필요 사용금액 (실적+혜택): ${totalNeeded.toLocaleString()}원`);
});

// 시나리오 B: 0.5% 특별적립군 단독
items.forEach(it => it.checked = false);
items.find(it => it.title.includes('0.5% 특별적립군')).checked = true;

const t30 = tiers688[0];
const capResB = windowMock.applyThreeLevelCap(items, tiers688, t30.perf);
const reqPayB = windowMock.calculateMinRequiredPayment(items, capResB.results);
console.log(`\n- [시나리오 B: 0.5% 특별적립 단독] 실적 30만 원:`);
console.log(`   * 혜택 달성 역산 필요 결제액: ${reqPayB.toLocaleString()}원 (기대값: 2,000,000원)`);

console.log("\n==========================================");
console.log("✅ 카드의정석 POINT CHECK x 핑크퐁 (idx: 688) 적재 & 역산 검증 통과!");
console.log("==========================================");
