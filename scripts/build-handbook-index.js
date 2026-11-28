#!/usr/bin/env node
'use strict';
// Home functions 1.4.1 (2026-11-27, Duane t631u 11:44 PM ET: list-aware, fuller excerpts so a section such as 38.3 keeps every
// list item; 1.4.0 cut it after the first). First built 1.4.0 (Duane go-ahead 10:20 PM ET, Q2 "YES"): builds the PRIVATE Handbook index used by
// functions/handbookAssistant.js. Output: functions/handbook-index.json (functions bundle only; never under public/).
// Reads the PUBLIC General Handbook (https://www.churchofjesuschrist.org/study/manual/general-handbook?lang=eng).
// Each entry: section number, title, chapter, canonical URL (with the #title_numberN anchor) and a SHORT excerpt.
// No secrets, no member data, no Firestore. Network: plain GETs of the public chapter pages, one at a time, ~1 s apart.
//
// Refresh (when the Church updates the Handbook, or monthly):
//   cd ~/Documents/0Church/Blackstone_Ward/zzWeb/BW_Home && node scripts/build-handbook-index.js
//   then review the summary it prints, bump the Home functions version, update CHANGELOG/PROJECT_STATE, run the tests,
//   and redeploy ONLY the function (separate approval): firebase deploy --only functions:handbookAssistant --project blackstoneward-b861c
// Options: --chapters 7,10,11  (override the chapter list)   --out <path>   --max-excerpt 1400 (soft cap; an open list may run to 1.6x)
// The second index (site help for blackstoneward.org and all hubs) is functions/site-help-index.json, edited by hand.
// How to refresh both: scripts/HORUS_INDEXES.md
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.churchofjesuschrist.org/study/manual/general-handbook';
// First set (Duane Q2): bishopric, youth, callings, interviews, meetings, records, finances, policies.
const DEFAULT_CHAPTERS = [
  '4-leadership-in-the-church-of-jesus-christ',
  '7',                                   // Bishopric
  '10-aaronic-priesthood',
  '11-young-women',
  '12-primary',
  '18-priesthood-ordinances-and-blessings',
  '20-activities',
  '22-providing-for-temporal-needs',
  '26-temple-recommends',
  '29-meetings-in-the-church',
  '30-callings-in-the-church',
  '31',                                  // Interviews
  '32-repentance-and-membership-councils',
  '33-records-and-reports',
  '34-finances-and-audits',
  '38-church-policies-and-guidelines'
];

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const CHAPTERS = String(arg('--chapters', '')).trim() ? arg('--chapters').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CHAPTERS;
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'functions', 'handbook-index.json')));
// Soft cap per excerpt. Whole paragraphs / list items are kept (never cut mid-item); a list that is open at the cap is finished
// up to HARD_EXCERPT (1.6x) so a section like 38.3 keeps every circumstance. Only a single paragraph longer than the cap is cut.
const MAX_EXCERPT = Math.max(200, Math.min(2000, Number(arg('--max-excerpt', 1400)) || 1400));
const HARD_EXCERPT = Math.round(MAX_EXCERPT * 1.6);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m));
}
const text = (html) => decode(String(html).replace(/<sup[^>]*>.*?<\/sup>/gs, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function shorten(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + ' …').trim();
}

// List-aware excerpt: a section that fits the hard cap is kept whole; otherwise whole paragraphs and list items up to the soft cap; if the cap falls inside a list (its intro ends with
// ":" or the previous part is a list item) the remaining items are kept up to the hard cap. Never cuts mid-item, except a lone
// first paragraph longer than the cap (cut at a sentence). A dropped tail is marked with " …".
function assemble(parts, max, hard) {
  const list = (parts || []).filter((p) => p && p.t);
  if (!list.length) return '';
  const whole = list.reduce((n, p, i) => n + (i ? 1 : 0) + p.t.length, 0);
  if (whole <= hard) return list.map((p) => p.t).join(' '); // a section that fits the hard cap is kept whole (38.3, 38.3.1)
  const out = [];
  let len = 0;
  for (const p of list) {
    const add = (out.length ? 1 : 0) + p.t.length;
    const prev = out[out.length - 1];
    const inList = Boolean(prev) && p.li && (prev.li || /:$/.test(prev.t));
    if (len + add <= max || (inList && len + add <= hard)) { out.push(p); len += add; continue; }
    break;
  }
  if (!out.length) return shorten(list[0].t, max);
  const text = out.map((p) => p.t).join(' ');
  return out.length < list.length ? `${text} …` : text;
}

function parseChapter(html, slug) {
  const url = `${BASE}/${slug}?lang=eng`;
  const h1 = /<h1[^>]*>(.*?)<\/h1>/s.exec(html);
  const chapterNum = (/<p[^>]*class="title-number"[^>]*>(.*?)<\/p>\s*<h1/s.exec(html) || [])[1];
  const chapterTitle = text(h1 ? h1[1] : slug);
  const body = html.slice(h1 ? h1.index : 0);
  const re = /<p[^>]*class="title-number"[^>]*id="(title_number\d+)"[^>]*>(.*?)<\/p>\s*<h([2-6])[^>]*>(.*?)<\/h\3>/gs;
  const heads = [];
  let m;
  while ((m = re.exec(body))) heads.push({ anchor: m[1], section: text(m[2]).replace(/\.$/, ''), title: text(m[4]), start: m.index, end: re.lastIndex });
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (!/^\d{1,2}(\.\d+){1,5}$/.test(h.section)) continue;
    const chunk = body.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : body.length);
    const parts = [];
    const pre = /<(p|li)\b[^>]*>(.*?)<\/\1>/gs;
    let pm;
    while ((pm = pre.exec(chunk))) {
      if (/class="title-number"/.test(pm[0])) continue;
      const t = text(pm[2]);
      if (t) parts.push({ t, li: pm[1] === 'li' });
      if (parts.reduce((a, x) => a + x.t.length + 1, 0) > HARD_EXCERPT * 1.5) break;
    }
    const excerpt = assemble(parts, MAX_EXCERPT, HARD_EXCERPT);
    if (!excerpt) continue;
    out.push({ section: h.section, title: h.title, chapter: `${chapterNum ? text(chapterNum).replace(/\.$/, '') + '. ' : ''}${chapterTitle}`, url: `${url}#${h.anchor}`, excerpt });
  }
  return out;
}

