/**
 * Cephalopods.js - Procedural cephalopod generation
 * 
 * Body plan: mantle + head + arms/tentacles + fins (some species)
 * 
 * Key features:
 * - Soft body (mantle/body sac)
 * - 8 arms (octopus) or 8 arms + 2 tentacles (squid/cuttlefish)
 * - Large eyes (lateral placement)
 * - Siphon (jet propulsion)
 * - Some have fins on mantle (squid, cuttlefish)
 * - Nautilus has external shell + many tentacles
 * 
 * Arm positions (looking from front, 0° = top):
 *   Arms radiate outward from head in a ring
 *   Octopus: 8 arms evenly spaced (45° apart)
 *   Squid: 8 arms + 2 longer tentacles
 * 
 * 1 unit = 1 meter
 */

import * as THREE from 'three'

// ============================================================================
// SEEDED RANDOM
// ============================================================================

function createRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function range(rng, min, max) {
  return min + rng() * (max - min)
}

function pick(rng, array) {
  return array[Math.floor(rng() * array.length)]
}

function chance(rng, probability) {
  return rng() < probability
}

// ============================================================================
// CEPHALOPOD CLASSES
// ============================================================================

export const CephalopodClass = {
  // Octopuses
  OCTOPUS: 'octopus',
  GIANT_PACIFIC_OCTOPUS: 'giant_pacific_octopus',
  BLUE_RINGED_OCTOPUS: 'blue_ringed_octopus',
  DUMBO_OCTOPUS: 'dumbo_octopus',
  MIMIC_OCTOPUS: 'mimic_octopus',
  // Squids
  SQUID: 'squid',
  GIANT_SQUID: 'giant_squid',
  HUMBOLDT_SQUID: 'humboldt_squid',
  FIREFLY_SQUID: 'firefly_squid',
  COLOSSAL_SQUID: 'colossal_squid',
  // Cuttlefish
  CUTTLEFISH: 'cuttlefish',
  FLAMBOYANT_CUTTLEFISH: 'flamboyant_cuttlefish',
  PHARAOH_CUTTLEFISH: 'pharaoh_cuttlefish',
  // Nautilus
  NAUTILUS: 'nautilus',
}

/**
 * Metadata for display names and ordering
 */
const CLASS_METADATA = {
  // Octopuses
  [CephalopodClass.OCTOPUS]:               { emoji: '🐙', scientificName: 'Octopoda', order: 10 },
  [CephalopodClass.GIANT_PACIFIC_OCTOPUS]: { emoji: '🐙', scientificName: 'Enteroctopus dofleini', order: 11 },
  [CephalopodClass.BLUE_RINGED_OCTOPUS]:   { emoji: '🐙', scientificName: 'Hapalochlaena', order: 12 },
  [CephalopodClass.DUMBO_OCTOPUS]:         { emoji: '🐙', scientificName: 'Grimpoteuthis', order: 13 },
  [CephalopodClass.MIMIC_OCTOPUS]:         { emoji: '🐙', scientificName: 'Thaumoctopus mimicus', order: 14 },
  // Squids
  [CephalopodClass.SQUID]:           { emoji: '🦑', scientificName: 'Teuthida', order: 20 },
  [CephalopodClass.GIANT_SQUID]:     { emoji: '🦑', scientificName: 'Architeuthis dux', order: 21 },
  [CephalopodClass.HUMBOLDT_SQUID]:  { emoji: '🦑', scientificName: 'Dosidicus gigas', order: 22 },
  [CephalopodClass.FIREFLY_SQUID]:   { emoji: '🦑', scientificName: 'Watasenia scintillans', order: 23 },
  [CephalopodClass.COLOSSAL_SQUID]:  { emoji: '🦑', scientificName: 'Mesonychoteuthis hamiltoni', order: 24 },
  // Cuttlefish
  [CephalopodClass.CUTTLEFISH]:            { emoji: '🦑', scientificName: 'Sepiida', order: 30 },
  [CephalopodClass.FLAMBOYANT_CUTTLEFISH]: { emoji: '🦑', scientificName: 'Metasepia pfefferi', order: 31 },
  [CephalopodClass.PHARAOH_CUTTLEFISH]:    { emoji: '🦑', scientificName: 'Sepia pharaonis', order: 32 },
  // Nautilus
  [CephalopodClass.NAUTILUS]: { emoji: '🐚', scientificName: 'Nautilidae', order: 40 },
}

