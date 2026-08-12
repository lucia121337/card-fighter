# Card Tile UI Standardization & Button Micro-Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize Card Tile UI components (`.c-card`, `.c-img`, `.c-chip`) and unify Button Micro-interactions across all Card Fighter pages (`common.css`, `index.html`, `search.html`, `match_game.html`, `detail.html`, `compare.html`).

**Architecture:** Extend `common.css` with global design tokens and utility classes (`.c-card`, `.c-img`, `.c-chip`, `.c-btn`, `.c-btn-primary`, `.c-btn-secondary`), and apply them across page styles to ensure visual consistency and smooth `translateY(-2px)` hover micro-interactions with 3px focus rings.

**Tech Stack:** Vanilla CSS, HTML5, JavaScript.

## Global Constraints
- Korean language only for all text, comments, and summaries.
- Relative paths within workspace.
- Preserved existing page logic and event handlers.

---

### Task 1: Add Card Tile & Button Component Tokens in `common.css`

**Files:**
- Modify: `common.css`

- [ ] **Step 1: Write Card Tile & Button Utility Rules in `common.css`**

Add `.c-card`, `.c-img-wrap`, `.c-img`, `.c-chip`, `.c-chip-fee`, `.c-chip-pre`, `.c-chip-chk`, `.c-chip-prem`, `.c-btn`, `.c-btn-primary`, `.c-btn-secondary` and general button hover rules to `common.css`:

```css
/* Global Card Tile Components */
.c-card, .card, .sr-row, .sr-reco-card {
  background: var(--panel);
  border: 1.5px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.c-card:hover, .card:hover, .sr-row:hover, .sr-reco-card:hover {
  transform: translateY(-3px);
  border-color: var(--brand);
  box-shadow: var(--shadow-md);
}

.c-img-wrap, .img-wrap {
  position: relative;
  width: 120px;
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-img, .card-media img, .sr-row img, .sr-reco-card img, .hero img {
  max-width: 100px;
  max-height: 72px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-xs);
  filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.12));
}

/* Global Chip Component */
.c-chip, .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--chip);
  border: 1px solid var(--line);
  color: var(--muted);
}

.c-chip-fee, .chip.fee {
  background: #EFF6FF !important;
  border-color: #BFDBFE !important;
  color: #1D4ED8 !important;
}

.c-chip-pre, .chip.pre {
  background: #F0FDF4 !important;
  border-color: #BBF7D0 !important;
  color: #15803D !important;
}

.c-chip-chk, .chip.chk {
  background: #FFF7ED !important;
  border-color: #FED7AA !important;
  color: #C2410C !important;
  font-weight: 700 !important;
}

.c-chip-prem, .chip.prem {
  background: linear-gradient(90deg, #B8860B, #E3B448) !important;
  border: none !important;
  color: #1A150A !important;
  font-weight: 800 !important;
}

/* Global Button & Micro-Interactions */
button, .detail-btn, .compare-btn, .back, .calc-btn, .c-btn {
  font-family: inherit;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

button:hover:not(:disabled), .detail-btn:hover, .compare-btn:hover, .back:hover, .calc-btn:hover, .c-btn:hover {
  transform: translateY(-2px);
}

button:active:not(:disabled), .detail-btn:active, .compare-btn:active, .back:active, .calc-btn:active, .c-btn:active {
  transform: translateY(0);
}

button:focus-visible, .detail-btn:focus-visible, .compare-btn:focus-visible, .back:focus-visible, .calc-btn:focus-visible, .c-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(20, 92, 230, 0.25);
}

.detail-btn, .back, .c-btn-primary {
  border-radius: var(--radius-sm);
}

#more {
  border-radius: var(--radius-md);
}
```

- [ ] **Step 2: Verify `common.css` syntax**

Run: `node -c common-header.js && curl -I http://127.0.0.1:5500/common.css`
Expected: `HTTP 200 OK`

- [ ] **Step 3: Commit `common.css`**

```bash
git add common.css
git commit -m "feat: add global card tile and button micro-interaction component rules to common.css"
```

---

### Task 2: Standardize Card Tiles and Buttons in `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Clean up redundant card/button overrides in `index.html`**

Update `index.html` CSS rules for `.card`, `.detail-btn`, `.compare-btn`, `#more`, `.chip` to inherit global `common.css` design tokens.

- [ ] **Step 2: Verify `index.html` in browser server**

Run: `curl -I http://127.0.0.1:5500/`
Expected: `HTTP 200 OK`

- [ ] **Step 3: Commit `index.html`**

```bash
git add index.html
git commit -m "style: standardize card tiles and button micro-interactions in index.html"
```

---

### Task 3: Standardize Card Tiles and Buttons in `search.html`, `detail.html`, `compare.html`, `match_game.html`

**Files:**
- Modify: `search.html`
- Modify: `detail.html`
- Modify: `compare.html`
- Modify: `match_game.html`

- [ ] **Step 1: Update card tile and button rules in `search.html`, `detail.html`, `compare.html`, `match_game.html`**

Ensure `.sr-row`, `.sr-reco-card`, `.detail-btn`, `.compare-hero-btn`, `.back` buttons use standard border-radius (8px / 12px), `translateY(-2px)` hover transitions, and unified chip styles.

- [ ] **Step 2: Verify HTTP endpoints**

Run: `curl -I http://127.0.0.1:5500/search.html && curl -I http://127.0.0.1:5500/detail/2691 && curl -I http://127.0.0.1:5500/compare && curl -I http://127.0.0.1:5500/match_game.html`
Expected: All return `HTTP 200 OK`

- [ ] **Step 3: Commit changes**

```bash
git add search.html detail.html compare.html match_game.html
git commit -m "style: standardize card tiles and buttons across search, detail, compare, and match_game pages"
```
