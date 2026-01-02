/**
 * Crustaceans.js - Procedural crustacean generation
 * 
 * Body plan: carapace + legs + claws + antennae
 * 
 * Key features:
 * - Exoskeleton (hard shell)
 * - 8 walking legs (4 pairs) + 2 claws (chelipeds)
 * - Antennae (sensory)
 * - Segmented body: cephalothorax + abdomen
 * - Some have tail fans (lobster, shrimp), some don't (crab)
 * 
 * Leg positions (looking from above, 0° = forward):
 *   Claws: ±30° (front)
 *   Leg 1: ±60°
 *   Leg 2: ±90° (sides)
 *   Leg 3: ±120°
 *   Leg 4: ±150° (rear)
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
// CRUSTACEAN CLASSES
// ============================================================================

export const CrustaceanClass = {
  // Crabs
  CRAB: 'crab',
  KING_CRAB: 'king_crab',
  SPIDER_CRAB: 'spider_crab',
  COCONUT_CRAB: 'coconut_crab',
  FIDDLER_CRAB: 'fiddler_crab',
  // Lobsters
  LOBSTER: 'lobster',
  CRAYFISH: 'crayfish',
  // Shrimp
  SHRIMP: 'shrimp',
  MANTIS_SHRIMP: 'mantis_shrimp',
  PISTOL_SHRIMP: 'pistol_shrimp',
  // Other
  HORSESHOE_CRAB: 'horseshoe_crab',
}

/**
 * Metadata for display names and ordering
 */
const CLASS_METADATA = {
  // Crabs
  [CrustaceanClass.CRAB]:          { emoji: '🦀', scientificName: 'Brachyura', order: 10 },
  [CrustaceanClass.KING_CRAB]:     { emoji: '🦀', scientificName: 'Lithodidae', order: 11 },
  [CrustaceanClass.SPIDER_CRAB]:   { emoji: '🦀', scientificName: 'Majoidea', order: 12 },
  [CrustaceanClass.COCONUT_CRAB]:  { emoji: '🥥', scientificName: 'Birgus latro', order: 14 },
  [CrustaceanClass.FIDDLER_CRAB]:  { emoji: '🦀', scientificName: 'Uca', order: 15 },
  // Lobsters
  [CrustaceanClass.LOBSTER]:       { emoji: '🦞', scientificName: 'Nephropidae', order: 20 },
  [CrustaceanClass.CRAYFISH]:      { emoji: '🦞', scientificName: 'Astacoidea', order: 21 },
  // Shrimp
  [CrustaceanClass.SHRIMP]:        { emoji: '🦐', scientificName: 'Caridea', order: 30 },
  [CrustaceanClass.MANTIS_SHRIMP]: { emoji: '🦐', scientificName: 'Stomatopoda', order: 31 },
  [CrustaceanClass.PISTOL_SHRIMP]: { emoji: '🦐', scientificName: 'Alpheidae', order: 32 },
  // Other
  [CrustaceanClass.HORSESHOE_CRAB]:{ emoji: '🧲', scientificName: 'Limulidae', order: 40 },
}

