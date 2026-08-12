/* Card Fighter Common Footer Injector */

(function () {
  function renderFooter() {
    let footer = document.querySelector('footer');
    if (!footer) {
      footer = document.createElement('footer');
      document.body.appendChild(footer);
    }
    footer.className = 'cf-global-footer';

    footer.innerHTML = `
      <div class="cf-footer-inner">
        <div class="cf-footer-top">
          <div class="cf-footer-brand">
            <span class="cf-footer-logo" role="img" aria-label="카드파이터 로고">🥊</span>
            <span class="cf-footer-title">카드 파이터</span>
          </div>
          <div class="cf-footer-links">
            <a href="/">홈</a>
            <a href="/card">전체카드</a>
            <a href="/calculator.html">혜택계산기</a>
            <a href="/cardlab">카드 연구소</a>
            <a href="javascript:void(0)" onclick="window.CardToast && CardToast.show('이용약관 준비 중입니다.')">이용약관</a>
            <a href="javascript:void(0)" onclick="window.CardToast && CardToast.show('개인정보처리방침 준비 중입니다.')">개인정보처리방침</a>
          </div>
        </div>
        <div class="cf-footer-desc">
          ※ 본 서비스는 신용카드 혜택 비교 및 피킹률 분석을 제공하는 참고용 안내 서비스이며, 실제 카드 발급 및 혜택 한도는 각 카드사의 개별 약관 및 전월 실적 조건에 따라 변경될 수 있습니다.
        </div>
        <div class="cf-footer-copy">
          © 2026 Card Fighter. All rights reserved.
        </div>
      </div>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }
})();
