/* Card Fighter Common GNB Header & Global UI Utilities Injector */

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
    if (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme') || document.body.classList.contains('prem-theme')) {
      return true;
    }
    return darkPages.some(p => path === p || path.startsWith(p));
  }

  /* ── 1. Global Favicon Injector ── */
  function initFavicon() {
    if (document.querySelector("link[rel*='icon']")) return;
    const link = document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'shortcut icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🥊</text></svg>';
    document.getElementsByTagName('head')[0].appendChild(link);
  }

  /* ── 2. Global Toast Notification System ── */
  window.CardToast = {
    show: function (msg, duration = 3000) {
      let toastEl = document.getElementById('cf-global-toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'cf-global-toast';
        toastEl.className = 'cf-toast-notification';
        document.body.appendChild(toastEl);
      }
      toastEl.innerHTML = `<span style="margin-right:6px">🥊</span> ${msg}`;
      toastEl.classList.add('show');
      if (toastEl._timer) clearTimeout(toastEl._timer);
      toastEl._timer = setTimeout(() => {
        toastEl.classList.remove('show');
      }, duration);
    }
  };

  /* ── 3. Global Scroll-to-Top Button ── */
  function initScrollToTop() {
    if (document.getElementById('cf-scroll-top')) return;
    const btn = document.createElement('button');
    btn.id = 'cf-scroll-top';
    btn.className = 'cf-scroll-top-btn';
    btn.setAttribute('aria-label', '최상단으로 이동');
    btn.innerHTML = '↑ Top';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        btn.classList.add('show');
      } else {
        btn.classList.remove('show');
      }
    });
  }

  /* ── 4. Global Header Navigation ── */
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
          <input type="text" class="cf-search-input" placeholder="카카오, 주유, 항공마일 검색" onkeydown="if(event.key==='Enter') window.CFHeaderSearch(this.value)" />
          <button type="button" class="cf-search-btn" onclick="window.CFHeaderSearch(this.previousElementSibling.value)" aria-label="검색">
            🔍
          </button>
        </div>
      </div>
    `;
  }

  window.CFHeaderSearch = function (q) {
    if (!q || !q.trim()) return;
    if (typeof filterCards === 'function') {
      const searchInp = document.getElementById('card-search');
      if (searchInp) {
        searchInp.value = q.trim();
        if (typeof showSection === 'function') showSection('cards');
        filterCards();
        window.CardToast && window.CardToast.show(`"${q.trim()}" 검색 결과입니다.`);
        return;
      }
    }
    location.href = '/card?q=' + encodeURIComponent(q.trim());
  };

  window.handleSmartBack = function (fallbackUrl = '/index.html') {
    if (document.referrer && document.referrer.includes(location.host) && !document.referrer.endsWith(location.pathname)) {
      history.back();
    } else {
      location.href = fallbackUrl;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initFavicon();
      initHeader();
      initScrollToTop();
    });
  } else {
    initFavicon();
    initHeader();
    initScrollToTop();
  }
})();
