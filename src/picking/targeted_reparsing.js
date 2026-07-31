/**
 * targeted_reparsing.js — 타겟 선별적 재파싱 (Targeted Batch Re-parsing)
 * 
 * 비정상 탐지기(Validator)에 선별된 타겟 카드만 '한글 혼용 금액 변환 및 구간 배열 파싱 룰'을
 * 적용하여 안전하게 데이터를 재추출하고 패치(Patch)합니다.
 */

import fs from 'fs';
import path from 'path';

// 한글 금액 변환 헬퍼 (Rule 6 적용)
function parseKoreanAmount(str) {
  if (!str) return 0;
  const numKoreanMap = { '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9 };
  let s = String(str).trim();
  if (s.includes('만') || s.includes('천')) {
    s = s.replace(/([일이삼사오육칠팔구])(?=[만천])/g, (_, p1) => numKoreanMap[p1] || p1);
  }
  s = s.replace(/,/g, '').replace(/\s+/g, '').trim();

  let total = 0;
  const manMatch = s.match(/(\d+(?:\.\d+)?)만(?:(\d+)|(\d+)천)?/);
  if (manMatch) {
    total += parseFloat(manMatch[1]) * 10000;
    if (manMatch[2]) {
      const restNum = parseInt(manMatch[2], 10);
      if (restNum < 10000) total += restNum;
    } else if (manMatch[3]) {
      total += parseInt(manMatch[3], 10) * 1000;
    } else {
      const restPart = s.slice(manMatch.index + manMatch[0].length);
      const chunMatch = restPart.match(/(\d+(?:\.\d+)?)천/);
      if (chunMatch) {
        total += parseFloat(chunMatch[1]) * 1000;
      } else {
        const restNumMatch = restPart.match(/^(\d+)/);
        if (restNumMatch) {
          const restVal = parseInt(restNumMatch[1], 10);
          if (restVal < 10000) total += restVal;
        }
      }
    }
  } else {
    const chunMatch = s.match(/(\d+(?:\.\d+)?)천/);
    if (chunMatch) {
      total += parseFloat(chunMatch[1]) * 1000;
    } else {
      const numOnly = s.match(/\d+/);
      if (numOnly) total = parseInt(numOnly[0], 10);
    }
  }
  return total;
}

// 텍스트 기반 구간 배열 파서 (Rule 6 적용)
function parseTextTiers(text) {
  if (!text) return null;
  const map = {};

  const reSingle = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과|시)?[^0-9%]{0,60}(?:월\s*|한도\s*|최대\s*)*([\d,]+[만천]?\s*원|[\d.]+\s*만\s*\d+천\s*원|[\d.]+\s*만\s*\d+\s*원|[\d.]+\s*만\s*원)/gi;
  let m;
  let safe = 0;
  while ((m = reSingle.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[2]);
    if (perf > 0 && limit >= 1000 && limit < 5000000 && !map[perf]) {
      map[perf] = limit;
    }
  }

  const sorted = Object.entries(map)
    .map(([p, l]) => ({ perf: Number(p), limit: l }))
    .sort((a, b) => a.perf - b.perf);

  return sorted.length > 0 ? sorted : null;
}

// 1. 데이터 로드
const cardsFullPath = path.resolve('cards_full.json');
const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

const targetCardsPath = path.resolve('src/picking/target_cards.json');
const targetList = JSON.parse(fs.readFileSync(targetCardsPath, 'utf8'));
const targetIdxSet = new Set(targetList.map(t => t.idx));

let patchedCount = 0;

cardsFull.forEach(card => {
  if (!targetIdxSet.has(card.idx)) return; // 타겟 카드가 아닌 경우 스킵 (사이드 이펙트 방지)

  let modified = false;
  const keyBenefits = card.key_benefit || [];

  if (Array.isArray(card.structured_benefits)) {
    card.structured_benefits.forEach((bItem, idx) => {
      const kb = keyBenefits[idx];
      const textToParse = (kb ? kb.info : '') + ' ' + (bItem.detail || '');
      const parsedTiers = parseTextTiers(textToParse);

      if (parsedTiers && parsedTiers.length > 1) {
        bItem.item_limit = parsedTiers;
        modified = true;
      }
    });
  }

  if (modified) {
    patchedCount++;
    // item_limit 파이프 문자열 갱신
    if (Array.isArray(card.structured_benefits)) {
      card.item_limit = card.structured_benefits
        .map(b => JSON.stringify(b.item_limit))
        .join(' | ');
    }

    // 개별 card_detail JSON도 함께 안전 패치
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

console.log(`[선별적 재파싱 결과] 타겟 ${targetList.length}개 카드 중 ${patchedCount}개 카드의 구간 배열 패치 완료`);

// cards_full.json 및 cards_list.json 안전 저장
fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
const cardsListPath = path.resolve('cards_list.json');
if (fs.existsSync(cardsListPath)) {
  fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
}
