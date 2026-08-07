const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const costumeState = require('../public/costume-state.js');

test('costumes use independent hat and nose slots with safe persisted values', () => {
  assert.deepEqual(costumeState.HATS, ['none', 'santa', 'magic', 'police']);
  assert.deepEqual(costumeState.NOSES, ['none', 'rudolph']);
  assert.deepEqual(costumeState.normalize({ hat: 'santa', nose: 'rudolph' }), {
    hat: 'santa', nose: 'rudolph'
  });
  assert.deepEqual(costumeState.normalize({ hat: 'script', nose: '../../nose' }), {
    hat: 'none', nose: 'none'
  });
  assert.deepEqual(costumeState.normalize('{"hat":"magic","nose":"rudolph"}'), {
    hat: 'magic', nose: 'rudolph'
  });
});

test('the home costume panel exposes every requested item and two body-part groups', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public', 'home-screen.css'), 'utf8');
  for (const id of ['santa', 'rudolph', 'magic', 'police']) {
    assert.match(html, new RegExp(`data-costume-id="${id}"`));
  }
  assert.match(html, /data-costume-slot="hat"/);
  assert.match(html, /data-costume-slot="nose"/);
  assert.match(html, /오른쪽 날개 뒤쪽 ⅔ 지점/);
  assert.match(html, /비행기 가장 앞부분/);
  assert.equal((html.match(/class="costume-preview-3d"/g) || []).length, 4);
  assert.match(html, /src="\.\/costume-preview-3d\.js"/);
  assert.match(css, /\.costume-options/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test('procedural 3d costumes are anchored to the flight nose and rear right wing', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'public', 'costume-3d.js'), 'utf8');
  assert.match(source, /hat: Object\.freeze\(\{ position: \[\.79, \.18, \.47\]/);
  assert.match(source, /nose: Object\.freeze\(\{ position: \[0, \.02, -1\.96\]/);
  assert.match(source, /function makeSantaHat\(/);
  assert.match(source, /function makeRudolphNose\(/);
  assert.match(source, /function makeMagicHat\(/);
  assert.match(source, /function makePoliceLight\(/);
});

test('selection cards render the same procedural costume meshes as rotating 3d previews', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'public', 'costume-preview-3d.js'), 'utf8');
  assert.match(source, /import \{ animateCostumes, createCostumeGroup \} from '\.\/costume-3d\.js'/);
  assert.match(source, /createCostumeGroup\(selectionFor\(id\)\)/);
  assert.match(source, /preview\.object\.rotation\.y = seconds/);
  assert.match(source, /preview\.renderer\.render\(preview\.scene, preview\.camera\)/);
});

test('costumes are persisted, rendered on local and remote craft, and sent to the server', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  assert.match(html, /window\.costumeState\.save\(next\)/);
  assert.match(html, /setGameplayCostume\(craft, selectedCostume, 'flight'\)/);
  assert.match(html, /setGameplayCostume\(existing\.remote\.group, existing\.costume, 'flight'\)/);
  assert.match(html, /function setGameplayCostume\([\s\S]*detachObjectMaterials\(previous\)[\s\S]*setCostumeOnObject\(owner, normalized, layout\)[\s\S]*registerObjectMaterials\(current\)/);
  assert.match(html, /t: 'hello'[\s\S]*costume: selectedCostume/);
  assert.match(html, /send\(\{ t: 'costume', costume: selectedCostume \}\)/);
});
