# UI/UX System Overhaul (Items 5 to 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 key UI/UX system improvements: (5) 640px/1024px Breakpoints, (6) Skeleton UI & Empty State, (7) Modal & Mobile Bottom Sheet, (8) Smart Back Button, (9) Typography Scale, and (10) Global Footer & Legal Disclaimer across Card Fighter.

**Architecture:** Add global component systems, responsive utility classes, smart back navigation handlers, and global footer renderer to `common.css` and `common-header.js`, then integrate across `index.html`, `search.html`, `detail.html`, `compare.html`, `cardlab.html`.

**Tech Stack:** Vanilla CSS, JavaScript, HTML5.

## Global Constraints
- Korean language only for all text, comments, and summaries.
- Relative paths within workspace.
- Preserved existing functionality and event listeners.

---

### Task 1: Add Typography Scale, Skeleton UI, Modal & Bottom Sheet, and Footer in `common.css` & `common-header.js`

**Files:**
- Modify: `common.css`
- Modify: `common-header.js`

- [ ] **Step 1: Add Typography, Skeleton Shimmer, Modal & Bottom Sheet, and Breakpoints to `common.css`**

Append global typography rules, `.skeleton-card`, `.c-empty-state`, `.c-modal`, `.c-bottom-sheet`, and `640px`/`1024px` media query rules to `common.css`.

- [ ] **Step 2: Add Smart Back Button helper and Global Footer injector in `common-header.js`**

In `common-header.js`, add `window.handleSmartBack()` and auto-inject `.cf-global-footer` into page bottom.

- [ ] **Step 3: Verify HTTP status of `common.css` and `common-header.js`**

Run: `curl -I http://127.0.0.1:5500/common.css && curl -I http://127.0.0.1:5500/common-header.js`
Expected: Both return `HTTP 200 OK`

- [ ] **Step 4: Commit Task 1**

```bash
git add common.css common-header.js
git commit -m "feat: add global typography, skeleton UI, bottom sheet modal, and smart back helper to core CSS/JS"
```

---

### Task 2: Implement Skeleton UI, Cashback Bottom Sheet Modal, and Footer in `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace spinner with Skeleton Card placeholders in `index.html`**

Update `index.html` initial card list rendering state to show 3 `.skeleton-card` shimmers before data loads.

- [ ] **Step 2: Update Cashback Modal to Bottom Sheet on Mobile (`max-width: 640px`)**

Apply `.c-modal` / `.c-bottom-sheet` styles to `index.html` modal popups.

- [ ] **Step 3: Verify `index.html` in server**

Run: `curl -I http://127.0.0.1:5500/`
Expected: `HTTP 200 OK`

- [ ] **Step 4: Commit Task 2**

```bash
git add index.html
git commit -m "feat: implement skeleton UI, bottom sheet cashback modal, and global footer in index.html"
```

---

### Task 3: Implement Smart Back Button, Legal Disclaimer, and Skeleton UI in `detail.html`, `search.html`, `compare.html`, `cardlab.html`

**Files:**
- Modify: `detail.html`
- Modify: `search.html`
- Modify: `compare.html`
- Modify: `cardlab.html`

- [ ] **Step 1: Wire Smart Back Button (`onclick="handleSmartBack()"`) in `detail.html` and `compare.html`**

Update `.back` link click handler to invoke `handleSmartBack()`.

- [ ] **Step 2: Implement Skeleton UI & Empty State in `search.html` and `detail.html`**

Use `.c-empty-state` in `search.html` when search yields no results.

- [ ] **Step 3: Verify all endpoints**

Run: `curl -I http://127.0.0.1:5500/search.html && curl -I http://127.0.0.1:5500/detail/2691 && curl -I http://127.0.0.1:5500/compare && curl -I http://127.0.0.1:5500/cardlab`
Expected: All return `HTTP 200 OK`

- [ ] **Step 4: Commit Task 3**

```bash
git add detail.html search.html compare.html cardlab.html
git commit -m "feat: apply smart back button, skeleton UI, empty state, and footer across detail, search, compare, cardlab"
```
