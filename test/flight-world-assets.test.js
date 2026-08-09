'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const decor = fs.readFileSync(path.join(root, 'public', 'flight-world-decor.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

const assetNames = [
  'hot-air-balloon-a',
  'hot-air-balloon-b',
  'hot-air-balloon-c',
  'airship-g',
  'airship-h'
];

test('selected airborne assets are valid local GLB 2.0 files', () => {
  for (const name of assetNames) {
    const file = path.join(root, 'public', 'assets', 'flight', `${name}.glb`);
    const data = fs.readFileSync(file);
    assert.equal(data.subarray(0, 4).toString('ascii'), 'glTF', name);
    assert.equal(data.readUInt32LE(4), 2, name);
    assert.equal(data.readUInt32LE(8), data.length, name);
  }
});

test('arena decor loads every selected asset and preserves procedural fallbacks', () => {
  assert.match(decor, /GLTFLoader/);
  assert.match(decor, /const FLIGHT_ASSETS = Object\.freeze/);
  assert.match(decor, /function normalizeLoadedFlightModel\(/);
  assert.match(decor, /makeHotAirBalloon\(index\)/);
  assert.match(decor, /makeBalloonAirship\(index\)/);
  assert.match(decor, /child\.material[\s\S]*flightAssetOwned/);
  assert.match(decor, /flightAssetPromises\.delete\(assetKey\)/);
  assert.match(decor, /function disposeFlightFallback\([\s\S]*const geometries = new Set\(\)[\s\S]*const materials = new Set\(\)/);
  assert.match(index, /disposeOwnedFlightMaterials\(arenaFlyObjects\)/);
  assert.match(index, /material\.userData\.flightAssetOwned[\s\S]*unregisterLitMaterial\(material\)/);
  assert.match(index, /createArenaFlyObjects\([\s\S]*detachObjectMaterials\(fallback\)[\s\S]*registerObjectMaterials\(loaded\)/);
  for (const name of assetNames) assert.match(decor, new RegExp(`${name}\\.glb`));
});

test('selected CC BY assets have repository attribution', () => {
  const credits = fs.readFileSync(path.join(root, 'public', 'assets', 'flight', 'CREDITS.md'), 'utf8');
  for (const name of assetNames) assert.match(credits, new RegExp(name));
  assert.match(credits, /Creative Commons Attribution/i);
  assert.match(credits, /Poly by Google/);
});