async function main() {
  const entries = [];
  const summary = [];
  for (const slug of CHAPTERS) {
    const url = `${BASE}/${slug}?lang=eng`;
    const r = await fetch(url, { headers: { 'User-Agent': 'BlackstoneWard-HandbookIndex/1.0 (ward website; manual refresh)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    const got = parseChapter(await r.text(), slug);
    if (!got.length) throw new Error(`No sections parsed from ${url} (page layout changed? check parseChapter).`);
    entries.push(...got);
    summary.push(`${slug}: ${got.length} sections`);
    await new Promise((res) => setTimeout(res, 1000));
  }
  const seen = new Set();
  const unique = entries.filter((e) => (seen.has(e.section) ? false : seen.add(e.section)));
  const doc = {
    builtAt: new Date().toISOString(),
    source: `${BASE}?lang=eng`,
    note: 'Short excerpts of the public General Handbook for the private Handbook assistant index. Functions bundle only; never host publicly.',
    maxExcerpt: MAX_EXCERPT,
    maxExcerptHard: HARD_EXCERPT,
    chapters: CHAPTERS,
    entries: unique
  };
  fs.writeFileSync(OUT, JSON.stringify(doc) + '\n');
  console.log(summary.join('\n'));
  console.log(`${unique.length} sections, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${OUT}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseChapter, shorten, assemble, decode, DEFAULT_CHAPTERS };
