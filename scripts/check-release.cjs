'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = message => {
  console.error(`release-consistency-error: ${message}`);
  process.exitCode = 1;
};

const packageVersion = readJson('package.json').version;
const lockVersion = readJson('package-lock.json').version;
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

if (lockVersion !== packageVersion) {
  fail(`package-lock.json=${lockVersion} package.json=${packageVersion}`);
}

const changelogVersion = changelog.match(/^##\s+([^\s]+)\s+-\s+\d{4}-\d{2}-\d{2}$/m)?.[1];
if (!changelogVersion) {
  fail('CHANGELOG.md has no version heading');
} else if (changelogVersion !== packageVersion) {
  fail(`CHANGELOG.md=${changelogVersion} package.json=${packageVersion}`);
}

const assetVersions = [...html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+\?v=([^"']+)["'][^>]*>/g)]
  .map(match => match[1]);
if (assetVersions.length === 0) {
  fail('public/index.html has no versioned script assets');
}
for (const assetVersion of new Set(assetVersions)) {
  if (assetVersion !== packageVersion) {
    fail(`public/index.html asset=${assetVersion} package.json=${packageVersion}`);
  }
}

if (!process.exitCode) {
  console.log(`release-consistency-ok version=${packageVersion} assets=${assetVersions.length}`);
}
