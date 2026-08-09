const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const costumeState = require('../public/costume-state.js');
const costumeTemplates = require('../public/costume-template.js');

test('costumes use independent head, nose, and paired-wing slots with safe persisted values', () => {
  assert.deepEqual(costumeState.HATS, ['none', 'santa', 'magic', 'police']);
  assert.deepEqual(costumeState.NOSES, ['none', 'rudolph']);
  assert.deepEqual(costumeState.WINGS, ['none', 'twin-jets']);
  assert.deepEqual(costumeState.normalize({ hat: 'santa', nose: 'rudolph', wings: 'twin-jets' }), {
    hat: 'santa', nose: 'rudolph', wings: 'twin-jets'
  });
  assert.deepEqual(costumeState.normalize({ hat: 'script', nose: '../../nose', wings: 'one-jet' }), {
    hat: 'none', nose: 'none', wings: 'none'
  });
  assert.deepEqual(costumeState.normalize('{"hat":"magic","nose":"rudolph"}'), {
    hat: 'magic', nose: 'rudolph', wings: 'none'
  });
});

test('the home costume panel exposes every requested item and three body-part groups', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public', 'home-screen.css'), 'utf8');
  for (const id of ['santa', 'rudolph', 'magic', 'police', 'twin-jets']) {
    assert.match(html, new RegExp(`data-costume-id="${id}"`));
  }
  assert.match(html, /data-costume-slot="hat"/);
  assert.match(html, /data-costume-slot="nose"/);
  assert.match(html, /data-costume-slot="wings"/);
  assert.match(html, /중앙 날개 뒤쪽/);
  assert.match(html, /양쪽 날개/);
  assert.match(html, /비행기 가장 앞부분/);
  assert.equal((html.match(/class="costume-preview-3d"/g) || []).length, 5);
  assert.match(html, /src="\.\/costume-preview-3d\.js"/);
  assert.match(css, /\.costume-options/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test('costume templates define typed attachment transforms for flight and standing showrooms', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'public', 'costume-3d.js'), 'utf8');
  assert.equal(costumeTemplates.ITEMS.santa.type, 'head');
  assert.equal(costumeTemplates.ITEMS.rudolph.type, 'nose');
  assert.equal(costumeTemplates.ITEMS['twin-jets'].type, 'wing');
  assert.deepEqual(costumeTemplates.resolveAttachments('santa', 'standing')[0].position, [0, -.96, .76]);
  assert.deepEqual(costumeTemplates.resolveAttachments('rudolph', 'standing')[0].position, [0, 3.52, -.2]);
  const standingWings = costumeTemplates.resolveAttachments('twin-jets', 'standing');
  assert.equal(standingWings.length, 2);
  assert.deepEqual(standingWings.map(point => point.rotation), [
    [Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]
  ]);
  assert.match(source, /costumeTemplates\.resolveAttachments\(itemId, layout\)/);
  assert.match(source, /function makeSantaHat\(/);
  assert.match(source, /function makeRudolphNose\(/);
  assert.match(source, /function makeMagicHat\(/);
  assert.match(source, /function makePoliceLight\(/);
  assert.match(source, /function makeJetEngine\(/);
});

test('selection cards render the same procedural costume meshes as rotating 3d previews', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'public', 'costume-preview-3d.js'), 'utf8');
  assert.match(source, /import \{ animateCostumes, costumeTemplates, createCostumeGroup \} from '\.\/costume-3d\.js'/);
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
  assert.match(html, /const nextKey = `\$\{layout}:\$\{normalized\.hat}:\$\{normalized\.nose}:\$\{normalized\.wings}`/);
  assert.match(html, /t: 'hello'[\s\S]*costume: selectedCostume/);
  assert.match(html, /send\(\{ t: 'costume', costume: selectedCostume \}\)/);
});
