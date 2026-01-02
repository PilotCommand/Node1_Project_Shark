/**
 * Mammals.js - Procedural marine mammal generation
 * 
 * Key differences from fish:
 * - Horizontal tail flukes (up-down motion) vs vertical tail fins
 * - Flippers instead of pectoral fins
 * - Blowhole on dorsal surface (cetaceans)
 * - Smooth, streamlined bodies
 * 
 * Fin placement uses degrees around body cross-section (looking from behind):
 *   0° = dorsal (top)
 *   90° = right side
 *   -90° = left side
 *   180° = ventral (bottom)
 * 
 * Position along body: 0 = snout, 1 = tail base
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
// MAMMAL CLASSES
// ============================================================================

export const MammalClass = {
  // Cetaceans - Whales
  BLUE_WHALE: 'blue_whale',
  HUMPBACK: 'humpback',
  SPERM_WHALE: 'sperm_whale',
  BELUGA: 'beluga',
  NARWHAL: 'narwhal',
  // Cetaceans - Dolphins
  DOLPHIN: 'dolphin',
  ORCA: 'orca',
  PILOT_WHALE: 'pilot_whale',
  // Pinnipeds
  SEAL: 'seal',
  SEA_LION: 'sea_lion',
  WALRUS: 'walrus',
  // Other
  SEA_OTTER: 'sea_otter',
  MANATEE: 'manatee',
}

/**
 * Metadata for display names and ordering
 */
const CLASS_METADATA = {
  // Cetaceans - Large whales
  [MammalClass.BLUE_WHALE]:   { emoji: '🐋', scientificName: 'Balaenoptera musculus', order: 10 },
  [MammalClass.HUMPBACK]:     { emoji: '🐋', scientificName: 'Megaptera novaeangliae', order: 11 },
  [MammalClass.SPERM_WHALE]:  { emoji: '🐋', scientificName: 'Physeter macrocephalus', order: 12 },
  // Cetaceans - Small whales
  [MammalClass.BELUGA]:       { emoji: '🐳', scientificName: 'Delphinapterus leucas', order: 20 },
  [MammalClass.NARWHAL]:      { emoji: '🦄', scientificName: 'Monodon monoceros', order: 21 },
  [MammalClass.PILOT_WHALE]:  { emoji: '🐋', scientificName: 'Globicephala', order: 22 },
  // Cetaceans - Dolphins
  [MammalClass.DOLPHIN]:      { emoji: '🐬', scientificName: 'Tursiops truncatus', order: 30 },
  [MammalClass.ORCA]:         { emoji: '🐬', scientificName: 'Orcinus orca', order: 31 },
  // Pinnipeds
  [MammalClass.SEAL]:         { emoji: '🦭', scientificName: 'Phocidae', order: 40 },
  [MammalClass.SEA_LION]:     { emoji: '🦭', scientificName: 'Otariidae', order: 41 },
  [MammalClass.WALRUS]:       { emoji: '🦭', scientificName: 'Odobenus rosmarus', order: 42 },
  // Other marine mammals
  [MammalClass.SEA_OTTER]:    { emoji: '🦦', scientificName: 'Enhydra lutris', order: 50 },
  [MammalClass.MANATEE]:      { emoji: '🐘', scientificName: 'Trichechus', order: 51 },
}

