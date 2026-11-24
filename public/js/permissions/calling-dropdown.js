// v1.2.66: Calling / Leadership Position dropdown helpers.
// Builds org-grouped options from a Firestore catalog or the vendored permissions.json.
// No I/O. No member data. Dual-org callings are listed under each of their orgs
// with the same value (the calling name).

export const LEGACY_ORG = {
  WD: 'bishopric',
  BI: 'bishopric',
  EQ: 'elders_quorum',
  RS: 'relief_society',
  SN: 'sunday_school',
  YM: 'youth',
  YW: 'youth',
  PM: 'youth',
  WA: 'bishopric'
};

// Retired Home/Youth Hub names (Duane, 2026-11-21): not offered in the dropdown.
export const RETIRED_CALLINGS = [
  'Ward Administrator',
  'Bishopric',
  'Ward Activity',
  'Ward Cleaning',
  'Youth ADL Priest',
  'Youth Priest',
  'Youth ADL Teacher',
  'Youth Teacher',
  'Youth ADL Deacon',
  'Youth Deacon',
  'Youth YW Pres',
  'Youth ADL YW',
  'Youth Builders',
  'Youth Messengers',
  'Youth Gatherers',
  'Youth Primary Pres',
  'EQ Pres',
  'EQ Activity',
  'RS Pres',
  'RS Activity',
  'SS Pres'
];

export function rcSeq(rc) {
  const n = Number(String(rc || '').replace(/^RC/i, ''));
  return Number.isFinite(n) ? n : 0;
}

function asOrgList(org) {
  return Array.isArray(org) ? org.filter(Boolean) : (org ? [org] : []);
}

function legacyRoleFor(r, roleForAreas) {
  const areas = r.areas || [];
  const hubRole = typeof roleForAreas === 'function' ? roleForAreas(areas) : null;
  if (hubRole && hubRole !== 'leader') return hubRole;
  if (areas.includes(11)) return 'young_women';
  if (areas.includes(12)) return 'primary';
  if (areas.includes(8)) return 'priests';
  if (areas.includes(9)) return 'teachers';
  if (areas.includes(10)) return 'deacons';
  if (areas.includes(7)) return 'combined';
  const o = asOrgList(r.org)[0];
  return { EQ: 'elders_quorum', RS: 'relief_society', SN: 'sunday_school' }[o] || 'leader';
}

export function catalogFromPermissions(P, roleForAreas) {
  const homeGate = P?.hubs?.home?.gateArea;
  const youthAreas = P?.hubs?.youth?.adminAreas || [];
  const youthNameById = Object.fromEntries(Object.entries(P?.hubs?.youth?.areaNames || {}).map(([n, id]) => [id, n]));
  const orgOrder = Object.keys(P?.orgs || {});
  const rolesIn = Array.isArray(P?.roles) ? P.roles : [];
  const groups = orgOrder
    .filter((o) => rolesIn.some((r) => asOrgList(r.org).includes(o)))
    .map((o, i) => ({ org: o, label: P.orgs[o], order: i + 1 }));
  const roles = rolesIn.map((r, i) => {
    const orgs = asOrgList(r.org);
    const homeSeat = Array.isArray(r.areas) && r.areas.includes(homeGate);
    const ya = (r.areas || []).filter((a) => youthAreas.includes(a));
    return {
      rc: r.rc,
      name: r.name,
      label: r.label,
      org: orgs,
      dropdownOrgs: orgs,
      displayOrder: i + 1,
      areas: r.areas || [],
      homeSeat,
      youthAreaNames: ya.map((a) => youthNameById[a]).filter(Boolean),
      legacyRole: legacyRoleFor(r, roleForAreas),
      legacyOrg: homeSeat ? 'bishopric' : (LEGACY_ORG[orgs[0]] || 'bishopric'),
      active: true
    };
  });
  return { schemaVersion: 1, groups, roles, source: 'bundled' };
}

export function isFirestoreCatalogValid(meta, roleDocs) {
  if (!meta || meta.schemaVersion !== 1) return false;
  if (!Array.isArray(roleDocs) || !Array.isArray(meta.roleIds)) return false;
  if (Number(meta.roleCount) !== roleDocs.length) return false;
  const ids = new Set(roleDocs.map((r) => r.rc || r.id));
  return meta.roleIds.every((id) => ids.has(id));
}

