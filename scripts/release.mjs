#!/usr/bin/env node
/**
 * Cut a Community Edition release: node scripts/release.mjs 1.0.2 [--dry-run]
 *
 * 1. Checks the working tree is clean and CHANGELOG.md has a "## <version> — <date>" entry.
 * 2. Writes the version into every package.json, .env.example and docker-compose.yml.
 * 3. Commits "chore: release <version>" and creates the annotated tag v<version>.
 *
 * Nothing is pushed: review, then `git push origin main v<version>`. CI builds and publishes the images,
 * and the release page can be created from the changelog entry.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [version, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/release.mjs <major.minor.patch> [--dry-run]');
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const write = (p, s) => (dryRun ? console.log('would write', p) : writeFileSync(resolve(root, p), s));

// 1. preconditions
if (!dryRun && sh('git status --porcelain')) {
  console.error('working tree is not clean; commit or stash first');
  process.exit(1);
}
if (sh('git tag -l v' + version)) {
  console.error('tag v' + version + ' already exists');
  process.exit(1);
}
const changelog = read('CHANGELOG.md');
if (!new RegExp('^## ' + version.replace(/\./g, '\\.') + ' — \\d{4}-\\d{2}-\\d{2}$', 'm').test(changelog)) {
  console.error('CHANGELOG.md has no "## ' + version + ' — YYYY-MM-DD" entry; write the notes first');
  process.exit(1);
}

// 2. versions
const current = JSON.parse(read('package.json')).version;
const packages = sh('git ls-files "package.json" "apps/*/package.json" "packages/*/package.json" "tests/*/package.json"').split('\n').filter(Boolean);
for (const p of packages) {
  const s = read(p);
  if (!s.includes('"version": "' + current + '"')) {
    console.error(p + ' is at a different version than the root (' + current + ')');
    process.exit(1);
  }
  write(p, s.replace('"version": "' + current + '"', '"version": "' + version + '"'));
}
for (const p of ['.env.example', 'docker-compose.yml']) {
  write(p, read(p).split(current).join(version));
}
console.log(`${current} -> ${version} in ${packages.length} package.json files, .env.example and docker-compose.yml`);

// 3. commit and tag
if (dryRun) {
  console.log('dry run: no commit, no tag');
  process.exit(0);
}
sh('git add -A');
sh(`git commit -q -m "chore: release ${version}"`);
sh(`git tag -a v${version} -m "Jumaah Community Edition ${version}"`);
console.log(`committed and tagged v${version}. Next: git push origin main v${version}`);
