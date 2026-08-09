const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const homeCss = fs.readFileSync(path.join(publicDir, 'home-screen.css'), 'utf8');
const flowCss = fs.readFileSync(path.join(publicDir, 'multiplayer-flow.css'), 'utf8');

test('costume showroom follows dynamic viewport height on short laptops', () => {
  assert.match(homeCss, /\.costume-dialog\s*\{[\s\S]*max-height:\s*calc\(100dvh - 44px\)/);
  assert.match(homeCss, /@media \(min-width: 901px\) and \(max-height: 820px\)/);
  assert.match(homeCss, /height:\s*clamp\(350px, calc\(100dvh - 142px\), 535px\)/);
  assert.match(homeCss, /@media \(min-width: 901px\) and \(max-height: 650px\)/);
});

test('paper-plane showroom compacts controls and cards for short desktop viewports', () => {
  assert.match(flowCss, /@media \(min-width:761px\) and \(max-height:820px\)/);
  assert.match(flowCss, /#folding-screen\s*\{[^}]*row-gap:\s*clamp\([^}]*padding:\s*clamp\(/s);
  assert.match(flowCss, /\.fold-preset-card\s*\{[^}]*min-height:\s*clamp\(50px,9dvh,62px\)/s);
  assert.match(flowCss, /@media \(min-width:761px\) and \(max-height:650px\)[\s\S]*\.fold-showroom-plaque[^}]*display:none/);
});

test('fine-pointer laptop HUD scales in progressive height breakpoints', () => {
  for (const [height, scale] of [[820, '.88'], [720, '.78'], [620, '.68']]) {
    const query = new RegExp(
      `@media \\(hover: hover\\) and \\(pointer: fine\\) and \\(min-width: 841px\\) and \\(max-height: ${height}px\\)`
    );
    assert.match(html, query);
    assert.match(html, new RegExp(`#hud-right-rail \\{[^}]*transform: scale\\(\\${scale}\\)`, 's'));
  }
  assert.match(html, /max-height: 620px\)[\s\S]*#hud-right-rail > #keys\s*\{\s*display:\s*none/);
});
