/**
 * Fishes.js - Anatomically accurate procedural fish generation
 * 
 * Fin placement uses degrees around body cross-section (looking from behind):
 *   0° = dorsal (top)
 *   120° = right-lower
 *   -120° = left-lower  
 *   180° = ventral (bottom)
 * 
 * Position along body: 0 = snout, 1 = tail base
 * 1 unit = 1 meter
 * Max 10 meshes per fish
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

// Convert degrees to position around body
// 0° = top, 90° = right, 180° = bottom, -90° = left
function degToOffset(deg, radiusX, radiusY) {
  const rad = (deg * Math.PI) / 180
  return {
    x: Math.sin(rad) * radiusX,
    y: Math.cos(rad) * radiusY
  }
}

// ============================================================================
// FISH CLASSES
// ============================================================================

export const FishClass = {
  SHARK: 'shark',
  RAY: 'ray',
  EEL: 'eel',
  GROUPER: 'grouper',
  TUNA: 'tuna',
  BARRACUDA: 'barracuda',
  TANG: 'tang',
  ANGELFISH: 'angelfish',
  PUFFER: 'puffer',
  MARLIN: 'marlin',
  FLOUNDER: 'flounder',
  STARTER: 'starter',
}

/**
 * Anatomically accurate class definitions
 * All fin positions use degrees around body (0° = top)
 * All sizes as ratios of body length
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SHARK (Selachimorpha) - 10 meshes
  // 3 body + 1 dorsal + 2 pectorals + 2 pelvics + 2 tail lobes
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.SHARK]: {
    name: 'Shark',
    length: { min: 1.5, max: 5.0 },
    
    bodyRatios: {
      height: { min: 0.15, max: 0.20 },
      width: { min: 0.12, max: 0.16 },
    },
    
    palettes: [
      { body: [0x5a6575, 0x6a7585, 0x7a8595], fin: [0x4a5565, 0x5a6575, 0x6a7585] },
      { body: [0x3d4555, 0x4d5565, 0x5d6575], fin: [0x2d3545, 0x3d4555, 0x4d5565] },
      { body: [0x6d7d8d, 0x7d8d9d, 0x8d9dad], fin: [0x5d6d7d, 0x6d7d8d, 0x7d8d9d] },
    ],
    
    // Body: [start, end, heightMult, widthMult]
    body: [
      { start: 0.00, end: 0.25, hMult: 0.70, wMult: 0.60 },  // Head - tapered snout
      { start: 0.25, end: 0.70, hMult: 1.00, wMult: 1.00 },  // Body - full girth
      { start: 0.70, end: 1.00, hMult: 0.35, wMult: 0.30 },  // Peduncle - very narrow
    ],
    
    // Fins: deg (around body), pos (along body 0-1), size [length, height, width]
    fins: [
      { name: 'dorsal',    deg: 0,    pos: 0.40, size: [0.12, 0.20, 0.02] },  // Iconic tall dorsal
      { name: 'pectoralR', deg: 120,  pos: 0.30, size: [0.22, 0.02, 0.08] },  // Right pec
      { name: 'pectoralL', deg: -120, pos: 0.30, size: [0.22, 0.02, 0.08] },  // Left pec
      { name: 'pelvicR',   deg: 140,  pos: 0.58, size: [0.08, 0.015, 0.03] }, // Right pelvic
      { name: 'pelvicL',   deg: -140, pos: 0.58, size: [0.08, 0.015, 0.03] }, // Left pelvic
    ],
    
    // Heterocercal tail - upper lobe larger
    tail: {
      type: 'heterocercal',
      upper: { size: [0.25, 0.15, 0.02], angle: 25 },  // 70% of tail
      lower: { size: [0.15, 0.08, 0.02], angle: -15 }, // 30% of tail
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RAY (Batoidea) - 6 meshes
  // 2 body + 2 wings + 1 tail + 1 (small pelvic area)
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.RAY]: {
    name: 'Ray',
    length: { min: 1.5, max: 5.5 },  // Wingspan
    
    bodyRatios: {
      height: { min: 0.05, max: 0.08 },  // Very flat
      width: { min: 0.40, max: 0.50 },   // Central disc (wings add more)
    },
    
    palettes: [
      { body: [0x3a4a5a, 0x4a5a6a, 0x5a6a7a], fin: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a] },
      { body: [0x1a2a3a, 0x2a3a4a, 0x3a4a5a], fin: [0x0a1a2a, 0x1a2a3a, 0x2a3a4a] },
      { body: [0x4a4a4a, 0x5a5a5a, 0x6a6a6a], fin: [0x3a3a3a, 0x4a4a4a, 0x5a5a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.50, hMult: 1.00, wMult: 1.00 },  // Front disc
      { start: 0.50, end: 1.00, hMult: 0.70, wMult: 0.60 },  // Rear disc
    ],
    
    // Wings at 90° and -90° (sides)
    fins: [
      { name: 'wingR', deg: 90,  pos: 0.40, size: [0.40, 0.04, 0.45], isWing: true },
      { name: 'wingL', deg: -90, pos: 0.40, size: [0.40, 0.04, 0.45], isWing: true },
    ],
    
    tail: {
      type: 'whip',
      size: [1.20, 0.02, 0.02],  // Very long thin whip
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EEL (Anguilliformes) - 8 meshes
  // 6 body segments + 1 dorsal ribbon + 1 tail
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.EEL]: {
    name: 'Eel',
    length: { min: 0.6, max: 3.0 },
    
    bodyRatios: {
      height: { min: 0.06, max: 0.09 },
      width: { min: 0.05, max: 0.08 },
    },
    
    palettes: [
      { body: [0x2f4f2f, 0x3f5f3f, 0x4f6f4f], fin: [0x1f3f1f, 0x2f4f2f, 0x3f5f3f] },
      { body: [0x4a3a2a, 0x5a4a3a, 0x6a5a4a], fin: [0x3a2a1a, 0x4a3a2a, 0x5a4a3a] },
      { body: [0x3a3a4a, 0x4a4a5a, 0x5a5a6a], fin: [0x2a2a3a, 0x3a3a4a, 0x4a4a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.12, hMult: 0.85, wMult: 0.85 },
      { start: 0.12, end: 0.28, hMult: 1.00, wMult: 1.00 },
      { start: 0.28, end: 0.46, hMult: 1.00, wMult: 1.00 },
      { start: 0.46, end: 0.64, hMult: 0.95, wMult: 0.95 },
      { start: 0.64, end: 0.82, hMult: 0.85, wMult: 0.85 },
      { start: 0.82, end: 1.00, hMult: 0.60, wMult: 0.60 },
    ],
    
    fins: [
      { name: 'dorsalRibbon', deg: 0, pos: 0.25, size: [0.65, 0.04, 0.005], ribbon: true },
    ],
    
    tail: {
      type: 'pointed',
      size: [0.08, 0.05, 0.04],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GROUPER (Serranidae) - 9 meshes
  // 3 body + 1 dorsal + 2 pectorals + 1 anal + 1 tail + 1 pelvic
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.GROUPER]: {
    name: 'Grouper',
    length: { min: 0.4, max: 2.5 },
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },
      width: { min: 0.22, max: 0.30 },
    },
    
    palettes: [
      { body: [0x6b4423, 0x7b5433, 0x8b6443], fin: [0x5b3413, 0x6b4423, 0x7b5433] },
      { body: [0x8b2323, 0x9b3333, 0xab4343], fin: [0x7b1313, 0x8b2323, 0x9b3333] },
      { body: [0x4a5a4a, 0x5a6a5a, 0x6a7a6a], fin: [0x3a4a3a, 0x4a5a4a, 0x5a6a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.30, hMult: 0.85, wMult: 0.80 },
      { start: 0.30, end: 0.75, hMult: 1.00, wMult: 1.00 },
      { start: 0.75, end: 1.00, hMult: 0.55, wMult: 0.50 },
    ],
    
    fins: [
      { name: 'dorsal',    deg: 0,    pos: 0.30, size: [0.45, 0.18, 0.02] },
      { name: 'pectoralR', deg: 120,  pos: 0.35, size: [0.16, 0.02, 0.10] },
      { name: 'pectoralL', deg: -120, pos: 0.35, size: [0.16, 0.02, 0.10] },
      { name: 'pelvic',    deg: 180,  pos: 0.38, size: [0.10, 0.08, 0.04] },
      { name: 'anal',      deg: 180,  pos: 0.62, size: [0.18, 0.12, 0.015] },
    ],
    
    tail: {
      type: 'rounded',
      size: [0.18, 0.25, 0.03],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TUNA (Scombridae) - 10 meshes
  // 4 body + 1 dorsal + 2 pectorals + 1 anal + 1 tail + 1 finlets
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.TUNA]: {
    name: 'Tuna',
    length: { min: 0.5, max: 3.0 },
    
    bodyRatios: {
      height: { min: 0.22, max: 0.28 },
      width: { min: 0.18, max: 0.23 },
    },
    
    palettes: [
      { body: [0x1a3a5a, 0x2a4a6a, 0x3a5a7a], fin: [0xdaa520, 0xeab530, 0xfac540] },
      { body: [0x1a2a4a, 0x2a3a5a, 0x3a4a6a], fin: [0x3a4a5a, 0x4a5a6a, 0x5a6a7a] },
      { body: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a], fin: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a] },
    ],
    
    body: [
      { start: 0.00, end: 0.20, hMult: 0.60, wMult: 0.50 },   // Pointed head
      { start: 0.20, end: 0.55, hMult: 1.00, wMult: 1.00 },   // Thick body
      { start: 0.55, end: 0.80, hMult: 0.50, wMult: 0.45 },   // Tapers
      { start: 0.80, end: 1.00, hMult: 0.12, wMult: 0.10 },   // Very narrow peduncle
    ],
    
    fins: [
      { name: 'dorsal',    deg: 0,    pos: 0.30, size: [0.12, 0.14, 0.015] },
      { name: 'pectoralR', deg: 110,  pos: 0.25, size: [0.28, 0.015, 0.05] },  // Long sickle
      { name: 'pectoralL', deg: -110, pos: 0.25, size: [0.28, 0.015, 0.05] },
      { name: 'anal',      deg: 180,  pos: 0.58, size: [0.08, 0.06, 0.01] },
      { name: 'finlets',   deg: 0,    pos: 0.72, size: [0.15, 0.03, 0.01] },   // Dorsal finlets
    ],
    
    tail: {
      type: 'lunate',
      size: [0.18, 0.30, 0.02],  // Powerful crescent
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BARRACUDA (Sphyraenidae) - 9 meshes
  // 3 body + 2 dorsals + 2 pectorals + 2 tail lobes
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.BARRACUDA]: {
    name: 'Barracuda',
    length: { min: 0.5, max: 2.0 },
    
    bodyRatios: {
      height: { min: 0.10, max: 0.14 },
      width: { min: 0.08, max: 0.11 },
    },
    
    palettes: [
      { body: [0xa0b0c0, 0xb0c0d0, 0xc0d0e0], fin: [0x8090a0, 0x90a0b0, 0xa0b0c0] },
      { body: [0x607080, 0x708090, 0x8090a0], fin: [0x506070, 0x607080, 0x708090] },
    ],
    
    body: [
      { start: 0.00, end: 0.28, hMult: 0.70, wMult: 0.65 },   // Long pike-like head
      { start: 0.28, end: 0.72, hMult: 1.00, wMult: 1.00 },   // Cylindrical body
      { start: 0.72, end: 1.00, hMult: 0.50, wMult: 0.45 },   // Peduncle
    ],
    
    fins: [
      { name: 'dorsal1',   deg: 0,    pos: 0.38, size: [0.08, 0.10, 0.012] },  // First dorsal
      { name: 'dorsal2',   deg: 0,    pos: 0.75, size: [0.08, 0.08, 0.012] },  // Second dorsal
      { name: 'pectoralR', deg: 120,  pos: 0.32, size: [0.10, 0.012, 0.04] },
      { name: 'pectoralL', deg: -120, pos: 0.32, size: [0.10, 0.012, 0.04] },
    ],
    
    tail: {
      type: 'forked',
      upper: { size: [0.14, 0.09, 0.015], angle: 20 },
      lower: { size: [0.14, 0.09, 0.015], angle: -20 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TANG (Acanthuridae) - 9 meshes
  // 3 body + 1 dorsal + 2 pectorals + 1 anal + 1 tail + 1 pelvic
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.TANG]: {
    name: 'Tang',
    length: { min: 0.12, max: 0.40 },
    
    bodyRatios: {
      height: { min: 0.55, max: 0.70 },  // Taller than long!
      width: { min: 0.12, max: 0.18 },   // Compressed
    },
    
    palettes: [
      { body: [0x1e90ff, 0x2ea0ff, 0x3eb0ff], fin: [0xffd700, 0xffe730, 0xfff760] },
      { body: [0xffd700, 0xffe730, 0xfff760], fin: [0xfff8dc, 0xfffaec, 0xfffcfc] },
      { body: [0x2a2a3a, 0x3a3a4a, 0x4a4a5a], fin: [0xff6030, 0xff7040, 0xff8050] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.80, wMult: 0.85 },
      { start: 0.25, end: 0.80, hMult: 1.00, wMult: 1.00 },
      { start: 0.80, end: 1.00, hMult: 0.45, wMult: 0.55 },
    ],
    
    fins: [
      { name: 'dorsal',    deg: 0,    pos: 0.20, size: [0.55, 0.25, 0.01] },
      { name: 'pectoralR', deg: 110,  pos: 0.35, size: [0.15, 0.01, 0.07] },
      { name: 'pectoralL', deg: -110, pos: 0.35, size: [0.15, 0.01, 0.07] },
      { name: 'pelvic',    deg: 160,  pos: 0.38, size: [0.10, 0.008, 0.04] },
      { name: 'anal',      deg: 180,  pos: 0.40, size: [0.38, 0.18, 0.01] },
    ],
    
    tail: {
      type: 'lunate',
      size: [0.12, 0.28, 0.01],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANGELFISH (Pomacanthidae) - 9 meshes
  // 3 body + 1 dorsal + 2 pectorals + 1 anal + 1 tail + 1 pelvic
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.ANGELFISH]: {
    name: 'Angelfish',
    length: { min: 0.15, max: 0.45 },
    
    bodyRatios: {
      height: { min: 0.80, max: 1.00 },  // Nearly circular!
      width: { min: 0.10, max: 0.15 },   // Paper thin
    },
    
    palettes: [
      { body: [0x1e90ff, 0x2ea0ff, 0x3eb0ff], fin: [0xffd700, 0xffe730, 0xfff760] },
      { body: [0x2a2a2a, 0x3a3a3a, 0x4a4a4a], fin: [0xffd700, 0xffe730, 0xfff760] },
      { body: [0x1a3a6a, 0x2a4a7a, 0x3a5a8a], fin: [0xffa500, 0xffb530, 0xffc560] },
    ],
    
    body: [
      { start: 0.00, end: 0.20, hMult: 0.65, wMult: 0.75 },
      { start: 0.20, end: 0.85, hMult: 1.00, wMult: 1.00 },
      { start: 0.85, end: 1.00, hMult: 0.40, wMult: 0.45 },
    ],
    
    fins: [
      { name: 'dorsal',    deg: 0,    pos: 0.18, size: [0.60, 0.50, 0.008] },  // Tall flowing
      { name: 'pectoralR', deg: 100,  pos: 0.32, size: [0.18, 0.008, 0.09] },
      { name: 'pectoralL', deg: -100, pos: 0.32, size: [0.18, 0.008, 0.09] },
      { name: 'pelvic',    deg: 150,  pos: 0.35, size: [0.22, 0.006, 0.02] },  // Long filaments
      { name: 'anal',      deg: 180,  pos: 0.38, size: [0.50, 0.40, 0.008] },  // Tall anal fin
    ],
    
    tail: {
      type: 'rounded',
      size: [0.15, 0.35, 0.008],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PUFFER (Tetraodontidae) - 7 meshes
  // 3 body + 1 dorsal + 2 pectorals + 1 tail
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.PUFFER]: {
    name: 'Puffer',
    length: { min: 0.08, max: 0.50 },
    
    bodyRatios: {
      height: { min: 0.50, max: 0.70 },
      width: { min: 0.45, max: 0.60 },  // Almost spherical
    },
    
    palettes: [
      { body: [0xf5f5dc, 0xf8f8e8, 0xfbfbf4], fin: [0xe5e5cc, 0xf0f0dc, 0xf5f5ec] },
      { body: [0xdaa520, 0xeab530, 0xfac540], fin: [0xca9510, 0xdaa520, 0xeab530] },
      { body: [0x6a8a6a, 0x7a9a7a, 0x8aaa8a], fin: [0x5a7a5a, 0x6a8a6a, 0x7a9a7a] },
    ],
    
    body: [
      { start: 0.00, end: 0.30, hMult: 0.85, wMult: 0.85 },  // Blunt head
      { start: 0.30, end: 0.80, hMult: 1.00, wMult: 1.00 },  // Round body
      { start: 0.80, end: 1.00, hMult: 0.45, wMult: 0.40 },  // Short peduncle
    ],
    
    fins: [
      { name: 'dorsal',    deg: 0,   pos: 0.72, size: [0.10, 0.12, 0.02] },   // Far back
      { name: 'pectoralR', deg: 90,  pos: 0.42, size: [0.12, 0.03, 0.10] },   // Round paddles
      { name: 'pectoralL', deg: -90, pos: 0.42, size: [0.12, 0.03, 0.10] },
    ],
    
    tail: {
      type: 'rounded',
      size: [0.10, 0.18, 0.03],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MARLIN (Istiophoridae) - 10 meshes
  // 4 body + 1 bill + 1 sail + 2 pectorals + 2 tail lobes
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.MARLIN]: {
    name: 'Marlin',
    length: { min: 1.8, max: 4.5 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.24 },
      width: { min: 0.12, max: 0.16 },
    },
    
    palettes: [
      { body: [0x1a2a5a, 0x2a3a6a, 0x3a4a7a], fin: [0x0a1a4a, 0x1a2a5a, 0x2a3a6a] },
      { body: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a], fin: [0x4a6a8a, 0x5a7a9a, 0x6a8aaa] },
    ],
    
    body: [
      { start: 0.00, end: 0.18, hMult: 0.55, wMult: 0.45 },
      { start: 0.18, end: 0.50, hMult: 1.00, wMult: 1.00 },
      { start: 0.50, end: 0.80, hMult: 0.45, wMult: 0.40 },
      { start: 0.80, end: 1.00, hMult: 0.10, wMult: 0.08 },  // Very narrow
    ],
    
    bill: {
      length: 0.35,
      height: 0.02,
      width: 0.015,
    },
    
    fins: [
      { name: 'sail',      deg: 0,    pos: 0.15, size: [0.60, 0.55, 0.01], sail: true },
      { name: 'pectoralR', deg: 110,  pos: 0.22, size: [0.20, 0.01, 0.04] },
      { name: 'pectoralL', deg: -110, pos: 0.22, size: [0.20, 0.01, 0.04] },
    ],
    
    tail: {
      type: 'lunate',
      size: [0.22, 0.38, 0.015],
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FLOUNDER (Pleuronectiformes) - 6 meshes
  // 3 body + 1 dorsal ribbon + 1 anal ribbon + 1 tail
  // ═══════════════════════════════════════════════════════════════════════════
  [FishClass.FLOUNDER]: {
    name: 'Flounder',
    length: { min: 0.25, max: 1.5 },
    
    bodyRatios: {
      height: { min: 0.04, max: 0.08 },  // Extremely flat
      width: { min: 0.50, max: 0.65 },   // Wide oval
    },
    
    palettes: [
      { body: [0x8b7355, 0x9b8365, 0xab9375], fin: [0x7b6345, 0x8b7355, 0x9b8365] },
      { body: [0x6b6b5b, 0x7b7b6b, 0x8b8b7b], fin: [0x5b5b4b, 0x6b6b5b, 0x7b7b6b] },
      { body: [0x5b6b4b, 0x6b7b5b, 0x7b8b6b], fin: [0x4b5b3b, 0x5b6b4b, 0x6b7b5b] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.90, wMult: 0.70 },
      { start: 0.25, end: 0.85, hMult: 1.00, wMult: 1.00 },
      { start: 0.85, end: 1.00, hMult: 0.55, wMult: 0.45 },
    ],
    
    // For flatfish, fins run along edges (90° and -90°)
    fins: [
      { name: 'dorsalEdge', deg: 90,  pos: 0.10, size: [0.75, 0.10, 0.01], ribbon: true },
      { name: 'analEdge',   deg: -90, pos: 0.20, size: [0.60, 0.10, 0.01], ribbon: true },
    ],
    
    tail: {
      type: 'rounded',
      size: [0.12, 0.06, 0.20],  // Wide flat tail
    },
    
    flatfish: true,
  },
}

// ============================================================================
// FISH GENERATION
// ============================================================================

export function generateFish(seed, fishClass = null) {
  const rng = createRNG(seed)
  
  if (!fishClass) {
    const classes = Object.values(FishClass).filter(c => c !== FishClass.STARTER)
    fishClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[fishClass]
  if (!classDef) {
    return generateStarterFish()
  }
  
  const length = range(rng, classDef.length.min, classDef.length.max)
  const height = length * range(rng, classDef.bodyRatios.height.min, classDef.bodyRatios.height.max)
  const width = length * range(rng, classDef.bodyRatios.width.min, classDef.bodyRatios.width.max)
  
  const traits = {
    length,
    height,
    width,
    palette: pick(rng, classDef.palettes),
    colorIndex: Math.floor(rng() * 3),
    metallic: chance(rng, 0.15),
    roughness: range(rng, 0.5, 0.8),
  }
  
  const { mesh, parts } = buildFishMesh(rng, classDef, traits)
  
  return { mesh, parts, seed, fishClass, traits }
}

function buildFishMesh(rng, classDef, traits) {
  const fishGroup = new THREE.Group()
  const parts = {}
  
  const { length, height, width, palette, colorIndex } = traits
  
  const bodyColor = palette.body[colorIndex]
  const finColor = palette.fin[colorIndex]
  
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: traits.metallic ? 0.45 : 0.2,
    roughness: traits.roughness,
  })
  
  const finMaterial = new THREE.MeshStandardMaterial({
    color: finColor,
    metalness: traits.metallic ? 0.35 : 0.15,
    roughness: traits.roughness + 0.1,
  })
  
  // === BUILD BODY SEGMENTS ===
  for (const seg of classDef.body) {
    const segLength = length * (seg.end - seg.start)
    const segHeight = height * seg.hMult
    const segWidth = width * seg.wMult
    
    const segMesh = new THREE.Mesh(
      new THREE.BoxGeometry(segWidth, segHeight, segLength),
      bodyMaterial
    )
    
    // Position along Z axis (nose at -length/2, tail at +length/2)
    const centerPos = (seg.start + seg.end) / 2
    segMesh.position.z = length * (centerPos - 0.5)
    
    fishGroup.add(segMesh)
    parts[`body_${seg.start}`] = segMesh
  }
  
  // === BUILD BILL (marlin) ===
  if (classDef.bill) {
    const billLen = length * classDef.bill.length
    const billMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        length * classDef.bill.width,
        length * classDef.bill.height,
        billLen
      ),
      bodyMaterial
    )
    billMesh.position.z = -length * 0.5 - billLen * 0.5
    fishGroup.add(billMesh)
    parts.bill = billMesh
  }
  
  // === BUILD FINS ===
  for (const fin of classDef.fins || []) {
    const [finLen, finH, finW] = fin.size
    const finLength = length * finLen
    const finHeight = length * finH
    const finWidth = length * finW
    
    const finMesh = new THREE.Mesh(
      new THREE.BoxGeometry(finWidth, finHeight, finLength),
      finMaterial
    )
    
    // Position along body
    const zPos = length * (fin.pos - 0.5)
    
    // Position around body using degrees
    const offset = degToOffset(fin.deg, width * 0.5, height * 0.5)
    
    // Handle different fin types
    if (fin.isWing) {
      // Wings (rays) - extend horizontally from sides
      finMesh.position.set(offset.x + (fin.deg > 0 ? finWidth * 0.5 : -finWidth * 0.5), 0, zPos)
    } else if (fin.ribbon) {
      // Ribbon fins - run along body
      finMesh.position.set(offset.x, offset.y, zPos)
      if (Math.abs(fin.deg) === 90) {
        // Edge fins (flounder)
        finMesh.position.x += (fin.deg > 0 ? finHeight * 0.5 : -finHeight * 0.5)
      }
    } else if (fin.deg === 0) {
      // Dorsal fins - on top
      finMesh.position.set(0, height * 0.5 + finHeight * 0.5, zPos)
    } else if (fin.deg === 180) {
      // Ventral/anal fins - on bottom
      finMesh.position.set(0, -height * 0.5 - finHeight * 0.5, zPos)
    } else {
      // Angled fins (pectorals, pelvics)
      // Rotate fin to extend outward from body
      const angleRad = (fin.deg * Math.PI) / 180
      finMesh.rotation.z = angleRad
      
      // Position at body surface, extending outward
      finMesh.position.set(
        offset.x + Math.sin(angleRad) * finHeight * 0.5,
        offset.y + Math.cos(angleRad) * finHeight * 0.5,
        zPos
      )
    }
    
    fishGroup.add(finMesh)
    parts[fin.name] = finMesh
  }
  
  // === BUILD TAIL ===
  const tailDef = classDef.tail
  if (tailDef) {
    const tailZ = length * 0.5
    
    if (tailDef.type === 'heterocercal' || tailDef.type === 'forked') {
      // Two-lobed tail
      const upper = tailDef.upper || tailDef
      const lower = tailDef.lower || tailDef
      
      const upperMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          length * upper.size[2],
          length * upper.size[1],
          length * upper.size[0]
        ),
        finMaterial
      )
      upperMesh.position.set(0, length * upper.size[1] * 0.3, tailZ)
      upperMesh.rotation.x = (upper.angle * Math.PI) / 180
      fishGroup.add(upperMesh)
      parts.tailUpper = upperMesh
      
      const lowerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          length * lower.size[2],
          length * lower.size[1],
          length * lower.size[0]
        ),
        finMaterial
      )
      lowerMesh.position.set(0, -length * lower.size[1] * 0.2, tailZ)
      lowerMesh.rotation.x = (lower.angle * Math.PI) / 180
      fishGroup.add(lowerMesh)
      parts.tailLower = lowerMesh
      
    } else if (tailDef.type === 'whip') {
      // Long whip tail (rays)
      const whipLen = length * tailDef.size[0]
      const whipMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          length * tailDef.size[2],
          length * tailDef.size[1],
          whipLen
        ),
        finMaterial
      )
      whipMesh.position.set(0, 0, tailZ + whipLen * 0.5)
      fishGroup.add(whipMesh)
      parts.tail = whipMesh
      
    } else {
      // Single tail (lunate, rounded, pointed)
      const [tLen, tH, tW] = tailDef.size
      const tailMesh = new THREE.Mesh(
        new THREE.BoxGeometry(length * tW, length * tH, length * tLen),
        finMaterial
      )
      tailMesh.position.set(0, 0, tailZ + length * tLen * 0.3)
      fishGroup.add(tailMesh)
      parts.tail = tailMesh
    }
  }
  
  fishGroup.rotation.order = 'YXZ'
  
  return { mesh: fishGroup, parts }
}

// ============================================================================
// STARTER FISH
// ============================================================================

export function generateStarterFish() {
  const fishGroup = new THREE.Group()
  
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    metalness: 0.3,
    roughness: 0.7
  })
  
  const finMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8833,
    metalness: 0.2,
    roughness: 0.8
  })
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.5), bodyMaterial)
  fishGroup.add(body)
  
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), bodyMaterial)
  head.position.set(0, 0, -0.9)
  fishGroup.add(head)
  
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.5), finMaterial)
  tail.position.set(0, 0, 1.0)
  tail.rotation.x = Math.PI / 6
  fishGroup.add(tail)
  
  const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.6), finMaterial)
  dorsalFin.position.set(0, 0.4, 0)
  fishGroup.add(dorsalFin)
  
  const leftFin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), finMaterial)
  leftFin.position.set(-0.5, -0.1, -0.2)
  leftFin.rotation.z = -Math.PI / 6
  fishGroup.add(leftFin)
  
  const rightFin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), finMaterial)
  rightFin.position.set(0.5, -0.1, -0.2)
  rightFin.rotation.z = Math.PI / 6
  fishGroup.add(rightFin)
  
  fishGroup.rotation.order = 'YXZ'
  
  return {
    mesh: fishGroup,
    parts: { body, head, tail, dorsalFin, leftFin, rightFin },
    seed: 0x5354524E,
    fishClass: FishClass.STARTER,
    traits: { preset: 'STARTER', length: 1.5, height: 0.5, width: 0.8 }
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

export function generateFishOfClass(fishClass) {
  return generateFish(randomSeed(), fishClass)
}

export default {
  generateFish,
  generateStarterFish,
  generateFishOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  FishClass,
}