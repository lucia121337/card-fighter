const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

function stringifyCSV(rows) {
  return rows.map(row => {
    return row.map(val => {
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');
}

function parseKoreanAmount(str) {
  if (!str) return 0;
  let total = 0;
  const cleaned = str.replace(/,/g, '').replace(/\s+/g, '').trim();

  const manMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*만/);
  const chunMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*천/);

  if (manMatch) {
    total += parseFloat(manMatch[1]) * 10000;
    const restChun = cleaned.match(/만\s*(\d+(?:\.\d+)?)\s*(?:천)?/);
    if (restChun && (cleaned.includes('천') || restChun[1] < 10)) {
      total += parseFloat(restChun[1]) * 1000;
    }
  } else if (chunMatch) {
    total += parseFloat(chunMatch[1]) * 1000;
  } else {
    const numOnly = cleaned.match(/\d+/);
    if (numOnly) {
      total = parseInt(numOnly[0], 10);
    }
  }
  return total;
}

function cleanHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// 1. 화이트/블랙리스트 필터링 적용
function isValuableBenefit(title, html) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle || cleanTitle === '유의사항') return false;
  
  const text = (cleanTitle + ' ' + cleanHtml(html));
  
  // 블랙리스트 키워드
  const blacklist = ['현장할인', '자유이용권', '무료입장', '바우처', '라운지', '발렛', '무이자할부', '선택형'];
  if (blacklist.some(k => text.includes(k))) {
    return false;
  }
  
  // 화이트리스트 키워드
  const whitelist = ['청구할인', '할인', '적립', '캐시백', '마일리지'];
  if (whitelist.some(k => text.includes(k))) {
    return true;
  }
  
  return false;
}

// 3. 건당 한도 x 횟수 곱연산 룰 적용
function parseLimitFromText(text) {
  let count = 1;
  const countMatch = text.match(/월\s*(\d+)\s*회/);
  if (countMatch) {
    count = parseInt(countMatch[1], 10);
  }
  
  const perMatch = text.match(/건당\s*(?:최대\s*)?([\d,]+[만천]?\s*원?)/);
  if (perMatch) {
    const perAmt = parseKoreanAmount(perMatch[1]);
    if (perAmt > 0) {
      return perAmt * count; // 곱한 값 리턴
    }
  }
  return null;
}

// Case A: 개별 단독 월 한도 파싱
function extractItemLimit(html) {
  const text = cleanHtml(html);
  if (text.includes('무제한') || text.includes('한도 없음') || text.includes('적립 한도 없이')) {
    return -1;
  }
  
  const patterns = [
    /월\s*최대\s*([\d,]+[만천]?\s*원?)/i,
    /할인\s*한도\s*[:：]?\s*(?:월\s*)?([\d,]+[만천]?\s*원?)/i,
    /최대\s*([\d,]+[만천]?\s*원?)\s*할인/i,
    /건당\s*최대\s*([\d,]+[만천]?\s*원?)/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*한도/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*까지/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*제공/i
  ];
  
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const amt = parseKoreanAmount(m[1]);
      if (amt > 0 && amt < 5000000) return amt;
    }
  }
  
  return -1;
}

// 2. item_limit의 다중 구조화 (티어 배열 또는 단일 숫자 추출)
function extractItemTiers(html) {
  const text = cleanHtml(html);
  
  // 건당 x 횟수 연산 우선 적용
  const multipliedLimit = parseLimitFromText(text);
  
  const map = {};
  
  // 실적 구간별 한도 파싱 (더 유연한 매칭)
  const reRange = /([\d]+(?:\.[\d]+)?)\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과|시)?[^0-9%]{0,50}(?:월\s*|한도\s*|최대\s*)*([\d,]+[만천]?\s*원)/gi;
  let m;
  let safeCount = 0;
  while ((m = reRange.exec(text)) !== null && safeCount++ < 50) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const amt = parseKoreanAmount(m[3]);
    if (amt > 0) map[lo] = amt;
  }

  const reSingle = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)[^0-9%]{0,50}(?:월\s*|한도\s*|최대\s*)*([\d,]+[만천]?\s*원)/gi;
  safeCount = 0;
  while ((m = reSingle.exec(text)) !== null && safeCount++ < 50) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const amt = parseKoreanAmount(m[2]);
    if (amt > 0) {
      if (!map[lo]) map[lo] = amt;
    }
  }
  
  const sorted = Object.entries(map)
    .map(([c, l]) => ({ perf: Number(c), limit: l }))
    .sort((a, b) => a.perf - b.perf);
    
  if (sorted.length > 0) {
    return sorted;
  }
  
  // 티어가 없으면 단독 한도
  if (multipliedLimit !== null) {
    return multipliedLimit;
  }
  
  return extractItemLimit(html);
}

