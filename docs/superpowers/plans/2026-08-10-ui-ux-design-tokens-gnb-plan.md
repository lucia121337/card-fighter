# Global Design Tokens & Common GNB Header System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create unified `common.css` and `common-header.js` files, and integrate them into key site pages (`index.html`, `search.html`, `calculator.html`, `cardlab.html`, `detail.html`, `compare.html`, `match_game.html`) to deliver consistent typography, color palette, logo, GNB links, search bar, and active state indicators.

**Architecture:** Create global design tokens in `common.css` and a web component / auto-rendering script in `common-header.js` that renders standard GNB header markup and handles active tab highlights dynamically based on `location.pathname`.

**Tech Stack:** Vanilla CSS3 (Custom Properties), Vanilla JS (ES6)

## Global Constraints

- Preserve page-specific features (e.g. search input functionality) while standardizing GNB header layout.
- Ensure 100% responsiveness on mobile devices (`max-width: 640px`).

---

### Task 1: Create `common.css` design tokens and GNB header stylesheet

**Files:**
- Create: `card-fighter/common.css`

- [ ] **Step 1: Write `common.css` with CSS custom properties and header styling**

```css
/* Card Fighter Global Design Tokens & Header Styles */

:root {
  /* Brand Primary Colors */
  --brand: #145CE6;
  --brand-deep: #0E47C0;
  --brand-light: #E8F0FD;
  --brand-soft: #BFDBFE;

  /* Neutral Background & Surface Colors */
  --bg: #F5F7FA;
  --panel: #FFFFFF;
  --panel2: #F8FAFC;
  --line: #E2E8F0;

  /* Typography Colors */
  --txt: #1E293B;
  --muted: #64748B;
  --sub: #475569;

  /* Accent & Semantic Colors */
  --accent: #2563EB;
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;

  /* Border Radii */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 22px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 18px rgba(20, 92, 230, 0.07);

  /* Layout */
  --header-height: 60px;
  --max-width: 1200px;
}

/* Header Base Styling */
.cf-global-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
  padding: 0 24px;
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.cf-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cf-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--txt);
  cursor: pointer;
}

.cf-logo-icon {
  font-size: 22px;
  line-height: 1;
}

.cf-logo-text {
  font-family: 'GmarketSans', 'Noto Sans KR', sans-serif;
  font-size: 19px;
  font-weight: 800;
  color: var(--txt);
  letter-spacing: -0.5px;
  white-space: nowrap;
}

.cf-gnb-divider {
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 4px;
}

.cf-gnb {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.cf-gnb::-webkit-scrollbar {
  display: none;
}

.cf-gnb-item {
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  transition: all 0.15s ease;
}

.cf-gnb-item:hover {
  background: var(--brand-light);
  color: var(--brand);
}

.cf-gnb-item.active {
  background: var(--brand-light);
  color: var(--brand);
  font-weight: 800;
}

.cf-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cf-search-box {
  display: flex;
  align-items: center;
  background: #F1F5F9;
  border: 1.5px solid var(--line);
  border-radius: var(--radius-full);
  padding: 4px 14px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.cf-search-box:focus-within {
  border-color: var(--brand);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(20, 92, 230, 0.12);
}

.cf-search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: var(--txt);
  width: 180px;
  font-family: inherit;
}

.cf-search-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cf-search-btn:hover {
  color: var(--brand);
}

@media (max-width: 768px) {
  .cf-global-header {
    padding: 0 16px;
  }
  .cf-search-input {
    width: 120px;
  }
}

@media (max-width: 640px) {
  .cf-search-box {
    display: none;
  }
}
```

- [ ] **Step 2: Commit `common.css`**

```bash
git add common.css
git commit -m "feat: add common.css global design tokens and GNB styles"
```

---

### Task 2: Create `common-header.js` auto-rendering component

**Files:**
- Create: `card-fighter/common-header.js`

- [ ] **Step 1: Write `common-header.js` to render unified GNB header**

```javascript
/* Card Fighter Common GNB Header Injector */

(function () {
  const routes = [
    { name: '전체카드', url: '/card', match: ['/', '/card', '/index.html'] },
    { name: '캐시백이벤트', url: '/event', match: ['/event'] },
    { name: '할인가맹점', url: '/shopping', match: ['/shopping'] },
    { name: '카드연구소', url: '/cardlab', match: ['/cardlab'] },
    { name: '혜택계산기', url: '/calculator.html', match: ['/calculator.html'] }
  ];

  function getActiveTab(path) {
    for (const r of routes) {
      if (r.match.some(m => m === '/' ? path === '/' : path.startsWith(m))) {
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
          <span class="cf-logo-icon">⚔️</span>
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
```

- [ ] **Step 2: Commit `common-header.js`**

```bash
git add common-header.js
git commit -m "feat: add common-header.js unified GNB injector script"
```

---

### Task 3: Integrate `common.css` and `common-header.js` across HTML pages

**Files:**
- Modify: `card-fighter/index.html`
- Modify: `card-fighter/search.html`
- Modify: `card-fighter/calculator.html`
- Modify: `card-fighter/cardlab.html`
- Modify: `card-fighter/detail.html`

- [ ] **Step 1: Include `common.css` and `common-header.js` in `<head>` and body of key HTML files**

Add `<link rel="stylesheet" href="/common.css">` and `<script src="/common-header.js" defer></script>` in `<head>` for each file.

- [ ] **Step 2: Verify in browser that GNB header renders identically across `http://localhost:5500/`, `/search.html`, `/calculator.html`, `/cardlab`, `/detail/2691`**

Run: `curl -I http://127.0.0.1:5500/` and check 200 OK.

- [ ] **Step 3: Commit integration changes**

```bash
git add index.html search.html calculator.html cardlab.html detail.html
git commit -m "refactor: integrate global design tokens and common GNB header across main pages"
```
