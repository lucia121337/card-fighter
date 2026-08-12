# serve.py Vercel Parameterized Rewrite Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `serve.py` so that Vercel parameterized rewrites like `/detail/:idx` are correctly matched via regex, resolving 404 errors when navigating to card detail pages locally.

**Architecture:** Replace exact dictionary lookup in `serve.py` with compiled regex pattern matching (`re.sub(r":\w+", r"[^/]+", src)`), mirroring `serve.js`.

**Tech Stack:** Python 3 (stdlib `re`, `http.server`)

## Global Constraints

- Do not break existing static file serving or exact rewrites in `serve.py`.
- Keep clean code without adding extra non-standard dependencies.

---

### Task 1: Update serve.py rewrite matching logic and verify local 200 OK responses

**Files:**
- Modify: `card-fighter/serve.py`

- [ ] **Step 1: Update `load_rewrites` and `PreviewHandler._rewrite_path` in `card-fighter/serve.py`**

Modify `serve.py` to compile `:param` patterns into regexes:

```python
import re

def load_rewrites():
    """vercel.json 의 rewrites 를 [(compiled_regex, destination)] 로 읽는다."""
    rules = []
    try:
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
            for r in (json.load(f).get("rewrites") or []):
                src, dst = r.get("source"), r.get("destination")
                if src and dst:
                    pattern_str = "^" + re.sub(r":\w+", r"[^/]+", src) + "$"
                    rules.append((re.compile(pattern_str), dst))
    except (OSError, ValueError):
        pass
    return rules

REWRITES = load_rewrites()

class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def _rewrite_path(self):
        parts = urllib.parse.urlsplit(self.path)
        p = parts.path
        dst = None
        for pattern, destination in REWRITES:
            if pattern.match(p):
                dst = destination
                break
        if not dst and p and p != "/" and not os.path.splitext(p)[1]:
            candidate = os.path.join(ROOT, p.lstrip("/").replace("/", os.sep) + ".html")
            if os.path.isfile(candidate):
                dst = p + ".html"
        if dst:
            self.path = urllib.parse.urlunsplit(("", "", dst, parts.query, parts.fragment))
```

- [ ] **Step 2: Verify `serve.py` works by running a quick test request against `/detail/2691`**

Run: `python3 -c "import serve; rules = serve.load_rewrites(); assert any(pat.match('/detail/2691') for pat, _ in rules)"`
Expected: PASS with no assertion error.

- [ ] **Step 3: Replace running `serve.py` server process or restart it**

Kill any existing process on port 5500 if running, and test `curl -I http://127.0.0.1:5500/detail/2691`.
Expected: `HTTP/1.0 200 OK`.

- [ ] **Step 4: Commit changes**

```bash
git add card-fighter/serve.py
git commit -m "fix: support parameterized vercel rewrites in serve.py"
```
