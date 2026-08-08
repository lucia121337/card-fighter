# Interactive Inline Re-calculator Design Specification

- **Date:** 2026-08-08
- **Topic:** Interactive Inline Re-calculator for Spending Profile Adjustment
- **Target File:** `match_game.html`

## 1. Executive Summary
The Interactive Inline Re-calculator allows users on the AI Card Recommendation result view (`#game-result-cards`) to expand an inline adjustment panel (`#inline-recalc-panel`). Users can adjust any of the 13 spending areas via mini-sliders or quick chips without restarting the quiz. Changes trigger real-time re-computation of AI recommendation rankings, net annual benefits, radar charts, breakdown modals, and 1:1 card comparisons.

## 2. Component & Architecture Design

### 2.1 UI Layout & Placement
- **Trigger Button:** Added to the header of `#user-spending-summary-box`:
  ```html
  <button type="button" class="inline-recalc-toggle-btn" onclick="toggleInlineRecalcPanel()">
    ✏️ 지출 실시간 수정/실험 <span id="recalc-toggle-icon">▼</span>
  </button>
  ```
- **Adjustment Panel (`#inline-recalc-panel`):** Collapsible panel placed inside `#user-spending-summary-box`. Contains 13 category mini-sliders with quick adjustment chips (+1만, +5만, +10만, Reset).

### 2.2 Data Flow & State Management
1. User adjusts a slider or clicks a quick chip in `#inline-recalc-panel`.
2. Event listener fires `onInlineSpendChange(type, value)`.
3. `userAnswers[type + '_spend']` is updated and synced with main quiz slider `#type-slider`.
4. `calculateRecommendations()` is invoked asynchronously (debounced 100ms for smooth dragging).
5. TOP 3 card items, Net ROI calculations, picking rate charts, and 1:1 comparison vs-box update live in DOM.

### 2.3 Visual Design System
- Panel Background: Glassmorphism `linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.7))` with `border: 1px solid rgba(56, 189, 248, 0.25)`.
- Mini Slider styling: Compact height (`6px`), cyan neon gradient fill.
- Smooth collapse/expand animation (`max-height` transition + opacity).

## 3. Verification Plan
1. **Interactive Functionality:** Moving any mini-slider updates total monthly spend and immediately updates the TOP 1 recommendation card.
2. **State Sync:** Going back to quiz reflects updated spending values accurately.
3. **Syntax & Performance:** 0 syntax errors, 0 lag during slider dragging.