export function catalogFromFirestoreDocs(meta, roleDocs) {
  const groups = (Array.isArray(meta?.groups) ? meta.groups : [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const roles = (roleDocs || []).filter((r) => r && r.active !== false).map((r, i) => {
    const orgs = asOrgList(r.dropdownOrgs || r.org);
    return {
      rc: r.rc || r.id,
      name: r.name,
      label: r.label,
      org: orgs,
      dropdownOrgs: orgs,
      displayOrder: r.displayOrder || i + 1,
      areas: r.areas || [],
      homeSeat: !!r.homeSeat,
      youthAreaNames: Array.isArray(r.youthAreaNames) ? r.youthAreaNames : [],
      legacyRole: r.legacyRole,
      legacyOrg: r.legacyOrg || 'bishopric',
      active: r.active !== false
    };
  });
  return { schemaVersion: 1, groups, roles, source: 'firestore' };
}

export function buildCallingOptionList(catalog) {
  const groups = [];
  for (const g of catalog?.groups || []) {
    const options = (catalog.roles || [])
      .filter((r) => r && r.active !== false && asOrgList(r.dropdownOrgs || r.org).includes(g.org))
      .sort((a, b) => rcSeq(a.rc) - rcSeq(b.rc) || (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((r) => ({ value: r.name, text: r.name, rc: r.rc }));
    if (options.length) groups.push({ org: g.org, label: g.label, order: g.order, options });
  }
  return { groups, optionCount: groups.reduce((n, g) => n + g.options.length, 0) };
}

export function callingDefinitionsFromCatalog(catalog) {
  return (catalog?.roles || []).filter((r) => r && r.active !== false).map((r) => ({
    calling: r.name,
    org: r.legacyOrg,
    role: r.legacyRole,
    activeOnYouth: (r.youthAreaNames || []).length > 0,
    defaultAccess: [...(r.youthAreaNames || [])]
  }));
}

export function isV6Calling(catalog, name) {
  return !!(name && (catalog?.roles || []).some((r) => r && r.active !== false && r.name === name));
}

export function v6RcForCalling(catalog, name) {
  const row = (catalog?.roles || []).find((r) => r && r.active !== false && r.name === name);
  return row ? row.rc : null;
}

export function matrixRowsFromCatalog(catalog) {
  return (catalog?.roles || [])
    .filter((r) => r && r.active !== false)
    .sort((a, b) => rcSeq(a.rc) - rcSeq(b.rc) || (a.displayOrder || 0) - (b.displayOrder || 0))
    .map((r) => [
      r.rc,
      r.name,
      r.label,
      Array.isArray(r.org) ? r.org.join(', ') : (r.orgText || ''),
      [...(r.areas || [])]
    ]);
}

export function recomputeGroups(orgsMap, roles) {
  const orgOrder = Object.keys(orgsMap || {});
  return orgOrder
    .filter((o) => (roles || []).some((r) => r && r.active !== false && asOrgList(r.dropdownOrgs || r.org).includes(o)))
    .map((o, i) => ({ org: o, label: orgsMap[o], order: i + 1 }));
}

// Fields for ward_permissions_roles/{RC}, matching import-permissions-to-firestore.js.
// Timestamps and updatedBy are applied by the caller. existing is a prior doc (update) or null (create).
export function buildRoleDocFields(edit, P, roleForAreas, existing = null) {
  const rc = edit.rc;
  const orgs = asOrgList(edit.org);
  const areas = (Array.isArray(edit.areas) ? edit.areas : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const homeGate = P?.hubs?.home?.gateArea;
  const youthAreaIds = P?.hubs?.youth?.adminAreas || [];
  const youthNameById = Object.fromEntries(Object.entries(P?.hubs?.youth?.areaNames || {}).map(([n, id]) => [id, n]));
  const homeSeat = areas.includes(homeGate);
  const ya = areas.filter((a) => youthAreaIds.includes(a));
  const seq = rcSeq(rc);
  return {
    schemaVersion: 1,
    permissionsVersion: (existing && existing.permissionsVersion) || 'v6',
    rc,
    seq,
    name: edit.name,
    label: edit.label,
    org: orgs,
    orgText: orgs.join(', '),
    areas,
    dropdownOrgs: orgs,
    displayOrder: (existing && existing.displayOrder) || seq,
    homeSeat,
    youthAreas: ya,
    youthAreaNames: ya.map((a) => youthNameById[a]).filter(Boolean),
    legacyRole: legacyRoleFor({ areas, org: orgs }, roleForAreas),
    legacyOrg: homeSeat ? 'bishopric' : (LEGACY_ORG[orgs[0]] || 'bishopric'),
    tierCeiling: existing && 'tierCeiling' in existing ? existing.tierCeiling : null,
    minorAllowed: existing ? !!existing.minorAllowed : false,
    youthSeat: existing ? !!existing.youthSeat : false,
    active: existing && existing.active === false ? false : true,
    source: (existing && existing.source) ? existing.source : { file: 'Access Matrix', sha256: null, row: null }
  };
}
