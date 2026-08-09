const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('engine overheat uses a dash-style full-screen cooling alert', () => {
  assert.match(html, /id="overheat-vortex"[^>]*role="status"[^>]*aria-live="assertive"/);
  assert.match(html, /id="overheat-callout"[\s\S]*ENGINE OVERHEAT[\s\S]*COOLING · 냉각/);
  assert.match(html, /#overheat-callout strong::before[^}]*content:\s*"» "/);
  assert.match(html, /#overheat-callout strong::after[^}]*content:\s*" «"/);
  assert.match(html, /#overheat-vortex::before[\s\S]*rgba\(255,72,50/);
  assert.match(html, /@keyframes\s+overheat-impact/);
});

test('cooling alert follows the overheat latch and displays recharge progress', () => {
  assert.match(html, /overheatVisualTarget\s*=\s*me\.engineOverheated\s*\?\s*1\s*:\s*0/);
  assert.match(html, /if\s*\(!wasOverheated && me\.engineOverheated\)\s*triggerOverheatImpact\(\)/);
  assert.match(html, /approachDashIntensity\(overheatVisualStrength,\s*overheatVisualTarget,\s*dt\)/);
  assert.match(html, /me\.energy\s*\/\s*MAX_ENERGY/);
  assert.match(html, /\$\('overheat-cooling-fill'\)\.style\.width\s*=\s*`\$\{coolingPercent\}%`/);
  assert.match(html, /setAttribute\('aria-hidden',\s*String\(!active\)\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*#overheat-vortex::before[^}]*animation:\s*none/s);
});
