import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { Redis } from '@upstash/redis';
import { computeUnitPayloads } from '../lib/trends-core.js';

// GitHub Actions에서는 NAVER_CLIENT_ID/SECRET, UPSTASH_REDIS_REST_URL/TOKEN이 저장소 Secrets로 이미
// env에 들어와 있다. 로컬에서 수동으로 이 스크립트를 돌릴 때만 .env.local을 직접 읽어 채워준다
// (기존 커스텀 로컬 서버와 동일한 방식 — dotenv 의존성 추가 없이 간단히 파싱).
function loadLocalEnvIfPresent() {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadLocalEnvIfPresent();

const NAVER_CLIENT_ID = (process.env.NAVER_CLIENT_ID || '').replace(/^﻿/, '').trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_CLIENT_SECRET || '').replace(/^﻿/, '').trim();
if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다.');
  process.exit(1);
}
const creds = { id: NAVER_CLIENT_ID, secret: NAVER_CLIENT_SECRET };

// api/naver-trends.js와 동일하게, Vercel Upstash 연동에 Custom Prefix를 쓴 경우의 변수명도 지원한다.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const redis = (REDIS_URL && REDIS_TOKEN)
  ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;
if (!redis) {
  console.warn('[redis] UPSTASH_REDIS_REST_URL/TOKEN이 없어 Redis 기록을 건너뜁니다 (SQLite에만 저장).');
}

const CACHE_TTL_SEC = 90 * 60; // api/naver-trends.js와 동일한 TTL(90분) — 매시간 주기 + 여유
const rKey = key => `trend:${key}`;
const rStaleKey = key => `trend:stale:${key}`;

async function writeRedis(key, data) {
  if (!redis) return;
  await redis.set(rKey(key), data, { ex: CACHE_TTL_SEC });
  await redis.set(rStaleKey(key), data); // 만료 없음 — api/naver-trends.js의 장애 폴백용
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'data');
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const db = new DatabaseSync(join(dbDir, 'trends.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS trend_cache (
    unit TEXT NOT NULL,
    mode TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (unit, mode)
  )
`);
const upsert = db.prepare(`
  INSERT INTO trend_cache (unit, mode, payload, updated_at)
  VALUES (@unit, @mode, @payload, @updated_at)
  ON CONFLICT(unit, mode) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
`);

async function collectUnit(unit) {
  console.log(`[collect] ${unit} 계산 중...`);
  const { anchor, main, all } = await computeUnitPayloads(unit, creds);
  const updatedAt = new Date().toISOString();

  // Redis 기록을 먼저/독립적으로 성공시켜서, 아래 SQLite 기록이 실패해도 라이브 서비스(Redis 읽기)엔
  // 영향이 없게 한다.
  await writeRedis(`anchor:${unit}`, anchor);
  await writeRedis(`main:${unit}`, main);
  await writeRedis(`all:${unit}`, all);

  upsert.run({ unit, mode: 'anchor', payload: JSON.stringify(anchor), updated_at: updatedAt });
  upsert.run({ unit, mode: 'main', payload: JSON.stringify(main), updated_at: updatedAt });
  upsert.run({ unit, mode: 'all', payload: JSON.stringify(all), updated_at: updatedAt });

  console.log(`[collect] ${unit} 완료 — 키워드 ${anchor.length}개, 1위: ${anchor[0]?.keyword ?? 'N/A'}`);
}

async function main() {
  for (const unit of ['date', 'week', 'month']) {
    await collectUnit(unit);
  }
  db.close();
  console.log('[collect] 전체 완료.');
}

main().catch(e => {
  console.error('[collect] 실패:', e);
  db.close();
  process.exit(1);
});
