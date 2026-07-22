/* 카드 혜택 계산 공용 모듈 — detail / calculator / tournament 공용
 *
 * 작업계획서(docs/card-tournament-plan.md) §11 "혜택 계산기 담당" 산출물.
 *   - 월 소비금액 + 전월실적 → 예상 혜택 계산
 *   - 할인율·적립률·월 한도 규칙을 한 곳에서 관리 (페이지마다 복붙 금지)
 *
 * 입력 데이터: benefits_structured.json (calc/build_benefits.py 생성)
 *
 * ── 설계 원칙 ────────────────────────────────────────────────
 * 1) 단위를 절대 섞지 않는다. 원 / 마일 / 포인트는 각각 따로 낸다. (원 환산 X)
 * 2) 전월실적은 소비합계와 별개 입력이다. 통합할인한도 tier 선택과
 *    실적조건 충족 판정 모두 전월실적 기준으로 한다.
 * 3) 한도는 근거가 강한 순서로 고른다.
 *      ① 통합할인한도 표(전월실적 구간별)  ② 문구에서 파싱한 월한도
 *      ③ 전 항목 개별한도의 합            ④ 기본값(임의 보정)
 * 4) 모든 수치는 '최대 기준' 예상치다. 화면에 반드시 그렇게 표기할 것.
 */
(function (global) {
  'use strict';

  var RATE_CLAMP = 0.10;    // 카테고리 혜택율 상한(과대추정 방지)
  var DEFAULT_CAP = 30000;  // 월한도 미상 카드 보정값
  var BASE_ROW = '그 외 모든 가맹점';

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  /* 카드 트랙 — 토너먼트에서 현금할인형/마일·포인트형을 나눌 때 사용 */
  function track(b) {
    if (!b) return 'none';
    var hasMoney = (b.category_rates && Object.keys(b.category_rates).length > 0) || num(b.base_rate) > 0;
    if (hasMoney) return 'money';
    if (b.is_mileage || num(b.miles_per_won) > 0 || num(b.points_per_won) > 0) return 'unit';
    return 'none';
  }

  /* 계산 행 구성: 카드의 카테고리별 율 + 기본율 행 */
  function buildRows(b) {
    var catRates = b.category_rates || {}, catCaps = b.category_caps || {};
    var rows = Object.keys(catRates).map(function (c) {
      return { cat: c, rate: Math.min(num(catRates[c]), RATE_CLAMP), cap: num(catCaps[c]), isBase: false };
    });
    rows.sort(function (x, y) { return y.rate - x.rate; });
    if (num(b.base_rate) > 0) {
      rows.push({ cat: BASE_ROW, rate: Math.min(num(b.base_rate), RATE_CLAMP), cap: 0, isBase: true });
    }
    return rows;
  }

  /* 적용 월한도 결정. prevMonth(전월실적)로 통합할인한도 구간을 고른다. */
  function resolveCap(b, rows, prevMonth) {
    var tiers = b.cap_tiers || [];
    if (tiers.length) {
      var cap = tiers[0][1];
      for (var i = 0; i < tiers.length; i++) { if (num(prevMonth) >= tiers[i][0]) cap = tiers[i][1]; }
      return { cap: cap, src: 'tier' };
    }
    if (num(b.monthly_cap) > 0) return { cap: num(b.monthly_cap), src: 'parsed' };
    var sum = 0, all = true;
    rows.forEach(function (r) { if (r.rate > 0) { if (r.cap) sum += r.cap; else all = false; } });
    if (all && sum) return { cap: sum, src: 'catSum' };
    return { cap: DEFAULT_CAP, src: 'default' };
  }

  /* 핵심 계산
   *   b        : benefits_structured.json 의 카드 1장
   *   spending : {카테고리명: 월 소비액(원)}  ('그 외 모든 가맹점' 키도 허용)
   *   opts     : {prevMonth: 전월실적(원)}
   */
  function calc(b, spending, opts) {
    opts = opts || {};
    spending = spending || {};
    var prevMonth = num(opts.prevMonth);

    var out = {
      track: 'none', rows: [], matched: [],
      rawMoney: 0, money: 0, cap: 0, capSrc: '', capped: false, scale: 1,
      miles: 0, milesBonus: 0, airline: '', isMileage: false,
      points: 0, pointName: '', pointPer1k: 0, pointTopPer1k: 0, pointBonus: 0,
      feeMonthly: 0, net: 0, hasMoney: false,
      preMonth: 0, meetsPreMonth: true, totalSpend: 0
    };
    if (!b) return out;

    out.track = track(b);
    out.preMonth = num(b.pre_month_money);
    out.meetsPreMonth = prevMonth >= out.preMonth;
    out.feeMonthly = Math.round(num(b.annual_fee) / 12);

    var total = 0;
    Object.keys(spending).forEach(function (k) { total += num(spending[k]); });
    out.totalSpend = total;

    var rows = buildRows(b);
    // 카드 카테고리에 안 걸린 지출은 기본율 행으로 넘긴다
    var matchedCats = {};
    rows.forEach(function (r) { if (!r.isBase) matchedCats[r.cat] = true; });
    var otherSpend = 0;
    Object.keys(spending).forEach(function (k) { if (!matchedCats[k]) otherSpend += num(spending[k]); });

    var raw = 0;
    rows.forEach(function (r) {
      var spend = r.isBase ? otherSpend : num(spending[r.cat]);
      var ben = spend * r.rate;
      if (r.cap) ben = Math.min(ben, r.cap);   // 카테고리 개별 월한도
      r.spend = spend; r.raw = ben;
      raw += ben;
      if (!r.isBase && spend > 0 && r.rate > 0) out.matched.push({ cat: r.cat, rate: r.rate });
    });

    var c = resolveCap(b, rows, prevMonth);
    out.cap = c.cap; out.capSrc = c.src;
    out.rawMoney = raw;
    out.money = Math.min(raw, c.cap);
    out.capped = raw > c.cap;
    out.scale = (out.capped && raw > 0) ? c.cap / raw : 1;   // 행별 표시 비례축소(왜곡 방지)
    rows.forEach(function (r) { r.shown = r.raw * out.scale; });
    out.rows = rows;
    out.hasMoney = rows.some(function (r) { return r.rate > 0; });

    // 마일 (원과 별개 단위)
    out.isMileage = !!b.is_mileage;
    out.airline = b.airline || '';
    out.miles = Math.round(total * num(b.miles_per_won));
    out.milesBonus = num(b.bonus_miles);

    // 포인트/머니/MR (원과 별개 단위)
    out.pointName = b.point_name || '';
    out.points = Math.round(total * num(b.points_per_won));
    out.pointPer1k = Math.round(num(b.points_per_won) * 1000 * 100) / 100;
    out.pointTopPer1k = Math.round(num(b.points_top_per_won) * 1000 * 100) / 100;
    out.pointBonus = num(b.bonus_points);

    out.net = out.money - out.feeMonthly;
    return out;
  }

  /* 토너먼트 후보 정렬용 점수. 트랙별로 비교 가능한 값만 쓴다. */
  function score(r) {
    if (!r) return 0;
    if (r.track === 'money') return r.net;                       // 원: 순이득
    return r.miles > 0 ? r.miles : r.points;                     // 단위: 마일/포인트 적립량
  }

  global.BenefitCalc = {
    RATE_CLAMP: RATE_CLAMP, DEFAULT_CAP: DEFAULT_CAP, BASE_ROW: BASE_ROW,
    track: track, buildRows: buildRows, resolveCap: resolveCap, calc: calc, score: score
  };
})(window);
