/**
 * extract_all.js — 범용 카드 데이터 전처리 엔진
 *
 * cards_full.json 전체 카드 배열을 순회하며 5가지 범용 Rule을 적용해
 * cards_updated.csv의 한도/혜택 열을 갱신한다.
 *
 * Rule 1: 화이트/블랙리스트 필터링
 * Rule 2: 건당 O원 × 월 O회 승수 연산 → item_limit 최대치 자동 연산
 * Rule 3: <table> 태그 및 전월실적/한도 텍스트 구조 → [{perf, limit}] 배열 추출
 * Rule 4: 통과 혜택만 '대제목: 소제목' 형태로 묶어 | 연결 → detailed_benefits 열 생성
 * Rule 5: 파싱 실패 혜택 → item_limit: -1 (무제한/수동확인), 실패 명단 콘솔 출력
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════
 * 공통 유틸
 * ═══════════════════════════════════════════════ */

/** HTML 태그·HTML 엔티티 제거 후 단일 공백으로 정규화 */
function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * [금액 변환 및 구간 배열 강제 룰]
 * 숫자/한글 혼용 금액 변환 룰: 약관에 '1만3천원', '1.5만원', '일만오천원' 등 한글 단위가 섞인 금액 표기가 등장하면, 
 * 절대 무시하거나 누락하지 말고 반드시 순수 정수(예: 13000, 15000)로 변환해서 추출해라. 
 * 특히 전월 실적(perf) 구간에 따라 한도가 다를 경우, 첫 번째 조건만 가져오지 말고 모든 구간을 파악하여 반드시 배열(Array) 형태로 `item_limit`을 작성해라.
 * 
 * Few-Shot 예시:
 * 원문: "전월 이용금액 40만원 이상 시 월 1만원, 80만원 이상 시 월 1만3천원 한도"
 * 출력:
 * "item_limit": [
 *   {"perf": 400000, "limit": 10000},
 *   {"perf": 800000, "limit": 13000}
 * ]
 *
 * 한국어 금액 문자열 → 숫자(원) 변환 (순수 정수 13000, 15000 등 변환 보장)
 * 예) "3만원" → 30000 / "1만 3천원" → 13000 / "1만3천원" → 13000 / "1.5만원" → 15000 / "500,000원" → 500000
 */
function parseKoreanAmount(str) {
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

/* ═══════════════════════════════════════════════
 * Rule 1: 화이트/블랙리스트 필터링
 * ═══════════════════════════════════════════════ */

const WHITELIST = ['청구할인', '할인', '적립', '캐시백', '마일리지'];
const BLACKLIST = ['현장할인', '입장권', '무료', '라운지', '발렛', '바우처', '무이자할부', '선택형'];

/**
 * @returns {boolean} 포함할 혜택이면 true
 */
function isValuableBenefit(title, html) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle || cleanTitle === '유의사항') return false;

  const text = cleanTitle + ' ' + cleanHtml(html);

  if (BLACKLIST.some(k => text.includes(k))) return false;
  if (WHITELIST.some(k => text.includes(k))) return true;
  return false;
}

/* ═══════════════════════════════════════════════
 * Rule 2: 건당 × 횟수 승수 연산
 * ═══════════════════════════════════════════════ */

/**
 * 텍스트에서 "건당 O원"과 "월 O회" 패턴을 동시 발견하면 곱한 값을 반환.
 * 패턴을 찾지 못하면 null 반환.
 */
function parseMultipliedLimit(text) {
  const countMatch = text.match(/월\s*(\d+)\s*회/);
  const perMatch   = text.match(/건당\s*(?:최대\s*)?([\d,]+[만천]?\s*원?)/);

  if (countMatch && perMatch) {
    const count  = parseInt(countMatch[1], 10);
    const perAmt = parseKoreanAmount(perMatch[1]);
    if (perAmt > 0 && count > 0) return perAmt * count;
  }
  return null;
}

/* ═══════════════════════════════════════════════
 * Rule 3: 표/계층 파싱 → [{perf, limit}] 배열
 * ═══════════════════════════════════════════════ */

/**
 * <table> 태그 파싱: 첫 번째 행/열이 실적, 두 번째가 한도인 구조를 가정.
 * 파싱에 성공하면 [{perf, limit}] 배열, 실패하면 null 반환.
 */
