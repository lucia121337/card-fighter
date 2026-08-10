# Design Specification - UI/UX System Overhaul (Items 5 to 10)

## Overview
This document specifies the design for completing UI/UX system enhancements across Card Fighter:
5. Responsive Breakpoints (640px Mobile / 1024px Desktop)
6. Skeleton UI & Empty State Standardization
7. Unified Modal & Bottom Sheet System
8. Smart Back Button Navigation Depth
9. Typography Scale System
10. Global Footer & Legal Disclaimer Standard Template

---

## 1. Component & Style Architecture (`common.css`, `common-header.js`)

### 5. Breakpoint Standardization
- **Mobile Breakpoint**: `@media (max-width: 640px)`
- **Desktop Breakpoint**: `@media (min-width: 1024px)`
- Consolidate legacy `768px` and `900px` media queries into these two standard breakpoints.

### 6. Skeleton UI & Empty State Component
- **Skeleton Pulse Shimmer (`.skeleton-card`, `.skeleton-img`, `.skeleton-line`)**:
  - Linear gradient shimmer animation: `background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;`
- **Empty State (`.c-empty-state`)**:
  - Icon: 48px size emoji (`🔍` or `💳`)
  - Title: 17px Bold 700 (`var(--txt)`)
  - Subtitle: 13.5px Regular (`var(--muted)`)
  - Action Button: Standard primary button (`.c-btn-primary`)

### 7. Unified Modal & Bottom Sheet System (`.c-modal`)
- **Desktop Mode (Default)**:
  - Centered overlay box with `backdrop-filter: blur(8px)`, `border-radius: 20px`, shadow `0 20px 40px rgba(0,0,0,0.2)`.
  - Top-right close button `X`.
- **Mobile Mode (`@media (max-width: 640px)`)**:
  - Bottom Sheet sliding up from bottom: `position: fixed; bottom: 0; border-radius: 24px 24px 0 0; max-height: 85vh;`
  - Top drag indicator bar (`width: 36px; height: 4px; border-radius: 99px; background: var(--line);`).

### 8. Smart Back Button (`.back`)
- JavaScript handler for `.back` button:
  ```javascript
  function handleSmartBack(fallbackUrl = '/index.html') {
    if (document.referrer && document.referrer.includes(location.host)) {
      history.back();
    } else {
      location.href = fallbackUrl;
    }
  }
  ```

### 9. Typography Scale
- `H1` (Page Title): `24px / line-height: 1.3`, `font-weight: 800`
- `H2` (Section Title): `19px / line-height: 1.35`, `font-weight: 800`
- `H3` (Subhead): `16px / line-height: 1.4`, `font-weight: 700`
- `Body 1` (Main text): `15px / line-height: 1.5`, `font-weight: 600`
- `Body 2` (Sub text): `13.5px / line-height: 1.55`, `font-weight: 500`
- `Caption` (Label/Chip): `11.5px / line-height: 1.4`, `font-weight: 600`

### 10. Global Footer (`.cf-global-footer`)
- Added automatically via `common-header.js` or shared script:
  - Brand section with logo 🥊 **카드파이터**
  - Disclaimer: "본 서비스에서 제공하는 카드 혜택 정보는 카드사 사정에 따라 변동될 수 있습니다."
  - Copyright: `© 2026 CardFighter. All rights reserved.`

---

## 2. File Integration Scope
1. `common.css` - Global Breakpoints, Skeleton, Modal, Bottom Sheet, Typography
2. `common-header.js` - Global Footer & Smart Back Button helper
3. `index.html` - Skeleton loading, Cashback modal, Footer
4. `search.html` - Empty state, Skeleton grid, Breakpoint cleanup
5. `detail.html` - Smart Back Button, Legal Disclaimer, Footer
6. `compare.html` - Modal, Smart Back Button, Footer
7. `cardlab.html` - Footer & Typography alignment
