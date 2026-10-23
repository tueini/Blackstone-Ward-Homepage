import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { safeURL, dateValue } from '../public/js/content.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML ids');
for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith('#')) assert.ok(ids.includes(ref.slice(1)), `Missing anchor ${ref}`);
  else if (!/^[a-z]+:/i.test(ref)) assert.ok(fs.existsSync(path.resolve(publicDir, ref.split(/[?#]/)[0])), `Missing asset ${ref}`);
}
for (const cssFile of ['styles.css', 'seasons.css', 'site.css']) {
  const css = fs.readFileSync(path.join(publicDir, 'assets', cssFile), 'utf8');
  for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    assert.ok(fs.existsSync(path.resolve(publicDir, 'assets', match[1])), `Missing CSS asset ${match[1]}`);
  }
}
const data = JSON.parse(fs.readFileSync(path.join(publicDir, 'data/ward.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(data.version, manifest.version, 'Content and package versions must match');
assert.equal(lock.version, manifest.version, 'Lockfile version must match');
assert.equal(lock.packages[''].version, manifest.version, 'Lockfile root package version must match');
assert.equal(html.match(/id="footer-version"[^>]*>([^<]+)</)?.[1], `v${manifest.version}`, 'Footer version must match');
assert.ok(['auto', 'fall', 'winter', 'spring', 'summer'].includes(data.season));
assert.ok(Array.isArray(data.events) && Array.isArray(data.announcements));
for (const item of [...data.events, ...data.announcements]) {
  assert.equal(typeof item.published, 'boolean', 'Every item needs an explicit published flag');
  assert.ok(typeof item.title === 'string' && item.title.trim(), 'Every item needs a title');
  for (const field of ['startAt', 'endAt', 'publishAt', 'expiresAt']) if (item[field]) assert.notEqual(dateValue(item[field]), null, `Invalid ${field}`);
  if (item.url) assert.ok(safeURL(item.url), 'Content links must be HTTPS');
}
const app = fs.readFileSync(path.join(publicDir, 'js/home.js'), 'utf8');
for (const match of html.matchAll(/(?:href|src)="((?:assets\/[^"?]+\.css|js\/home\.js)(?:\?[^\"]*)?)"/g)) {
  assert.equal(new URL(match[1], 'https://example.org/').searchParams.get('v'), manifest.version, 'Published code assets need matching version URLs');
}
assert.ok(app.includes(`from './content.js?v=${manifest.version}'`), 'Content module URL must match the release version');
assert.ok(!app.includes('innerHTML'), 'Content must render as text, not injected markup');
assert.ok(!app.includes('addDoc(') && !app.includes('setDoc(') && !app.includes('updateDoc('), 'Homepage must not write to Firestore');
const hosting = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
assert.ok(['staging', 'blackstoneward'].includes(hosting.hosting.target), 'Hosting target must be staging or blackstoneward');
assert.ok(!hosting.firestore && !hosting.functions, 'Homepage deployment must not include rules or functions');
console.log('Site integrity, public content, asset links, and hosting scope verified.');