/**
 * Class definitions - body plans and proportions
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OCTOPUS - Classic 8-armed cephalopod, no fins
  // 1 mantle + 1 head + 8 arms + 2 eyes
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.OCTOPUS]: {
    name: 'Octopus',
    length: { min: 0.30, max: 0.60 },  // Mantle length
    
    bodyRatios: {
      height: { min: 0.50, max: 0.65 },  // Relative to length
      width: { min: 0.55, max: 0.70 },
    },
    
    palettes: [
      { body: [0x8b4513, 0x9b5523, 0xab6533], arm: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
      { body: [0xdc143c, 0xcc0428, 0xbc0018], arm: [0xac0008, 0x9c0000, 0x8c0000] },  // Red
      { body: [0x8b0000, 0x9b1010, 0xab2020], arm: [0x7b0000, 0x6b0000, 0x5b0000] },  // Dark red
      { body: [0xd2691e, 0xc2590e, 0xb24900], arm: [0xa23900, 0x922900, 0x821900] },  // Orange
      { body: [0x556b2f, 0x657b3f, 0x758b4f], arm: [0x455b1f, 0x354b0f, 0x253b00] },  // Olive
    ],
    
    mantle: {
      shape: 'rounded',
      lengthRatio: 1.0,
      widthRatio: 0.60,
      heightRatio: 0.55,
    },
    
    head: {
      sizeRatio: 0.45,  // Relative to mantle
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 2.5,   // Relative to mantle length
      thickness: 0.08,    // Base thickness ratio
      taper: 0.85,        // How much arms taper
      curl: 0.3,          // Amount of curl at tips
    },
    
    features: {
      eyes: { size: 0.12, spread: 0.35 },
      siphon: { size: 0.08, position: 0.6 },
      suckers: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GIANT PACIFIC OCTOPUS - Largest octopus species
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.GIANT_PACIFIC_OCTOPUS]: {
    name: 'Giant Pacific Octopus',
    length: { min: 0.60, max: 1.00 },  // Mantle can reach 60cm+
    
    bodyRatios: {
      height: { min: 0.55, max: 0.70 },
      width: { min: 0.60, max: 0.75 },
    },
    
    palettes: [
      { body: [0x8b4513, 0x9b5523, 0xab6533], arm: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
      { body: [0xb22222, 0xa21212, 0x920202], arm: [0x820000, 0x720000, 0x620000] },  // Firebrick
      { body: [0xcd853f, 0xbd752f, 0xad651f], arm: [0x9d550f, 0x8d4500, 0x7d3500] },  // Tan
    ],
    
    mantle: {
      shape: 'bulbous',
      lengthRatio: 1.0,
      widthRatio: 0.65,
      heightRatio: 0.60,
    },
    
    head: {
      sizeRatio: 0.50,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 4.0,   // Very long arms!
      thickness: 0.10,
      taper: 0.80,
      curl: 0.35,
    },
    
    features: {
      eyes: { size: 0.10, spread: 0.40 },
      siphon: { size: 0.10, position: 0.55 },
      suckers: true,
      webbing: 0.25,  // Webbing between arms
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BLUE-RINGED OCTOPUS - Small but deadly, distinctive blue rings
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.BLUE_RINGED_OCTOPUS]: {
    name: 'Blue-Ringed Octopus',
    length: { min: 0.05, max: 0.08 },  // Very small!
    
    bodyRatios: {
      height: { min: 0.45, max: 0.55 },
      width: { min: 0.50, max: 0.60 },
    },
    
    palettes: [
      { body: [0xdaa520, 0xcab510, 0xbaa500], arm: [0xaaa500, 0x9a9500, 0x8a8500], rings: 0x0066ff },  // Yellow with blue
      { body: [0xf4a460, 0xe49450, 0xd48440], arm: [0xc47430, 0xb46420, 0xa45410], rings: 0x0088ff },  // Sandy
    ],
    
    mantle: {
      shape: 'compact',
      lengthRatio: 1.0,
      widthRatio: 0.55,
      heightRatio: 0.50,
    },
    
    head: {
      sizeRatio: 0.40,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 2.0,
      thickness: 0.06,
      taper: 0.80,
      curl: 0.25,
    },
    
    features: {
      eyes: { size: 0.15, spread: 0.30 },
      siphon: { size: 0.06, position: 0.6 },
      suckers: true,
      blueRings: true,  // Distinctive markings
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DUMBO OCTOPUS - Deep sea, ear-like fins
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.DUMBO_OCTOPUS]: {
    name: 'Dumbo Octopus',
    length: { min: 0.20, max: 0.30 },
    
    bodyRatios: {
      height: { min: 0.65, max: 0.80 },
      width: { min: 0.70, max: 0.85 },
    },
    
    palettes: [
      { body: [0xffc0cb, 0xffb0bb, 0xffa0ab], arm: [0xef9090, 0xdf8080, 0xcf7070] },  // Pink
      { body: [0xffe4e1, 0xffd4d1, 0xffc4c1], arm: [0xefb4b1, 0xdfa4a1, 0xcf9491] },  // Misty rose
      { body: [0xffffff, 0xf0f0f0, 0xe0e0e0], arm: [0xd0d0d0, 0xc0c0c0, 0xb0b0b0] },  // White
    ],
    
    mantle: {
      shape: 'bell',  // Bell-shaped, gelatinous
      lengthRatio: 1.0,
      widthRatio: 0.75,
      heightRatio: 0.70,
    },
    
    head: {
      sizeRatio: 0.35,
      position: 'integrated',  // Head blends with mantle
    },
    
    arms: {
      count: 8,
      lengthRatio: 1.5,   // Shorter arms
      thickness: 0.08,
      taper: 0.75,
      curl: 0.2,
    },
    
    fins: {
      type: 'ear',
      size: 0.40,    // Large ear-like fins
      position: 0.3,
      angle: 45,
    },
    
    features: {
      eyes: { size: 0.10, spread: 0.35 },
      siphon: { size: 0.06, position: 0.65 },
      suckers: true,
      webbing: 0.60,  // Extensive webbing
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MIMIC OCTOPUS - Can imitate other animals
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.MIMIC_OCTOPUS]: {
    name: 'Mimic Octopus',
    length: { min: 0.20, max: 0.35 },
    
    bodyRatios: {
      height: { min: 0.40, max: 0.50 },
      width: { min: 0.45, max: 0.55 },
    },
    
    palettes: [
      { body: [0xf5deb3, 0xe5ceb3, 0xd5bea3], arm: [0xc5ae93, 0xb59e83, 0xa58e73], stripes: 0x3d2b1f },  // Tan with brown stripes
      { body: [0xfaf0e6, 0xeae0d6, 0xdad0c6], arm: [0xcac0b6, 0xbab0a6, 0xaaa096], stripes: 0x2f1f0f },  // Linen
    ],
    
    mantle: {
      shape: 'elongated',
      lengthRatio: 1.0,
      widthRatio: 0.45,
      heightRatio: 0.40,
    },
    
    head: {
      sizeRatio: 0.35,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 3.5,   // Long, flexible arms
      thickness: 0.05,
      taper: 0.90,
      curl: 0.4,
    },
    
    features: {
      eyes: { size: 0.12, spread: 0.30 },
      siphon: { size: 0.07, position: 0.6 },
      suckers: true,
      stripes: true,  // Brown/white striped pattern
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SQUID - Common squid with torpedo body
  // 1 mantle + 2 fins + 8 arms + 2 tentacles + 2 eyes
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.SQUID]: {
    name: 'Squid',
    length: { min: 0.20, max: 0.40 },
    
    bodyRatios: {
      height: { min: 0.30, max: 0.40 },
      width: { min: 0.30, max: 0.40 },
    },
    
    palettes: [
      { body: [0xfff5ee, 0xefe5de, 0xdfd5ce], arm: [0xcfc5be, 0xbfb5ae, 0xafa59e], spots: 0x8b0000 },  // Cream with red spots
      { body: [0xf0e68c, 0xe0d67c, 0xd0c66c], arm: [0xc0b65c, 0xb0a64c, 0xa0963c], spots: 0x800000 },  // Khaki
      { body: [0xd2b48c, 0xc2a47c, 0xb2946c], arm: [0xa2845c, 0x92744c, 0x82643c], spots: 0x4a0000 },  // Tan
    ],
    
    mantle: {
      shape: 'torpedo',
      lengthRatio: 1.0,
      widthRatio: 0.35,
      heightRatio: 0.35,
    },
    
    head: {
      sizeRatio: 0.30,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.80,
      thickness: 0.04,
      taper: 0.85,
      curl: 0.15,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.50,  // Longer than arms
      thickness: 0.03,
      clubSize: 0.12,     // Expanded tip with suckers
    },
    
    fins: {
      type: 'triangular',
      size: 0.25,
      position: 0.85,     // Near tail end
      angle: 30,
    },
    
    features: {
      eyes: { size: 0.10, spread: 0.28 },
      siphon: { size: 0.08, position: 0.4 },
      suckers: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GIANT SQUID - Legendary deep-sea monster
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.GIANT_SQUID]: {
    name: 'Giant Squid',
    length: { min: 2.0, max: 5.0 },  // Mantle alone can be huge
    
    bodyRatios: {
      height: { min: 0.28, max: 0.35 },
      width: { min: 0.28, max: 0.35 },
    },
    
    palettes: [
      { body: [0x8b0000, 0x9b1010, 0xab2020], arm: [0x7b0000, 0x6b0000, 0x5b0000] },  // Deep red
      { body: [0xcd5c5c, 0xbd4c4c, 0xad3c3c], arm: [0x9d2c2c, 0x8d1c1c, 0x7d0c0c] },  // Indian red
    ],
    
    mantle: {
      shape: 'torpedo',
      lengthRatio: 1.0,
      widthRatio: 0.30,
      heightRatio: 0.30,
    },
    
    head: {
      sizeRatio: 0.25,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 1.2,
      thickness: 0.06,
      taper: 0.80,
      curl: 0.2,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 4.0,   // Extremely long!
      thickness: 0.04,
      clubSize: 0.15,
    },
    
    fins: {
      type: 'triangular',
      size: 0.20,
      position: 0.90,
      angle: 25,
    },
    
    features: {
      eyes: { size: 0.12, spread: 0.25 },  // Largest eyes in animal kingdom
      siphon: { size: 0.10, position: 0.35 },
      suckers: true,
      hooks: true,  // Suckers have hooks
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HUMBOLDT SQUID - Aggressive pack hunter
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.HUMBOLDT_SQUID]: {
    name: 'Humboldt Squid',
    length: { min: 0.50, max: 1.50 },
    
    bodyRatios: {
      height: { min: 0.32, max: 0.40 },
      width: { min: 0.32, max: 0.40 },
    },
    
    palettes: [
      { body: [0xdc143c, 0xcc0428, 0xbc0018], arm: [0xac0008, 0x9c0000, 0x8c0000] },  // Crimson
      { body: [0xffffff, 0xf0f0f0, 0xe0e0e0], arm: [0xd0d0d0, 0xc0c0c0, 0xb0b0b0] },  // White (flashing)
    ],
    
    mantle: {
      shape: 'muscular',
      lengthRatio: 1.0,
      widthRatio: 0.38,
      heightRatio: 0.38,
    },
    
    head: {
      sizeRatio: 0.28,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.90,
      thickness: 0.05,
      taper: 0.82,
      curl: 0.2,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.80,
      thickness: 0.04,
      clubSize: 0.14,
    },
    
    fins: {
      type: 'triangular',
      size: 0.28,
      position: 0.88,
      angle: 35,
    },
    
    features: {
      eyes: { size: 0.09, spread: 0.26 },
      siphon: { size: 0.09, position: 0.4 },
      suckers: true,
      hooks: true,
      bioluminescence: true,  // Flashing chromatophores
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIREFLY SQUID - Bioluminescent beauty
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.FIREFLY_SQUID]: {
    name: 'Firefly Squid',
    length: { min: 0.05, max: 0.08 },  // Very small
    
    bodyRatios: {
      height: { min: 0.35, max: 0.42 },
      width: { min: 0.35, max: 0.42 },
    },
    
    palettes: [
      { body: [0x4169e1, 0x3159d1, 0x2149c1], arm: [0x1139b1, 0x0129a1, 0x001991], glow: 0x00ffff },  // Royal blue
      { body: [0x6a5acd, 0x5a4abd, 0x4a3aad], arm: [0x3a2a9d, 0x2a1a8d, 0x1a0a7d], glow: 0x00ff88 },  // Slate blue
    ],
    
    mantle: {
      shape: 'torpedo',
      lengthRatio: 1.0,
      widthRatio: 0.35,
      heightRatio: 0.35,
    },
    
    head: {
      sizeRatio: 0.32,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.70,
      thickness: 0.04,
      taper: 0.85,
      curl: 0.15,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.20,
      thickness: 0.025,
      clubSize: 0.10,
    },
    
    fins: {
      type: 'rounded',
      size: 0.22,
      position: 0.85,
      angle: 30,
    },
    
    features: {
      eyes: { size: 0.12, spread: 0.28 },
      siphon: { size: 0.05, position: 0.45 },
      suckers: true,
      bioluminescence: true,  // Blue light organs
      photophores: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COLOSSAL SQUID - Largest invertebrate
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.COLOSSAL_SQUID]: {
    name: 'Colossal Squid',
    length: { min: 2.5, max: 4.0 },
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },
      width: { min: 0.35, max: 0.45 },
    },
    
    palettes: [
      { body: [0x800020, 0x900030, 0xa00040], arm: [0x700010, 0x600000, 0x500000] },  // Burgundy
      { body: [0x722f37, 0x821f27, 0x920f17], arm: [0x620007, 0x520000, 0x420000] },  // Wine
    ],
    
    mantle: {
      shape: 'massive',
      lengthRatio: 1.0,
      widthRatio: 0.40,
      heightRatio: 0.42,
    },
    
    head: {
      sizeRatio: 0.28,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 1.0,
      thickness: 0.08,
      taper: 0.75,
      curl: 0.25,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 2.5,
      thickness: 0.06,
      clubSize: 0.18,
    },
    
    fins: {
      type: 'rounded',
      size: 0.30,
      position: 0.85,
      angle: 35,
    },
    
    features: {
      eyes: { size: 0.14, spread: 0.28 },
      siphon: { size: 0.12, position: 0.38 },
      suckers: true,
      rotatingHooks: true,  // Swiveling hooks on arms
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CUTTLEFISH - Master of camouflage
  // 1 mantle + 2 undulating fins + 8 arms + 2 tentacles
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.CUTTLEFISH]: {
    name: 'Cuttlefish',
    length: { min: 0.15, max: 0.45 },
    
    bodyRatios: {
      height: { min: 0.40, max: 0.50 },
      width: { min: 0.55, max: 0.65 },
    },
    
    palettes: [
      { body: [0xd2b48c, 0xc2a47c, 0xb2946c], arm: [0xa2845c, 0x92744c, 0x82643c] },  // Tan
      { body: [0x8b4513, 0x9b5523, 0xab6533], arm: [0x7b3503, 0x6b2500, 0x5b1500] },  // Brown
      { body: [0x556b2f, 0x657b3f, 0x758b4f], arm: [0x455b1f, 0x354b0f, 0x253b00] },  // Olive
      { body: [0x2f4f4f, 0x3f5f5f, 0x4f6f6f], arm: [0x1f3f3f, 0x0f2f2f, 0x001f1f] },  // Dark slate
    ],
    
    mantle: {
      shape: 'oval',       // Flattened oval
      lengthRatio: 1.0,
      widthRatio: 0.60,
      heightRatio: 0.45,
    },
    
    head: {
      sizeRatio: 0.30,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.60,
      thickness: 0.05,
      taper: 0.80,
      curl: 0.2,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.20,
      thickness: 0.03,
      clubSize: 0.10,
      retractable: true,   // Can be hidden
    },
    
    fins: {
      type: 'undulating',  // Full-length frills
      size: 0.15,
      position: 0.5,       // Run along entire body
      fullLength: true,
    },
    
    features: {
      eyes: { size: 0.14, spread: 0.35, wShaped: true },  // W-shaped pupils
      siphon: { size: 0.07, position: 0.5 },
      suckers: true,
      cuttlebone: true,    // Internal shell
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FLAMBOYANT CUTTLEFISH - Toxic and colorful
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.FLAMBOYANT_CUTTLEFISH]: {
    name: 'Flamboyant Cuttlefish',
    length: { min: 0.06, max: 0.08 },  // Small
    
    bodyRatios: {
      height: { min: 0.45, max: 0.55 },
      width: { min: 0.55, max: 0.65 },
    },
    
    palettes: [
      { body: [0x800080, 0x900090, 0xa000a0], arm: [0xffff00, 0xffd700, 0xffc000], spots: 0xffffff },  // Purple/yellow
      { body: [0x8b0000, 0x9b1010, 0xab2020], arm: [0xff4500, 0xf53500, 0xe52500], spots: 0xffff00 },  // Red/orange
    ],
    
    mantle: {
      shape: 'oval',
      lengthRatio: 1.0,
      widthRatio: 0.58,
      heightRatio: 0.48,
    },
    
    head: {
      sizeRatio: 0.32,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.55,
      thickness: 0.06,
      taper: 0.78,
      curl: 0.25,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.0,
      thickness: 0.035,
      clubSize: 0.09,
      retractable: true,
    },
    
    fins: {
      type: 'undulating',
      size: 0.14,
      position: 0.5,
      fullLength: true,
    },
    
    features: {
      eyes: { size: 0.15, spread: 0.32, wShaped: true },
      siphon: { size: 0.06, position: 0.5 },
      suckers: true,
      cuttlebone: true,
      flamboyantDisplay: true,  // Warning coloration
      walks: true,               // Can walk on seafloor
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHARAOH CUTTLEFISH - Large Indo-Pacific species
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.PHARAOH_CUTTLEFISH]: {
    name: 'Pharaoh Cuttlefish',
    length: { min: 0.30, max: 0.42 },
    
    bodyRatios: {
      height: { min: 0.42, max: 0.52 },
      width: { min: 0.58, max: 0.68 },
    },
    
    palettes: [
      { body: [0xdeb887, 0xceb877, 0xbea867], arm: [0xae9857, 0x9e8847, 0x8e7837] },  // Burlywood
      { body: [0x8b7355, 0x9b8365, 0xab9375], arm: [0x7b6345, 0x6b5335, 0x5b4325] },  // Tan brown
    ],
    
    mantle: {
      shape: 'broad',
      lengthRatio: 1.0,
      widthRatio: 0.62,
      heightRatio: 0.48,
    },
    
    head: {
      sizeRatio: 0.30,
      position: 'front',
    },
    
    arms: {
      count: 8,
      lengthRatio: 0.65,
      thickness: 0.055,
      taper: 0.82,
      curl: 0.22,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 1.30,
      thickness: 0.035,
      clubSize: 0.12,
      retractable: true,
    },
    
    fins: {
      type: 'undulating',
      size: 0.16,
      position: 0.5,
      fullLength: true,
    },
    
    features: {
      eyes: { size: 0.13, spread: 0.36, wShaped: true },
      siphon: { size: 0.08, position: 0.5 },
      suckers: true,
      cuttlebone: true,
      zebra: true,  // Can display zebra pattern
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NAUTILUS - Ancient external shell, many tentacles
  // 1 shell + many tentacles (90+) + hood
  // ═══════════════════════════════════════════════════════════════════════════
  [CephalopodClass.NAUTILUS]: {
    name: 'Nautilus',
    length: { min: 0.15, max: 0.25 },  // Shell diameter
    
    bodyRatios: {
      height: { min: 0.90, max: 1.00 },  // Shell is roughly spherical
      width: { min: 0.45, max: 0.55 },   // Shell is laterally compressed
    },
    
    palettes: [
      { shell: [0xffe4b5, 0xffd4a5, 0xffc495], body: [0xff8c00, 0xf87c00, 0xf06c00], stripes: 0x8b4513 },  // Cream with brown stripes
      { shell: [0xfaf0e6, 0xeae0d6, 0xdad0c6], body: [0xcd853f, 0xbd752f, 0xad651f], stripes: 0x654321 },  // Linen
    ],
    
    shell: {
      type: 'chambered',
      spiralTurns: 2.5,
      thickness: 0.08,
    },
    
    head: {
      sizeRatio: 0.40,
      position: 'aperture',  // Emerges from shell opening
    },
    
    tentacles: {
      count: 90,       // Many simple tentacles
      lengthRatio: 0.60,
      thickness: 0.015,
      noSuckers: true,  // No suckers, unlike other cephalopods
    },
    
    hood: {
      present: true,
      size: 0.35,  // Protective leathery hood
    },
    
    features: {
      eyes: { size: 0.08, spread: 0.25, pinhole: true },  // Primitive pinhole eyes
      siphon: { size: 0.10, position: 0.4 },
    },
  },
}

// ============================================================================
// MESH GENERATION
// ============================================================================

const MAX_MESHES = 12  // Limit for performance

/**
 * Generate a procedural cephalopod mesh
 * @param {number} seed - Random seed for consistent generation
 * @param {string} cephalopodClass - Type from CephalopodClass enum
 * @returns {object} { mesh: THREE.Group, parts: {}, seed, class }
 */
