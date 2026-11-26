'use strict';
// Signup orgs (spec "Orgs and admin placement"). Phase 1: ONLY ward_activities is enabled.
// Phases 2-3 flip `enabled` and confirm leader_seats; the org_id data model does not change.
// leader_seats = RC codes (Permissions sheet) that lead the org. Minor-capable youth seats are never listed.
const ORGS = [
  { id: 'elders_quorum', slug: 'eq', name: 'Elders Quorum', enabled: false, youth: false, default_access_level: 'passcode', leader_seats: ['RC7', 'RC8', 'RC9', 'RC10'] },
  { id: 'relief_society', slug: 'rs', name: 'Relief Society', enabled: false, youth: false, default_access_level: 'passcode', leader_seats: ['RC11', 'RC12', 'RC13', 'RC14'] },
  { id: 'young_men', slug: 'ym', name: 'Young Men', enabled: false, youth: true, default_access_level: 'passcode', leader_seats: [] /* Phase 2: confirm adult YM leader seats */ },
  { id: 'young_women', slug: 'yw', name: 'Young Women', enabled: false, youth: true, default_access_level: 'passcode', leader_seats: ['RC19', 'RC20', 'RC21', 'RC22'] },
  { id: 'primary', slug: 'primary', name: 'Primary', enabled: false, youth: true, default_access_level: 'passcode', leader_seats: ['RC46', 'RC47', 'RC48', 'RC49'] },
  { id: 'ward_activities', slug: 'activities', name: 'Ward Activities Committee', enabled: true, youth: false, default_access_level: 'public', leader_seats: ['RC52'] },
];
const ORG_BY_ID = Object.fromEntries(ORGS.map((o) => [o.id, o]));

// Ward admins (spec role ward_admin = bishopric / clerk / web admin): Web Admin RC1, Bishop RC2, counselors RC3-RC4,
// Ward Clerk RC5, Executive Secretary RC6. Legacy ward_leaders.role 'admin' / 'bishopric' counts too (same as the
// live rules' roster seat and Home /admin).
const WARD_ADMIN_SEATS = ['RC1', 'RC2', 'RC3', 'RC4', 'RC5', 'RC6'];
const WARD_ADMIN_ROLES = ['admin', 'bishopric'];
const AREA_TOOLS = 22;    // home.activities: create/edit events, templates, passcodes, invites, reminders
const AREA_CONTACTS = 23; // home.signup: participant full names and contacts, CSV export

module.exports = { ORGS, ORG_BY_ID, WARD_ADMIN_SEATS, WARD_ADMIN_ROLES, AREA_TOOLS, AREA_CONTACTS };
