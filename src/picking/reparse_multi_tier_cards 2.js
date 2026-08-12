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
          total += (n < 10) ? n * 1000 : n;
        }
      }
    }
  } else if (s.includes('천')) {
    const chunMatch = s.match(/(\d+(?:\.\d+)?)천/);
    if (chunMatch) total += Math.round(parseFloat(chunMatch[1]) * 1000);
  } else {
    const numOnly = s.match(/\d+/);
    if (numOnly) total = parseInt(numOnly[0], 10);
  }
  return total;
}

/**
 * 정밀 다중 실적 구간 파서 (Master Rule 적용)
 * - 약관 텍스트의 각 문장/줄 단위로 [최소 실적 기준]과 [해당 한도]를 1:1 쌍으로 매핑
 * - "30만원 이상 70만원 미만 시: 1만원" -> perf: 300000, limit: 10000 (최하위 구간 누락 및 Shift 완전 방지)
 */
export function parseMultiTierLimits(text) {
  if (!text) return null;
  const map = new Map();

  const lines = text.replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<\/li>/gi, '\n')
                    .split(/\n+/);

  for (let line of lines) {
    line = line.replace(/<[^>]+>/g, '').trim();
    if (!line) continue;

    const minPerfMatch = line.match(/([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*이상/);
    if (!minPerfMatch) continue;

    const perf = Math.round(parseFloat(minPerfMatch[1]) * 10000);
    if (perf < 100000) continue;

    // 조건 분기 후 혜택 한도 추출 (콜론, 시:, 또는 실적 영역 제외 후 탐색)
    let afterCondition = line;
    if (line.includes('시:')) {
      afterCondition = line.split('시:')[1];
    } else if (line.includes(':')) {
      afterCondition = line.split(':')[1];
    } else {
      afterCondition = line.replace(/[\d]+(?:\.[\d]+)?\s*만\s*원?\s*(?:이상|미만|이하|~)/g, '');
    }

    const limitMatch = afterCondition.match(/([\d,]+[만천]?\s*원|[\d.]+\s*만\s*원)/);
    if (limitMatch) {
      const limit = parseKoreanAmount(limitMatch[1]);
      if (limit >= 1000 && limit <= 300000 && perf > limit) {
        map.set(perf, limit);
      }
    }
  }

  const sorted = Array.from(map.entries())
    .map(([perf, limit]) => ({ perf, limit }))
    .sort((a, b) => a.perf - b.perf);

  return sorted.length > 0 ? sorted : null;
}

// 스크립트 메인 처리
const rootDir = path.resolve('.');
const cardsFullPath = path.join(rootDir, 'cards_full.json');

if (fs.existsSync(cardsFullPath)) {
  const cardsFull = JSON.parse(fs.readFileSync(cardsFullPath, 'utf8'));

  let scannedTargets = [];
  let patchedCardsCount = 0;

  cardsFull.forEach(card => {
    let fullText = '';
    if (Array.isArray(card.key_benefit)) {
      card.key_benefit.forEach(b => { fullText += (b.info || '') + ' '; });
    }
    if (card.detailed_benefits) {
      fullText += String(card.detailed_benefits) + ' ';
    }

    // 조건 2: 3개 이상 실적 구간 또는 "이상/미만" 조건 2회 이상 연속 등장하는 복합 카드 선별
    const rangeKeywordMatches = fullText.match(/(?:이상|미만|이하|~)/g);
    const multiTierCount = (rangeKeywordMatches || []).length;
    const isMultiTierTarget = multiTierCount >= 2;

    if (isMultiTierTarget) {
      scannedTargets.push(card.idx);

      let modified = false;
      const keyBenefits = card.key_benefit || [];

      if (Array.isArray(card.structured_benefits)) {
        card.structured_benefits.forEach((bItem, idx) => {
          const kb = keyBenefits[idx];
          const textToParse = (kb ? kb.info : '') + ' ' + (bItem.detail || '');
          const parsedTiers = parseMultiTierLimits(textToParse);

          if (parsedTiers && parsedTiers.length >= 2) {
            bItem.item_limit = parsedTiers;
            modified = true;
          }
        });
      }

      if (modified) {
        patchedCardsCount++;
        card.item_limit = card.structured_benefits
          .map(b => JSON.stringify(b.item_limit))
          .join(' | ');

        const detailPath = path.join(rootDir, 'card_detail', `${card.idx}.json`);
        if (fs.existsSync(detailPath)) {
          try {
            const dObj = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            dObj.structured_benefits = card.structured_benefits;
            dObj.item_limit = card.item_limit;
            fs.writeFileSync(detailPath, JSON.stringify(dObj, null, 2), 'utf8');
          } catch (e) {}
        }
      }
    }
  });

  fs.writeFileSync(cardsFullPath, JSON.stringify(cardsFull, null, 2), 'utf8');
  const cardsListPath = path.join(rootDir, 'cards_list.json');
  if (fs.existsSync(cardsListPath)) {
    fs.writeFileSync(cardsListPath, JSON.stringify(cardsFull, null, 2), 'utf8');
  }

  console.log(`==========================================`);
  console.log(`🚀 [Multi-Tier 구간 파싱 & 일괄 패치 완료]`);
  console.log(`선별된 다중 실적 구간 타겟 카드: ${scannedTargets.length}개`);
  console.log(`정밀 1:1 매핑 패치 적용 완료 카드: ${patchedCardsCount}개`);
  console.log(`==========================================`);
}