// <strong> 문장 추출 헬퍼
function extractBenefitDetail(html) {
  if (!html) return '';
  const strongMatch = html.match(/<strong>([^<]+)<\/strong>/i);
  if (strongMatch && strongMatch[1].trim()) {
    return strongMatch[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const cleanText = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return cleanText.length > 0 ? cleanText[0] : '';
}

// Case B: 카드 전체 통합 한도 구간 파싱
function extractTotalLimitTiers(keyBenefits) {
  const plains = (keyBenefits || []).map(b => cleanHtml(b.info));
  const fullText = plains.join(' ');
  
  const map = {};
  
  const reRange = /([\d]+(?:\.[\d]+)?)\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*[^:：\d]{0,25}[:：]\s*(?:월\s*)?([\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+\s*(?:원|점|천|만)?)/gi;
  let m;
  let safeCount = 0;
  while ((m = reRange.exec(fullText)) !== null && safeCount++ < 100) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const lim = parseKoreanAmount(m[3]);
    if (lo > 0 && lim > 0 && lim < 5000000) {
      if (!map[lo]) map[lo] = lim;
    }
  }

  const reSingle = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)[^:：\d]{0,25}[:：]\s*(?:월\s*)?([\d]+(?:\.[\d]+)?\s*만\s*(?:[\d]+\s*천)?|[\d,]+)\s*(?:원|점|이상|만원|천원)?/gi;
  safeCount = 0;
  while ((m = reSingle.exec(fullText)) !== null && safeCount++ < 100) {
    const lo = Math.round(parseFloat(m[1]) * 10000);
    const lim = parseKoreanAmount(m[2]);
    if (lo > 0 && lim > 0 && lim < 5000000) {
      if (!map[lo]) map[lo] = lim;
    }
  }

  const sorted = Object.entries(map)
    .map(([c, l]) => ({ perf: Number(c), limit: l }))
    .sort((a, b) => a.perf - b.perf);
    
  return sorted.length > 0 ? sorted : null;
}

// Case C: 그룹 한도 파싱
function extractGroupLimits(keyBenefits, cardIdx) {
  const groups = [];
  keyBenefits.forEach((kb, idx) => {
    const text = cleanHtml(kb.info);
    const bracketMatch = text.match(/\[([^\]]+)\]/);
    const groupLimitMatch = text.match(/(?:서비스\s*통합\s*|통합\s*이용\s*|통합\s*할인\s*한도\s*|통합\s*)(?:월\s*)?([\d,]+[만천]?\s*원?)/);
    
    if (bracketMatch && bracketMatch[1] && groupLimitMatch) {
      const gName = bracketMatch[1].trim();
      const gLimit = parseKoreanAmount(groupLimitMatch[1]);
      if (gLimit > 0) {
        groups.push({
          idx: idx,
          groupId: `group_${cardIdx}_${gName}`,
          groupLimit: gLimit
        });
      }
    }
  });
  return groups;
}

