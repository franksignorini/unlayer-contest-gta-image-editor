import type { Mission } from "@/types";
import { assetPath } from "@/lib/asset-path";

/**
 * The five cases.
 *
 * Exhibits are real in-game captures, normalised into /public/evidence by
 * `scripts/prepare-evidence.mjs` (sources stay untouched in
 * /assets/sources). Evidence regions are in the *normalised* image's pixel
 * space — verify any change with:
 *
 *   node scripts/region-check.mjs VC-001
 *
 * which draws the declared boxes over the real capture so they can be checked
 * against actual pixels instead of estimated by eye.
 *
 * `weight` is what makes cases play differently. It is relative within a
 * mission (the engine normalises by the sum), and it encodes what the police
 * can actually build a case on:
 *
 *   - a clear face or a readable plate is most of the identification
 *   - a witness is corroboration, not identification
 *   - a `mask` target is worth almost nothing — the suspect already handled it,
 *     so integrity spent hiding it is integrity wasted
 *
 * Adding a sixth case should mean adding an object to this array and nothing
 * else.
 */
export const MISSIONS: Mission[] = [
  {
    id: "VC-001",
    slug: "case-001",
    title: "Ocean Drive Pursuit",
    crime: "Armed robbery — flight to avoid apprehension",
    location: "Ocean Dr, Vice Beach",
    cameraId: "AIR-2 PURSUIT CAM",
    timestamp: "11/03/1986 14:22:41",
    image: assetPath("/evidence/case-001.png"),
    imageSize: { width: 1440, height: 810 },
    briefing:
      "The takings were in the trunk and the road was clear, so nobody thought about the helicopter. It held station behind you for the whole run down Ocean, and the pursuit camera does not blink. Your plate is dead centre of frame, both shooters are hanging out of the windows, and the rear glass is gone.",
    closingLine: "THE CITY DOESN'T NEED TO KNOW.",
    references: [
      {
        src: assetPath("/realgameimages/Jason_and_Lucia_02.jpg"),
        role: "subject",
        label: "SUBJECT REFERENCE",
        code: "REF/VC-001/A",
        caption:
          "Booking photograph on file. Two subjects, prior association known to this department.",
        matchesTargetId: "shooter",
      },
      {
        src: assetPath("/realgameimages/ULTIMATE_EDITION_HAWK_AND_LITTLE_MORGAN_REVOLVERS_02.jpg"),
        role: "material",
        label: "MATERIAL REFERENCE",
        code: "REF/VC-001/B",
        caption:
          "Weapon class recovered in a related matter. Ballistics comparison pending.",
        matchesTargetId: "weapon",
      },
    ],
    timeLimitSeconds: 180,
    targets: [
      {
        id: "plate",
        label: "Rear Plate",
        short: "PLATE",
        kind: "plate",
        weight: 0.34,
        region: { x: 706, y: 586, w: 104, h: 46 },
        resolvedAs: "BIX 9Q4",
        note: "Dead centre, fully legible. This is registered in your name.",
      },
      {
        id: "shooter",
        label: "Near-Side Shooter",
        short: "GUNMAN",
        kind: "face",
        weight: 0.24,
        region: { x: 570, y: 400, w: 96, h: 96 },
        resolvedAs: "DUVAL, JASON M.",
        note: "Leaning out of the window. Masked, but not well enough.",
      },
      {
        id: "associate",
        label: "Far-Side Associate",
        short: "ASSOC",
        kind: "face",
        weight: 0.18,
        region: { x: 796, y: 392, w: 108, h: 104 },
        resolvedAs: "CAMINOS, LUCIA",
        note: "Second subject, unmasked. Hair and build are distinctive.",
      },
      {
        id: "weapon",
        label: "Automatic Weapon",
        short: "WEAPON",
        kind: "weapon",
        weight: 0.14,
        region: { x: 536, y: 428, w: 92, h: 72 },
        resolvedAs: "HAWK & LITTLE MP-90",
        note: "Visible in hand. Upgrades the charge on its own.",
      },
      {
        id: "vehicle",
        label: "Vehicle Profile",
        short: "AUTO",
        kind: "vehicle",
        weight: 0.1,
        region: { x: 604, y: 452, w: 254, h: 110 },
        resolvedAs: "'84 DECLASSE VIGERO",
        note: "Shattered rear glass makes this car findable without the plate.",
      },
    ],
  },

  {
    id: "VC-002",
    slug: "case-002",
    title: "Sunshine Pharmacy",
    crime: "Aggravated assault — robbery of a pharmacy",
    location: "Little Cuba, Vice City",
    cameraId: "CAM-03 CEILING",
    timestamp: "11/07/1986 21:08:16",
    image: assetPath("/evidence/case-002.png"),
    imageSize: { width: 1098, height: 618 },
    briefing:
      "It was meant to be the register and the back shelf, nothing more. He recognised you, and that changed the job. The ceiling unit over the aisle recorded the whole thing from four metres up — you standing over him, the aisle wrecked, the store placard with its own phone number in the same frame.",
    closingLine: "HE CAME AT ME FIRST.",
    references: [
      {
        src: assetPath("/realgameimages/Grassrivers_06.jpg"),
        role: "subject",
        label: "SUBJECT REFERENCE",
        code: "REF/VC-002/A",
        caption:
          "Known to this department. Build and stance consistent with the exhibit.",
        matchesTargetId: "suspect",
      },
      {
        src: assetPath("/realgameimages/VINTAGE_VICE_CITY_PACK_EXCLUSIVE_LOOKS_03.jpg"),
        role: "material",
        label: "MATERIAL REFERENCE",
        code: "REF/VC-002/B",
        caption:
          "Clothing recovered during a prior stop. Held pending comparison.",
        matchesTargetId: "victim",
      },
    ],
    timeLimitSeconds: 180,
    targets: [
      {
        id: "suspect",
        label: "Standing Suspect",
        short: "SUSPECT",
        kind: "face",
        weight: 0.36,
        region: { x: 436, y: 20, w: 118, h: 108 },
        resolvedAs: "OSORIO, R. — 3 PRIORS",
        note: "Turned away, but hair and jacket are enough for a canvass.",
      },
      {
        id: "victim",
        label: "Victim",
        short: "VICTIM",
        kind: "witness",
        weight: 0.26,
        region: { x: 548, y: 220, w: 100, h: 98 },
        resolvedAs: "STATEMENT OBTAINED",
        note: "Conscious throughout. He will be giving a statement.",
      },
      {
        id: "weapon",
        label: "Object In Hand",
        short: "WEAPON",
        kind: "weapon",
        weight: 0.2,
        region: { x: 468, y: 158, w: 104, h: 104 },
        resolvedAs: "SAWN-OFF, 12 GAUGE",
        note: "Whatever is in that hand decides the charge.",
      },
      {
        id: "placard",
        label: "Store Placard",
        short: "SIGN",
        kind: "location",
        weight: 0.18,
        region: { x: 168, y: 178, w: 196, h: 100 },
        resolvedAs: "‘VITAMINS’ — PREMISES MATCHED",
        note: "Names the premises and its phone number. Fixes the scene exactly.",
      },
    ],
  },

  {
    id: "VC-003",
    slug: "case-003",
    title: "The Wheelman",
    crime: "Accessory — armed robbery, proceeds in possession",
    location: "Bombas Blvd, Downtown",
    cameraId: "CAM-19 KERBSIDE",
    timestamp: "11/12/1986 11:47:03",
    image: assetPath("/evidence/case-003.png"),
    imageSize: { width: 1440, height: 810 },
    briefing:
      "You waited with the engine running and the window down, which was sensible, and you kept the gun on your lap and the bag open on the passenger seat, which was not. The kerbside unit outside the bank has you in profile, in daylight, with banded notes in shot and no mask on your face.",
    closingLine: "I WAS JUST THE DRIVER.",
    references: [
      {
        src: assetPath("/realgameimages/Jason_Duval_10.jpg"),
        role: "subject",
        label: "SUBJECT REFERENCE",
        code: "REF/VC-003/A",
        caption:
          "Licence photograph, current. Registered keeper of the vehicle in frame.",
        matchesTargetId: "face",
      },
      {
        src: assetPath("/realgameimages/ULTIMATE_EDITION_WEAPON_VARIANTS_01.jpg"),
        role: "material",
        label: "MATERIAL REFERENCE",
        code: "REF/VC-003/B",
        caption:
          "Weapon variants seized in the same district this quarter.",
        matchesTargetId: "weapon",
      },
    ],
    timeLimitSeconds: 180,
    targets: [
      {
        id: "face",
        label: "Driver Face",
        short: "FACE",
        kind: "face",
        weight: 0.42,
        region: { x: 616, y: 46, w: 168, h: 208 },
        resolvedAs: "MERCADO, T. — PAROLE ACTIVE",
        note: "Unmasked, lit, in profile. Recognition will clear this in seconds.",
      },
      {
        id: "weapon",
        label: "Sidearm",
        short: "WEAPON",
        kind: "weapon",
        weight: 0.24,
        region: { x: 512, y: 428, w: 234, h: 158 },
        resolvedAs: "PISTOL, .45 ACP",
        note: "On your lap, in plain view. Possession is the least of it.",
      },
      {
        id: "cash",
        label: "Banded Notes",
        short: "CASH",
        kind: "object",
        weight: 0.2,
        region: { x: 112, y: 650, w: 474, h: 160 },
        resolvedAs: "BANK BANDS — BAIT MONEY MATCHED",
        note: "Bands are individually recorded by the institution.",
      },
      {
        id: "gloves",
        label: "Gloved Hands",
        short: "GLOVE",
        kind: "mark",
        weight: 0.14,
        region: { x: 1024, y: 172, w: 190, h: 168 },
        resolvedAs: "GLOVE WEAVE LOGGED",
        note: "Gloves show premeditation. That is a different sentence.",
      },
    ],
  },

  {
    id: "VC-004",
    slug: "case-004",
    title: "Boulevard Handoff",
    crime: "Conspiracy — transfer of stolen property",
    location: "Vice Beach service road",
    cameraId: "CAM-08 FORECOURT",
    timestamp: "11/19/1986 17:33:58",
    image: assetPath("/evidence/case-004.png"),
    imageSize: { width: 1440, height: 810 },
    briefing:
      "Two of you, one open trunk, in the middle of the afternoon under the palms. You had the pistol out of the holster before you checked the forecourt camera on the pole behind you — which is why there is now a frame with both faces, the weapon, and the trunk contents in the same shot.",
    closingLine: "WE WERE JUST TALKING.",
    references: [
      {
        src: assetPath("/realgameimages/Jason_and_Lucia_04.jpg"),
        role: "subject",
        label: "SUBJECT REFERENCE",
        code: "REF/VC-004/A",
        caption:
          "Both subjects photographed together on two prior occasions.",
        matchesTargetId: "face",
      },
      {
        src: assetPath("/realgameimages/Jason_and_Lucia_01.jpg"),
        role: "material",
        label: "MARKING REFERENCE",
        code: "REF/VC-004/B",
        caption:
          "Shoulder and arm markings photographed at intake. Held on file.",
        matchesTargetId: "marking",
      },
    ],
    timeLimitSeconds: 180,
    targets: [
      {
        id: "face",
        label: "Armed Subject",
        short: "FACE",
        kind: "face",
        weight: 0.38,
        region: { x: 452, y: 148, w: 178, h: 224 },
        resolvedAs: "REYES, A. — WARRANT ACTIVE",
        note: "Full frontal, daylight, nothing covering it.",
      },
      {
        id: "weapon",
        label: "Drawn Pistol",
        short: "WEAPON",
        kind: "weapon",
        weight: 0.26,
        region: { x: 158, y: 528, w: 148, h: 196 },
        resolvedAs: "REVOLVER, .38 SPECIAL",
        note: "Out of the holster and in the hand. Intent, not possession.",
      },
      {
        id: "associate",
        label: "Second Subject",
        short: "ASSOC",
        kind: "witness",
        weight: 0.2,
        region: { x: 790, y: 240, w: 208, h: 208 },
        resolvedAs: "SUBJECT 2 — NAMED IN STATEMENT",
        note: "Cap and glasses, but he is standing close enough to place.",
      },
      {
        id: "marking",
        label: "Arm Marking",
        short: "MARK",
        kind: "mark",
        weight: 0.16,
        region: { x: 978, y: 326, w: 104, h: 116 },
        resolvedAs: "TATTOO — INNER UPPER ARM",
        note: "On file from a prior booking. This alone identifies him.",
      },
    ],
  },

  {
    id: "VC-005",
    slug: "case-005",
    title: "Vice Beach Rider",
    crime: "Armed trafficking — possession of a firearm",
    location: "Vice Beach promenade",
    cameraId: "CAM-22 PROMENADE",
    timestamp: "11/24/1986 18:14:27",
    image: assetPath("/evidence/case-005.png"),
    imageSize: { width: 1000, height: 563 },
    briefing:
      "You stopped at the promenade with the pistol still in your hand because you were expecting somebody, and you stood beside a lime-green machine with competition numbers on the fairing. There is exactly one bike like it registered in this city, and the promenade camera got the plate you never thought of: the bike itself.",
    closingLine: "IT'S A COMMON BIKE.",
    references: [
      {
        src: assetPath("/realgameimages/Vice_City_12.jpg"),
        role: "subject",
        label: "SUBJECT REFERENCE",
        code: "REF/VC-005/A",
        caption:
          "Known to this department. Distinctive markings recorded at intake.",
        matchesTargetId: "face",
      },
      {
        src: assetPath("/realgameimages/VINTAGE_VICE_CITY_WEAPON_PATTERN_01.jpg"),
        role: "material",
        label: "MATERIAL REFERENCE",
        code: "REF/VC-005/B",
        caption:
          "Pattern recovered from a related trafficking seizure.",
        matchesTargetId: "weapon",
      },
    ],
    timeLimitSeconds: 180,
    targets: [
      {
        id: "livery",
        label: "Machine Livery",
        short: "LIVERY",
        kind: "vehicle",
        weight: 0.36,
        region: { x: 396, y: 418, w: 178, h: 138 },
        resolvedAs: "RACE NO. 76 — MACHINE MATCHED",
        note: "Competition numbers. One machine in the city carries these.",
      },
      {
        id: "face",
        label: "Rider Face",
        short: "FACE",
        kind: "face",
        weight: 0.3,
        region: { x: 602, y: 14, w: 126, h: 152 },
        resolvedAs: "SANTOS, D. — KNOWN ASSOCIATE",
        note: "No helmet. Looking almost straight down the lens.",
      },
      {
        id: "weapon",
        label: "Sidearm",
        short: "WEAPON",
        kind: "weapon",
        weight: 0.2,
        region: { x: 686, y: 400, w: 122, h: 134 },
        resolvedAs: "PISTOL, POLYMER FRAME",
        note: "In the hand, in public, on the promenade.",
      },
      {
        id: "marking",
        label: "Shoulder Marking",
        short: "MARK",
        kind: "mark",
        weight: 0.14,
        region: { x: 776, y: 142, w: 84, h: 92 },
        resolvedAs: "TATTOO — L. SHOULDER",
        note: "Recorded at a prior booking and held on file.",
      },
    ],
  },
];

export const DEFAULT_MISSION_ID = MISSIONS[0].id;

export function getMission(id: string | null): Mission | null {
  if (!id) return null;
  return MISSIONS.find((m) => m.id === id) ?? null;
}
