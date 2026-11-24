// 2026-11-20 (Duane): temporary single master password; org passwords disabled.
// 2026-11-23 (Duane, #3): the temporary master password is RETIRED and its hash removed from every hub.
// zzWeb/tools/set-temp-master.sh is obsolete; do not run it.
window.SECURE_AUTH_HASHES = {
    MASTER: "RETIRED-2026-11-23",
    PRIMARY: "DISABLED-2026-11-20",
    PRIESTS: "DISABLED-2026-11-20",
    TEACHERS: "DISABLED-2026-11-20",
    DEACONS: "DISABLED-2026-11-20",
    YW: "DISABLED-2026-11-20",
    COMBINED: "DISABLED-2026-11-20",
    WARD: "DISABLED-2026-11-20"
};
var SECURE_AUTH_HASHES = window.SECURE_AUTH_HASHES;

window.MASTER_APPROVED_HASHES = [
    "RETIRED-2026-11-23",
    "DISABLED-2026-11-20",
    "DISABLED-2026-11-20",
    "DISABLED-2026-11-20"
];
var MASTER_APPROVED_HASHES = window.MASTER_APPROVED_HASHES;

window.SPOTLIGHT_APPROVED_HASHES = [
    "49dc32d144254d01d855278512b3136d081d8b3e48635d1d2da759d7257432b2",
    "96a030ef7207224a71290eec8daa464481ba8eb4ec9db402efbbf751c513b52b",
    "3741d854a9685db18aeedf0d5d19738b625ba8af2786bcba1be1d45b5aa350f3",
    "c2665ea3e12568c37b740ffa21751b197aabf0a164a7ca562906bd7c094dde34",
    "56fe43f748e258de06b4955e2b8978bbc1c28ff9ba53917387d6dca8fb920018",
    "cab6b959431f0cf4e844d2d5c54f4cf4b568c335e19427fafcb5a9efda1b55cb",
    "7e73b026cfd1b008c5580cc3d1d65bf7e59e70f8fd934508c40ad473835ea22a",
    "162094c4d87101ff5aca2e655c39a40744052b4e1deb3f100391d45946db0bec"
];
var SPOTLIGHT_APPROVED_HASHES = window.SPOTLIGHT_APPROVED_HASHES;

async function hashInput(name) {
    const normalized = name.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
window.hashInput = hashInput;
