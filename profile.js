/* 소비 프로필 공용 모듈 — 홈 / 혜택계산기 / 카드월드컵이 같은 프로필을 공유한다.
 * "한 번 입력하면 어디서나 내 기준" — localStorage에 저장, 단위는 항상 원(₩).
 *   CardProfile.load()  → {spend:{카테고리:원}, prevMonth:원(0=합계로 간주), updatedAt} | null
 *   CardProfile.save(spendWon, prevWon) → 저장된 프로필 | null(유효 지출 없음)
 *   CardProfile.clear()
 * 실패 안전: localStorage 불가 환경에서도 예외 없이 null만 반환. */
(function (global) {
  'use strict';
  var KEY = 'cf_profile_v1';

  function load() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY));
      if (p && p.spend && typeof p.spend === 'object' && Object.keys(p.spend).length) return p;
    } catch (e) {}
    return null;
  }

  function save(spendWon, prevWon) {
    try {
      var clean = {};
      Object.keys(spendWon || {}).forEach(function (k) {
        var v = Math.round(+spendWon[k] || 0);
        if (v > 0) clean[k] = v;
      });
      if (!Object.keys(clean).length) return null;   // 빈 저장으로 기존 프로필을 지우지 않는다
      var p = { spend: clean, prevMonth: Math.max(0, Math.round(+prevWon || 0)), updatedAt: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(p));
      return p;
    } catch (e) { return null; }
  }

  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function total(p) {
    p = p || load(); if (!p) return 0;
    return Object.values(p.spend).reduce(function (a, b) { return a + b; }, 0);
  }

  global.CardProfile = { load: load, save: save, clear: clear, total: total, KEY: KEY };
})(window);
