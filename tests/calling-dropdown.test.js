import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogFromPermissions, buildCallingOptionList, callingDefinitionsFromCatalog, isV6Calling, RETIRED_CALLINGS, buildRoleDocFields, matrixRowsFromCatalog, recomputeGroups } from '../public/js/permissions/calling-dropdown.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = JSON.parse(fs.readFileSync(path.join(root, 'public/js/permissions/permissions.json'), 'utf8'));

const catalog = catalogFromPermissions(P);
const list = buildCallingOptionList(catalog);

assert.equal(list.groups.length, 9, 'expected 9 org groups (empty orgs skipped)');
assert.equal(list.optionCount, 55, 'expected 55 options for 52 callings with dual-org repeats');
assert.deepEqual(list.groups.map((g) => g.label), [
  'Ward',
  'Bishopric',
  'Elders Quorum',
  'Relief Society',
  'Young Men',
  'Young Women',
  'Primary',
  'Sunday School',
  'Ward Aux'
]);
assert.deepEqual(list.groups.map((g) => g.options.length), [1, 5, 4, 4, 14, 16, 4, 4, 3]);

const byLabel = Object.fromEntries(list.groups.map((g) => [g.label, g.options]));
for (const rc of ['RC2', 'RC3', 'RC4']) {
  const inBi = byLabel['Bishopric'].find((o) => o.rc === rc);
  const inYm = byLabel['Young Men'].find((o) => o.rc === rc);
  assert.ok(inBi, `${rc} should appear under Bishopric`);
  assert.ok(inYm, `${rc} should appear under Young Men`);
  assert.equal(inBi.value, inYm.value, `${rc} copies must save the same calling value`);
}
assert.equal(byLabel['Bishopric'].find((o) => o.rc === 'RC2').value, 'Bishop');
// First group that contains Bishop is Bishopric (Orgs-tab order).
const firstBishopGroup = list.groups.find((g) => g.options.some((o) => o.value === 'Bishop'));
assert.equal(firstBishopGroup.label, 'Bishopric');

const names = new Set(list.groups.flatMap((g) => g.options.map((o) => o.value)));
assert.equal(names.size, 52);
for (const old of RETIRED_CALLINGS) {
  assert.equal(names.has(old), false, `retired name should not appear: ${old}`);
}
assert.equal(isV6Calling(catalog, 'Bishop'), true);
assert.equal(isV6Calling(catalog, 'Youth YW Pres'), false);
assert.equal(isV6Calling(catalog, 'Ward Administrator'), false);

const defs = callingDefinitionsFromCatalog(catalog);
assert.equal(defs.length, 52);
const ywp = defs.find((d) => d.calling === 'YW President');
assert.ok(ywp);
assert.equal(ywp.org, 'youth');
assert.equal(ywp.role, 'young_women');
assert.ok(ywp.activeOnYouth);
assert.ok(ywp.defaultAccess.includes('Young Women'));
const eqp = defs.find((d) => d.calling === 'EQ President');
assert.equal(eqp.org, 'elders_quorum');
assert.equal(eqp.role, 'elders_quorum');
const web = defs.find((d) => d.calling === 'Web Administrator');
assert.equal(web.org, 'bishopric');

console.log('calling-dropdown: PASS — 9 groups, 55 options, RC2–RC4 under Bishopric and Young Men, no retired names.');

const ywpFields = buildRoleDocFields(
  { rc: 'RC19', name: 'YW President', label: 'YW Pres', org: ['YW'], areas: [7, 11, 13, 14, 15, 22, 23] },
  P,
  undefined
);
assert.equal(ywpFields.rc, 'RC19');
assert.equal(ywpFields.seq, 19);
assert.equal(ywpFields.schemaVersion, 1);
assert.equal(ywpFields.permissionsVersion, 'v6');
assert.deepEqual(ywpFields.org, ['YW']);
assert.equal(ywpFields.orgText, 'YW');
assert.deepEqual(ywpFields.dropdownOrgs, ['YW']);
assert.equal(ywpFields.legacyOrg, 'youth');
assert.equal(ywpFields.legacyRole, 'young_women');
assert.equal(ywpFields.homeSeat, false);
assert.ok(ywpFields.youthAreaNames.includes('Young Women'));
assert.equal(ywpFields.source.file, 'Access Matrix');

const bishopFields = buildRoleDocFields(
  { rc: 'RC2', name: 'Bishop', label: 'Bish', org: ['BI', 'YM'], areas: Array.from({ length: 24 }, (_, i) => i + 1) },
  P,
  undefined
);
assert.equal(bishopFields.homeSeat, true);
assert.equal(bishopFields.legacyOrg, 'bishopric');
assert.deepEqual(bishopFields.org, ['BI', 'YM']);

const rows = matrixRowsFromCatalog(catalog);
assert.equal(rows.length, 52);
assert.deepEqual(rows[0].slice(0, 4), ['RC1', 'Web Administrator', 'Web Admin', 'WD']);
const bishopRow = rows.find((r) => r[0] === 'RC2');
assert.equal(bishopRow[3], 'BI, YM');

const groups = recomputeGroups(P.orgs, catalog.roles);
assert.equal(groups.length, 9);
assert.equal(groups[0].org, 'WD');
assert.ok(!groups.some((g) => g.org === 'OT'));

console.log('calling-dropdown: also PASS — role doc fields, matrix rows, group recompute.');
