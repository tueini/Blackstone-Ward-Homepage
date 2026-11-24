// GENERATED FILE: do not edit. Built by BW_Platform scripts/build-permissions.js from the master sheet
// (see PERMISSIONS.source) and vendored into hubs by scripts/vendor-permissions.js with a checksum check.
// Shared permissions module (ES module, no imports, no I/O). Seats, labels, orgs and areas come only from
// the sheet; no member names, phones or emails are in this file.
//   resolveAccess(record, opts) -> { rcCodes, areas, role, breakGlass, ownerFallback }
//   canAccess(access, area) / canEnterHub(access, hub) / canEditPassword(actor, target, opts)
// Unknown, empty or inactive records fail closed: { rcCodes: [], areas: [], role: null }.

export const PERMISSIONS = {
  "schema": 1,
  "generator": "BW_Platform 0.2.0 scripts/build-permissions.js",
  "source": {
    "file": "Permissions_v5.xlsx",
    "sha256": "2d766a135ce3ca2630784ca9ef6331a2e613a2d9486c7a922832ce2919b865e1"
  },
  "orgs": {
    "WD": "Ward",
    "BI": "Bishopric",
    "EQ": "Elders Quorum",
    "RS": "Relief Society",
    "YM": "Young Men",
    "YW": "Young Women",
    "PM": "Primary",
    "SN": "Sunday School",
    "WA": "Ward Aux",
    "OT": "Other"
  },
  "areas": [
    {
      "id": 1,
      "site": "blackstoneward.org/admin/",
      "region": "",
      "status": "Active",
      "key": "home.admin",
      "hub": "home",
      "tier": "T2"
    },
    {
      "id": 2,
      "site": "bish.blackstoneward.org",
      "region": "",
      "status": "Active",
      "key": "bish.hub",
      "hub": "bish",
      "tier": "T3"
    },
    {
      "id": 3,
      "site": "bish.blackstoneward.org",
      "region": "Interview Mgr",
      "status": "Active",
      "key": "bish.interviews",
      "hub": "bish",
      "tier": "T4"
    },
    {
      "id": 4,
      "site": "blackstoneward.org/td",
      "region": "",
      "status": "Active",
      "key": "home.td",
      "hub": "home",
      "tier": "T3"
    },
    {
      "id": 5,
      "site": "blackstoneward.org/music",
      "region": "",
      "status": "Active",
      "key": "home.music",
      "hub": "home",
      "tier": "T1"
    },
    {
      "id": 6,
      "site": "blackstoneward.org/cleaning",
      "region": "",
      "status": "TBD",
      "key": "home.cleaning",
      "hub": "home",
      "tier": "T2"
    },
    {
      "id": 7,
      "site": "youth.blackstoneward.org/admin",
      "region": "Combined",
      "status": "Active",
      "key": "youth.combined",
      "hub": "youth",
      "tier": "T1"
    },
    {
      "id": 8,
      "site": "youth.blackstoneward.org/admin",
      "region": "Priests",
      "status": "Active",
      "key": "youth.priests",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 9,
      "site": "youth.blackstoneward.org/admin",
      "region": "Teachers",
      "status": "Active",
      "key": "youth.teachers",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 10,
      "site": "youth.blackstoneward.org/admin",
      "region": "Deacons",
      "status": "Active",
      "key": "youth.deacons",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 11,
      "site": "youth.blackstoneward.org/admin",
      "region": "Young Women",
      "status": "Active",
      "key": "youth.yw",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 12,
      "site": "youth.blackstoneward.org/admin",
      "region": "Primary",
      "status": "Active",
      "key": "youth.primary",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 13,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy",
      "status": "Active",
      "key": "youth.settings",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 14,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy: Announcements",
      "status": "Active",
      "key": "youth.settings.announcements",
      "hub": "youth",
      "tier": "T1"
    },
    {
      "id": 15,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy: Spotlights",
      "status": "Active",
      "key": "youth.settings.spotlights",
      "hub": "youth",
      "tier": "T1"
    },
    {
      "id": 16,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy: Teachers",
      "status": "Active",
      "key": "youth.settings.teachers",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 17,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy: Leaders",
      "status": "Active",
      "key": "youth.settings.leaders",
      "hub": "youth",
      "tier": "T2"
    },
    {
      "id": 18,
      "site": "youth.blackstoneward.org/admin",
      "region": "Settings & Privacy: Themes",
      "status": "Active",
      "key": "youth.settings.themes",
      "hub": "youth",
      "tier": "T1"
    },
    {
      "id": 19,
      "site": "eq.blackstoneward.org/admin",
      "region": "",
      "status": "TBD",
      "key": "eq.admin",
      "hub": "eq",
      "tier": "T2"
    },
    {
      "id": 20,
      "site": "rs.blackstoneward.org/admin",
      "region": "",
      "status": "TBD",
      "key": "rs.admin",
      "hub": "rs",
      "tier": "T2"
    },
    {
      "id": 21,
      "site": "sun.blackstoneward.org/admin",
      "region": "",
      "status": "TBD",
      "key": "sun.admin",
      "hub": "sun",
      "tier": "T2"
    },
    {
      "id": 22,
      "site": "blackstoneward.org/activities",
      "region": "",
      "status": "TBD",
      "key": "home.activities",
      "hub": "home",
      "tier": "T1"
    },
    {
      "id": 23,
      "site": "blackstoneward.org/signup",
      "region": "",
      "status": "TBD",
      "key": "home.signup",
      "hub": "home",
      "tier": "T2"
    },
    {
      "id": 24,
      "site": "auction.blackstoneward.org/admin.html",
      "region": "",
      "status": "Active",
      "key": "auction.admin",
      "hub": "auction",
      "tier": "T2"
    }
  ],
  "roles": [
    {
      "rc": "RC1",
      "name": "Web Administrator",
      "label": "Web Admin",
      "org": [
        "WD"
      ],
      "orgText": "WD",
      "areas": [
        1
      ]
    },
    {
      "rc": "RC2",
      "name": "Bishop",
      "label": "Bish",
      "org": [
        "BI",
        "YM"
      ],
      "orgText": "BI, YM",
      "areas": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24
      ]
    },
    {
      "rc": "RC3",
      "name": "Bishopric 1st Counselor",
      "label": "Bish C1",
      "org": [
        "BI",
        "YM"
      ],
      "orgText": "BI, YM",
      "areas": [
        1,
        2,
        4,
        5,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        22,
        23,
        24
      ]
    },
    {
      "rc": "RC4",
      "name": "Bishopric 2nd Counselor",
      "label": "Bish C2",
      "org": [
        "BI",
        "YM"
      ],
      "orgText": "BI, YM",
      "areas": [
        1,
        2,
        4,
        5,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        22,
        23,
        24
      ]
    },
    {
      "rc": "RC5",
      "name": "Ward Clerk",
      "label": "Wd Clk",
      "org": [
        "BI"
      ],
      "orgText": "BI",
      "areas": [
        1,
        2,
        4,
        5,
        22,
        23,
        24
      ]
    },
    {
      "rc": "RC6",
      "name": "Ward Executive Secretary",
      "label": "Exec Sec",
      "org": [
        "BI"
      ],
      "orgText": "BI",
      "areas": [
        1,
        2,
        3,
        4,
        5,
        22,
        23,
        24
      ]
    },
    {
      "rc": "RC7",
      "name": "EQ President",
      "label": "EQ Pres",
      "org": [
        "EQ"
      ],
      "orgText": "EQ",
      "areas": [
        19,
        22,
        23
      ]
    },
    {
      "rc": "RC8",
      "name": "EQ Presidency 1st Counselor",
      "label": "EQ C1",
      "org": [
        "EQ"
      ],
      "orgText": "EQ",
      "areas": [
        19,
        22,
        23
      ]
    },
    {
      "rc": "RC9",
      "name": "EQ Presidency 2nd Counselor",
      "label": "EQ C2",
      "org": [
        "EQ"
      ],
      "orgText": "EQ",
      "areas": [
        19,
        22,
        23
      ]
    },
    {
      "rc": "RC10",
      "name": "EQ Presidency Secretary",
      "label": "EQ Sec",
      "org": [
        "EQ"
      ],
      "orgText": "EQ",
      "areas": [
        19,
        22,
        23
      ]
    },
    {
      "rc": "RC11",
      "name": "RS President",
      "label": "RS Pres",
      "org": [
        "RS"
      ],
      "orgText": "RS",
      "areas": [
        20,
        22,
        23
      ]
    },
    {
      "rc": "RC12",
      "name": "RS Presidency 1st Counselor",
      "label": "RS C1",
      "org": [
        "RS"
      ],
      "orgText": "RS",
      "areas": [
        20,
        22,
        23
      ]
    },
    {
      "rc": "RC13",
      "name": "RS Presidency 2nd Counselor",
      "label": "RS C2",
      "org": [
        "RS"
      ],
      "orgText": "RS",
      "areas": [
        20,
        22,
        23
      ]
    },
    {
      "rc": "RC14",
      "name": "RS Presidency Secretary",
      "label": "RS Sec",
      "org": [
        "RS"
      ],
      "orgText": "RS",
      "areas": [
        20,
        22,
        23
      ]
    },
    {
      "rc": "RC15",
      "name": "Sun President",
      "label": "Sun Pres",
      "org": [
        "SN"
      ],
      "orgText": "SN",
      "areas": [
        21,
        22,
        23
      ]
    },
    {
      "rc": "RC16",
      "name": "Sun Presidency 1st Counselor",
      "label": "Sun C1",
      "org": [
        "SN"
      ],
      "orgText": "SN",
      "areas": [
        21,
        22,
        23
      ]
    },
    {
      "rc": "RC17",
      "name": "Sun Presidency 2nd Counselor",
      "label": "Sun C2",
      "org": [
        "SN"
      ],
      "orgText": "SN",
      "areas": [
        21,
        22,
        23
      ]
    },
    {
      "rc": "RC18",
      "name": "Sun Presidency Secretary",
      "label": "Sun Sec",
      "org": [
        "SN"
      ],
      "orgText": "SN",
      "areas": [
        21,
        22,
        23
      ]
    },
    {
      "rc": "RC19",
      "name": "YW President",
      "label": "YW Pres",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        7,
        11,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC20",
      "name": "YW Presidency 1st Counselor",
      "label": "YW C1",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        7,
        11,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC21",
      "name": "YW Presidency 2nd Counselor",
      "label": "YW C2",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        7,
        11,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC22",
      "name": "YW Presidency Secretary",
      "label": "YW Sec",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        7,
        11,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC23",
      "name": "YW Gatherers President",
      "label": "YWG Pres",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC24",
      "name": "YW Gatherers 1st Counselor",
      "label": "YWG C1",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC25",
      "name": "YW Gatherers 2nd Counselor",
      "label": "YWG C2",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC26",
      "name": "YW Gatherers Secretary",
      "label": "YWG Sec",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC27",
      "name": "YW Messengers President",
      "label": "YWM Pres",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC28",
      "name": "YW Messengers 1st Counselor",
      "label": "YWM C1",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC29",
      "name": "YW Messengers 2nd Counselor",
      "label": "YWM C2",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC30",
      "name": "YW Messengers Secretary",
      "label": "YWM Sec",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC31",
      "name": "YW Builders President",
      "label": "YWB Pres",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC32",
      "name": "YW Builders 1st Counselor",
      "label": "YWB C1",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC33",
      "name": "YW Builders 2nd Counselor",
      "label": "YWB C2",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC34",
      "name": "YW Builders Secretary",
      "label": "YWB Sec",
      "org": [
        "YW"
      ],
      "orgText": "YW",
      "areas": [
        11
      ]
    },
    {
      "rc": "RC35",
      "name": "Priests 1st Assistant",
      "label": "YMP A1",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        8
      ]
    },
    {
      "rc": "RC36",
      "name": "Priests 2nd Assistant",
      "label": "YMP A2",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        8
      ]
    },
    {
      "rc": "RC37",
      "name": "Priests Secretary",
      "label": "YMP Sec",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        8
      ]
    },
    {
      "rc": "RC38",
      "name": "Teachers President",
      "label": "YMT Pres",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        9
      ]
    },
    {
      "rc": "RC39",
      "name": "Teachers 1st Counselor",
      "label": "YMT C1",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        9
      ]
    },
    {
      "rc": "RC40",
      "name": "Teachers 2nd Counselor",
      "label": "YMT C2",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        9
      ]
    },
    {
      "rc": "RC41",
      "name": "Teachers Secretary",
      "label": "YMT Sec",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        9
      ]
    },
    {
      "rc": "RC42",
      "name": "Deacons President",
      "label": "YMD Pres",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        10
      ]
    },
    {
      "rc": "RC43",
      "name": "Deacons 1st Counselor",
      "label": "YMD C1",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        10
      ]
    },
    {
      "rc": "RC44",
      "name": "Deacons 2nd Counselor",
      "label": "YMD C2",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        10
      ]
    },
    {
      "rc": "RC45",
      "name": "Deacons Secretary",
      "label": "YMD Sec",
      "org": [
        "YM"
      ],
      "orgText": "YM",
      "areas": [
        10
      ]
    },
    {
      "rc": "RC46",
      "name": "Primary President",
      "label": "PM Pres",
      "org": [
        "PM"
      ],
      "orgText": "PM",
      "areas": [
        7,
        12,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC47",
      "name": "Primary Presidency 1st Counselor",
      "label": "PM C1",
      "org": [
        "PM"
      ],
      "orgText": "PM",
      "areas": [
        7,
        12,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC48",
      "name": "Primary Presidency 2nd Counselor",
      "label": "PM C2",
      "org": [
        "PM"
      ],
      "orgText": "PM",
      "areas": [
        7,
        12,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC49",
      "name": "Primary Presidency Secretary",
      "label": "PM Sec",
      "org": [
        "PM"
      ],
      "orgText": "PM",
      "areas": [
        7,
        12,
        13,
        14,
        15,
        22,
        23
      ]
    },
    {
      "rc": "RC50",
      "name": "Ward Music Coordinator",
      "label": "WD MusC",
      "org": [
        "WA"
      ],
      "orgText": "WA",
      "areas": [
        5
      ]
    },
    {
      "rc": "RC51",
      "name": "Ward Building Coordinator",
      "label": "WD BldC",
      "org": [
        "WA"
      ],
      "orgText": "WA",
      "areas": [
        6
      ]
    },
    {
      "rc": "RC52",
      "name": "Ward Activity Committee Leader",
      "label": "WD ActL",
      "org": [
        "WA"
      ],
      "orgText": "WA",
      "areas": [
        22,
        23
      ]
    }
  ],
  "legacyNames": {
    "Ward Administrator": "RC1",
    "SS President": "RC15",
    "SS Presidency 1st Counselor": "RC16",
    "SS Presidency 2nd Counselor": "RC17",
    "SS Presidency Secretary": "RC18"
  },
  "hubs": {
    "home": {
      "gateArea": 1
    },
    "bish": {
      "gateArea": 2,
      "interviewsArea": 3,
      "tdArea": 4
    },
    "youth": {
      "adminAreas": [
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18
      ],
      "areaNames": {
        "Combined": 7,
        "Priests": 8,
        "Teachers": 9,
        "Deacons": 10,
        "Young Women": 11,
        "Primary": 12,
        "Settings & Privacy": 13
      }
    },
    "auction": {
      "gateArea": 24
    },
    "sharedSessionAreas": [
      2,
      3,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18
    ]
  },
  "overrides": {
    "wildcards": false,
    "guards": [
      {
        "area": 3,
        "onlySeats": [
          "RC2",
          "RC6"
        ],
        "why": "Interview Mgr: Bishop + Exec Sec only (D1, Duane 2026-11-21)"
      }
    ],
    "droppedGuards": [
      "Tithing guard on area 4 (T2) dropped: /td is the page all TD participants reach (D1, Duane 2026-11-21 4:24 PM ET)",
      "RC1/RC2 wildcards removed: explicit sheet lists only (D2)"
    ]
  },
  "passwordPolicy": {
    "editAllSeats": [
      "RC2"
    ],
    "breakGlassEditsAll": true,
    "editOwnAndNonBishopricSeats": [
      "RC3",
      "RC4"
    ],
    "protectedSeats": [
      "RC1",
      "RC2",
      "RC3",
      "RC4",
      "RC5",
      "RC6"
    ]
  },
  "breakGlass": {
    "areas": [
      1
    ],
    "role": "home_admin"
  }
};
export const PERMISSIONS_SHA256 = PERMISSIONS.source.sha256;

const ROLE_ORDER = PERMISSIONS.roles.map((r) => r.rc);
const ROLE_BY_RC = Object.fromEntries(PERMISSIONS.roles.map((r) => [r.rc, r]));
const RC_BY_NAME = Object.fromEntries(PERMISSIONS.roles.map((r) => [r.name, r.rc]));
const ALL_AREA_IDS = PERMISSIONS.areas.map((a) => a.id);
const HOME_GATE_AREA = PERMISSIONS.hubs.home.gateArea;
const YOUTH_ADMIN_AREAS = PERMISSIONS.hubs.youth.adminAreas;

export function normalizePhone(value) {
  if (!value) return '';
  const s = String(value);
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return s.startsWith('+') ? s : `+${digits}`;
}

function sheetOrder(set) {
  return ROLE_ORDER.filter((rc) => set.has(rc));
}

// RC codes a record holds by itself: its rcCodes (sheet codes only) plus an exact sheet calling name or a
// legacy calling name. No owner fallback here.
export function seatCodesFor(record) {
  if (!record || typeof record !== 'object') return [];
  const set = new Set();
  const raw = Array.isArray(record.rcCodes) ? record.rcCodes : (record.rcCodes ? [record.rcCodes] : []);
  raw.forEach((c) => { const k = String(c || '').trim().toUpperCase(); if (ROLE_BY_RC[k]) set.add(k); });
  const calling = String(record.calling || '').trim();
  if (RC_BY_NAME[calling]) set.add(RC_BY_NAME[calling]);
  if (PERMISSIONS.legacyNames[calling]) set.add(PERMISSIONS.legacyNames[calling]);
  return sheetOrder(set);
}

// opts.owner = { id, phone, seats } (kept by the hub, not in this file).
export function isOwnerRecord(record, owner) {
  if (!record || !owner) return false;
  if (owner.id && record.id === owner.id) return true;
  const p = normalizePhone(record.phoneNumber || '');
  return !!(owner.phone && p && p === owner.phone);
}

// D3: the owner seats apply ONLY when the owner record has no seats of its own (no rcCodes, no sheet calling).
export function rcCodesFor(record, opts = {}) {
  const seats = seatCodesFor(record);
  if (seats.length || !isOwnerRecord(record, opts.owner)) return seats;
  return sheetOrder(new Set((opts.owner.seats || []).map((s) => String(s).toUpperCase()).filter((s) => ROLE_BY_RC[s])));
}

export function areasForRcCodes(rcCodes) {
  const set = new Set();
  (rcCodes || []).forEach((rc) => { const r = ROLE_BY_RC[rc]; if (r) r.areas.forEach((a) => set.add(a)); });
  return [...set].sort((a, b) => a - b);
}

// Role kept for screens and hubs that still read a role string: every area -> admin; the Home gate area plus
// every Youth admin area -> bishopric; the Home gate area otherwise -> home_admin; other areas -> leader.
export function roleForAreas(areas) {
  if (!areas || !areas.length) return null;
  const has = (ids) => ids.every((a) => areas.includes(a));
  if (has(ALL_AREA_IDS)) return 'admin';
  if (areas.includes(HOME_GATE_AREA) && has(YOUTH_ADMIN_AREAS)) return 'bishopric';
  if (areas.includes(HOME_GATE_AREA)) return 'home_admin';
  return 'leader';
}

// opts.breakGlass = true only for a master-password session (set by the hub, never read from a record).
export function resolveAccess(record, opts = {}) {
  const none = { rcCodes: [], areas: [], role: null, breakGlass: false, ownerFallback: false };
  if (opts.breakGlass === true) {
    return { rcCodes: [], areas: [...PERMISSIONS.breakGlass.areas], role: PERMISSIONS.breakGlass.role, breakGlass: true, ownerFallback: false };
  }
  if (!record || typeof record !== 'object' || record.active === false) return none;
  const rcCodes = rcCodesFor(record, opts);
  if (!rcCodes.length) return none;
  const areas = areasForRcCodes(rcCodes);
  return { rcCodes, areas, role: roleForAreas(areas), breakGlass: false, ownerFallback: seatCodesFor(record).length === 0 };
}

export function canAccess(access, area) {
  return !!access && Array.isArray(access.areas) && access.areas.includes(Number(area));
}

export function canEnterHub(access, hub) {
  const h = PERMISSIONS.hubs[hub];
  if (!h) return false;
  if (h.gateArea) return canAccess(access, h.gateArea);
  if (h.adminAreas) return h.adminAreas.some((a) => canAccess(access, a));
  return false;
}

function sameRecord(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const pa = normalizePhone(a.phoneNumber || '');
  const pb = normalizePhone(b.phoneNumber || '');
  return pa.length >= 11 && pa === pb;
}

// D8 password editing. opts: { owner, actorBreakGlass }.
export function canEditPassword(actor, target, opts = {}) {
  if (!target || typeof target !== 'object') return false;
  const pol = PERMISSIONS.passwordPolicy;
  const a = resolveAccess(actor, { owner: opts.owner, breakGlass: opts.actorBreakGlass === true });
  if (!a.role) return false;
  if (a.breakGlass) return pol.breakGlassEditsAll === true;
  if (a.rcCodes.some((rc) => pol.editAllSeats.includes(rc))) return true;
  if (sameRecord(actor, target)) return true;
  if (a.rcCodes.some((rc) => pol.editOwnAndNonBishopricSeats.includes(rc))) {
    return !rcCodesFor(target, { owner: opts.owner }).some((rc) => pol.protectedSeats.includes(rc));
  }
  return false;
}