function processMigration() {
  const csvPath = path.join(__dirname, 'cards_updated.csv');
  const fullJsonPath = path.join(__dirname, 'cards_full.json');
  
  if (!fs.existsSync(csvPath) || !fs.existsSync(fullJsonPath)) {
    console.error('필수 파일이 누락되었습니다.');
    return;
  }
  
  const cards = JSON.parse(fs.readFileSync(fullJsonPath, 'utf-8'));
  const cardsMap = {};
  
  cards.forEach(card => {
    const keyBenefits = card.key_benefit || [];
    
    // 1. 전수조사 필터링 (화이트/블랙리스트 적용)
    const validBenefits = keyBenefits.filter(kb => isValuableBenefit(kb.title, kb.info));
    
    const formattedList = [];
    const itemLimits = [];
    const groupIds = [];
    const groupLimits = [];
    
    const groupInfoList = extractGroupLimits(keyBenefits, card.idx);
    
    validBenefits.forEach(kb => {
      const title = (kb.title || '').trim();
      const detail = extractBenefitDetail(kb.info);
      
      if (detail) {
        formattedList.push(`${title}: ${detail}`);
      } else {
        formattedList.push(title);
      }
      
      const limitsData = extractItemTiers(kb.info);
      if (typeof limitsData === 'object' && limitsData !== null) {
        itemLimits.push(JSON.stringify(limitsData));
      } else {
        itemLimits.push(limitsData);
      }
      
      const originalIdx = keyBenefits.indexOf(kb);
      const gInfo = groupInfoList.find(g => g.idx === originalIdx);
      if (gInfo) {
        groupIds.push(gInfo.groupId);
        groupLimits.push(gInfo.groupLimit);
      } else {
        groupIds.push('none');
        groupLimits.push(-1);
      }
    });
    
    const totalTiers = extractTotalLimitTiers(keyBenefits);
    
    // top_benefit_summary를 validBenefits 목록과 인덱스를 맞추어 빌드
    const rawItems = validBenefits.map(kb => {
      const title = (kb.title || '').trim();
      const detail = extractBenefitDetail(kb.info);
      
      let rateText = '';
      const pctM = detail.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pctM) {
        rateText = ` ${pctM[1]}%`;
      } else {
        const wonM = detail.match(/(\d+[,0-9]*)\s*(?:원|점)\s*(?:청구)?할인/);
        if (wonM) {
          rateText = ` ${wonM[1]}원`;
        }
      }
      return `${title}:${rateText || ' 할인'}`;
    });

    cardsMap[String(card.idx)] = {
      top_benefit_summary: rawItems.join(' | '),
      detailed_benefits: formattedList.join(' | '),
      item_limit: itemLimits.join(' | '),
      group_id: groupIds.join(' | '),
      group_limit: groupLimits.join(' | '),
      total_limit_tiers: totalTiers ? JSON.stringify(totalTiers) : 'null'
    };
  });
  
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  if (rows.length > 0) {
    const header = rows[0];
    const idxIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'idx');
    const summaryIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'top_benefit_summary');
    const detailedIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'detailed_benefits');
    const itemLimitIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'item_limit');
    const groupIdIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'group_id');
    const groupLimitIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'group_limit');
    const totalLimitTiersIdx = header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === 'total_limit_tiers');
    
    let updatedCount = 0;
    for (let i = 1; i < rows.length; i++) {
      const cardIdx = String(rows[i][idxIdx]).trim();
      const mapped = cardsMap[cardIdx];
      if (mapped) {
        rows[i][summaryIdx] = mapped.top_benefit_summary;
        rows[i][detailedIdx] = mapped.detailed_benefits;
        rows[i][itemLimitIdx] = mapped.item_limit;
        rows[i][groupIdIdx] = mapped.group_id;
        rows[i][groupLimitIdx] = mapped.group_limit;
        rows[i][totalLimitTiersIdx] = mapped.total_limit_tiers;
        updatedCount++;
      }
    }
    
    fs.writeFileSync(csvPath, '\ufeff' + stringifyCSV(rows), 'utf-8');
    console.log(`성공: 총 ${updatedCount}개 카드의 전수조사 한도 데이터를 cards_updated.csv에 병합 완료했습니다.`);
  }
}

try {
  processMigration();
} catch (err) {
  console.error('에러 발생:', err);
}
