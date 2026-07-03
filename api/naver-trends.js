import { readFileSync } from 'fs';
import { join } from 'path';

// 유사 혜택 태그 묶음 (카드별 benefit_categories 집계 시 동의어로 취급)
const SYNONYM_GROUPS = {
  '카페':      ['카페', '커피/디저트', '베이커리'],
  '온라인쇼핑': ['온라인쇼핑', '소셜커머스', '홈쇼핑'],
  '대중교통':   ['대중교통', '택시', '기차', '고속버스', '고속버스/기차', '하이패스'],
  '편의점':    ['편의점', '마트/편의점'],
  '주유소':    ['주유소', '충전소', '충전소(전기/LPG)'],
  '영화':      ['영화', '공연/전시'],
  '해외이용':   ['해외이용', '해외결제', '면세점', '공항라운지', '공항라운지/PP', 'PP', '항공권', '항공', '대한항공', '아시아나항공', '여행사', '온라인 여행사', '리조트', '환전・ATM', '저가항공', '제주항공', '진에어', '에어부산', '이스타항공', '티웨이항공'],
  '대형마트':   ['대형마트', 'SSM'],
  '백화점':    ['백화점', '백화점/아울렛', '아울렛'],
  '통신비':    ['통신비', 'KT', 'LGU+', 'SKT'],
  '디지털구독': ['디지털구독', '스트리밍(넷플릭스', '티빙 등)'],
  '병원':      ['병원', '동물병원', '약국'],
  '패밀리레스토랑': ['패밀리레스토랑', '일반음식점', '패스트푸드', '음식점'],
};
const GENERIC_TAGS = new Set(['기타', '국내외가맹점', '모든가맹점', '제휴/PLCC', '적립', '생활', '프리미엄 서비스', '프리미엄서비스', '할인', '수수료우대', '무이자할부', '선택형', '유의사항']);

function benefitKeywordRanking() {
  const TAG_TO_GROUP = {};
  for (const [group, tags] of Object.entries(SYNONYM_GROUPS)) {
    for (const tag of tags) TAG_TO_GROUP[tag] = group;
  }
  const cards = JSON.parse(readFileSync(join(process.cwd(), 'cards_list.json'), 'utf-8'));
  const cardCountByGroup = {};
  for (const card of cards) {
    const tags = (card.benefit_categories || '').split(',').map(s => s.trim()).filter(Boolean);
    const groupsInCard = new Set();
    for (const tag of tags) {
      if (GENERIC_TAGS.has(tag)) continue;
      groupsInCard.add(TAG_TO_GROUP[tag] || tag);
    }
    for (const group of groupsInCard) cardCountByGroup[group] = (cardCountByGroup[group] || 0) + 1;
  }
  return Object.entries(cardCountByGroup)
    .sort((a, b) => b[1] - a[1])
    .map(([keyword, count]) => ({ keyword, count }));
}

// 서버 실행 환경의 로컬 타임존과 무관하게 KST(UTC+9) 기준 날짜를 UTC getter로 안전하게 다룬다
// (toISOString()은 로컬 자정을 UTC로 변환하면서 하루 밀리는 문제가 있어 사용하지 않음)
function nowKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return { y: kst.getUTCFullYear(), m: kst.getUTCMonth(), d: kst.getUTCDate() };
}
const pad = n => String(n).padStart(2, '0');
const fmt = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function getRange(unit) {
  const { y, m, d } = nowKST();
  const endDate = fmt(y, m, d);

  if (unit === 'month') {
    const start = new Date(Date.UTC(y, m - 11, 1));
    return { startDate: fmt(start.getUTCFullYear(), start.getUTCMonth(), 1), endDate, naverUnit: 'month' };
  }
  if (unit === 'week') {
    // 최근 5주차 (네이버가 자체적으로 주 단위 버킷을 나눠주므로 4주(28일) 전부터 요청)
    const start = new Date(Date.UTC(y, m, d - 28));
    return { startDate: fmt(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()), endDate, naverUnit: 'week' };
  }
  // 일별: 최근 30일. 단, 오늘이 말일이면 이번 달 1일~말일까지 표기
  if (d === daysInMonth(y, m)) {
    return { startDate: fmt(y, m, 1), endDate, naverUnit: 'date' };
  }
  const start = new Date(Date.UTC(y, m, d - 29));
  return { startDate: fmt(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()), endDate, naverUnit: 'date' };
}