/**
 * Class definitions - body plans and proportions
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BLUE WHALE - Largest animal ever
  // 3 body + 2 flippers + 1 dorsal ridge + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.BLUE_WHALE]: {
    name: 'Blue Whale',
    length: { min: 20.0, max: 30.0 },
    
    bodyRatios: {
      height: { min: 0.12, max: 0.15 },
      width: { min: 0.14, max: 0.18 },
    },
    
    palettes: [
      { body: [0x4a6a8a, 0x5a7a9a, 0x6a8aaa], fin: [0x3a5a7a, 0x4a6a8a, 0x5a7a9a] },
      { body: [0x5a6a7a, 0x6a7a8a, 0x7a8a9a], fin: [0x4a5a6a, 0x5a6a7a, 0x6a7a8a] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.70, wMult: 0.65 },  // Head - broad, flat
      { start: 0.25, end: 0.70, hMult: 1.00, wMult: 1.00 },  // Body - massive
      { start: 0.70, end: 1.00, hMult: 0.40, wMult: 0.35 },  // Peduncle - tapered
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.28, size: [0.08, 0.01, 0.025] },
      { name: 'flipperL', deg: -100, pos: 0.28, size: [0.08, 0.01, 0.025] },
      { name: 'dorsalRidge', deg: 0, pos: 0.72, size: [0.04, 0.015, 0.008] },  // Tiny dorsal
    ],
    
    flukes: {
      span: 0.25,      // Total width as ratio of length
      length: 0.06,
      thickness: 0.008,
      sweep: 15,       // Angle of fluke sweep
    },
    
    features: {
      throatGrooves: true,  // Ventral pleats
      blowhole: { pos: 0.12, size: 0.015 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HUMPBACK WHALE - Long flippers, knobby head
  // 3 body + 2 long flippers + 1 dorsal hump + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.HUMPBACK]: {
    name: 'Humpback Whale',
    length: { min: 12.0, max: 16.0 },
    
    bodyRatios: {
      height: { min: 0.16, max: 0.20 },
      width: { min: 0.18, max: 0.22 },
    },
    
    palettes: [
      { body: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a], fin: [0x1a2a3a, 0x2a3a4a, 0x3a4a5a] },
      { body: [0x3a3a3a, 0x4a4a4a, 0x5a5a5a], fin: [0x2a2a2a, 0x3a3a3a, 0x4a4a4a] },
    ],
    
    body: [
      { start: 0.00, end: 0.28, hMult: 0.75, wMult: 0.70 },  // Head - rounded
      { start: 0.28, end: 0.68, hMult: 1.00, wMult: 1.00 },  // Body
      { start: 0.68, end: 1.00, hMult: 0.35, wMult: 0.30 },  // Peduncle
    ],
    
    fins: [
      // Extremely long pectoral flippers - signature feature
      { name: 'flipperR', deg: 100,  pos: 0.30, size: [0.30, 0.015, 0.04] },
      { name: 'flipperL', deg: -100, pos: 0.30, size: [0.30, 0.015, 0.04] },
      { name: 'dorsalHump', deg: 0,  pos: 0.65, size: [0.08, 0.04, 0.02] },
    ],
    
    flukes: {
      span: 0.30,
      length: 0.08,
      thickness: 0.01,
      sweep: 20,
    },
    
    features: {
      throatGrooves: true,
      blowhole: { pos: 0.10, size: 0.018 },
      tubercles: true,  // Bumpy head
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPERM WHALE - Massive square head
  // 3 body + 2 small flippers + 1 dorsal hump + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.SPERM_WHALE]: {
    name: 'Sperm Whale',
    length: { min: 12.0, max: 18.0 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.16, max: 0.20 },
    },
    
    palettes: [
      { body: [0x4a4a4a, 0x5a5a5a, 0x6a6a6a], fin: [0x3a3a3a, 0x4a4a4a, 0x5a5a5a] },
      { body: [0x5a4a4a, 0x6a5a5a, 0x7a6a6a], fin: [0x4a3a3a, 0x5a4a4a, 0x6a5a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.35, hMult: 1.00, wMult: 0.90 },  // HUGE square head
      { start: 0.35, end: 0.70, hMult: 0.75, wMult: 0.80 },  // Body - tapers from head
      { start: 0.70, end: 1.00, hMult: 0.30, wMult: 0.25 },  // Peduncle
    ],
    
    fins: [
      { name: 'flipperR', deg: 110,  pos: 0.38, size: [0.06, 0.012, 0.025] },
      { name: 'flipperL', deg: -110, pos: 0.38, size: [0.06, 0.012, 0.025] },
      { name: 'dorsalHump', deg: 0,  pos: 0.68, size: [0.06, 0.03, 0.015] },
    ],
    
    flukes: {
      span: 0.28,
      length: 0.07,
      thickness: 0.012,
      sweep: 18,
    },
    
    features: {
      blowhole: { pos: 0.05, size: 0.02, offset: -0.3 },  // Angled left
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BELUGA - White whale, no dorsal fin
  // 3 body + 2 flippers + 2 flukes (no dorsal!)
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.BELUGA]: {
    name: 'Beluga',
    length: { min: 3.5, max: 5.5 },
    
    bodyRatios: {
      height: { min: 0.20, max: 0.25 },
      width: { min: 0.22, max: 0.28 },
    },
    
    palettes: [
      { body: [0xe8e8e8, 0xf0f0f0, 0xf8f8f8], fin: [0xd8d8d8, 0xe0e0e0, 0xe8e8e8] },
      { body: [0xd0d0d0, 0xe0e0e0, 0xf0f0f0], fin: [0xc0c0c0, 0xd0d0d0, 0xe0e0e0] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.85, wMult: 0.80 },  // Rounded melon head
      { start: 0.25, end: 0.70, hMult: 1.00, wMult: 1.00 },  // Chunky body
      { start: 0.70, end: 1.00, hMult: 0.40, wMult: 0.35 },  // Peduncle
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.28, size: [0.12, 0.015, 0.05] },
      { name: 'flipperL', deg: -100, pos: 0.28, size: [0.12, 0.015, 0.05] },
      // No dorsal fin! Adaptation to ice
    ],
    
    flukes: {
      span: 0.28,
      length: 0.08,
      thickness: 0.015,
      sweep: 12,
    },
    
    features: {
      melon: true,  // Bulbous forehead
      blowhole: { pos: 0.08, size: 0.02 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NARWHAL - The unicorn whale
  // 3 body + 2 flippers + 1 tusk + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.NARWHAL]: {
    name: 'Narwhal',
    length: { min: 4.0, max: 5.5 },  // Body only, not including tusk
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.20, max: 0.25 },
    },
    
    palettes: [
      { body: [0x6a7a7a, 0x7a8a8a, 0x8a9a9a], fin: [0x5a6a6a, 0x6a7a7a, 0x7a8a8a] },
      { body: [0x5a6a6a, 0x6a7a7a, 0x7a8a8a], fin: [0x4a5a5a, 0x5a6a6a, 0x6a7a7a] },
    ],
    
    body: [
      { start: 0.00, end: 0.22, hMult: 0.80, wMult: 0.75 },  // Rounded head
      { start: 0.22, end: 0.68, hMult: 1.00, wMult: 1.00 },  // Body
      { start: 0.68, end: 1.00, hMult: 0.38, wMult: 0.32 },  // Peduncle
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.25, size: [0.10, 0.015, 0.045] },
      { name: 'flipperL', deg: -100, pos: 0.25, size: [0.10, 0.015, 0.045] },
      // No dorsal fin
    ],
    
    tusk: {
      length: 0.50,   // As ratio of body length (can be 2-3m!)
      diameter: 0.015,
      spiralTurns: 2,
    },
    
    flukes: {
      span: 0.26,
      length: 0.07,
      thickness: 0.012,
      sweep: 15,
    },
    
    features: {
      blowhole: { pos: 0.06, size: 0.018 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DOLPHIN (Bottlenose) - Classic dolphin shape
  // 3 body + 2 flippers + 1 dorsal + 2 flukes + beak
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.DOLPHIN]: {
    name: 'Dolphin',
    length: { min: 2.5, max: 4.0 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.16, max: 0.20 },
    },
    
    palettes: [
      { body: [0x708090, 0x808fa0, 0x909fb0], fin: [0x607080, 0x708090, 0x808fa0] },
      { body: [0x5a6a7a, 0x6a7a8a, 0x7a8a9a], fin: [0x4a5a6a, 0x5a6a7a, 0x6a7a8a] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.70, wMult: 0.65 },  // Head + melon
      { start: 0.25, end: 0.65, hMult: 1.00, wMult: 1.00 },  // Body
      { start: 0.65, end: 1.00, hMult: 0.35, wMult: 0.30 },  // Peduncle
    ],
    
    beak: {
      length: 0.08,
      height: 0.025,
      width: 0.03,
    },
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.28, size: [0.12, 0.015, 0.05] },
      { name: 'flipperL', deg: -100, pos: 0.28, size: [0.12, 0.015, 0.05] },
      { name: 'dorsal',   deg: 0,    pos: 0.45, size: [0.10, 0.12, 0.015] },
    ],
    
    flukes: {
      span: 0.25,
      length: 0.06,
      thickness: 0.01,
      sweep: 20,
    },
    
    features: {
      blowhole: { pos: 0.10, size: 0.015 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ORCA - Killer whale, distinctive markings
  // 3 body + 2 flippers + 1 tall dorsal + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.ORCA]: {
    name: 'Orca',
    length: { min: 6.0, max: 9.0 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.20, max: 0.25 },
    },
    
    palettes: [
      // Black and white - iconic
      { body: [0x1a1a1a, 0x2a2a2a, 0x3a3a3a], fin: [0x0a0a0a, 0x1a1a1a, 0x2a2a2a] },
    ],
    
    body: [
      { start: 0.00, end: 0.22, hMult: 0.75, wMult: 0.70 },  // Rounded head
      { start: 0.22, end: 0.65, hMult: 1.00, wMult: 1.00 },  // Robust body
      { start: 0.65, end: 1.00, hMult: 0.38, wMult: 0.32 },  // Peduncle
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.25, size: [0.15, 0.015, 0.06] },
      { name: 'flipperL', deg: -100, pos: 0.25, size: [0.15, 0.015, 0.06] },
      // Males have HUGE dorsal (up to 1.8m!)
      { name: 'dorsal',   deg: 0,    pos: 0.42, size: [0.10, 0.20, 0.02] },
    ],
    
    flukes: {
      span: 0.30,
      length: 0.08,
      thickness: 0.015,
      sweep: 18,
    },
    
    features: {
      blowhole: { pos: 0.08, size: 0.018 },
      eyePatch: true,  // White patch behind eye
      saddlePatch: true,  // Gray patch behind dorsal
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PILOT WHALE - Bulbous head, long flippers
  // 3 body + 2 flippers + 1 dorsal + 2 flukes
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.PILOT_WHALE]: {
    name: 'Pilot Whale',
    length: { min: 4.5, max: 7.0 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.20, max: 0.25 },
    },
    
    palettes: [
      { body: [0x2a2a2a, 0x3a3a3a, 0x4a4a4a], fin: [0x1a1a1a, 0x2a2a2a, 0x3a3a3a] },
      { body: [0x3a3a4a, 0x4a4a5a, 0x5a5a6a], fin: [0x2a2a3a, 0x3a3a4a, 0x4a4a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.90, wMult: 0.85 },  // Very round melon
      { start: 0.25, end: 0.65, hMult: 1.00, wMult: 1.00 },  // Body
      { start: 0.65, end: 1.00, hMult: 0.35, wMult: 0.30 },  // Peduncle
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.28, size: [0.18, 0.015, 0.05] },
      { name: 'flipperL', deg: -100, pos: 0.28, size: [0.18, 0.015, 0.05] },
      { name: 'dorsal',   deg: 0,    pos: 0.38, size: [0.12, 0.08, 0.02] },
    ],
    
    flukes: {
      span: 0.26,
      length: 0.07,
      thickness: 0.012,
      sweep: 16,
    },
    
    features: {
      melon: true,
      blowhole: { pos: 0.08, size: 0.016 },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEAL (Harbor seal) - No external ear flaps
  // 3 body + 2 front flippers + 2 rear flippers
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.SEAL]: {
    name: 'Seal',
    length: { min: 1.5, max: 2.0 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.32 },
      width: { min: 0.28, max: 0.35 },
    },
    
    palettes: [
      { body: [0x6a6a5a, 0x7a7a6a, 0x8a8a7a], fin: [0x5a5a4a, 0x6a6a5a, 0x7a7a6a] },
      { body: [0x7a7a7a, 0x8a8a8a, 0x9a9a9a], fin: [0x6a6a6a, 0x7a7a7a, 0x8a8a8a] },
      { body: [0x4a4a4a, 0x5a5a5a, 0x6a6a6a], fin: [0x3a3a3a, 0x4a4a4a, 0x5a5a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.80, wMult: 0.75 },  // Round head
      { start: 0.25, end: 0.70, hMult: 1.00, wMult: 1.00 },  // Plump body
      { start: 0.70, end: 1.00, hMult: 0.50, wMult: 0.45 },  // Rear
    ],
    
    fins: [
      // Front flippers - small, used for steering
      { name: 'flipperFR', deg: 110,  pos: 0.28, size: [0.12, 0.02, 0.06] },
      { name: 'flipperFL', deg: -110, pos: 0.28, size: [0.12, 0.02, 0.06] },
      // Rear flippers - fused, point backward
      { name: 'flipperRR', deg: 150,  pos: 0.92, size: [0.15, 0.02, 0.08] },
      { name: 'flipperRL', deg: -150, pos: 0.92, size: [0.15, 0.02, 0.08] },
    ],
    
    features: {
      noEarFlaps: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA LION - Visible ear flaps, can walk on flippers
  // 3 body + 2 front flippers + 2 rear flippers
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.SEA_LION]: {
    name: 'Sea Lion',
    length: { min: 2.0, max: 2.8 },
    
    bodyRatios: {
      height: { min: 0.28, max: 0.35 },
      width: { min: 0.30, max: 0.38 },
    },
    
    palettes: [
      { body: [0x5a4a3a, 0x6a5a4a, 0x7a6a5a], fin: [0x4a3a2a, 0x5a4a3a, 0x6a5a4a] },
      { body: [0x4a3a2a, 0x5a4a3a, 0x6a5a4a], fin: [0x3a2a1a, 0x4a3a2a, 0x5a4a3a] },
    ],
    
    body: [
      { start: 0.00, end: 0.22, hMult: 0.75, wMult: 0.70 },  // Head
      { start: 0.22, end: 0.65, hMult: 1.00, wMult: 1.00 },  // Body
      { start: 0.65, end: 1.00, hMult: 0.55, wMult: 0.50 },  // Rear - more distinct
    ],
    
    fins: [
      // Larger front flippers - can rotate forward to walk
      { name: 'flipperFR', deg: 110,  pos: 0.25, size: [0.18, 0.025, 0.10] },
      { name: 'flipperFL', deg: -110, pos: 0.25, size: [0.18, 0.025, 0.10] },
      // Rear flippers - can rotate forward
      { name: 'flipperRR', deg: 140,  pos: 0.90, size: [0.18, 0.025, 0.10] },
      { name: 'flipperRL', deg: -140, pos: 0.90, size: [0.18, 0.025, 0.10] },
    ],
    
    features: {
      earFlaps: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WALRUS - Tusks and whiskers
  // 3 body + 2 front flippers + 2 rear flippers + 2 tusks
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.WALRUS]: {
    name: 'Walrus',
    length: { min: 2.5, max: 3.5 },
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },
      width: { min: 0.40, max: 0.50 },
    },
    
    palettes: [
      { body: [0x8a6a5a, 0x9a7a6a, 0xaa8a7a], fin: [0x7a5a4a, 0x8a6a5a, 0x9a7a6a] },
      { body: [0x7a5a4a, 0x8a6a5a, 0x9a7a6a], fin: [0x6a4a3a, 0x7a5a4a, 0x8a6a5a] },
    ],
    
    body: [
      { start: 0.00, end: 0.28, hMult: 0.90, wMult: 0.85 },  // Massive head
      { start: 0.28, end: 0.72, hMult: 1.00, wMult: 1.00 },  // Huge body
      { start: 0.72, end: 1.00, hMult: 0.60, wMult: 0.55 },  // Rear
    ],
    
    fins: [
      { name: 'flipperFR', deg: 110,  pos: 0.32, size: [0.15, 0.03, 0.10] },
      { name: 'flipperFL', deg: -110, pos: 0.32, size: [0.15, 0.03, 0.10] },
      { name: 'flipperRR', deg: 140,  pos: 0.88, size: [0.18, 0.03, 0.12] },
      { name: 'flipperRL', deg: -140, pos: 0.88, size: [0.18, 0.03, 0.12] },
    ],
    
    tusks: {
      length: 0.25,
      diameter: 0.025,
    },
    
    features: {
      whiskers: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA OTTER - Smallest marine mammal, floats on back
  // 3 body + 4 legs + 1 flat tail
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.SEA_OTTER]: {
    name: 'Sea Otter',
    length: { min: 1.0, max: 1.5 },
    
    bodyRatios: {
      height: { min: 0.18, max: 0.22 },
      width: { min: 0.20, max: 0.25 },
    },
    
    palettes: [
      { body: [0x4a3a2a, 0x5a4a3a, 0x6a5a4a], fin: [0x3a2a1a, 0x4a3a2a, 0x5a4a3a] },
      { body: [0x3a2a1a, 0x4a3a2a, 0x5a4a3a], fin: [0x2a1a0a, 0x3a2a1a, 0x4a3a2a] },
    ],
    
    body: [
      { start: 0.00, end: 0.20, hMult: 0.80, wMult: 0.75 },  // Round head
      { start: 0.20, end: 0.65, hMult: 1.00, wMult: 1.00 },  // Long body
      { start: 0.65, end: 1.00, hMult: 0.70, wMult: 0.65 },  // Rear + tail base
    ],
    
    fins: [
      // Small front paws
      { name: 'pawFR', deg: 120,  pos: 0.22, size: [0.06, 0.02, 0.04] },
      { name: 'pawFL', deg: -120, pos: 0.22, size: [0.06, 0.02, 0.04] },
      // Large webbed rear feet
      { name: 'pawRR', deg: 130,  pos: 0.62, size: [0.12, 0.02, 0.08] },
      { name: 'pawRL', deg: -130, pos: 0.62, size: [0.12, 0.02, 0.08] },
    ],
    
    tail: {
      length: 0.25,
      height: 0.04,
      width: 0.08,
      flat: true,
    },
    
    features: {
      whiskers: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MANATEE - Gentle sea cow
  // 3 body + 2 flippers + 1 paddle tail
  // ═══════════════════════════════════════════════════════════════════════════
  [MammalClass.MANATEE]: {
    name: 'Manatee',
    length: { min: 3.0, max: 4.0 },
    
    bodyRatios: {
      height: { min: 0.30, max: 0.38 },
      width: { min: 0.35, max: 0.42 },
    },
    
    palettes: [
      { body: [0x6a6a6a, 0x7a7a7a, 0x8a8a8a], fin: [0x5a5a5a, 0x6a6a6a, 0x7a7a7a] },
      { body: [0x5a5a5a, 0x6a6a6a, 0x7a7a7a], fin: [0x4a4a4a, 0x5a5a5a, 0x6a6a6a] },
    ],
    
    body: [
      { start: 0.00, end: 0.25, hMult: 0.85, wMult: 0.80 },  // Round snout
      { start: 0.25, end: 0.75, hMult: 1.00, wMult: 1.00 },  // Very rotund body
      { start: 0.75, end: 1.00, hMult: 0.65, wMult: 0.60 },  // Tail base
    ],
    
    fins: [
      { name: 'flipperR', deg: 100,  pos: 0.30, size: [0.12, 0.025, 0.08] },
      { name: 'flipperL', deg: -100, pos: 0.30, size: [0.12, 0.025, 0.08] },
    ],
    
    tail: {
      type: 'paddle',  // Round paddle, not flukes
      width: 0.20,
      length: 0.12,
      thickness: 0.03,
    },
    
    features: {
      whiskers: true,
      wrinkledSkin: true,
    },
  },
}

// ============================================================================
// MAMMAL GENERATION
// ============================================================================

export function generateMammal(seed, mammalClass = null) {
  const rng = createRNG(seed)
  
  if (!mammalClass) {
    const classes = Object.values(MammalClass)
    mammalClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[mammalClass]
  if (!classDef) {
    console.warn(`Unknown mammal class: ${mammalClass}`)
    return null
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
    smoothness: range(rng, 0.3, 0.5),  // Mammals are smoother than fish
  }
  
  const { mesh, parts } = buildMammalMesh(rng, classDef, traits, mammalClass)
  
  return { mesh, parts, seed, mammalClass, traits }
}

function buildMammalMesh(rng, classDef, traits, mammalClass) {
  const mammalGroup = new THREE.Group()
  const parts = {}
  
  const { length, height, width, palette, colorIndex } = traits
  
  const bodyColor = palette.body[colorIndex]
  const finColor = palette.fin[colorIndex]
  
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.1,
    roughness: traits.smoothness,
  })
  
  const finMaterial = new THREE.MeshStandardMaterial({
    color: finColor,
    metalness: 0.05,
    roughness: traits.smoothness + 0.1,
  })
  
  const overlap = length * 0.005
  
  // === BUILD BODY SEGMENTS ===
  for (const seg of classDef.body) {
    const segLength = length * (seg.end - seg.start) + overlap
    const segHeight = height * seg.hMult
    const segWidth = width * seg.wMult
    
    const segMesh = new THREE.Mesh(
      new THREE.BoxGeometry(segWidth, segHeight, segLength),
      bodyMaterial
    )
    
    const segCenter = (seg.start + seg.end) / 2
    segMesh.position.z = length * (segCenter - 0.5)
    
    mammalGroup.add(segMesh)
    parts[`body_${seg.start.toFixed(2)}`] = segMesh
  }
  
  // === BUILD BEAK (dolphins) ===
  if (classDef.beak) {
    const beakLen = length * classDef.beak.length
    const beakMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        length * classDef.beak.width,
        length * classDef.beak.height,
        beakLen
      ),
      bodyMaterial
    )
    beakMesh.position.z = -length * 0.5 - beakLen * 0.5 + overlap
    mammalGroup.add(beakMesh)
    parts.beak = beakMesh
  }
  
  // === BUILD TUSK (narwhal) ===
  if (classDef.tusk) {
    const tuskLen = length * classDef.tusk.length
    const tuskDia = length * classDef.tusk.diameter
    
    const tuskMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,  // Ivory
      metalness: 0.2,
      roughness: 0.4,
    })
    
    const tuskMesh = new THREE.Mesh(
      new THREE.BoxGeometry(tuskDia, tuskDia, tuskLen),
      tuskMaterial
    )
    // Tusk emerges from left side of upper jaw
    tuskMesh.position.set(-width * 0.1, height * 0.1, -length * 0.5 - tuskLen * 0.5)
    mammalGroup.add(tuskMesh)
    parts.tusk = tuskMesh
  }
  
  // === BUILD TUSKS (walrus) ===
  if (classDef.tusks) {
    const tuskLen = length * classDef.tusks.length
    const tuskDia = length * classDef.tusks.diameter
    
    const tuskMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,
      metalness: 0.2,
      roughness: 0.4,
    })
    
    const tuskR = new THREE.Mesh(
      new THREE.BoxGeometry(tuskDia, tuskLen, tuskDia),
      tuskMaterial
    )
    tuskR.position.set(width * 0.15, -height * 0.3 - tuskLen * 0.4, -length * 0.45)
    mammalGroup.add(tuskR)
    parts.tuskR = tuskR
    
    const tuskL = new THREE.Mesh(
      new THREE.BoxGeometry(tuskDia, tuskLen, tuskDia),
      tuskMaterial
    )
    tuskL.position.set(-width * 0.15, -height * 0.3 - tuskLen * 0.4, -length * 0.45)
    mammalGroup.add(tuskL)
    parts.tuskL = tuskL
  }
  
  // === BUILD FINS/FLIPPERS ===
  for (const fin of classDef.fins || []) {
    const [finLenRatio, finHRatio, finWRatio] = fin.size
    const finLen = length * finLenRatio
    const finH = length * finHRatio
    const finW = length * finWRatio
    
    const finMesh = new THREE.Mesh(
      new THREE.BoxGeometry(finW, finH, finLen),
      finMaterial
    )
    
    // Find position along body
    const frontEdgeZ = length * (fin.pos - 0.5)
    const finCenterZ = frontEdgeZ + finLen * 0.5
    
    // Find local body dimensions at this position
    let localHeight = height
    let localWidth = width
    for (const seg of classDef.body) {
      if (fin.pos >= seg.start && fin.pos < seg.end) {
        localHeight = height * seg.hMult
        localWidth = width * seg.wMult
        break
      }
    }
    
    // Position based on degree
    if (fin.deg === 0) {
      // Dorsal
      finMesh.position.set(0, localHeight * 0.5 + finH * 0.5 - overlap, finCenterZ)
    } else {
      // Side fins/flippers
      const angleRad = (fin.deg * Math.PI) / 180
      const offsetX = Math.sin(angleRad) * localWidth * 0.5
      const offsetY = Math.cos(angleRad) * localHeight * 0.5
      
      finMesh.position.set(
        offsetX + Math.sin(angleRad) * (finH * 0.5 - overlap),
        offsetY + Math.cos(angleRad) * (finH * 0.5 - overlap),
        finCenterZ
      )
      finMesh.rotation.z = angleRad
    }
    
    mammalGroup.add(finMesh)
    parts[fin.name] = finMesh
  }
  
  // === BUILD FLUKES (cetaceans) - HORIZONTAL tail ===
  if (classDef.flukes) {
    const flukeSpan = length * classDef.flukes.span
    const flukeLen = length * classDef.flukes.length
    const flukeThick = length * classDef.flukes.thickness
    const sweepAngle = (classDef.flukes.sweep * Math.PI) / 180
    
    // Right fluke
    const flukeR = new THREE.Mesh(
      new THREE.BoxGeometry(flukeSpan * 0.5, flukeThick, flukeLen),
      finMaterial
    )
    flukeR.position.set(flukeSpan * 0.25, 0, length * 0.5 + flukeLen * 0.3)
    flukeR.rotation.y = -sweepAngle
    mammalGroup.add(flukeR)
    parts.flukeR = flukeR
    
    // Left fluke
    const flukeL = new THREE.Mesh(
      new THREE.BoxGeometry(flukeSpan * 0.5, flukeThick, flukeLen),
      finMaterial
    )
    flukeL.position.set(-flukeSpan * 0.25, 0, length * 0.5 + flukeLen * 0.3)
    flukeL.rotation.y = sweepAngle
    mammalGroup.add(flukeL)
    parts.flukeL = flukeL
  }
  
  // === BUILD TAIL (otters, manatees) ===
  if (classDef.tail) {
    const tailLen = length * classDef.tail.length
    let tailMesh
    
    if (classDef.tail.type === 'paddle') {
      // Round paddle tail (manatee)
      const tailW = length * classDef.tail.width
      const tailThick = length * classDef.tail.thickness
      tailMesh = new THREE.Mesh(
        new THREE.BoxGeometry(tailW, tailThick, tailLen),
        finMaterial
      )
    } else {
      // Flat tail (otter)
      const tailH = length * classDef.tail.height
      const tailW = length * classDef.tail.width
      tailMesh = new THREE.Mesh(
        new THREE.BoxGeometry(tailW, tailH, tailLen),
        finMaterial
      )
    }
    
    tailMesh.position.set(0, 0, length * 0.5 + tailLen * 0.4)
    mammalGroup.add(tailMesh)
    parts.tail = tailMesh
  }
  
  // === BUILD BLOWHOLE (cetaceans) ===
  if (classDef.features?.blowhole) {
    const bh = classDef.features.blowhole
    const bhSize = length * bh.size
    
    // Find body height at blowhole position
    let bhHeight = height
    for (const seg of classDef.body) {
      if (bh.pos >= seg.start && bh.pos < seg.end) {
        bhHeight = height * seg.hMult
        break
      }
    }
    
    const blowholeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0,
      roughness: 0.9,
    })
    
    const blowhole = new THREE.Mesh(
      new THREE.BoxGeometry(bhSize * 2, bhSize * 0.5, bhSize),
      blowholeMaterial
    )
    
    const xOffset = bh.offset ? width * bh.offset : 0
    blowhole.position.set(xOffset, bhHeight * 0.5 + bhSize * 0.1, length * (bh.pos - 0.5))
    mammalGroup.add(blowhole)
    parts.blowhole = blowhole
  }
  
  mammalGroup.rotation.order = 'YXZ'
  
  return { mesh: mammalGroup, parts }
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

export function generateMammalOfClass(mammalClass) {
  return generateMammal(randomSeed(), mammalClass)
}

// ============================================================================
// CLASS METADATA HELPERS
// ============================================================================

/**
 * Get the full display name for a mammal class
 */
export function getClassDisplayName(mammalClass) {
  const meta = CLASS_METADATA[mammalClass]
  if (!meta) return mammalClass
  const def = CLASS_DEFINITIONS[mammalClass]
  const name = def?.name || meta.scientificName
  return `${meta.emoji} ${name} (${meta.scientificName})`
}

/**
 * Get the short name for a mammal class
 */
export function getClassShortName(mammalClass) {
  const def = CLASS_DEFINITIONS[mammalClass]
  if (def?.name) return def.name
  const meta = CLASS_METADATA[mammalClass]
  return meta?.scientificName || mammalClass
}

/**
 * Get all mammal classes in display order
 */
export function getOrderedClasses() {
  return Object.values(MammalClass)
    .filter(mc => CLASS_METADATA[mc])
    .sort((a, b) => CLASS_METADATA[a].order - CLASS_METADATA[b].order)
}

export default {
  generateMammal,
  generateMammalOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  MammalClass,
  getClassDisplayName,
  getClassShortName,
  getOrderedClasses,
}