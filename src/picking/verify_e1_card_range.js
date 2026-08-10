/**
 * verify_e1_card_range.js — E1 우리카드 상한선 구간 매칭 및 계산기 산출 정합성 검증 스크립트
 */

import fs from 'fs';
import path from 'path';

// calculator.js 모듈 로드
const calcJsPath = path.resolve('calculator.js');
const calcJsCode = fs.readFileSync(calcJsPath, 'utf8');
const windowMock = {};
new Function('window', 'document', 'console', calcJsCode)(windowMock, { getElementById: () => null, querySelector: () => null }, console);

const dbDataPath = path.resolve('src/picking/calculator_data.json');
const dbData = JSON.parse(fs.readFileSync(dbDataPath, 'utf8'));

// idx 2869 (E1 우리카드) 조회
const card2869 = dbData.cards.find(c => c.card_id === 2869);
const items2869 = dbData.benefit_items.filter(b => b.card_id === 2869);

console.log("==========================================");
console.log("🔍 [검증 1] E1 우리카드 (idx: 2869) Range item_limit 적재 상태");
console.log("==========================================");
items2869.forEach(it => {
  console.log(`- 혜택: ${it.title} | item_limit: ${it.item_limit}`);
});

const structuredItems = windowMock.getStructuredBenefits({ structured_benefits: items2869 });

// 실적 40만원 연산 검증
const capRes40 = windowMock.applyThreeLevelCap(structuredItems, card2869.total_limit_tiers, 400000);
const gasBenefit40 = capRes40.results.find(r => r.id === 0); // 충전소

// 실적 80만원 연산 검증
const capRes80 = windowMock.applyThreeLevelCap(structuredItems, card2869.total_limit_tiers, 800000);
const gasBenefit80 = capRes80.results.find(r => r.id === 0); // 충전소

console.log("\n==========================================");
console.log("🔍 [검증 2] 계산기 엔진 Range 매칭 연산 산출 결과");
console.log("==========================================");
console.log("[전월 실적 40만원 설정 시 충전소 혜택]");
console.log("- 적용 혜택 금액 (applied):", gasBenefit40 ? gasBenefit40.applied : 0, "원");
console.log("- 개별 한도 (currentItemLimit):", gasBenefit40 ? gasBenefit40.currentItemLimit : 0, "원");

console.log("\n[전월 실적 80만원 설정 시 충전소 혜택]");
console.log("- 적용 혜택 금액 (applied):", gasBenefit80 ? gasBenefit80.applied : 0, "원");
console.log("- 개별 한도 (currentItemLimit):", gasBenefit80 ? gasBenefit80.currentItemLimit : 0, "원");

if (gasBenefit40 && gasBenefit40.currentItemLimit === 10000 && gasBenefit80 && gasBenefit80.currentItemLimit === 20000) {
  console.log("\n✅ [검증 성공] 40만원 실적 선택 시 0원으로 죽지 않고 10,000원 한도가 온전히 매칭되어 정상 계산됩니다!");
} else {
  console.log("\n❌ [검증 실패] 구간 범위 매칭 및 계산 산출 결과 확인 필요");
}
