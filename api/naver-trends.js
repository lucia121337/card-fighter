import { Redis } from '@upstash/redis';
import { computeUnitPayloads } from '../lib/trends-core.js';

// 네이버 호출/anchor 정규화/기간 계산 로직은 lib/trends-core.js로 옮겨 scripts/collect-trends.js(매시간
// GitHub Actions 배치)와 공유한다. 이 파일은 캐시 조회/서빙과 "캐시가 비어있을 때의 안전망 계산"만 담당한다.

// 네이버 API 호출 횟수를 줄이기 위한 캐시.
// 정상 상황에서는 매시간 GitHub Actions가 Redis를 미리 채워두므로 사용자 요청은 대부분 캐시 히트로 즉시
// 응답한다. TTL은 그 매시간 주기에 여유를 둔 90분으로 둬서, Action이 한 번 실패해도 바로 캐시가 비지 않게 한다.
//
// Vercel은 서버리스라 함수 인스턴스가 요청 사이사이에 내려갔다 다시 뜰 수 있고(콜드 스타트), 그때마다
// 아래 인메모리 Map은 통째로 사라진다 — 그래서 Upstash Redis(Vercel 마켓플레이스 연동, env로
// UPSTASH_REDIS_REST_URL/TOKEN이 잡혀있으면 자동 감지)가 있으면 그쪽에 저장해 인스턴스가 바뀌어도
// 캐시가 유지되게 하고, 로컬 개발처럼 Redis가 없는 환경에서는 기존 인메모리 캐시로 자연스럽게 폴백한다.
// Vercel의 Upstash 마켓플레이스 연동 시 Custom Prefix를 넣으면 표준 이름(UPSTASH_REDIS_REST_URL/TOKEN)이
// 아니라 그 접두사가 KV 호환 변수명 앞에 그대로 붙는다(예: UPSTASH_REDIS_REST_KV_REST_API_URL). 두 이름
// 다 지원해서 어느 쪽으로 연동해도 동작하게 한다.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const redis = (REDIS_URL && REDIS_TOKEN)
  ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;

const CACHE_TTL_MS = 90 * 60 * 1000; // 90분 (매시간 수집 주기 + 여유)
const CACHE_TTL_SEC = CACHE_TTL_MS / 1000;
const memResponseCache = new Map();
const memStaleCache = new Map();
const rKey = key => `trend:${key}`;
const rStaleKey = key => `trend:stale:${key}`;

async function getCached(key) {
  if (redis) {
    try {
      const hit = await redis.get(rKey(key));
      if (hit !== null && hit !== undefined) return hit;
    } catch (e) { console.error('[redis] get 실패, 메모리 캐시로 폴백:', e.message); }
  }
  const hit = memResponseCache.get(key);
  return hit && Date.now() - hit.ts < CACHE_TTL_MS ? hit.data : null;
}

// 쿼터 초과 등으로 네이버 호출 자체가 실패하면, 방금 성공했던 값이 있어도 TTL이 지나면 그냥 사라져서
// 화면이 통째로 빈 상태("데이터 없음")가 된다. 그러니 TTL과 별개로 "마지막으로 성공한 응답"은 만료 없이
// 따로 보관해뒀다가, 새로 호출이 실패했을 때 이거라도 보여줘서 화면이 완전히 비지는 않게 한다.
async function setCached(key, data) {
  if (redis) {
    try {
      await redis.set(rKey(key), data, { ex: CACHE_TTL_SEC });
      await redis.set(rStaleKey(key), data); // 만료 없음
    } catch (e) { console.error('[redis] set 실패, 메모리 캐시로만 저장:', e.message); }
  }
  memResponseCache.set(key, { data, ts: Date.now() });
  memStaleCache.set(key, data);
}

async function getStale(key) {
  if (redis) {
    try {
      const hit = await redis.get(rStaleKey(key));
      if (hit !== null && hit !== undefined) return hit;
    } catch (e) { console.error('[redis] stale get 실패, 메모리 캐시로 폴백:', e.message); }
  }
  return memStaleCache.get(key) || null;
}

// 같은 unit에 대한 계산(안전망 라이브 호출)이 동시에 여러 번 시작되는 걸 막기 위한 진행 중 Promise 저장소.
// main/all 모드 요청이 거의 동시에 캐시 미스로 들어와도 네이버 호출은 unit당 한 번만 하고 결과를 공유한다.
const pendingCompute = new Map();

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
  const mode = req.query.mode === 'all' ? 'all' : 'main';
  const cacheKey = `${mode}:${unit}`;

  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    // 캐시 미스: 정상적으로는 매시간 GitHub Actions가 채워두지만, 최초 배포 직후(아직 한 번도
    // 수집이 안 돈 시점)나 Action 장애 상황을 대비한 안전망으로 여기서 직접 네이버를 호출해 채운다.
    if (!pendingCompute.has(unit)) {
      pendingCompute.set(unit, computeUnitPayloads(unit, creds)
        .then(async payloads => {
          await setCached(`anchor:${unit}`, payloads.anchor);
          await setCached(`main:${unit}`, payloads.main);
          await setCached(`all:${unit}`, payloads.all);
          return payloads;
        })
        .finally(() => pendingCompute.delete(unit)));
    }
    const payloads = await pendingCompute.get(unit);
    return res.status(200).json(payloads[mode]);
  } catch (e) {
    // 네이버 호출이 실패해도(쿼터 초과 등) 화면이 통째로 비지 않도록, 마지막으로 성공했던 응답이
    // 남아있으면 stale 표시와 함께 그대로 내려준다. 진짜 아무 것도 없을 때만 에러를 보여준다.
    const stale = await getStale(cacheKey);
    if (stale) return res.status(200).json({ ...stale, stale: true, staleReason: e.message });
    res.status(500).json({ error: e.message });
  }
}
