/**
 * cleanse_unwarranted_group_limits.js — 약관 미명시 그룹/통합 한도 전수 스캔 및 일괄 해제 클렌징 스크립트
 */

import fs from 'fs';
import path from 'path';

const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let cleansedCardCount = 0;

cardsFull.forEach(card => {
  let fullText = '';
  if (Array.isArray(card.key_benefit)) {
    card.key_benefit.forEach(b => {
      fullText += (b.info || '') + ' ';
    });
  }
  if (card.detailed_benefits) {
    fullText += String(card.detailed_benefits) + ' ';
  }

  // 명시적 그룹/통합한도 키워드 검사
  const hasExplicitGroupCap = /(?:총\s*)?(?:통합\s*|그룹\s*|합산\s*)(?:월\s*)?(?:할인\s*|적립\s*)?한도/i.test(fullText);

  let isCleansed = false;

  // 약관 원문에 명시적 통합한도 문구가 없으면 오생성된 total_limit_tiers 및 group_limit 해제
  if (!hasExplicitGroupCap) {
    if (Array.isArray(card.total_limit_tiers) && card.total_limit_tiers.length > 0) {
      card.total_limit_tiers = null; // or []
      isCleansed = true;
    }
    if (card.group_limit && card.group_limit !== '-1' && card.group_limit !== null) {
      card.group_limit = '-1';
      card.group_id = 'none';
      isCleansed = true;
    }
    if (Array.isArray(card.structured_benefits)) {
      card.structured_benefits.forEach(bItem => {
        if (bItem.group_id !== null) {
          bItem.group_id = null;
          isCleansed = true;
        }
      });
    }
  }

  if (isCleansed) {
    cleansedCardCount++;
    const detailPath = path.resolve(`card_detail/${card.idx}.json`);
    if (fs.existsSync(detailPath)) {
      try {
        const dObj = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
        dObj.total_limit_tiers = card.total_limit_tiers;
        dObj.group_limit = card.group_limit;
        dObj.group_id = card.group_id;
        dObj.structured_benefits = card.structured_benefits;
        fs.writeFileSync(detailPath, JSON.stringify(dObj, null, 2), 'utf8');
      } catch (e) {}
    }
  }
});

console.log(`==========================================`);
console.log(`🚀 [약관 미명시 그룹/통합한도 전수 클렌징 완료]`);
console.log(`총 ${cleansedCardCount}개 카드의 불필요한 group_limit / total_limit_tiers 해제 완료`);
console.log(`==========================================`);

// 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
