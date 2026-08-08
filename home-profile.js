/* 홈 개인화 — 소비 프로필로 "생활 상황별 대표 카드"를 "내 소비 기준 Top3"로 바꾼다.
 * index.html 마크업은 건드리지 않고 주입한다(#home-featured-cards 위에 스트립 삽입).
 * 프로필 없으면: 퀵 입력 스트립만 노출, 기존 대표카드 그대로(무회귀).
 * 프로필 있으면: benefits_structured.json + cards.json(활성만) 지연 로드 → BenefitCalc 순이득 Top3.
 * 의존: profile.js(CardProfile), benefit-calc.js(BenefitCalc) */
(function () {
  'use strict';
  var QUICK_CATS = [
    { key: '푸드', icon: '🍔' }, { key: '마트/편의점', icon: '🛒' },
    { key: '온라인쇼핑', icon: '🛍️' }, { key: '주유', icon: '⛽' }, { key: '통신', icon: '📶' }
  ];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var won = function (n) { return Math.round(n).toLocaleString() + '원'; };
  var DATA = null; // {BEN, CARDS}

  function el(id) { return document.getElementById(id); }

  function ensureStrip() {
    var grid = el('home-featured-cards');
    if (!grid || el('home-profile-strip')) return el('home-profile-strip');
    var strip = document.createElement('div');
    strip.id = 'home-profile-strip';
    strip.innerHTML = '';
    grid.parentNode.insertBefore(strip, grid);
    injectCss();
    return strip;
  }

  function injectCss() {
    if (el('home-profile-css')) return;
    var st = document.createElement('style');
    st.id = 'home-profile-css';
    st.textContent =
      '#home-profile-strip{margin:0 0 16px;background:#fff;border:1.5px solid #dbe7ff;border-left:4px solid #145ce6;' +
        'border-radius:14px;padding:14px 18px;box-shadow:0 4px 14px rgba(20,92,230,.06)}' +
      '#home-profile-strip .hp-title{font-weight:800;font-size:14px;margin-bottom:10px}' +
      '#home-profile-strip .hp-title small{color:#64748b;font-weight:600;margin-left:6px}' +
      '#home-profile-strip .hp-rows{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '#home-profile-strip .hp-item{display:flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:7px 10px;transition:.13s}' +
      '#home-profile-strip .hp-item:focus-within{border-color:#145ce6;background:#fff;box-shadow:0 0 0 3px rgba(20,92,230,.1)}' +
      '#home-profile-strip .hp-item input{width:52px;border:0;outline:0;font-size:13.5px;font-weight:700;text-align:right;font-family:inherit;background:transparent}' +
      '#home-profile-strip .hp-item small{color:#94a3b8;font-size:11.5px}' +
      '#home-profile-strip .hp-go{background:#145ce6;color:#fff;border:0;border-radius:10px;padding:9px 18px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit;transition:.13s}' +
      '#home-profile-strip .hp-go:hover{background:#0f49b8;transform:translateY(-1px)}' +
      '#home-profile-strip .hp-sum{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13.5px}' +
      '#home-profile-strip .hp-sum b{color:#145ce6}' +
      '#home-profile-strip .hp-link{background:none;border:0;color:#64748b;text-decoration:underline;cursor:pointer;font-size:12.5px;font-family:inherit;padding:0}' +
      '.home-card-reason.hp-gain{color:#047857}' +
      /* 순위 배지 + 1위 챔피언 — 계산기·월드컵과 같은 언어(골드는 1위에만) */
      '#home-featured-cards .home-feature-card{position:relative}' +
      '.hp-rank{position:absolute;top:-9px;left:14px;z-index:2;font-size:10px;font-weight:900;letter-spacing:.6px;' +
        'padding:2.5px 10px;border-radius:99px;color:#fff;background:#94a3b8}' +
      '.hp-rank.hp-r1{background:linear-gradient(135deg,#f2c94c,#dfa32a);box-shadow:0 3px 8px rgba(223,163,42,.35)}' +
      '.hp-rank.hp-r2{background:#64748b}' +
      '.hp-rank.hp-r3{background:#b45309}' +
      '#home-featured-cards .home-feature-card.hp-champ{border-color:#e7bd4b;background:linear-gradient(180deg,#fffdf4,#fff)}' +
      /* 1위 카드 혜택 내역 — 빈 공간을 '왜 1위인지'로 채운다 */
      '.hp-breakdown{margin-top:16px;padding-top:14px;border-top:1px dashed #e8d9ab}' +
      '.hp-breakdown .hb-title{font-size:11px;font-weight:800;color:#a16207;letter-spacing:.04em;margin-bottom:8px}' +
      '.hp-breakdown .hb-row{display:flex;justify-content:space-between;gap:12px;padding:4.5px 0;' +
        'font-family:"Noto Sans KR",sans-serif;font-size:12.5px;color:#475569}' +
      '.hp-breakdown .hb-row b{font-variant-numeric:tabular-nums;font-weight:700;color:#047857;white-space:nowrap}' +
      '.hp-breakdown .hb-row.hb-minus b{color:#dc2626}' +
      '.hp-breakdown .hb-row.hb-total{margin-top:4px;padding-top:8px;border-top:1px solid #e8d9ab;font-weight:800;color:#1e293b}' +
      '.hp-breakdown .hb-row.hb-total b{font-size:14px}' +
      '.hp-breakdown .hb-note{margin-top:6px;font-size:11px;color:#94a3b8;font-family:"Noto Sans KR",sans-serif}' +
      /* 기본(프로필 전) 1위 카드 상세 혜택 — 중립 톤 */
      '.hp-benefits{margin-top:16px;padding-top:14px;border-top:1px dashed #e2e8f0}' +
      '.hp-benefits .hb-title{font-size:11px;font-weight:800;color:#145ce6;letter-spacing:.04em;margin-bottom:8px}' +
      '.hp-benefits .hb-row{display:flex;justify-content:space-between;gap:12px;padding:4.5px 0;' +
        'font-family:"Noto Sans KR",sans-serif;font-size:12.5px;color:#475569}' +
      '.hp-benefits .hb-row b{font-variant-numeric:tabular-nums;font-weight:700;color:#145ce6;white-space:nowrap}' +
      '.hp-benefits .hb-svc{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}' +
      '.hp-benefits .hb-svc span{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:#f1f5f9;color:#475569}' +
      '.hp-benefits .hb-note{margin-top:6px;font-size:11px;color:#94a3b8;font-family:"Noto Sans KR",sans-serif}';
    document.head.appendChild(st);
  }

  /* 기본(프로필 전) 대표카드 1위의 빈 공간 — 카드의 실제 상세 혜택을 채운다 */
  function enhanceDefaultLead(d) {
    var lead = document.querySelector('#home-featured-cards .home-feature-card.is-lead');
    if (!lead || lead.querySelector('.hp-breakdown') || lead.querySelector('.hp-benefits')) return;
    var btn = lead.querySelector('[data-home-compare]');
    var b = btn && d.BEN[String(btn.dataset.homeCompare)];
    if (!b) return;
    var rows = [];
    var cr = b.category_rates || {}, cc = b.category_caps || {};
    Object.keys(cr).sort(function (a, z) { return cr[z] - cr[a]; }).slice(0, 5).forEach(function (c) {
      var cap = cc[c] > 0 ? ' <small style="color:#94a3b8">(월 한도 ' + won(cc[c]) + ')</small>' : '';
      rows.push('<div class="hb-row"><span>' + esc(c) + cap + '</span><b>' + Math.round(cr[c] * 100) + '% 할인</b></div>');
    });
    if ((b.base_rate || 0) > 0)
      rows.push('<div class="hb-row"><span>그 외 모든 가맹점</span><b>' + (Math.round(b.base_rate * 1000) / 10) + '%</b></div>');
    // 정액: 같은 (카테고리+대상)은 최댓값 1개만 (사다리 중복 방지)
    var fx = {};
    (b.fixed_discounts || []).forEach(function (f) {
      var k = (f.category || '') + '|' + (f.targets || '');
      if ((f.won || 0) > (fx[k] ? fx[k].won : 0)) fx[k] = f;
    });
    Object.values(fx).slice(0, 3).forEach(function (f) {
      rows.push('<div class="hb-row"><span>정액할인 · ' + esc(f.category || '') + '</span><b>월 ' + won(f.won) + '</b></div>');
    });
    var fuel = Math.max.apply(null, [0].concat((b.fuel_discounts || []).map(function (f) { return f.won_per_liter || 0; })));
    if (fuel > 0) rows.push('<div class="hb-row"><span>주유 할인</span><b>리터당 ' + fuel + '원</b></div>');
    if ((b.voucher_won || 0) > 0) rows.push('<div class="hb-row"><span>연 바우처</span><b>' + won(b.voucher_won) + '</b></div>');
    if (!rows.length) return;
    var svcs = (b.service_benefits || []).slice(0, 3).map(function (s) { return '<span>🎫 ' + esc((s.label || '').slice(0, 22)) + '</span>'; }).join('');
    var note = b.pre_month_money > 0 ? '전월실적 ' + won(b.pre_month_money) + ' 이상 시 · ' : '';
    var box = document.createElement('div');
    box.className = 'hp-benefits';
    box.innerHTML = '<div class="hb-title">💳 이 카드의 주요 혜택</div>' + rows.join('') +
      (svcs ? '<div class="hb-svc">' + svcs + '</div>' : '') +
      '<div class="hb-note">' + note + "'최대 기준' · 원문 검수 데이터 기반</div>";
    var content = lead.querySelector('dl') ? lead.querySelector('dl').parentNode : lead;
    content.appendChild(box);
  }

  /* 1위 카드 혜택 내역 — '왜 1위인지'를 항목별로 분해 */
  function breakdownHTML(r) {
    var lines = [];
    r.rows.filter(function (row) { return row.rate > 0 && (row.shown || 0) > 0; })
      .sort(function (a, z) { return z.shown - a.shown; }).slice(0, 5)
      .forEach(function (row) {
        var name = row.isBase ? '그 외 모든 가맹점' : row.cat;
        lines.push('<div class="hb-row"><span>' + esc(name) + ' ' + Math.round(row.rate * 100) + '% × ' +
          won(row.spend) + '</span><b>+' + won(Math.round(row.shown)) + '</b></div>');
      });
    (r.fixedRows || []).slice(0, 2).forEach(function (f) {
      lines.push('<div class="hb-row"><span>정액할인 · ' + esc(f.category || '') + '</span><b>+' + won(f.won) + '</b></div>');
    });
    if (r.fuelMoney > 0) lines.push('<div class="hb-row"><span>주유 리터당 할인</span><b>+' + won(r.fuelMoney) + '</b></div>');
    lines.push('<div class="hb-row hb-minus"><span>연회비 (월 환산)</span><b>−' + won(r.feeMonthly) + '</b></div>');
    lines.push('<div class="hb-row hb-total"><span>월 예상 순이득</span><b>' + won(Math.max(r.net, 0)) + '</b></div>');
    return '<div class="hp-breakdown"><div class="hb-title">🧾 내 소비 기준 혜택 내역</div>' + lines.join('') +
      '<div class="hb-note">' + (r.capped ? '월 통합한도 ' + won(r.cap) + ' 적용 후 금액이에요. ' : '') + "'최대 기준' 예상치 · 원문 검수 데이터 기반</div></div>";
  }

  function renderInputStrip() {
    var strip = ensureStrip(); if (!strip) return;
    strip.innerHTML =
      '<div class="hp-title">💡 내 소비를 넣으면 <span style="color:#145ce6">내 기준 Top3</span>로 바뀌어요 <small>홈·혜택계산기·카드월드컵 공용 (만원 단위)</small></div>' +
      '<div class="hp-rows">' +
      QUICK_CATS.map(function (c) {
        return '<label class="hp-item">' + c.icon + ' ' + esc(c.key) +
          ' <input type="number" min="0" inputmode="numeric" data-hp-cat="' + esc(c.key) + '" placeholder="0"><small>만원</small></label>';
      }).join('') +
      '<button class="hp-go" id="hp-go">내 기준으로 보기</button></div>';
    el('hp-go').onclick = function () {
      var spend = {};
      strip.querySelectorAll('[data-hp-cat]').forEach(function (i) {
        var v = parseFloat(i.value) || 0;
        if (v > 0) spend[i.dataset.hpCat] = v * 10000;
      });
      var p = CardProfile.save(spend, 0);
      if (!p) { alert('한 곳 이상 금액을 넣어주세요!'); return; }
      apply();
    };
  }

  function renderSummaryStrip(p) {
    var strip = ensureStrip(); if (!strip) return;
    var t = CardProfile.total(p);
    var cats = Object.keys(p.spend).slice(0, 4).join(' · ');
    strip.innerHTML =
      '<div class="hp-sum">🔗 <b>내 소비 프로필 적용 중</b> — 월 ' + won(t) + ' (' + esc(cats) + ')' +
      ' <a class="hp-link" href="calculator.html" style="color:#145ce6">계산기에서 자세히 수정 →</a>' +
      ' <button class="hp-link" id="hp-reset">초기화</button></div>';
    el('hp-reset').onclick = function () { CardProfile.clear(); location.reload(); };
  }

  function loadData() {
    if (DATA) return Promise.resolve(DATA);
    return Promise.all([
      fetch('benefits_structured.json').then(function (r) { return r.json(); }),
      fetch('cards.json').then(function (r) { return r.json(); })   // 활성 목록(단종 제외)
    ]).then(function (rs) {
      var byIdx = {};
      rs[1].forEach(function (c) { byIdx[c.idx] = c; });
      DATA = { BEN: rs[0], CARDS: byIdx };
      return DATA;
    });
  }

  function renderTop3(p) {
    var grid = el('home-featured-cards'); if (!grid) return;
    loadData().then(function (d) {
      var prev = p.prevMonth > 0 ? p.prevMonth : CardProfile.total(p);
      var ranked = [];
      for (var idx in d.CARDS) {                       // 활성 카드만 순회
        var b = d.BEN[String(idx)]; if (!b) continue;
        var r = BenefitCalc.calc(b, p.spend, { prevMonth: prev });
        if (r.money <= 0) continue;                    // 돈 혜택 있는 카드만 (홈은 단순하게)
        ranked.push({ idx: idx, card: d.CARDS[idx], r: r });
      }
      ranked.sort(function (a, z) { return z.r.net - a.r.net || a.r.feeMonthly - z.r.feeMonthly; });
      var top = ranked.slice(0, 3);
      if (!top.length) return;                         // 계산 불가 프로필이면 기존 화면 유지

      // 제목/부제 개인화
      var h2 = el('home-featured-title');
      if (h2) {
        h2.textContent = '내 소비 기준 대표 카드 Top3';
        var head = h2.parentNode;
        var span = head.querySelector('span'); if (span) span.textContent = '내 프로필로 계산한 순위';
        var sub = head.querySelector('p');
        if (sub) sub.textContent = '월 최대 ' + won(top[0].r.net) + ' 순이득 — 연회비까지 뺀 실제 이득 기준이에요.';
      }
      grid.innerHTML = top.map(function (t, i) {
        var c = t.card, r = t.r;
        // 혜택 기여 상위 항목 — 기본율('그 외') 포함, 실제로 돈이 되는 순서대로
        var drivers = r.rows.filter(function (row) { return row.rate > 0 && (row.shown || 0) > 0; })
          .sort(function (a, z) { return z.shown - a.shown; }).slice(0, 3)
          .map(function (row) { return esc(row.isBase ? '그 외' : row.cat) + ' ' + Math.round(row.rate * 100) + '%'; }).join(' · ');
        return '<article class="home-feature-card ' + (i === 0 ? 'is-lead hp-champ' : 'is-compact') + '">' +
          '<span class="hp-rank hp-r' + (i + 1) + '">' + (i === 0 ? '🏆 1위' : (i + 1) + '위') + '</span>' +
          '<img loading="lazy" src="' + esc(c.card_img || '') + '" alt="' + esc(c.card_name || '') + '" onerror="this.style.visibility=\'hidden\'">' +
          '<div><small>' + esc(c.company || '') + '</small><h3>' + esc(c.card_name || '') + '</h3>' +
          '<p>' + (drivers ? '주요 혜택: ' + drivers : esc(c.top_benefit_summary || '')) + '</p>' +
          '<dl><div><dt>월 예상 순이득</dt><dd><b style="color:#047857">' + won(Math.max(r.net, 0)) + '</b></dd></div>' +
          '<div><dt>연회비</dt><dd>월 ' + won(r.feeMonthly) + '</dd></div></dl>' +
          (i === 0 ? breakdownHTML(r) : '') + '</div>' +
          '<strong class="home-card-reason hp-gain">혜택 ' + won(r.money) + (r.capped ? ' (월 한도 적용)' : '') + ' − 연회비 = 순이득</strong>' +
          '<div class="home-card-actions"><a href="detail.html?idx=' + encodeURIComponent(c.idx) + '">상세 보기</a>' +
          '<button type="button" data-home-compare="' + esc(c.idx) + '" data-card-name="' + esc(c.card_name || '') + '" data-card-img="' + esc(c.card_img || '') + '">비교함 담기</button></div>' +
          '</article>';
      }).join('');
    }).catch(function () { /* 로드 실패 시 기존 대표카드 유지 */ });
  }

  /* 히어로 '오늘의 매치' — 프로필 있으면 내 1위 vs 2위, 없으면 표준 소비 기준(계산기 '보통' 프리셋).
     가짜 예시가 아니라 실데이터 계산 결과를 보여준다. */
  var NORMAL_PRESET = { '푸드': 400000, '카페/디저트': 100000, '마트/편의점': 250000,
    '온라인쇼핑': 200000, '교통': 70000, '주유': 100000, '통신': 70000 };

  function rankCards(spend, prevMonth, d) {
    var ranked = [];
    for (var idx in d.CARDS) {
      var b = d.BEN[String(idx)]; if (!b) continue;
      var r = BenefitCalc.calc(b, spend, { prevMonth: prevMonth });
      if (r.money <= 0) continue;
      ranked.push({ idx: idx, card: d.CARDS[idx], r: r });
    }
    ranked.sort(function (a, z) { return z.r.net - a.r.net || a.r.feeMonthly - z.r.feeMonthly; });
    return ranked;
  }

  function renderHeroMatch() {
    var box = el('hero-match'); if (!box) return;
    var p = CardProfile.load();
    var spend = p ? p.spend : NORMAL_PRESET;
    var prev = p && p.prevMonth > 0 ? p.prevMonth
             : Object.values(spend).reduce(function (a, b) { return a + b; }, 0);
    loadData().then(function (d) {
      var top2 = rankCards(spend, prev, d).slice(0, 2);
      if (top2.length < 2) return;
      var row = function (t, win) {
        var c = t.card;
        return '<div class="hm-card' + (win ? ' hm-win' : '') + '">' +
          (win ? '<span class="hm-belt">🏆 WINNER</span>' : '') +
          '<img loading="lazy" src="' + esc(c.card_img || '') + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
          '<div><small>' + esc(c.company || '') + '</small><b>' + esc(c.card_name || '') + '</b></div>' +
          '<span class="hm-net">월 ' + won(t.r.net) + '</span></div>';
      };
      box.innerHTML =
        '<div class="hm-label">🥊 오늘의 매치 <small>' + (p ? '내 소비 기준' : '표준 소비 기준 (월 119만원)') + '</small></div>' +
        row(top2[0], true) +
        '<div class="hm-vs">VS</div>' +
        row(top2[1], false) +
        '<a class="hm-more" href="calculator.html">전체 랭킹 보기 →</a>';
      // 프로필 전 기본 대표카드에도 상세 혜택 채움 (팀 렌더가 늦을 수 있어 재시도)
      if (!p) {
        var tries = 0;
        (function tryEnhance() {
          enhanceDefaultLead(d);
          if (!document.querySelector('#home-featured-cards .hp-benefits') && ++tries < 12) setTimeout(tryEnhance, 300);
        })();
      }
    }).catch(function () {
      box.innerHTML = '<div class="hm-loading">대진을 불러오지 못했어요 — <a href="calculator.html" style="color:#145ce6;font-weight:800">계산기에서 직접 확인 →</a></div>';
    });
  }

  function apply() {
    var p = CardProfile.load();
    if (p) { renderSummaryStrip(p); renderTop3(p); }
    else renderInputStrip();
    renderHeroMatch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
