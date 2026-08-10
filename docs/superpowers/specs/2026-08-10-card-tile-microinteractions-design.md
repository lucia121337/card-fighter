# Design Specification - Card Tile UI Standardization & Button Micro-Interactions

## Overview
This document specifies the design for standardizing Card Tile UI components (`.c-card`, `.c-chip`, `.c-img`) and unifying Button Micro-interactions across Card Fighter (`index.html`, `search.html`, `match_game.html`, `detail.html`, `compare.html`, `calculator.html`).

---

## 1. Global Component Architecture (`common.css`)

### A. Card Tile Component System (`.c-card`)
- **Card Container (`.c-card`, `.card`)**:
  - `background`: `var(--panel)` (`#FFFFFF` in light mode, `#191B23` in dark/prem theme)
  - `border`: `1.5px solid var(--line)` (`#E2E8F0` light, `#3A3320` dark)
  - `border-radius`: `var(--radius-lg)` (`16px`)
  - `box-shadow`: `var(--shadow-sm)` (`0 2px 8px rgba(15,23,42,0.06)`)
  - `transition`: `transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease`
  - `hover`: `transform: translateY(-3px); border-color: var(--brand); box-shadow: var(--shadow-md);`

- **Card Media & Image (`.c-img-wrap`, `.c-img`)**:
  - Aspect ratio: `1.586 : 1` (standard credit card ratio)
  - Image size: `120px` width x `76px` height
  - `object-fit`: `contain`
  - Backdrop radial glow: `radial-gradient(circle, rgba(233,237,243,0.8) 0%, transparent 72%)`
  - Image drop-shadow: `filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.12))`

- **Chips System (`.c-chip`)**:
  - Base Chip: `padding: 4px 10px; font-size: 11.5px; font-weight: 600; border-radius: var(--radius-sm) (8px);`
  - Fee Chip (`.c-chip-fee`, `.chip.fee`): `background: #EFF6FF; border: 1px solid #BFDBFE; color: #1D4ED8;`
  - Cash-back Chip (`.c-chip-cash`, `.chip.pre`): `background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D;`
  - Check Card Chip (`.c-chip-check`, `.chip.chk`): `background: #FFF7ED; border: 1px solid #FED7AA; color: #C2410C;`
  - Premium Chip (`.c-chip-prem`, `.chip.prem`): `background: linear-gradient(90deg, #B8860B, #E3B448); color: #1A150A; font-weight: 800;`

---

## 2. Button & Micro-Interactions System

- **Standard Buttons (`.c-btn`, `.detail-btn`, `.compare-btn`, `.back`, `.calc-btn`)**:
  - `border-radius`: `var(--radius-sm)` (`8px`) for standard action buttons; `var(--radius-md)` (`12px`) for primary CTA buttons.
  - `font-size`: `13px` / `14px`, `font-weight: 700`
  - `transition`: `all 0.15s ease`
  - `hover`: `transform: translateY(-2px); box-shadow: 0 4px 12px rgba(20, 92, 230, 0.25)`
  - `active`: `transform: translateY(0); box-shadow: 0 2px 4px rgba(20, 92, 230, 0.2)`
  - `focus-visible`: `outline: none; box-shadow: 0 0 0 3px rgba(20, 92, 230, 0.25)`

- **Primary CTA Buttons (`.c-btn-primary`, `#more`, `.detail-btn`)**:
  - `background`: `var(--brand)` (`#145CE6`)
  - `color`: `#FFFFFF`
  - `hover`: `background: var(--brand-deep)` (`#0E47C0`)

- **Secondary Outline Buttons (`.c-btn-secondary`, `.compare-btn`)**:
  - `background`: `var(--panel)`
  - `border`: `1.5px solid var(--line)`
  - `color`: `var(--txt)`
  - `hover`: `border-color: var(--brand); color: var(--brand)`

---

## 3. Scope of Page Integration
1. [common.css](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/common.css)
2. [index.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/index.html)
3. [search.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/search.html)
4. [match_game.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/match_game.html)
5. [detail.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/detail.html)
6. [compare.html](file:///Users/yonghee/Documents/icb_cardfighter/card-fighter/compare.html)
