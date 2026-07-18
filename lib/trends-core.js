import { readFileSync } from 'fs';
import { join } from 'path';

// benefit_categories는 24개 표준 카테고리로 이미 정리(중복 제거)되어 있어 동의어 병합이 필요 없다.
// 전체카드 탭의 24개 카테고리 알약과 1:1로 맞추기 위해 트렌드 키워드도 24개 전부를 순위 비교 대상으로 삼는다.
export function benefitKeywordRanking() {
  const cards = JSON.parse(readFileSync(join(process.cwd(), 'cards_list.json'), 'utf-8'));
  const cardCountByCategory = {};
  for (const card of cards) {
    const cats = (card.benefit_categories || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const cat of cats) {
      cardCountByCategory[cat] = (cardCountByCategory[cat] || 0) + 1;
    }
  }
  return Object.entries(cardCountByCategory)
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

export function getRange(unit) {
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
export function alignResultsToCommonPeriods(results) {
  const allPeriods = new Set();
  for (const r of results) for (const p of r.data) allPeriods.add(p.period);
  const sortedPeriods = Array.from(allPeriods).sort();
  return results.map(r => {
    const ratioByPeriod = new Map(r.data.map(p => [p.period, p.ratio]));
    return { ...r, data: sortedPeriods.map(period => ({ period, ratio: ratioByPeriod.get(period) ?? 0 })) };
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// fetch에 타임아웃이 없으면(네이티브 fetch 기본값) 네이버 쪽이 응답 없이 멈춰있을 때 요청이 무한정
// 매달리다가 결국 Vercel 함수 자체의 최대 실행시간(최대 60초)까지 꽉 채우고 나서야 끝나버린다 —
// 콜드 스타트 때 이 경로를 타면 사용자가 실제로 40~60초씩 기다리는 원인이었다. 8초로 끊어서 그보다
// 훨씬 빨리 실패시키고, 그래도 안 되면 재시도 → 그것도 안 되면 상위(handler)의 stale 캐시로 넘어가게 한다.
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
      signal: AbortSignal.timeout(8000),
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
export async function callNaverDataLabBatched(bodies, creds, concurrency = 3) {
  const out = [];
  for (let i = 0; i < bodies.length; i += concurrency) {
    const batch = bodies.slice(i, i + concurrency);
    out.push(...await Promise.all(batch.map(b => callNaverDataLab(b, creds))));
    if (i + concurrency < bodies.length) await sleep(150);
  }
  return out;
}

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// Naver DataLab은 한 요청(최대 5개 키워드) 안에서만 상대값(0~100)이 비교 가능해서,
// 키워드를 하나씩 따로 요청하면 각자 자기 자신 기준 0~100으로 정규화되어 서로 절대 비교가 불가능하다.
// 그래서 모든 요청에 공통 기준 키워드(anchor)를 끼워 넣고, anchor의 값 차이만큼 스케일을 보정해 병합하면
// 전체 키워드를 하나의 공통 척도로 비교할 수 있다. 실시간 리더보드/차트와 "더보기" 전체 순위가
// 서로 다른 방식으로 랭킹을 내면 순위가 어긋나므로, 두 화면 모두 반드시 이 함수 하나로만 순위를 낸다.
export async function anchorRankKeywords(keywords, startDate, endDate, naverUnit, creds) {
  const anchor = keywords[0];
  const others = keywords.slice(1);
  const chunks = chunk(others, 4); // anchor + 4개씩 = 요청당 5개 키워드
  const chunkBodies = chunks.map(group => ({
    startDate, endDate, timeUnit: naverUnit,
    keywordGroups: [anchor, ...group].map(kw => ({ groupName: kw, keywords: [kw] })),
  }));
  const chunkResponses = await callNaverDataLabBatched(chunkBodies, creds);

  // 쿼터 초과 등으로 청크가 전부 실패하면 cr.results가 없어 아래 루프가 그냥 다 건너뛰고
  // 조용히 빈 배열([])을 반환했었다 — 그러면 호출한 쪽에서는 "성공했는데 데이터가 0개"로 보여서
  // 진짜 원인(네이버 에러)이 감춰진다. 첫 번째 실패 응답의 에러 메시지를 그대로 던져서 드러낸다.
  const firstFailed = chunkResponses.find(cr => !cr.results);
  if (firstFailed && chunkResponses.every(cr => !cr.results)) {
    throw new Error(firstFailed.errorMessage || firstFailed.message || '네이버 API 호출 실패');
  }

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
  return merged;
}

// unit(date/week/month) 하나에 대해 anchor 정규화 순위 + 실시간 리더보드(top5 그래프) + 더보기 전체 순위를
// 한 번에 계산한다. api/naver-trends.js(요청당 캐시 미스 시)와 scripts/collect-trends.js(매시간 배치)가
// 완전히 동일한 계산 흐름을 공유하도록 여기 하나로 모았다.
export async function computeUnitPayloads(unit, creds) {
  const { startDate, endDate, naverUnit } = getRange(unit);
  const fullRanking = benefitKeywordRanking();
  const candidatePool = fullRanking.map(r => r.keyword); // 24개 표준 카테고리 전부

  const anchorRanked = await anchorRankKeywords(candidatePool, startDate, endDate, naverUnit, creds);

  const all = { unit, allKeywordSearchRanking: anchorRanked };

  // 실시간 인기 검색어 top5는 반드시 더보기 모달과 같은 anchor 정규화 순위에서 뽑아야 한다.
  const topBenefits = anchorRanked.slice(0, 5).map(r => r.keyword);

  // 그래프 선(line) 자체는 각 키워드 고유의 추이 모양을 보여줘야 하므로, 5개를 한 요청에 묶지 않고
  // 키워드마다 따로 요청해 각자의 상대 추이(자기 자신 기준 0~100)로 그린다.
  const perKeywordBodies = topBenefits.map(kw => ({
    startDate, endDate, timeUnit: naverUnit,
    keywordGroups: [{ groupName: kw, keywords: [kw] }],
  }));
  const perKeywordResponses = await callNaverDataLabBatched(perKeywordBodies, creds);
  const firstBad = perKeywordResponses.find(r => !r.results || !r.results[0]);
  if (firstBad) throw new Error(firstBad.errorMessage || firstBad.message || 'Naver DataLab 응답 오류');
  const results = alignResultsToCommonPeriods(perKeywordResponses.map(r => r.results[0]));

  // 순위/등락 판단은 위 개별 요청 값(서로 비교 불가)이 아니라 anchor 정규화 값을 그대로 써서
  // 리더보드·그래프 범례가 더보기 모달과 항상 일치하도록 한다.
  const anchorLatestByKeyword = Object.fromEntries(anchorRanked.map(r => [r.keyword, r.latest]));
  const anchorLatest = topBenefits.map(kw => ({ keyword: kw, latest: anchorLatestByKeyword[kw] ?? 0 }));

  const main = { unit, results, anchorLatest };

  return { anchor: anchorRanked, main, all };
}
