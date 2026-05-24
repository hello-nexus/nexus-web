#!/usr/bin/env bash
# E2E contract test for Settings: language switching, theme switching, build integrity.
# Requires: node (for JS execution), curl.
# Usage: bash scripts/e2e-settings.sh [base_url]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASE="${1:-http://localhost:9400}"
PASS=0
FAIL=0

pass() { ((PASS++)); echo "  ✓ $1"; }
fail() { ((FAIL++)); echo "  ✗ $1"; }

echo "=== Nexus Settings E2E Tests ==="
echo "Base: $BASE"
echo ""

# ── 1. Build integrity ───────────────────────────────────────────────────────
echo "── Build integrity ──"

# Check that index.html is served
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$HTTP_CODE" == "200" ]] && pass "index.html served (HTTP $HTTP_CODE)" || fail "index.html not served (HTTP $HTTP_CODE)"

# Check that the main JS bundle loads
INDEX_HTML=$(curl -s "$BASE/")
JS_PATH=$(echo "$INDEX_HTML" | grep -oE 'src="/assets/index-[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
if [[ -n "$JS_PATH" ]]; then
  JS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$JS_PATH")
  [[ "$JS_CODE" == "200" ]] && pass "Main JS bundle loads ($JS_PATH)" || fail "Main JS bundle failed ($JS_CODE)"
else
  fail "No JS bundle found in index.html"
fi

# Check that CSS loads
CSS_PATH=$(echo "$INDEX_HTML" | grep -oE 'href="/assets/index-[^"]+\.css"' | head -1 | sed 's/href="//;s/"//')
if [[ -n "$CSS_PATH" ]]; then
  CSS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$CSS_PATH")
  [[ "$CSS_CODE" == "200" ]] && pass "CSS bundle loads ($CSS_PATH)" || fail "CSS bundle failed ($CSS_CODE)"
else
  fail "No CSS bundle found in index.html"
fi

echo ""

# ── 2. Locale file integrity ─────────────────────────────────────────────────
echo "── Locale files ──"

LOCALES="en zh-TW zh-CN ja ko de fr es"
for lang in $LOCALES; do
  # Find the chunk for this locale
  LOCALE_PATH=$(curl -s "$BASE/" | cat)
  # Locale chunks are lazy-loaded, so check they exist in the assets dir
  LOCALE_FILE=$(ls -1 "$REPO_ROOT"/dist/assets/${lang}-*.js 2>/dev/null | head -1)
  if [[ -n "$LOCALE_FILE" ]]; then
    # Verify it contains translation keys
    if grep -q "nav.monitoring" "$LOCALE_FILE" 2>/dev/null; then
      pass "Locale $lang has nav.monitoring key"
    else
      fail "Locale $lang missing nav.monitoring key"
    fi
  else
    fail "Locale $lang chunk not found in dist/"
  fi
done

echo ""

# ── 3. Translation completeness ──────────────────────────────────────────────
echo "── Translation completeness ──"

EN_KEYS=$(node -e "const en = require('./src/locales/en.json'); console.log(Object.keys(en).length)")
echo "  English has $EN_KEYS keys"

for lang in $LOCALES; do
  if [[ "$lang" == "en" ]]; then continue; fi
  LANG_KEYS=$(node -e "const l = require('./src/locales/${lang}.json'); console.log(Object.keys(l).length)")
  if [[ "$LANG_KEYS" == "$EN_KEYS" ]]; then
    pass "$lang has $LANG_KEYS keys (matches en)"
  else
    fail "$lang has $LANG_KEYS keys (expected $EN_KEYS)"
  fi
done

echo ""

# ── 4. Theme CSS variables ───────────────────────────────────────────────────
echo "── Theme CSS ──"

CSS_FILE=$(ls -1 "$REPO_ROOT"/dist/assets/index-*.css 2>/dev/null | head -1)
if [[ -n "$CSS_FILE" ]]; then
  # Check dark theme variables exist
  grep -q "\-\-bg:" "$CSS_FILE" && pass "CSS has --bg variable" || fail "CSS missing --bg"
  grep -q "\-\-accent:" "$CSS_FILE" && pass "CSS has --accent variable" || fail "CSS missing --accent"

  # Check light theme exists
  grep -q 'data-theme.*light' "$CSS_FILE" && pass "CSS has light theme" || fail "CSS missing light theme"
  grep -q 'data-theme.*dark' "$CSS_FILE" && pass "CSS has dark theme" || fail "CSS missing dark theme"
else
  fail "CSS file not found"
fi

echo ""

# ── 5. Settings code structure ───────────────────────────────────────────────
echo "── Settings code structure ──"

# Theme tab must NOT exist
JS_MAIN=$(ls -1 "$REPO_ROOT"/dist/assets/index-*.js 2>/dev/null | head -1)
if [[ -n "$JS_MAIN" ]]; then
  ! grep -q "gradientStyle" "$JS_MAIN" && pass "No gradient code in bundle" || fail "Gradient code still in bundle"
  ! grep -q "colorSwatch" "$JS_MAIN" && pass "No color picker code in bundle" || fail "Color picker code still in bundle"
  ! grep -q "creditsIntro" "$JS_MAIN" && pass "No credits code in bundle" || fail "Credits code still in bundle"

  # Theme mode must exist
  grep -q "themeMode" "$JS_MAIN" && pass "themeMode exists in bundle" || fail "themeMode missing from bundle"
  grep -q "data-theme" "$JS_MAIN" && pass "data-theme switching exists" || fail "data-theme switching missing"

  # i18n must exist — check for the i18n context string (survives minification)
  grep -q "I18nProvider" "$JS_MAIN" || grep -q "locales/" "$JS_MAIN" && pass "i18n system exists in bundle" || fail "i18n system missing"
fi

echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "SOME TESTS FAILED"
  exit 1
fi
