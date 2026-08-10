# Global Design Tokens & Common GNB Header System Design Spec

## Overview
Standardize UI design tokens (colors, typography, radii, shadows) and implement a single, unified GNB header component across all Card Fighter pages to eliminate visual disparities between pages worked on by different developers.

## Design Details

### 1. Global Design Tokens (`common.css`)
Location: `card-fighter/common.css`

```css
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
```

### 2. Common GNB Header (`common-header.js` & `common.css`)
Location: `card-fighter/common-header.js`

- **Brand Logo**: ⚔️ **카드파이터** (Clicking links to `/`)
- **Navigation Links**:
  - `전체카드` (`/card` / `/index.html`)
  - `캐시백이벤트` (`/event`)
  - `할인가맹점` (`/shopping`)
  - `카드연구소` (`/cardlab`)
  - `혜택계산기` (`/calculator.html`)
- **Header Search Bar**: Integrated search input with magnifying glass button redirecting to `/search.html?q=...`.
- **Active Tab Highlighting**: Dynamically matches `location.pathname` to add the `.active` class to the current menu link.
- **Responsive Mobile Layout**: Horizontal scrolling nav with hidden scrollbars for screens under 640px.

### 3. Page Integrations
Include `<link rel="stylesheet" href="/common.css">` and `<script src="/common-header.js"></script>` across:
- `index.html`
- `search.html`
- `calculator.html`
- `cardlab.html`
- `detail.html`
- `compare.html`
- `match_game.html`
