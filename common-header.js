/* Card Fighter Common GNB Header Injector */

(function () {
  const routes = [
    { name: '전체카드', url: '/card', match: ['/', '/card', '/index.html'] },
    { name: '캐시백이벤트', url: '/event', match: ['/event'] },
    { name: '할인가맹점', url: '/shopping', match: ['/shopping'] },
    { name: '카드연구소', url: '/cardlab', match: ['/cardlab', '/cardlab_detail.html', '/match_game.html', '/worldcup_game.html'] },
    { name: '혜택계산기', url: '/calculator.html', match: ['/calculator.html'] }
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

  function initHeader() {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const currentPath = location.pathname;
    const activeName = getActiveTab(currentPath);

    const gnbItems = routes.map(r => {
      const isActive = r.name === activeName ? ' active' : '';
      return `<a href="${r.url}" class="cf-gnb-item${isActive}">${r.name}</a>`;
    }).join('');

    headerEl.className = 'cf-global-header';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
})();