/**
 * Class definitions - body plans and proportions
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRAB - Classic wide carapace, sideways walker
  // 1 carapace + 8 legs + 2 claws + 2 eyestalks
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.CRAB]: {
    name: 'Crab',
    length: { min: 0.08, max: 0.25 },  // Carapace width
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },  // Relative to width
      depth: { min: 0.70, max: 0.85 },   // Front-to-back
    },
    
    palettes: [
      { shell: [0x8b4513, 0x9b5523, 0xab6533], leg: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
      { shell: [0xdc143c, 0xec2443, 0xfc3453], leg: [0xcc0428, 0xdc143c, 0xec2443] },  // Red
      { shell: [0x2f4f4f, 0x3f5f5f, 0x4f6f6f], leg: [0x1f3f3f, 0x2f4f4f, 0x3f5f5f] },  // Dark slate
      { shell: [0x4682b4, 0x5692c4, 0x66a2d4], leg: [0x3672a4, 0x4682b4, 0x5692c4] },  // Blue
    ],
    
    carapace: {
      shape: 'wide',  // wider than long
      widthRatio: 1.0,
      depthRatio: 0.75,
      heightRatio: 0.40,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.80,   // Relative to body width
      thickness: 0.04,
      angles: [60, 90, 120, 150],  // Degrees from centerline
    },
    
    claws: {
      lengthRatio: 0.60,
      thickness: 0.08,
      pincer: true,
      symmetric: true,
    },
    
    features: {
      eyestalks: { length: 0.15, spread: 0.25 },
      antennae: { length: 0.20, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // KING CRAB - Massive, spiny, long legs
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.KING_CRAB]: {
    name: 'King Crab',
    length: { min: 0.20, max: 0.28 },
    
    bodyRatios: {
      height: { min: 0.40, max: 0.50 },
      depth: { min: 0.85, max: 0.95 },
    },
    
    palettes: [
      { shell: [0x8b0000, 0x9b1010, 0xab2020], leg: [0x7b0000, 0x8b0000, 0x9b1010] },  // Deep red
      { shell: [0xb8860b, 0xc8960b, 0xd8a61b], leg: [0xa8760b, 0xb8860b, 0xc8960b] },  // Golden brown
    ],
    
    carapace: {
      shape: 'round',
      widthRatio: 1.0,
      depthRatio: 0.90,
      heightRatio: 0.45,
      spiny: true,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 1.80,  // Very long legs!
      thickness: 0.05,
      angles: [55, 85, 115, 145],
      spiny: true,
    },
    
    claws: {
      lengthRatio: 0.70,
      thickness: 0.10,
      pincer: true,
      symmetric: true,
    },
    
    features: {
      eyestalks: { length: 0.12, spread: 0.20 },
      antennae: { length: 0.15, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPIDER CRAB - Extremely long spindly legs
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.SPIDER_CRAB]: {
    name: 'Spider Crab',
    length: { min: 0.15, max: 0.40 },
    
    bodyRatios: {
      height: { min: 0.50, max: 0.60 },
      depth: { min: 1.00, max: 1.20 },  // Longer than wide
    },
    
    palettes: [
      { shell: [0xd2691e, 0xe2792e, 0xf2893e], leg: [0xc2590e, 0xd2691e, 0xe2792e] },  // Orange
      { shell: [0x8b4513, 0x9b5523, 0xab6533], leg: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
    ],
    
    carapace: {
      shape: 'triangular',  // Pointed front
      widthRatio: 0.80,
      depthRatio: 1.10,
      heightRatio: 0.55,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 3.00,  // Extremely long!
      thickness: 0.025,   // Very thin
      angles: [50, 80, 110, 140],
    },
    
    claws: {
      lengthRatio: 0.50,
      thickness: 0.05,
      pincer: true,
      symmetric: true,
    },
    
    features: {
      eyestalks: { length: 0.10, spread: 0.15 },
      antennae: { length: 0.30, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COCONUT CRAB - Largest land arthropod
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.COCONUT_CRAB]: {
    name: 'Coconut Crab',
    length: { min: 0.30, max: 0.45 },
    
    bodyRatios: {
      height: { min: 0.45, max: 0.55 },
      depth: { min: 1.20, max: 1.40 },  // Long body
    },
    
    palettes: [
      { shell: [0x4a0080, 0x5a1090, 0x6a20a0], leg: [0x3a0070, 0x4a0080, 0x5a1090] },  // Purple
      { shell: [0x8b0000, 0x9b1010, 0xab2020], leg: [0x7b0000, 0x8b0000, 0x9b1010] },  // Red
      { shell: [0x1a1a2a, 0x2a2a3a, 0x3a3a4a], leg: [0x0a0a1a, 0x1a1a2a, 0x2a2a3a] },  // Dark blue
    ],
    
    carapace: {
      shape: 'oval',
      widthRatio: 0.75,
      depthRatio: 1.30,
      heightRatio: 0.50,
    },
    
    abdomen: {
      visible: true,  // Unlike most crabs
      segments: 4,
      taperRatio: 0.60,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 1.20,
      thickness: 0.07,
      angles: [55, 85, 115, 145],
    },
    
    claws: {
      lengthRatio: 0.80,
      thickness: 0.12,
      pincer: true,
      symmetric: false,
      largeSide: 'left',
      sizeRatio: 1.3,
      crushingPower: true,  // Can crack coconuts!
    },
    
    features: {
      eyestalks: { length: 0.10, spread: 0.18 },
      antennae: { length: 0.15, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIDDLER CRAB - One massive claw
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.FIDDLER_CRAB]: {
    name: 'Fiddler Crab',
    length: { min: 0.02, max: 0.05 },
    
    bodyRatios: {
      height: { min: 0.40, max: 0.50 },
      depth: { min: 0.80, max: 0.90 },
    },
    
    palettes: [
      { shell: [0x4682b4, 0x5692c4, 0x66a2d4], leg: [0x3672a4, 0x4682b4, 0x5692c4] },  // Blue
      { shell: [0x8b4513, 0x9b5523, 0xab6533], leg: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
      { shell: [0xff6347, 0xff7357, 0xff8367], leg: [0xef5337, 0xff6347, 0xff7357] },  // Orange-red
    ],
    
    carapace: {
      shape: 'trapezoidal',
      widthRatio: 1.0,
      depthRatio: 0.85,
      heightRatio: 0.45,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.70,
      thickness: 0.03,
      angles: [60, 90, 120, 150],
    },
    
    claws: {
      lengthRatio: 0.40,
      thickness: 0.06,
      pincer: true,
      symmetric: false,
      largeSide: 'random',  // Males have one HUGE claw
      sizeRatio: 3.0,  // Major claw is 3x larger!
    },
    
    features: {
      eyestalks: { length: 0.25, spread: 0.35 },  // Tall eyestalks
      antennae: { length: 0.15, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LOBSTER - Classic with big claws and tail fan
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.LOBSTER]: {
    name: 'Lobster',
    length: { min: 0.25, max: 0.60 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.30 },
      width: { min: 0.20, max: 0.25 },
    },
    
    palettes: [
      { shell: [0x8b0000, 0x9b1010, 0xab2020], leg: [0x7b0000, 0x8b0000, 0x9b1010] },  // Red (cooked)
      { shell: [0x1a3a4a, 0x2a4a5a, 0x3a5a6a], leg: [0x0a2a3a, 0x1a3a4a, 0x2a4a5a] },  // Blue-brown (alive)
      { shell: [0x2f2f1f, 0x3f3f2f, 0x4f4f3f], leg: [0x1f1f0f, 0x2f2f1f, 0x3f3f2f] },  // Dark olive
    ],
    
    carapace: {
      shape: 'cylindrical',
      widthRatio: 0.22,
      depthRatio: 0.35,
      heightRatio: 0.25,
    },
    
    abdomen: {
      visible: true,
      segments: 6,
      taperRatio: 0.70,
      lengthRatio: 0.55,  // More than half is tail
    },
    
    tail: {
      type: 'fan',
      width: 0.25,
      length: 0.15,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.40,
      thickness: 0.025,
      angles: [70, 90, 110, 130],
    },
    
    claws: {
      lengthRatio: 0.45,
      thickness: 0.08,
      pincer: true,
      symmetric: false,  // Crusher and cutter
      largeSide: 'random',
      sizeRatio: 1.3,
    },
    
    features: {
      eyestalks: { length: 0.08, spread: 0.12 },
      antennae: { length: 0.80, count: 2 },  // Very long!
      antennules: { length: 0.15, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRAYFISH - Freshwater mini-lobster
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.CRAYFISH]: {
    name: 'Crayfish',
    length: { min: 0.08, max: 0.18 },
    
    bodyRatios: {
      height: { min: 0.22, max: 0.28 },
      width: { min: 0.18, max: 0.22 },
    },
    
    palettes: [
      { shell: [0x8b4513, 0x9b5523, 0xab6533], leg: [0x7b3503, 0x8b4513, 0x9b5523] },  // Brown
      { shell: [0x556b2f, 0x657b3f, 0x758b4f], leg: [0x455b1f, 0x556b2f, 0x657b3f] },  // Olive
      { shell: [0x8b0000, 0x9b1010, 0xab2020], leg: [0x7b0000, 0x8b0000, 0x9b1010] },  // Red
    ],
    
    carapace: {
      shape: 'cylindrical',
      widthRatio: 0.20,
      depthRatio: 0.40,
      heightRatio: 0.22,
    },
    
    abdomen: {
      visible: true,
      segments: 6,
      taperRatio: 0.65,
      lengthRatio: 0.50,
    },
    
    tail: {
      type: 'fan',
      width: 0.20,
      length: 0.12,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.35,
      thickness: 0.020,
      angles: [70, 90, 110, 130],
    },
    
    claws: {
      lengthRatio: 0.40,
      thickness: 0.06,
      pincer: true,
      symmetric: true,
    },
    
    features: {
      eyestalks: { length: 0.08, spread: 0.10 },
      antennae: { length: 0.60, count: 2 },
      antennules: { length: 0.12, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SHRIMP - Small, curved body
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.SHRIMP]: {
    name: 'Shrimp',
    length: { min: 0.05, max: 0.15 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.12, max: 0.16 },
    },
    
    palettes: [
      { shell: [0xffc0cb, 0xffd0db, 0xffe0eb], leg: [0xffb0bb, 0xffc0cb, 0xffd0db] },  // Pink
      { shell: [0xf5f5f5, 0xfafafa, 0xffffff], leg: [0xe5e5e5, 0xf0f0f0, 0xf5f5f5] },  // White
      { shell: [0xff6347, 0xff7357, 0xff8367], leg: [0xef5337, 0xff6347, 0xff7357] },  // Red
    ],
    
    carapace: {
      shape: 'curved',
      widthRatio: 0.14,
      depthRatio: 0.25,
      heightRatio: 0.18,
    },
    
    abdomen: {
      visible: true,
      segments: 6,
      taperRatio: 0.50,
      lengthRatio: 0.65,
      curved: true,  // Distinctive shrimp curve
    },
    
    tail: {
      type: 'fan',
      width: 0.12,
      length: 0.08,
    },
    
    rostrum: {
      length: 0.25,  // Pointed "nose"
      serrated: true,
    },
    
    legs: {
      pairs: 5,  // Shrimp have 5 walking pairs
      lengthRatio: 0.25,
      thickness: 0.010,
      angles: [60, 80, 100, 120, 140],
      swimmerets: true,
    },
    
    claws: {
      lengthRatio: 0.15,
      thickness: 0.015,
      pincer: true,
      symmetric: true,
      small: true,
    },
    
    features: {
      eyestalks: { length: 0.10, spread: 0.12 },
      antennae: { length: 1.50, count: 2 },  // Very long!
      antennules: { length: 0.30, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MANTIS SHRIMP - Colorful, powerful clubs/spears
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.MANTIS_SHRIMP]: {
    name: 'Mantis Shrimp',
    length: { min: 0.10, max: 0.38 },
    
    bodyRatios: {
      height: { min: 0.20, max: 0.25 },
      width: { min: 0.15, max: 0.20 },
    },
    
    palettes: [
      { shell: [0x00ff00, 0x20ff20, 0x40ff40], leg: [0xff0000, 0xff2020, 0xff4040] },  // Green/red
      { shell: [0x4169e1, 0x5179f1, 0x6189ff], leg: [0xff6347, 0xff7357, 0xff8367] },  // Blue/orange
      { shell: [0xff1493, 0xff24a3, 0xff34b3], leg: [0x00ced1, 0x10dee1, 0x20eef1] },  // Pink/cyan
    ],
    
    carapace: {
      shape: 'flat',
      widthRatio: 0.18,
      depthRatio: 0.20,
      heightRatio: 0.15,
    },
    
    abdomen: {
      visible: true,
      segments: 8,  // More segments visible
      taperRatio: 0.70,
      lengthRatio: 0.70,
    },
    
    tail: {
      type: 'fan',
      width: 0.20,
      length: 0.10,
      colorful: true,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.25,
      thickness: 0.015,
      angles: [70, 90, 110, 130],
    },
    
    raptorialAppendages: {
      // The famous "clubs" or "spears"
      type: 'smasher',  // or 'spearer'
      length: 0.30,
      thickness: 0.04,
      folded: true,
    },
    
    features: {
      eyestalks: { length: 0.15, spread: 0.20 },
      eyes: { trinocular: true },  // 16 color receptors!
      antennae: { length: 0.40, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PISTOL SHRIMP - One massive snapping claw
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.PISTOL_SHRIMP]: {
    name: 'Pistol Shrimp',
    length: { min: 0.03, max: 0.05 },
    
    bodyRatios: {
      height: { min: 0.20, max: 0.25 },
      width: { min: 0.15, max: 0.18 },
    },
    
    palettes: [
      { shell: [0xff6347, 0xff7357, 0xff8367], leg: [0xef5337, 0xff6347, 0xff7357] },  // Orange-red
      { shell: [0x32cd32, 0x42dd42, 0x52ed52], leg: [0x22bd22, 0x32cd32, 0x42dd42] },  // Green
      { shell: [0xdaa520, 0xeab530, 0xfac540], leg: [0xca9510, 0xdaa520, 0xeab530] },  // Golden
    ],
    
    carapace: {
      shape: 'rounded',
      widthRatio: 0.16,
      depthRatio: 0.30,
      heightRatio: 0.20,
    },
    
    abdomen: {
      visible: true,
      segments: 6,
      taperRatio: 0.55,
      lengthRatio: 0.60,
    },
    
    tail: {
      type: 'fan',
      width: 0.10,
      length: 0.06,
    },
    
    legs: {
      pairs: 4,
      lengthRatio: 0.30,
      thickness: 0.012,
      angles: [65, 90, 115, 140],
    },
    
    claws: {
      lengthRatio: 0.25,
      thickness: 0.03,
      pincer: true,
      symmetric: false,
      largeSide: 'random',
      sizeRatio: 4.0,  // Pistol claw is HUGE
      snapping: true,
    },
    
    features: {
      eyestalks: { length: 0.12, spread: 0.14 },
      antennae: { length: 0.80, count: 2 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HORSESHOE CRAB - Ancient, helmet-shaped (not true crab)
  // ═══════════════════════════════════════════════════════════════════════════
  [CrustaceanClass.HORSESHOE_CRAB]: {
    name: 'Horseshoe Crab',
    length: { min: 0.30, max: 0.60 },
    
    bodyRatios: {
      height: { min: 0.20, max: 0.25 },
      width: { min: 0.85, max: 0.95 },
    },
    
    palettes: [
      { shell: [0x5a4a3a, 0x6a5a4a, 0x7a6a5a], leg: [0x4a3a2a, 0x5a4a3a, 0x6a5a4a] },  // Brown
      { shell: [0x4a5a4a, 0x5a6a5a, 0x6a7a6a], leg: [0x3a4a3a, 0x4a5a4a, 0x5a6a5a] },  // Olive
    ],
    
    prosoma: {
      // Front "helmet"
      shape: 'horseshoe',
      widthRatio: 0.90,
      depthRatio: 0.60,
      heightRatio: 0.22,
    },
    
    opisthosoma: {
      // Middle section
      shape: 'hexagonal',
      widthRatio: 0.50,
      depthRatio: 0.25,
      heightRatio: 0.18,
    },
    
    telson: {
      // Tail spine
      length: 0.50,
      thickness: 0.03,
    },
    
    legs: {
      pairs: 5,
      lengthRatio: 0.35,
      thickness: 0.025,
      angles: [50, 70, 90, 110, 130],
      hidden: true,  // Under the shell
    },
    
    claws: null,  // No true claws
    
    features: {
      eyes: { compound: true, count: 10 },  // Many eyes!
      bookGills: true,
    },
  },
}

// ============================================================================
// CRUSTACEAN GENERATION
// ============================================================================

export function generateCrustacean(seed, crustaceanClass = null) {
  const rng = createRNG(seed)
  
  if (!crustaceanClass) {
    const classes = Object.values(CrustaceanClass)
    crustaceanClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[crustaceanClass]
  if (!classDef) {
    console.warn(`Unknown crustacean class: ${crustaceanClass}`)
    return null
  }
  
  // Primary dimension is "length" but meaning varies:
  // - Crabs: carapace width
  // - Lobsters/shrimp: total body length
  const length = range(rng, classDef.length.min, classDef.length.max)
  const height = length * range(rng, classDef.bodyRatios.height.min, classDef.bodyRatios.height.max)
  const width = classDef.bodyRatios.width 
    ? length * range(rng, classDef.bodyRatios.width.min, classDef.bodyRatios.width.max)
    : length * range(rng, classDef.bodyRatios.depth?.min || 0.8, classDef.bodyRatios.depth?.max || 1.0)
  
  const traits = {
    length,
    height,
    width,
    palette: pick(rng, classDef.palettes),
    colorIndex: Math.floor(rng() * 3),
    shellRoughness: range(rng, 0.6, 0.9),
  }
  
  // Determine asymmetric claw side if applicable
  if (classDef.claws?.symmetric === false && classDef.claws?.largeSide === 'random') {
    traits.largeClaw = chance(rng, 0.5) ? 'left' : 'right'
  } else if (classDef.claws?.largeSide) {
    traits.largeClaw = classDef.claws.largeSide
  }
  
  const { mesh, parts } = buildCrustaceanMesh(rng, classDef, traits, crustaceanClass)
  
  return { mesh, parts, seed, crustaceanClass, traits }
}

function buildCrustaceanMesh(rng, classDef, traits, crustaceanClass) {
  const crustGroup = new THREE.Group()
  const parts = {}
  let meshCount = 0
  const MAX_MESHES = 10
  
  const { length, height, width, palette, colorIndex } = traits
  
  const shellColor = palette.shell[colorIndex]
  const legColor = palette.leg[colorIndex]
  
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: shellColor,
    metalness: 0.1,
    roughness: traits.shellRoughness,
  })
  
  const legMaterial = new THREE.MeshStandardMaterial({
    color: legColor,
    metalness: 0.05,
    roughness: traits.shellRoughness + 0.1,
  })
  
  // Helper: add mesh with count check
  function addMesh(mesh, name) {
    if (meshCount >= MAX_MESHES) return false
    crustGroup.add(mesh)
    parts[name] = mesh
    meshCount++
    return true
  }
  
  // Helper: create a leg extending outward from body
  function createLeg(x, z, angle, legLen, legThick, material) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(legLen, legThick, legThick),
      material
    )
    // Position at body edge, leg extends outward in X direction
    const side = x > 0 ? 1 : -1
    leg.position.set(
      x + side * legLen * 0.5,
      height * 0.3,
      z
    )
    // Tilt down slightly
    leg.rotation.z = side * 0.3
    return leg
  }
  
  // === CRAB-TYPE BODY (wide carapace) ===
  if (classDef.carapace) {
    const carapaceW = length * classDef.carapace.widthRatio
    const carapaceD = length * classDef.carapace.depthRatio
    const carapaceH = length * classDef.carapace.heightRatio
    
    const carapace = new THREE.Mesh(
      new THREE.BoxGeometry(carapaceW, carapaceH, carapaceD),
      shellMaterial
    )
    carapace.position.set(0, carapaceH * 0.5, 0)
    addMesh(carapace, 'carapace')
  }
  
  // === HORSESHOE CRAB (prosoma + telson) ===
  if (classDef.prosoma) {
    const proW = length * classDef.prosoma.widthRatio
    const proD = length * classDef.prosoma.depthRatio
    const proH = length * classDef.prosoma.heightRatio
    
    const prosoma = new THREE.Mesh(
      new THREE.BoxGeometry(proW, proH, proD),
      shellMaterial
    )
    prosoma.position.set(0, proH * 0.5, 0)
    addMesh(prosoma, 'prosoma')
    
    // Telson (tail spike) - front attaches at back of prosoma
    if (classDef.telson && meshCount < MAX_MESHES) {
      const telsonLen = length * classDef.telson.length
      const telsonThick = length * classDef.telson.thickness
      
      const telson = new THREE.Mesh(
        new THREE.BoxGeometry(telsonThick, telsonThick, telsonLen),
        shellMaterial
      )
      // Front of telson (local -Z) attaches at back of prosoma
      telson.position.set(0, proH * 0.3, proD * 0.5 + telsonLen * 0.5)
      addMesh(telson, 'telson')
    }
  }
  
  // === LOBSTER/SHRIMP ABDOMEN (single tapered mesh) ===
  if (classDef.abdomen?.visible && meshCount < MAX_MESHES) {
    const abdomenLen = length * (classDef.abdomen.lengthRatio || 0.5)
    const abdomenW = width * 0.6
    const abdomenH = height * 0.5
    
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.3
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    const abdomen = new THREE.Mesh(
      new THREE.BoxGeometry(abdomenW, abdomenH, abdomenLen),
      shellMaterial
    )
    
    // Front of abdomen (local -Z) attaches at back of carapace
    let abdomenY = carapaceH * 0.5
    let abdomenZ = carapaceD * 0.5 + abdomenLen * 0.5
    let rotX = 0
    
    // Curve down for shrimp
    if (classDef.abdomen.curved) {
      rotX = 0.5
      // Adjust position so front still attaches at carapace
      abdomenY = carapaceH * 0.5 - abdomenLen * 0.5 * Math.sin(rotX)
      abdomenZ = carapaceD * 0.5 + abdomenLen * 0.5 * Math.cos(rotX)
    }
    
    abdomen.position.set(0, abdomenY, abdomenZ)
    abdomen.rotation.x = rotX
    addMesh(abdomen, 'abdomen')
  }
  
  // === TAIL FAN (single mesh) ===
  if (classDef.tail?.type === 'fan' && meshCount < MAX_MESHES) {
    const tailW = length * classDef.tail.width
    const tailL = length * classDef.tail.length
    const tailH = length * 0.03
    
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.3
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    const abdomenLen = classDef.abdomen?.visible ? length * (classDef.abdomen.lengthRatio || 0.5) : 0
    
    // Calculate where abdomen ends
    let tailY = carapaceH * 0.4
    let tailZ = carapaceD * 0.5 + abdomenLen + tailL * 0.5
    
    // Adjust for curved abdomen - tail attaches at end of curve
    if (classDef.abdomen?.curved) {
      const curveAngle = 0.5
      // End of curved abdomen is lower and not as far back
      tailY = carapaceH * 0.5 - abdomenLen * Math.sin(curveAngle)
      tailZ = carapaceD * 0.5 + abdomenLen * Math.cos(curveAngle) + tailL * 0.5
    }
    
    const tailFan = new THREE.Mesh(
      new THREE.BoxGeometry(tailW, tailH, tailL),
      shellMaterial
    )
    tailFan.position.set(0, tailY, tailZ)
    addMesh(tailFan, 'tailFan')
  }
  
  // === ROSTRUM (shrimp nose) ===
  if (classDef.rostrum && meshCount < MAX_MESHES) {
    const rostLen = length * classDef.rostrum.length
    const rostH = length * 0.02
    
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.3
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    const rostrum = new THREE.Mesh(
      new THREE.BoxGeometry(rostH, rostH, rostLen),
      shellMaterial
    )
    // Back of rostrum (local +Z) attaches at front-top of carapace
    rostrum.position.set(0, carapaceH * 0.85, -carapaceD * 0.5 - rostLen * 0.5)
    addMesh(rostrum, 'rostrum')
  }
  
  // === CLAWS (2 meshes) ===
  if (classDef.claws && meshCount < MAX_MESHES - 1) {
    const clawLen = length * classDef.claws.lengthRatio
    const clawThick = length * classDef.claws.thickness
    const largeSide = traits.largeClaw || 'right'
    const sizeRatio = classDef.claws.sizeRatio || 1.0
    
    const carapaceW = classDef.carapace ? length * classDef.carapace.widthRatio : width
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.3
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    // Claws extend forward from the front corners of the carapace
    const clawAngle = 0.3  // Angle inward toward centerline
    const clawY = carapaceH * 0.5
    const attachX = carapaceW * 0.4  // Attachment X offset from center
    
    // Right claw - rotates around Y by +clawAngle
    // Back of claw (local +Z) should attach to body
    const rSize = largeSide === 'right' ? sizeRatio : 1.0
    const rClawLen = clawLen * rSize
    const rClawThick = clawThick * rSize
    const clawR = new THREE.Mesh(
      new THREE.BoxGeometry(rClawThick, rClawThick * 0.5, rClawLen),
      legMaterial
    )
    // Offset position so back of claw attaches at body edge
    clawR.position.set(
      attachX - rClawLen * 0.5 * Math.sin(clawAngle),
      clawY,
      -carapaceD * 0.5 - rClawLen * 0.5 * Math.cos(clawAngle)
    )
    clawR.rotation.y = clawAngle
    addMesh(clawR, 'clawR')
    
    // Left claw - rotates around Y by -clawAngle
    const lSize = largeSide === 'left' ? sizeRatio : 1.0
    const lClawLen = clawLen * lSize
    const lClawThick = clawThick * lSize
    const clawL = new THREE.Mesh(
      new THREE.BoxGeometry(lClawThick, lClawThick * 0.5, lClawLen),
      legMaterial
    )
    // Offset position so back of claw attaches at body edge
    clawL.position.set(
      -attachX + lClawLen * 0.5 * Math.sin(clawAngle),
      clawY,
      -carapaceD * 0.5 - lClawLen * 0.5 * Math.cos(clawAngle)
    )
    clawL.rotation.y = -clawAngle
    addMesh(clawL, 'clawL')
  }
  
  // === RAPTORIAL APPENDAGES (mantis shrimp - replaces claws) ===
  if (classDef.raptorialAppendages && meshCount < MAX_MESHES - 1) {
    const rapLen = length * classDef.raptorialAppendages.length
    const rapThick = length * classDef.raptorialAppendages.thickness
    
    const rapMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      metalness: 0.3,
      roughness: 0.5,
    })
    
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.2
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    // Raptorial appendages fold forward, tips pointing ahead
    // They rotate around X axis so they tilt forward/down
    const foldAngle = -0.4  // Negative = tips point forward-down
    const attachY = carapaceH * 0.5
    const attachZ = -carapaceD * 0.4
    
    // Geometry extends in Z, rotation around X
    // Back of appendage (local +Z end) attaches to body
    const rapR = new THREE.Mesh(
      new THREE.BoxGeometry(rapThick, rapThick * 1.2, rapLen),
      rapMat
    )
    rapR.position.set(
      width * 0.15,
      attachY + rapLen * 0.5 * Math.sin(foldAngle),
      attachZ - rapLen * 0.5 * Math.cos(foldAngle)
    )
    rapR.rotation.x = foldAngle
    addMesh(rapR, 'raptorialR')
    
    const rapL = new THREE.Mesh(
      new THREE.BoxGeometry(rapThick, rapThick * 1.2, rapLen),
      rapMat
    )
    rapL.position.set(
      -width * 0.15,
      attachY + rapLen * 0.5 * Math.sin(foldAngle),
      attachZ - rapLen * 0.5 * Math.cos(foldAngle)
    )
    rapL.rotation.x = foldAngle
    addMesh(rapL, 'raptorialL')
  }
  
  // === LEGS (up to 4 meshes - combine pairs if needed) ===
  if (classDef.legs && !classDef.legs.hidden && meshCount < MAX_MESHES) {
    const legLen = length * classDef.legs.lengthRatio
    const legThick = length * classDef.legs.thickness
    const numPairs = Math.min(classDef.legs.pairs, 4)
    
    const carapaceW = classDef.carapace ? length * classDef.carapace.widthRatio : width
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.5
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    // Calculate how many leg meshes we can add
    const availableMeshes = MAX_MESHES - meshCount
    const legsToAdd = Math.min(numPairs * 2, availableMeshes)
    
    const tiltAngle = 0.5  // Legs tilt downward
    const attachY = carapaceH * 0.4  // Attach point on body
    
    for (let i = 0; i < legsToAdd && meshCount < MAX_MESHES; i++) {
      const side = i % 2 === 0 ? 1 : -1  // Alternate right/left
      const pairIndex = Math.floor(i / 2)
      
      // Spread legs along the body (front to back)
      const zOffset = (pairIndex / (numPairs - 1 || 1) - 0.5) * carapaceD * 0.7
      
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(legLen, legThick, legThick),
        legMaterial
      )
      
      // Position leg so inner edge attaches to body
      // After rotation, inner end moves - compensate so it stays at body edge
      leg.position.set(
        side * (carapaceW * 0.5 + legLen * 0.5 * Math.cos(tiltAngle)),
        attachY - legLen * 0.5 * Math.sin(tiltAngle),
        zOffset
      )
      
      // Tilt legs down (outer end lower than inner)
      leg.rotation.z = side * -tiltAngle
      
      addMesh(leg, `leg${i}`)
    }
  }
  
  // === EYESTALKS (combined into body or skip if at limit) ===
  // Only add if we have room and it's a defining feature
  if (classDef.features?.eyestalks && meshCount < MAX_MESHES - 1) {
    const eyeLen = length * classDef.features.eyestalks.length
    const eyeSpread = length * classDef.features.eyestalks.spread
    const eyeThick = length * 0.025
    
    const carapaceD = classDef.carapace ? length * classDef.carapace.depthRatio : length * 0.3
    const carapaceH = classDef.carapace ? length * classDef.carapace.heightRatio : height
    
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.5,
      roughness: 0.3,
    })
    
    // Eyestalks protrude upward from top-front of carapace
    // Bottom of eyestalk attaches to top of carapace
    const eyeR = new THREE.Mesh(
      new THREE.BoxGeometry(eyeThick, eyeLen, eyeThick),
      eyeMat
    )
    eyeR.position.set(
      eyeSpread * 0.5,
      carapaceH + eyeLen * 0.5,  // Bottom at carapace top
      -carapaceD * 0.35
    )
    addMesh(eyeR, 'eyeR')
    
    // Left eye
    if (meshCount < MAX_MESHES) {
      const eyeL = new THREE.Mesh(
        new THREE.BoxGeometry(eyeThick, eyeLen, eyeThick),
        eyeMat
      )
      eyeL.position.set(
        -eyeSpread * 0.5,
        carapaceH + eyeLen * 0.5,  // Bottom at carapace top
        -carapaceD * 0.35
      )
      addMesh(eyeL, 'eyeL')
    }
  }
  
  crustGroup.rotation.order = 'YXZ'
  
  return { mesh: crustGroup, parts }
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

export function generateCrustaceanOfClass(crustaceanClass) {
  return generateCrustacean(randomSeed(), crustaceanClass)
}

// ============================================================================
// CLASS METADATA HELPERS
// ============================================================================

/**
 * Get the full display name for a crustacean class
 */
export function getClassDisplayName(crustaceanClass) {
  const meta = CLASS_METADATA[crustaceanClass]
  if (!meta) return crustaceanClass
  const def = CLASS_DEFINITIONS[crustaceanClass]
  const name = def?.name || meta.scientificName
  return `${meta.emoji} ${name} (${meta.scientificName})`
}

/**
 * Get the short name for a crustacean class
 */
export function getClassShortName(crustaceanClass) {
  const def = CLASS_DEFINITIONS[crustaceanClass]
  if (def?.name) return def.name
  const meta = CLASS_METADATA[crustaceanClass]
  return meta?.scientificName || crustaceanClass
}

/**
 * Get all crustacean classes in display order
 */
export function getOrderedClasses() {
  return Object.values(CrustaceanClass)
    .filter(cc => CLASS_METADATA[cc])
    .sort((a, b) => CLASS_METADATA[a].order - CLASS_METADATA[b].order)
}

export default {
  generateCrustacean,
  generateCrustaceanOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  CrustaceanClass,
  getClassDisplayName,
  getClassShortName,
  getOrderedClasses,
}