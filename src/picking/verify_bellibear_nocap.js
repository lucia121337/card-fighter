/**
 * verify_bellibear_nocap.js — 롯데홈쇼핑 벨리곰 카드 그룹한도 해제 및 계산기 렌더링 정합성 검증 스크립트
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

// 2265번 카드 데이터 조회
const card2265 = dbData.cards.find(c => c.card_id === 2265);
const items2265 = dbData.benefit_items.filter(b => b.card_id === 2265);

console.log("==========================================");
console.log("🔍 [검증] 롯데홈쇼핑 벨리곰 카드 (idx: 2265) 그룹/통합 한도 해제 상태");
console.log("==========================================");
console.log("Cards Table capping_mode:", card2265.capping_mode);
console.log("Cards Table total_limit_tiers:", card2265.total_limit_tiers);

items2265.forEach(it => {
  console.log(`- 혜택: ${it.title} | group_id: ${it.group_id} | item_limit: ${it.item_limit}`);
});

// 계산기 엔진 캡핑 연산 검증 (실적 60만원 선택 시)
const structuredItems = windowMock.getStructuredBenefits({
  structured_benefits: items2265
});

const capRes60 = windowMock.applyThreeLevelCap(structuredItems, card2265.total_limit_tiers, 600000);

console.log("\n==========================================");
console.log("🔍 [계산기 3계층 캡핑 연산 결과 (실적 60만원 기준)]");
console.log("총 통합 한도(totalCap):", capRes60.totalCap === Infinity ? '무제한 (족쇄 경고 없음)' : capRes60.totalCap);
console.log("최종 적용 혜택 총액(totalSpent):", capRes60.totalSpent, "원");

const homeShoppingBenefit = capRes60.results.find(r => r.id === 0);
console.log("\n[홈쇼핑 7% 청구할인 혜택 캡핑 검증]");
console.log("- 적용된 혜택 금액 (applied):", homeShoppingBenefit ? homeShoppingBenefit.applied : 0, "원");
console.log("- 개별 한도 (currentItemLimit):", homeShoppingBenefit ? homeShoppingBenefit.currentItemLimit : 0, "원");

if (homeShoppingBenefit && homeShoppingBenefit.applied === 40000 && capRes60.totalCap === Infinity) {
  console.log("\n✅ [검증 성공] 벨리곰 카드의 불필요한 통합 한도 족쇄 경고가 해제되어 40,000원 한도가 온전히 적용됩니다!");
} else {
  console.log("\n❌ [검증 실패] 한도 족쇄 해제 및 40,000원 적용 확인 필요");
}
