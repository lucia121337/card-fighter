# Interactive Inline Re-calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive inline spending re-calculator (`#inline-recalc-panel`) in `match_game.html` so users can fine-tune their spending profile directly on the recommendation result screen and see real-time AI updates.

**Architecture:** Toggleable glassmorphism panel containing mini-sliders and quick chips for all 13 spending areas. Adjusting any mini-slider updates `userAnswers`, debounces, re-runs `calculateRecommendations()`, and updates TOP 3 cards, Net ROI, radar chart, and 1:1 comparison UI in real time.

**Tech Stack:** Vanilla JavaScript (ES6), HTML5, CSS3 Glassmorphism, Chart.js.

## Global Constraints
- Language: Korean only for UI copy and comments.
- Pathing: Relative paths inside workspace (`match_game.html`).
- Zero syntax errors verified via `verify_syntax.js`.

---

### Task 1: Add Inline Re-calculator Toggle Button & HTML Panel Container

**Files:**
- Modify: `match_game.html:2670-2695`

**Interfaces:**
- Consumes: `#user-spending-summary-box` DOM container
- Produces: `#inline-recalc-panel` collapsible div and `toggleInlineRecalcPanel()` toggle function

- [ ] **Step 1: Add HTML markup for toggle button and collapsible panel**

```html
<div class="spending-summary-header" style="justify-content: space-between;">
  <div>
    <span class="summary-icon">📊</span>
    <h4 id="summary-total-title" style="display:inline;">내가 입력한 월 지출 내역 (총 0만 원)</h4>
  </div>
  <button type="button" class="inline-recalc-toggle-btn" onclick="toggleInlineRecalcPanel()" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; padding: 6px 12px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer;">
    ✏️ 지출 실시간 수정/실험 <span id="recalc-toggle-icon">▼</span>
  </button>
</div>

<div id="inline-recalc-panel" class="inline-recalc-panel" style="display: none; flex-direction: column; gap: 12px; margin-top: 14px; padding: 16px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 16px;">
  <!-- Mini sliders dynamically rendered via renderInlineRecalcSliders() -->
</div>
```

- [ ] **Step 2: Add CSS styles for `.inline-recalc-panel` and mini-sliders**
- [ ] **Step 3: Verify syntax using `verify_syntax.js`**
- [ ] **Step 4: Commit changes**

```bash
git add match_game.html
git commit -m "feat: add inline recalculator HTML container and CSS styles"
```

---

### Task 2: Implement JS Logic for Live Sync & Real-time AI Re-calculation

**Files:**
- Modify: `match_game.html:4370-4450`

**Interfaces:**
- Consumes: `userAnswers`, `calculateRecommendations()`, `selectBestCardItem()`
- Produces: `renderInlineRecalcSliders()`, `onInlineSpendChange()`, `toggleInlineRecalcPanel()`

- [ ] **Step 1: Implement `toggleInlineRecalcPanel()` and `renderInlineRecalcSliders()`**
- [ ] **Step 2: Implement debounced `onInlineSpendChange(type, val)`**
- [ ] **Step 3: Verify syntax and test live synchronization using `verify_syntax.js`**
- [ ] **Step 4: Commit changes**

```bash
git add match_game.html
git commit -m "feat: implement live sync and real-time recommendation recalculation"
```