function parseTableTiers(html) {
  if (!html || !html.includes('<table')) return null;

  const tiers = [];

  // tr 추출
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  const rows = [];
  while ((trMatch = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      cells.push(cleanHtml(tdMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }

  // 헤더 행 제외 후 실적/한도 쌍 추출 시도
  for (const row of rows) {
    if (row.length < 2) continue;
    // 각 셀에서 숫자 추출
    for (let i = 0; i < row.length - 1; i++) {
      const perf  = parseKoreanAmount(row[i]);
      const limit = parseKoreanAmount(row[i + 1]);
      // limit은 최소 1,000원 이상이어야 하고, 연도 범위(2020~2040) 숫자는 제외
      if (perf > 0 && limit >= 1000 && limit < 5000000 && !(limit >= 2020 && limit <= 2040)) {
        // 실적 값이 한도 값보다 큰 경우만 (실적 > 혜택한도가 일반적)
        if (perf > limit || perf >= 10000) {
          tiers.push({ perf, limit });
          break;
        }
      }
    }
  }

  // 중복 제거 및 정렬
  const seen = new Set();
  const unique = tiers.filter(t => {
    const key = `${t.perf}_${t.limit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.perf - b.perf);

  return unique.length > 0 ? unique : null;
}

/**
 * "전월실적 ... 한도" 또는 "O만원 이상 → O만원 한도" 텍스트 패턴 파싱
 * 파싱 성공 시 [{perf, limit}] 배열, 실패 시 null 반환.
 */
function parseTextTiers(text) {
  const map = {};

  // 패턴A: "30만~50만원" 범위 + 한도
  const reRange = /([\d]+(?:\.[\d]+)?)\s*~\s*([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과|시)?[^0-9%]{0,60}(?:월\s*|한도\s*|최대\s*)*([\d,]+[만천]?\s*원)/gi;
  let m;
  let safe = 0;
  while ((m = reRange.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[3]);
    // limit은 최소 1,000원 이상, 실적보다 작아야 합리적
    if (perf > 0 && limit >= 1000 && limit < 5000000 && !map[perf]) map[perf] = limit;
  }

  // 패턴B: "30만원 이상" 단일 + 한도
  const reSingle = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*(?:이상|초과)[^0-9%]{0,60}(?:월\s*|한도\s*|최대\s*)*([\d,]+[만천]?\s*원)/gi;
  safe = 0;
  while ((m = reSingle.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[2]);
    if (perf > 0 && limit >= 1000 && limit < 5000000 && !map[perf]) map[perf] = limit;
  }

  // 패턴C: "전월실적 O만원: 월 한도 O만원" 콜론 구조
  // 연도(2024~2030) 같은 숫자가 limit으로 파싱되는 것을 방지
  const reColon = /([\d]+(?:\.[\d]+)?)\s*만\s*원?\s*[:：][^0-9]{0,30}(?:월\s*)?(?:최대\s*)?([\d,]+[만천]?\s*원)/gi;
  safe = 0;
  while ((m = reColon.exec(text)) !== null && safe++ < 50) {
    const perf  = Math.round(parseFloat(m[1]) * 10000);
    const limit = parseKoreanAmount(m[2]);
    // 연도 범위(2020~2035) 또는 1000원 미만이면 skip
    if (perf > 0 && limit >= 1000 && limit < 5000000 && !(limit >= 2020 && limit <= 2040) && !map[perf]) {
      map[perf] = limit;
    }
  }


  const sorted = Object.entries(map)
    .map(([p, l]) => ({ perf: Number(p), limit: l }))
    .sort((a, b) => a.perf - b.perf);

  return sorted.length > 0 ? sorted : null;
}

/* ═══════════════════════════════════════════════
 * 개별 item_limit 단독 추출 (티어 없을 때)
 * ═══════════════════════════════════════════════ */

function extractSingleLimit(text) {
  if (text.includes('무제한') || text.includes('한도 없음') || text.includes('적립 한도 없이')) {
    return -1;
  }

  const patterns = [
    /월\s*최대\s*([\d,]+[만천]?\s*원?)/i,
    /할인\s*한도\s*[:：]?\s*(?:월\s*)?([\d,]+[만천]?\s*원?)/i,
    /최대\s*([\d,]+[만천]?\s*원?)\s*할인/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*한도/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*까지/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*제공/i,
    /월\s*([\d,]+[만천]?\s*원?)\s*적립/i,
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

/* ═══════════════════════════════════════════════
 * 통합 item_limit 추출 (Rule 2+3 우선, 단독 fallback)
 * ═══════════════════════════════════════════════ */

/**
 * 혜택 HTML에서 item_limit 값을 추출.
 * @returns {Array|number} 티어 배열 [{perf,limit}] 또는 단독 숫자/-1
 */
function extractItemLimit(html) {
  const text = cleanHtml(html);

  // Rule 3-A: 테이블 우선
  const tableTiers = parseTableTiers(html);
  if (tableTiers) return tableTiers;

  // Rule 3-B: 텍스트 계층
  const textTiers = parseTextTiers(text);
  if (textTiers) return textTiers;

  // Rule 2: 승수 연산
  const multiplied = parseMultipliedLimit(text);
  if (multiplied !== null) return multiplied;

  // 단독 한도 fallback
  return extractSingleLimit(text);
}

/* ═══════════════════════════════════════════════
 * 총 통합 한도 (total_limit_tiers) 추출
 * ═══════════════════════════════════════════════ */

function extractTotalLimitTiers(keyBenefits) {
  const fullText = (keyBenefits || []).map(b => cleanHtml(b.info)).join(' ');
  return parseTextTiers(fullText);
}

/* ═══════════════════════════════════════════════
 * 그룹 한도 추출
 * ═══════════════════════════════════════════════ */

function extractGroupLimits(keyBenefits, cardIdx) {
  const groups = [];
  (keyBenefits || []).forEach((kb, idx) => {
    const text = cleanHtml(kb.info);
    const bracketMatch    = text.match(/\[([^\]]+)\]/);
    const groupLimitMatch = text.match(/(?:서비스\s*통합\s*|통합\s*이용\s*|통합\s*할인\s*한도\s*|통합\s*)(?:월\s*)?([\d,]+[만천]?\s*원?)/);

    if (bracketMatch && groupLimitMatch) {
      const gName  = bracketMatch[1].trim();
      const gLimit = parseKoreanAmount(groupLimitMatch[1]);
      if (gLimit > 0) {
        groups.push({ idx, groupId: `group_${cardIdx}_${gName}`, groupLimit: gLimit });
      }
    }
  });
  return groups;
}

/* ═══════════════════════════════════════════════
 * Rule 4: detailed_benefits 문자열 결합
 * ═══════════════════════════════════════════════ */

/** <strong> 태그 또는 첫 번째 의미 있는 문장 추출 */
function extractBenefitDetail(html) {
  if (!html) return '';
  const strongM = html.match(/<strong>([^<]+)<\/strong>/i);
  if (strongM && strongM[1].trim()) {
    return strongM[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const lines = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[0] : '';
}

/* ═══════════════════════════════════════════════
 * CSV 파서 / 직렬화
 * ═══════════════════════════════════════════════ */

function parseCSV(text) {
  const lines = [];
  let row = [''];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], nx = text[i + 1];
    if (c === '"') {
      if (inQ && nx === '"') { row[row.length - 1] += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && nx === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines;
}

function stringifyCSV(rows) {
  return rows.map(row =>
    row.map(val => {
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
}

/* ═══════════════════════════════════════════════
 * 메인: 전체 카드 처리
 * ═══════════════════════════════════════════════ */

function processAll() {
  const csvPath      = path.join(__dirname, 'cards_updated.csv');
  const fullJsonPath = path.join(__dirname, 'cards_full.json');

  if (!fs.existsSync(csvPath) || !fs.existsSync(fullJsonPath)) {
    console.error('[오류] 필수 파일이 누락되었습니다. cards_updated.csv / cards_full.json 확인 필요');
    return;
  }

  console.log('[INFO] cards_full.json 로딩 중...');
  const cards = JSON.parse(fs.readFileSync(fullJsonPath, 'utf-8'));
  console.log(`[INFO] 총 ${cards.length}개 카드 처리 시작`);

  /** Rule 5: 파싱 실패 명단 수집 */
  const failedCards = [];

  const cardsMap = {};

  for (const card of cards) {
    const cardIdx  = String(card.idx);
    const cardName = card.card_name || card.name || '(이름없음)';
    const kb       = card.key_benefit || [];

    let hasParseError = false;

    // Rule 1 필터링
    const validBenefits = kb.filter(b => isValuableBenefit(b.title, b.info));

    const formattedList = []; // Rule 4: detailed_benefits
    const itemLimits    = [];
    const groupIds      = [];
    const groupLimits   = [];

    // 그룹 한도 정보 사전 추출
    const groupInfoList = extractGroupLimits(kb, cardIdx);

    for (const benefit of validBenefits) {
      const title  = (benefit.title || '').trim();
      const detail = extractBenefitDetail(benefit.info);

      // Rule 4: 대제목: 소제목 결합
      formattedList.push(detail ? `${title}: ${detail}` : title);

      // Rule 2+3: item_limit 추출 (예외 방어)
      let limVal;
      try {
        limVal = extractItemLimit(benefit.info);
        // 숫자인데 비정상적으로 크거나 NaN → -1 처리
        if (typeof limVal === 'number' && (isNaN(limVal) || !isFinite(limVal))) {
          limVal = -1;
          hasParseError = true;
        }
      } catch (e) {
        // Rule 5: 파싱 실패 시 -1로 안전 처리
        limVal = -1;
        hasParseError = true;
      }

      itemLimits.push(
        Array.isArray(limVal) ? JSON.stringify(limVal) : String(limVal)
      );

      // 그룹 정보 매핑
      const origIdx = kb.indexOf(benefit);
      const gInfo   = groupInfoList.find(g => g.idx === origIdx);
      if (gInfo) {
        groupIds.push(gInfo.groupId);
        groupLimits.push(gInfo.groupLimit);
      } else {
        groupIds.push('none');
        groupLimits.push(-1);
      }
    }

    // Case B: 총 통합 한도 추출
    let totalTiers = null;
    try {
      totalTiers = extractTotalLimitTiers(kb);
    } catch (e) {
      totalTiers = null;
      hasParseError = true;
    }

    // Rule 5: 파싱 실패 카드 수집 (item_limit이 전부 -1이고 유효 혜택이 있는 경우)
    if (hasParseError || (validBenefits.length > 0 && itemLimits.every(v => v === '-1'))) {
      failedCards.push({ idx: cardIdx, card_name: cardName });
    }

    // top_benefit_summary 생성
    const rawSummaryItems = validBenefits.map(b => {
      const title  = (b.title || '').trim();
      const detail = extractBenefitDetail(b.info);
      const pctM   = detail.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pctM)  return `${title}: ${pctM[1]}%`;
      const wonM = detail.match(/(\d+[,0-9]*)\s*(?:원|점)\s*(?:청구)?할인/);
      if (wonM)  return `${title}: ${wonM[1]}원`;
      return `${title}: 할인`;
    });

    cardsMap[cardIdx] = {
      top_benefit_summary : rawSummaryItems.join(' | '),
      detailed_benefits   : formattedList.join(' | '),
      item_limit          : itemLimits.join(' | '),
      group_id            : groupIds.join(' | '),
      group_limit         : groupLimits.join(' | '),
      total_limit_tiers   : totalTiers ? JSON.stringify(totalTiers) : 'null',
    };
  }

  /* ── CSV 업데이트 ── */
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  // BOM 제거 후 파싱
  const csvClean = csvText.replace(/^\uFEFF+/, '');
  const rows     = parseCSV(csvClean);

  if (rows.length === 0) {
    console.error('[오류] CSV 파일이 비어있습니다.');
    return;
  }

  const header = rows[0];
  const col = name => header.findIndex(h => h.replace(/[^a-zA-Z0-9_]/g, '').trim() === name);

  const idxCol             = col('idx');
  const summaryCol         = col('top_benefit_summary');
  const detailedCol        = col('detailed_benefits');
  const itemLimitCol       = col('item_limit');
  const groupIdCol         = col('group_id');
  const groupLimitCol      = col('group_limit');
  const totalLimitTiersCol = col('total_limit_tiers');

  // 필수 열 검증
  if ([idxCol, summaryCol, detailedCol, itemLimitCol, groupIdCol, groupLimitCol, totalLimitTiersCol].some(c => c === -1)) {
    console.error('[오류] CSV 헤더에 필요한 열이 없습니다. 헤더:', header.join(', '));
    return;
  }

  let updatedCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const cardIdx = String(rows[i][idxCol] || '').trim();
    const mapped  = cardsMap[cardIdx];
    if (mapped) {
      rows[i][summaryCol]         = mapped.top_benefit_summary;
      rows[i][detailedCol]        = mapped.detailed_benefits;
      rows[i][itemLimitCol]       = mapped.item_limit;
      rows[i][groupIdCol]         = mapped.group_id;
      rows[i][groupLimitCol]      = mapped.group_limit;
      rows[i][totalLimitTiersCol] = mapped.total_limit_tiers;
      updatedCount++;
    }
  }

  fs.writeFileSync(csvPath, '\uFEFF' + stringifyCSV(rows), 'utf-8');
  console.log(`\n[완료] 총 ${updatedCount}개 카드의 전수 한도 데이터를 cards_updated.csv에 병합 완료`);

  /* ── Rule 5: 파싱 실패/예외 처리 명단 출력 ── */
  if (failedCards.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[파싱 실패/예외 처리 명단] — 총 ${failedCards.length}건`);
    console.log('(item_limit: -1 로 안전 처리됨 — 수동 확인 필요)');
    console.log('='.repeat(60));
    failedCards.forEach(c => {
      console.log(`  idx: ${String(c.idx).padEnd(6)} | ${c.card_name}`);
    });
    console.log('='.repeat(60));
  } else {
    console.log('[INFO] 파싱 실패 카드 없음 — 모든 카드 정상 처리');
  }
}

/* ── 실행 ── */
try {
  processAll();
} catch (err) {
  console.error('[치명적 오류]', err);
}
