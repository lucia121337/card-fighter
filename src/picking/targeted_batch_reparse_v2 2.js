/**
 * targeted_batch_reparse_v2.js — 고도화된 타겟 선별 배치 재파싱 스크립트
 */

import fs from 'fs';
import path from 'path';

export function parseKoreanAmount(str) {
  if (!str) return 0;
  const numKoreanMap = { '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9 };
  let s = String(str).trim();
  if (s.includes('만') || s.includes('천')) {
    s = s.replace(/([일이삼사오육칠팔구])(?=[만천])/g, (_, p1) => numKoreanMap[p1] || p1);
  }
  s = s.replace(/,/g, '').replace(/\s+/g, '').trim();

  let total = 0;

  if (s.includes('만')) {
    const parts = s.split('만');
    const manVal = parseFloat(parts[0]);
    if (!isNaN(manVal)) {
      total += Math.round(manVal * 10000);
    }
    const rest = parts[1] || '';
    if (rest) {
      const chunMatch = rest.match(/(\d+(?:\.\d+)?)천/);
      if (chunMatch) {
        total += Math.round(parseFloat(chunMatch[1]) * 1000);
      } else {
        const numMatch = rest.match(/(\d+)/);
        if (numMatch) {
          const n = parseInt(numMatch[1], 10);
          if (n < 10) {
            total += n * 1000;
          } else {
            total += n;
          }
        }
      }
    }
  } else if (s.includes('천')) {
    const chunMatch = s.match(/(\d+(?:\.\d+)?)천/);
    if (chunMatch) {
      total += Math.round(parseFloat(chunMatch[1]) * 1000);
    }
  } else {
    const numOnly = s.match(/\d+/);
    if (numOnly) {
      total = parseInt(numOnly[0], 10);
    }
  }

  return total;
}

export function parseTextTiers(text) {
  if (!text) return null;
  const map = {};

  // 한도 키워드가 명시된 실적/한도 추출 정규식 (건당 결제 조건과 구분)
  const reLimitPattern = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과|미만|시|~)*[^0-9%]{0,80}?(?:할인한도|적립한도|한도|월\s*|최대)\s*[:：]?\s*([\d,]+[만천]?\s*원|[\d.]+\s*만\s*\d+천\s*원|[\d.]+\s*만\s*\d+\s*원|[\d.]+\s*만\s*원)/gi;
  let m;
  let safe = 0;
  while ((m = reLimitPattern.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[2]);
    if (perf >= 100000 && limit >= 1000 && limit <= 300000 && perf > limit) {
      if (!map[perf]) map[perf] = limit;
    }
  }

  const reRangePattern = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과|미만|시)?[^0-9%]{0,80}?(?:할인한도|적립한도|한도|월\s*|최대)\s*[:：]?\s*([\d,]+[만천]?\s*원|[\d.]+\s*만\s*\d+천\s*원|[\d.]+\s*만\s*\d+\s*원|[\d.]+\s*만\s*원)/gi;
  safe = 0;
  while ((m = reRangePattern.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[3]);
    if (perf >= 100000 && limit >= 1000 && limit <= 300000 && perf > limit) {
      if (!map[perf]) map[perf] = limit;
    }
  }

  const sorted = Object.entries(map)
    .map(([p, l]) => ({ perf: Number(p), limit: l }))
    .sort((a, b) => a.perf - b.perf);

  return sorted.length > 0 ? sorted : null;
}

// 배치 실행
const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

let patchedCardCount = 0;

cardsFull.forEach(card => {
  let modified = false;
  const keyBenefits = card.key_benefit || [];

  if (Array.isArray(card.structured_benefits)) {
    card.structured_benefits.forEach((bItem, idx) => {
      const kb = keyBenefits[idx];
      const textToParse = (kb ? kb.info : '') + ' ' + (bItem.detail || '');
      const parsedTiers = parseTextTiers(textToParse);

      if (parsedTiers && parsedTiers.length >= 1) {
        bItem.item_limit = parsedTiers.length === 1 ? parsedTiers[0].limit : parsedTiers;
        if (parsedTiers.length > 1) {
          bItem.item_limit = parsedTiers;
        }
        modified = true;
      }
    });
  }

  if (modified) {
    patchedCardCount++;
    if (Array.isArray(card.structured_benefits)) {
      card.item_limit = card.structured_benefits
        .map(b => JSON.stringify(b.item_limit))
        .join(' | ');
    }

    const detailPath = path.resolve(`card_detail/${card.idx}.json`);
    if (fs.existsSync(detailPath)) {
      try {
        const dObj = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
        dObj.structured_benefits = card.structured_benefits;
        dObj.item_limit = card.item_limit;
        fs.writeFileSync(detailPath, JSON.stringify(dObj, null, 2), 'utf8');
      } catch (e) {}
    }
  }
});

console.log(`==========================================`);
console.log(`🚀 [Targeted Batch Reparse v2 완료]`);
console.log(`총 ${patchedCardCount}개 카드의 혜택 한도 데이터 재구조화 패치 적용 완료`);
console.log(`==========================================`);

// 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
