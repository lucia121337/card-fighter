/* Card Fighter Common GNB Header Injector */

(function () {
  const routes = [
    { name: '홈', url: '/', match: ['/', '/index.html'] },
    { name: '전체카드', url: '/card', match: ['/card'] },
    { name: '혜택계산기', url: '/calculator.html', match: ['/calculator.html'] },
    { name: '캐시백이벤트', url: '/event', match: ['/event'] },
    { name: '할인가맹점', url: '/shopping', match: ['/shopping'] },
    { name: '카드연구소', url: '/cardlab', match: ['/cardlab', '/cardlab_detail.html', '/match_game.html', '/worldcup_game.html', '/tournament.html'] }
  ];

  function isMatch(path, pattern) {
    if (pattern === '/') return path === '/';
    return path === pattern || path.startsWith(pattern + '/') || path.startsWith(pattern + '?');
  }

  function getActiveTab(path) {
    for (const r of routes) {
      if (r.match.some(m => isMatch(path, m))) {
        return r.name;
      }
    }
    return '';
  }

  const darkPages = [
    '/match_game.html',
    '/cardlab/match',
    '/qa.html',
    '/review.html',
    '/premium-dark.html'
  ];

  function isDarkModePage(path) {
    if (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme')) {
      return true;
    }
    return darkPages.some(p => path === p || path.startsWith(p));
  }

  function initHeader() {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const currentPath = location.pathname;
    const activeName = getActiveTab(currentPath);
    const isDark = isDarkModePage(currentPath);

    const SECTION_MAP = { '홈': 'home', '전체카드': 'cards', '캐시백이벤트': 'cashback', '할인가맹점': 'shopping' };
    const gnbItems = routes.map(r => {
      const isActive = r.name === activeName ? ' active' : '';
      const sec = SECTION_MAP[r.name];
      const onclickAttr = sec ? ` data-section="${sec}" onclick="if(typeof showSection==='function'){showSection('${sec}');return false;}"` : '';
      return `<a href="${r.url}" class="cf-gnb-item${isActive}"${onclickAttr}>${r.name}</a>`;
    }).join('');

    headerEl.className = 'cf-global-header' + (isDark ? ' cf-header-dark' : '');
    headerEl.innerHTML = `
      <div class="cf-header-left">
        <a href="/" class="cf-logo">
          <span class="cf-logo-icon">🥊</span>
          <span class="cf-logo-text">카드파이터</span>
        </a>
        <div class="cf-gnb-divider"></div>
        <nav class="cf-gnb">
          ${gnbItems}
        </nav>
      </div>
      <div class="cf-header-right">
        <div class="cf-search-box">
          <input type="text" class="cf-search-input" placeholder="스타벅스, 주유 할인 검색" onkeydown="if(event.key==='Enter') window.CFHeaderSearch(this.value)" />
          <button type="button" class="cf-search-btn" onclick="window.CFHeaderSearch(this.previousElementSibling.value)" aria-label="검색">
            🔍
          </button>
        </div>
      </div>
    `;
  }

  window.CFHeaderSearch = function (q) {
    if (!q || !q.trim()) return;
    location.href = '/search.html?q=' + encodeURIComponent(q.trim());
  };

  window.handleSmartBack = function (fallbackUrl = '/index.html') {
    if (document.referrer && document.referrer.includes(location.host) && !document.referrer.endsWith(location.pathname)) {
      history.back();
    } else {
      location.href = fallbackUrl;
    }
  };

  function initFooter() {
    if (document.querySelector('.cf-global-footer')) return;
    const footerHtml = `
      <footer class="cf-global-footer">
        <div class="cf-footer-inner">
          <div class="cf-footer-brand">
            <span>🥊</span> 카드파이터 (CardFighter)
          </div>
          <div>신용카드 및 체크카드 주요 혜택 및 연회비 실시간 비교·계산 플랫폼</div>
          <div class="cf-footer-disclaimer">
            본 서비스에서 제공하는 카드 상품 정보 및 혜택 내역은 각 카드사의 제공 데이터 기준이며 카드사 사정에 따라 일시 변경될 수 있습니다.<br>
            © 2026 CardFighter. All rights reserved.
          </div>
        </div>
      </footer>
    `;
    document.body.insertAdjacentHTML('beforeend', footerHtml);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initHeader(); initFooter(); });
  } else {
    initHeader();
    initFooter();
  }
})();