// 키워드를 개별 요청으로 나눠 조회하면 검색량이 적은 키워드는 네이버가 앞쪽 구간을 잘라서 돌려줄 때가 있어
// 데이터 길이가 서로 달라질 수 있다. 전체 결과의 period 합집합을 기준으로 빈 구간을 0으로 채워 정렬한다.
function alignResultsToCommonPeriods(results) {
  const allPeriods = new Set();
  for (const r of results) for (const p of r.data) allPeriods.add(p.period);
  const sortedPeriods = Array.from(allPeriods).sort();
  return results.map(r => {
    const ratioByPeriod = new Map(r.data.map(p => [p.period, p.ratio]));
    return { ...r, data: sortedPeriods.map(period => ({ period, ratio: ratioByPeriod.get(period) ?? 0 })) };
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callNaverDataLab(body, creds, retries = 2) {
  try {
    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': creds.id,
        'X-Naver-Client-Secret': creds.secret,
      },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch (e) {
    // 짧은 시간에 요청이 몰리면 네이버 쪽에서 연결이 끊기는 경우가 있어 살짝 쉬었다 재시도
    if (retries > 0) { await sleep(300); return callNaverDataLab(body, creds, retries - 1); }
    throw e;
  }
}

// 여러 키워드 그룹을 전부 Promise.all로 한꺼번에 쏘면 네이버 쪽 요청 폭주로 "fetch failed"가 나서,
// 소수(concurrency)씩 나눠 쏘아 부하는 줄이면서도 완전 순차보다는 빠르게 처리한다.
async function callNaverDataLabBatched(bodies, creds, concurrency = 3) {
  const out = [];
  for (let i = 0; i < bodies.length; i += concurrency) {
    const batch = bodies.slice(i, i + concurrency);
    out.push(...await Promise.all(batch.map(b => callNaverDataLab(b, creds))));
    if (i + concurrency < bodies.length) await sleep(150);
  }
  return out;
}

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// 네이버 API 호출 횟수를 줄이기 위한 짧은 인메모리 캐시.
// 어차피 1시간 주기로 자동 재조회되므로, 그보다 짧은 TTL 안에서는 캐시로 응답해 요청 폭주/쿼터 낭비를 막는다.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분
const responseCache = new Map();
function getCached(key) {
  const hit = responseCache.get(key);
  return hit && Date.now() - hit.ts < CACHE_TTL_MS ? hit.data : null;
}
function setCached(key, data) {
  responseCache.set(key, { data, ts: Date.now() });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NAVER_CLIENT_ID = (process.env.NAVER_CLIENT_ID || '').replace(/^﻿/, '').trim();
  const NAVER_CLIENT_SECRET = (process.env.NAVER_CLIENT_SECRET || '').replace(/^﻿/, '').trim();
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  }
  const creds = { id: NAVER_CLIENT_ID, secret: NAVER_CLIENT_SECRET };

  const unit = ['date', 'week', 'month'].includes(req.query.unit) ? req.query.unit : 'month';
  const { startDate, endDate, naverUnit } = getRange(unit);
  const fullRanking = benefitKeywordRanking();

  try {
    // 전체 혜택 키워드를 실제 네이버 검색량 기준으로 내림차순 정렬 (더보기 모달용)
    // Naver DataLab은 한 요청(최대 5개 키워드) 안에서만 상대값(0~100)이 비교 가능하므로,
    // 모든 요청에 공통 기준 키워드(anchor)를 끼워 넣어 요청 간 스케일을 맞춰 병합한다.
    if (req.query.mode === 'all') {
      const cacheKey = `all:${unit}`;
      const cached = getCached(cacheKey);
      if (cached) return res.status(200).json(cached);

      const candidatePool = fullRanking.slice(0, 25).map(r => r.keyword);
      const anchor = candidatePool[0];
      const others = candidatePool.slice(1);
      const chunks = chunk(others, 4); // anchor + 4개씩 = 요청당 5개 키워드
      const chunkBodies = chunks.map(group => ({
        startDate, endDate, timeUnit: naverUnit,
        keywordGroups: [anchor, ...group].map(kw => ({ groupName: kw, keywords: [kw] })),
      }));
      const chunkResponses = await callNaverDataLabBatched(chunkBodies, creds);

      let baselineAnchorRatio = null;
      const merged = [];
      for (const cr of chunkResponses) {
        if (!cr.results) continue;
        const anchorResult = cr.results.find(r => r.title === anchor);
        const anchorRatio = anchorResult?.data[anchorResult.data.length - 1]?.ratio || 0;
        if (baselineAnchorRatio === null) baselineAnchorRatio = anchorRatio || 1;
        const scale = anchorRatio ? baselineAnchorRatio / anchorRatio : 1;
        for (const r of cr.results) {
          if (r.title === anchor) {
            if (merged.some(m => m.keyword === anchor)) continue; // anchor는 한 번만 포함
            merged.push({ keyword: anchor, latest: baselineAnchorRatio });
            continue;
          }
          const latest = (r.data[r.data.length - 1]?.ratio || 0) * scale;
          merged.push({ keyword: r.title, latest });
        }
      }
      merged.sort((a, b) => b.latest - a.latest);
      const payload = { unit, allKeywordSearchRanking: merged };
      setCached(cacheKey, payload);
      return res.status(200).json(payload);
    }

    const cacheKey = `main:${unit}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    // 실제 카드 데이터의 혜택 카테고리 상위 5개(유사어 병합)로 키워드 5개를 실시간 자동 선정.
    // 5개를 한 요청에 묶으면 네이버가 그 안에서 제일 큰 값을 100으로 정규화해서
    // 검색량이 작은 키워드는 0에 눌려버리므로, 키워드마다 따로 요청해 각자의 상대 추이로 비교한다.
    const topBenefits = fullRanking.slice(0, 5).map(r => r.keyword);
    const perKeywordBodies = topBenefits.map(kw => ({
      startDate, endDate, timeUnit: naverUnit,
      keywordGroups: [{ groupName: kw, keywords: [kw] }],
    }));
    const perKeywordResponses = await callNaverDataLabBatched(perKeywordBodies, creds);
    const firstBad = perKeywordResponses.find(r => !r.results || !r.results[0]);
    if (firstBad) return res.status(500).json({ error: firstBad.errorMessage || firstBad.message || 'Naver DataLab 응답 오류' });
    const results = alignResultsToCommonPeriods(perKeywordResponses.map(r => r.results[0]));
    const payload = { unit, results };
    setCached(cacheKey, payload);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