export function generateCephalopod(seed, cephalopodClass = null) {
  const rng = createRNG(seed)
  
  // Pick class if not specified
  if (!cephalopodClass) {
    const classes = Object.values(CephalopodClass)
    cephalopodClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[cephalopodClass]
  if (!classDef) {
    console.warn(`Unknown cephalopod class: ${cephalopodClass}`)
    return null
  }
  
  // Generate base dimensions
  const length = range(rng, classDef.length.min, classDef.length.max)
  const height = length * range(rng, classDef.bodyRatios.height.min, classDef.bodyRatios.height.max)
  const width = length * range(rng, classDef.bodyRatios.width.min, classDef.bodyRatios.width.max)
  
  // Pick color palette
  const palette = pick(rng, classDef.palettes)
  const bodyColor = pick(rng, palette.body || palette.shell)
  const armColor = pick(rng, palette.arm || palette.body || palette.shell)
  
  // Create materials
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.1,
    roughness: 0.7,
  })
  
  const armMaterial = new THREE.MeshStandardMaterial({
    color: armColor,
    metalness: 0.05,
    roughness: 0.8,
  })
  
  // Create group and tracking
  const cephGroup = new THREE.Group()
  const parts = {}
  let meshCount = 0
  
  function addMesh(mesh, name) {
    if (meshCount >= MAX_MESHES) return false
    mesh.castShadow = true
    mesh.receiveShadow = true
    cephGroup.add(mesh)
    parts[name] = mesh
    meshCount++
    return true
  }
  
  // === NAUTILUS - Special case with shell ===
  if (classDef.shell) {
    const shellColor = pick(rng, palette.shell)
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: shellColor,
      metalness: 0.2,
      roughness: 0.5,
    })
    
    // Create spiral shell - shell is at front (-Z), opening faces back (+Z)
    const shellRadius = length * 0.45
    const shellThickness = length * classDef.shell.thickness
    
    const shell = new THREE.Mesh(
      new THREE.TorusGeometry(shellRadius, shellThickness, 8, 16, Math.PI * 1.5),
      shellMaterial
    )
    shell.rotation.x = Math.PI / 2
    shell.rotation.y = Math.PI / 2  // Opening faces +Z
    shell.position.z = -shellRadius * 0.3  // Shell at front
    addMesh(shell, 'shell')
    
    // Inner whorl
    const innerShell = new THREE.Mesh(
      new THREE.TorusGeometry(shellRadius * 0.5, shellThickness * 0.8, 6, 12, Math.PI * 1.5),
      shellMaterial
    )
    innerShell.rotation.x = Math.PI / 2
    innerShell.rotation.y = Math.PI / 2
    innerShell.position.z = -shellRadius * 0.3
    addMesh(innerShell, 'innerShell')
    
    // Body emerging from shell aperture (toward +Z)
    const bodySize = length * classDef.head.sizeRatio
    const bodyZ = shellRadius * 0.35
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(bodySize, 8, 6),
      bodyMaterial
    )
    body.position.set(0, 0, bodyZ)
    body.scale.set(0.8, 0.7, 1)
    addMesh(body, 'body')
    
    // Hood
    if (classDef.hood && classDef.hood.present) {
      const hoodSize = bodySize * classDef.hood.size
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(hoodSize, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        bodyMaterial
      )
      hood.position.set(0, bodySize * 0.4, bodyZ + bodySize * 0.3)
      hood.rotation.x = -Math.PI / 3
      addMesh(hood, 'hood')
    }
    
    // Tentacles - trail behind (toward +Z)
    const tentacleLen = length * classDef.tentacles.lengthRatio
    const tentacleThick = length * classDef.tentacles.thickness
    const numTentacles = Math.min(6, MAX_MESHES - meshCount)
    
    const spreadAngle = 0.5
    
    for (let i = 0; i < numTentacles && meshCount < MAX_MESHES; i++) {
      // Distribute tentacles in a fan pattern
      const ringAngle = ((i / (numTentacles - 1)) - 0.5) * Math.PI * 0.8
      
      // Create tentacle with base at origin
      const tentGeom = new THREE.CylinderGeometry(tentacleThick * 0.5, tentacleThick, tentacleLen, 4)
      tentGeom.translate(0, tentacleLen / 2, 0)
      
      const tentacle = new THREE.Mesh(tentGeom, armMaterial)
      
      // Attach behind body (toward +Z)
      const attachZ = bodyZ + bodySize * 0.7
      const attachX = Math.sin(ringAngle) * bodySize * 0.25
      const attachY = Math.cos(ringAngle) * bodySize * 0.3
      
      tentacle.position.set(attachX, attachY, attachZ)
      
      // Point tentacles backward (+Z) with spread
      tentacle.rotation.order = 'ZXY'
      tentacle.rotation.x = Math.PI / 2 + ringAngle * 0.4
      tentacle.rotation.z = -Math.sin(ringAngle) * spreadAngle * 0.3
      
      addMesh(tentacle, `tentacle${i}`)
    }
  }
  // === STANDARD CEPHALOPOD (octopus, squid, cuttlefish) ===
  else {
    const mantleDef = classDef.mantle
    const mantleLen = length * mantleDef.lengthRatio
    const mantleW = length * mantleDef.widthRatio
    const mantleH = length * mantleDef.heightRatio
    
    // Create mantle (body sac)
    let mantleGeom
    if (mantleDef.shape === 'torpedo' || mantleDef.shape === 'muscular') {
      // Elongated squid shape
      mantleGeom = new THREE.CapsuleGeometry(mantleW * 0.5, mantleLen - mantleW, 6, 12)
    } else if (mantleDef.shape === 'oval' || mantleDef.shape === 'broad') {
      // Flattened cuttlefish shape
      mantleGeom = new THREE.SphereGeometry(mantleLen * 0.5, 10, 8)
    } else {
      // Rounded octopus shape
      mantleGeom = new THREE.SphereGeometry(mantleLen * 0.5, 8, 8)
    }
    
    const mantle = new THREE.Mesh(mantleGeom, bodyMaterial)
    
    // Scale mantle appropriately
    if (mantleDef.shape === 'torpedo' || mantleDef.shape === 'muscular') {
      mantle.rotation.x = Math.PI / 2
      mantle.scale.set(mantleW / mantleLen, 1, mantleH / mantleLen)
    } else if (mantleDef.shape === 'oval' || mantleDef.shape === 'broad') {
      mantle.scale.set(mantleW / mantleLen, mantleH / mantleLen, 1)
    } else {
      mantle.scale.set(mantleW / mantleLen, mantleH / mantleLen, 1)
    }
    
    // Mantle at FRONT (-Z direction, like fish head) - cephalopods swim mantle-first
    mantle.position.set(0, 0, -mantleLen * 0.3)
    addMesh(mantle, 'mantle')
    
    // === HEAD ===
    // Head is BEHIND mantle (toward +Z)
    const headSize = mantleLen * classDef.head.sizeRatio
    const headZ = mantleLen * 0.1
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(headSize, 8, 6),
      bodyMaterial
    )
    head.position.set(0, 0, headZ)
    head.scale.set(1.1, 0.9, 0.9)
    addMesh(head, 'head')
    
    // === EYES ===
    if (classDef.features?.eyes && meshCount < MAX_MESHES - 1) {
      const eyeSize = mantleLen * classDef.features.eyes.size
      const eyeSpread = mantleLen * classDef.features.eyes.spread
      
      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.6,
        roughness: 0.2,
      })
      
      // Eyes on sides of head
      const eyeR = new THREE.Mesh(
        new THREE.SphereGeometry(eyeSize, 6, 4),
        eyeMaterial
      )
      eyeR.position.set(eyeSpread, 0, headZ)
      addMesh(eyeR, 'eyeR')
      
      if (meshCount < MAX_MESHES) {
        const eyeL = new THREE.Mesh(
          new THREE.SphereGeometry(eyeSize, 6, 4),
          eyeMaterial
        )
        eyeL.position.set(-eyeSpread, 0, headZ)
        addMesh(eyeL, 'eyeL')
      }
    }
    
    // === FINS (squid/cuttlefish) ===
    if (classDef.fins && meshCount < MAX_MESHES - 1) {
      const finSize = mantleLen * classDef.fins.size
      const finPos = mantleLen * classDef.fins.position
      
      const finMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.05,
        roughness: 0.8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
      
      if (classDef.fins.type === 'ear') {
        // Dumbo octopus ear-like fins - on sides of mantle
        const finGeom = new THREE.CircleGeometry(finSize, 8)
        
        const finR = new THREE.Mesh(finGeom, finMaterial)
        finR.position.set(mantleW * 0.5, mantleH * 0.2, -mantleLen * 0.2)
        finR.rotation.y = -Math.PI / 4
        finR.rotation.z = Math.PI / 6
        addMesh(finR, 'finR')
        
        if (meshCount < MAX_MESHES) {
          const finL = new THREE.Mesh(finGeom, finMaterial)
          finL.position.set(-mantleW * 0.5, mantleH * 0.2, -mantleLen * 0.2)
          finL.rotation.y = Math.PI / 4
          finL.rotation.z = -Math.PI / 6
          addMesh(finL, 'finL')
        }
      } else if (classDef.fins.fullLength) {
        // Cuttlefish undulating fins - along sides of mantle
        const finGeom = new THREE.PlaneGeometry(finSize, mantleLen * 0.8)
        
        const finR = new THREE.Mesh(finGeom, finMaterial)
        finR.position.set(mantleW * 0.5 + finSize * 0.4, 0, -mantleLen * 0.25)
        finR.rotation.y = Math.PI / 2
        addMesh(finR, 'finR')
        
        if (meshCount < MAX_MESHES) {
          const finL = new THREE.Mesh(finGeom, finMaterial)
          finL.position.set(-mantleW * 0.5 - finSize * 0.4, 0, -mantleLen * 0.25)
          finL.rotation.y = Math.PI / 2
          addMesh(finL, 'finL')
        }
      } else {
        // Squid triangular fins - at rear of mantle
        const finGeom = new THREE.BufferGeometry()
        const vertices = new Float32Array([
          0, 0, 0,
          finSize, 0, finSize * 0.5,
          0, 0, finSize,
        ])
        finGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
        finGeom.computeVertexNormals()
        
        const finR = new THREE.Mesh(finGeom, finMaterial)
        finR.position.set(mantleW * 0.3, 0, -mantleLen * 0.6)
        addMesh(finR, 'finR')
        
        if (meshCount < MAX_MESHES) {
          const finL = new THREE.Mesh(finGeom.clone(), finMaterial)
          finL.position.set(-mantleW * 0.3, 0, -mantleLen * 0.6)
          finL.scale.x = -1
          addMesh(finL, 'finL')
        }
      }
    }
    
    // === ARMS ===
    if (classDef.arms && meshCount < MAX_MESHES) {
      const armLen = mantleLen * classDef.arms.lengthRatio
      const armThick = mantleLen * classDef.arms.thickness
      const numArms = classDef.arms.count
      
      // Calculate how many arms we can add
      const availableMeshes = MAX_MESHES - meshCount
      const armsToAdd = Math.min(numArms, availableMeshes)
      
      // Arms attach at BACK of head, trailing behind (toward +Z)
      const armAttachZ = headZ + headSize * 0.5
      const attachRadius = headSize * 0.6
      
      // Spread angle - how much arms fan outward
      const spreadAngle = 0.5
      
      for (let i = 0; i < armsToAdd && meshCount < MAX_MESHES; i++) {
        // Ring position: 0 = top, going clockwise when viewed from behind
        const ringAngle = (i / numArms) * Math.PI * 2
        
        // Create tapered cylinder with BASE at origin (thick end attaches to head)
        const armGeom = new THREE.CylinderGeometry(armThick * 0.3, armThick, armLen, 5)
        armGeom.translate(0, armLen / 2, 0)
        
        const arm = new THREE.Mesh(armGeom, armMaterial)
        
        // Attachment point on head (in a ring around the mouth area)
        const attachX = Math.sin(ringAngle) * attachRadius
        const attachY = Math.cos(ringAngle) * attachRadius * 0.7
        
        arm.position.set(attachX, attachY, armAttachZ)
        
        // Rotation: cylinder points +Y, we want it to point +Z (trailing behind)
        // rotation.x = PI/2 points it toward +Z
        // Then add spread based on ring position
        arm.rotation.order = 'ZXY'
        arm.rotation.x = Math.PI / 2 + spreadAngle * Math.cos(ringAngle)
        arm.rotation.z = -spreadAngle * Math.sin(ringAngle)
        
        addMesh(arm, `arm${i}`)
      }
    }
    
    // === TENTACLES (squid/cuttlefish only) ===
    if (classDef.tentacles && meshCount < MAX_MESHES - 1) {
      const tentLen = mantleLen * classDef.tentacles.lengthRatio
      const tentThick = mantleLen * classDef.tentacles.thickness
      
      // Tentacles attach behind head, trailing with arms
      const tentAttachZ = headZ + headSize * 0.4
      const attachRadius = headSize * 0.4
      
      // Two feeding tentacles - positioned at sides
      const spreadAngle = 0.35
      
      for (let side = 0; side < 2 && meshCount < MAX_MESHES; side++) {
        // Position tentacles at 3 o'clock and 9 o'clock
        const ringAngle = side === 0 ? Math.PI / 2 : -Math.PI / 2
        
        const attachX = Math.sin(ringAngle) * attachRadius
        const attachY = 0  // Center height
        
        // Create tapered cylinder with base at origin
        const tentGeom = new THREE.CylinderGeometry(tentThick * 0.4, tentThick, tentLen, 4)
        tentGeom.translate(0, tentLen / 2, 0)
        
        const tentacle = new THREE.Mesh(tentGeom, armMaterial)
        
        tentacle.position.set(attachX, attachY, tentAttachZ)
        
        // Point backward (+Z) with slight outward spread
        tentacle.rotation.order = 'ZXY'
        tentacle.rotation.x = Math.PI / 2
        tentacle.rotation.z = -spreadAngle * Math.sin(ringAngle)
        
        addMesh(tentacle, `tentacle${side}`)
        
        // Add club at tip if we have room
        if (classDef.tentacles.clubSize && meshCount < MAX_MESHES) {
          const clubSize = mantleLen * classDef.tentacles.clubSize
          
          // Club is at the tip of tentacle, which extends in +Z direction with some spread
          const tipZ = tentAttachZ + tentLen * Math.cos(spreadAngle * Math.abs(Math.sin(ringAngle)))
          const tipX = attachX - tentLen * Math.sin(spreadAngle * Math.sin(ringAngle))
          
          const club = new THREE.Mesh(
            new THREE.SphereGeometry(clubSize, 5, 4),
            armMaterial
          )
          club.position.set(tipX, attachY, tipZ + clubSize * 0.3)
          club.scale.set(0.6, 0.5, 1.2)
          addMesh(club, `club${side}`)
        }
      }
    }
  }
  
  cephGroup.rotation.order = 'YXZ'
  
  return {
    mesh: cephGroup,
    parts,
    seed,
    class: cephalopodClass,
    length,
    height,
    width,
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

export function randomSeed() {
  return Math.floor(Math.random() * 0xFFFFFFFF)
}

export function seedToString(seed) {
  return seed.toString(16).toUpperCase().padStart(8, '0')
}

export function stringToSeed(str) {
  return parseInt(str, 16)
}

export function generateCephalopodOfClass(cephalopodClass) {
  return generateCephalopod(randomSeed(), cephalopodClass)
}

// ============================================================================
// CLASS METADATA HELPERS
// ============================================================================

/**
 * Get the full display name for a cephalopod class
 */
export function getClassDisplayName(cephalopodClass) {
  const meta = CLASS_METADATA[cephalopodClass]
  if (!meta) return cephalopodClass
  const def = CLASS_DEFINITIONS[cephalopodClass]
  const name = def?.name || meta.scientificName
  return `${meta.emoji} ${name} (${meta.scientificName})`
}

/**
 * Get the short name for a cephalopod class
 */
export function getClassShortName(cephalopodClass) {
  const def = CLASS_DEFINITIONS[cephalopodClass]
  if (def?.name) return def.name
  const meta = CLASS_METADATA[cephalopodClass]
  return meta?.scientificName || cephalopodClass
}

/**
 * Get all cephalopod classes in display order
 */
export function getOrderedClasses() {
  return Object.values(CephalopodClass)
    .filter(cc => CLASS_METADATA[cc])
    .sort((a, b) => CLASS_METADATA[a].order - CLASS_METADATA[b].order)
}

export default {
  generateCephalopod,
  generateCephalopodOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  CephalopodClass,
  getClassDisplayName,
  getClassShortName,
  getOrderedClasses,
}