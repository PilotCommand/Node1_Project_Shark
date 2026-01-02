/**
 * Jellies.js - Procedural jellyfish and jelly-like creature generation
 * 
 * Body plan: bell/dome + oral arms + trailing tentacles
 * 
 * Key features:
 * - Gelatinous bell (umbrella/dome shaped)
 * - Trailing tentacles (stinging in true jellies)
 * - Oral arms (frilly structures around mouth)
 * - Some have bioluminescence
 * - Comb jellies have cilia rows instead of tentacles
 * 
 * Orientation: bell at -Z (front, movement direction), tentacles trail at +Z
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
// JELLY CLASSES
// ============================================================================

export const JellyClass = {
  // True Jellyfish (Scyphozoa)
  MOON_JELLY: 'moon_jelly',
  LIONS_MANE: 'lions_mane',
  BARREL_JELLY: 'barrel_jelly',
  FRIED_EGG_JELLY: 'fried_egg_jelly',
  COMPASS_JELLY: 'compass_jelly',
  // Box Jellyfish (Cubozoa)
  BOX_JELLY: 'box_jelly',
  SEA_WASP: 'sea_wasp',
  // Hydrozoans
  PORTUGUESE_MAN_O_WAR: 'portuguese_man_o_war',
  BY_THE_WIND_SAILOR: 'by_the_wind_sailor',
  CRYSTAL_JELLY: 'crystal_jelly',
  // Comb Jellies (Ctenophora)
  SEA_GOOSEBERRY: 'sea_gooseberry',
  BLOODYBELLY_COMB: 'bloodybelly_comb',
  VENUS_GIRDLE: 'venus_girdle',
}

/**
 * Metadata for display names and ordering
 */
const CLASS_METADATA = {
  // True Jellyfish
  [JellyClass.MOON_JELLY]:        { emoji: '🪼', scientificName: 'Aurelia aurita', order: 10 },
  [JellyClass.LIONS_MANE]:        { emoji: '🪼', scientificName: 'Cyanea capillata', order: 11 },
  [JellyClass.BARREL_JELLY]:      { emoji: '🪼', scientificName: 'Rhizostoma pulmo', order: 12 },
  [JellyClass.FRIED_EGG_JELLY]:   { emoji: '🍳', scientificName: 'Cotylorhiza tuberculata', order: 13 },
  [JellyClass.COMPASS_JELLY]:     { emoji: '🧭', scientificName: 'Chrysaora hysoscella', order: 14 },
  // Box Jellyfish
  [JellyClass.BOX_JELLY]:         { emoji: '📦', scientificName: 'Cubozoa', order: 20 },
  [JellyClass.SEA_WASP]:          { emoji: '⚠️', scientificName: 'Chironex fleckeri', order: 21 },
  // Hydrozoans
  [JellyClass.PORTUGUESE_MAN_O_WAR]: { emoji: '🎈', scientificName: 'Physalia physalis', order: 30 },
  [JellyClass.BY_THE_WIND_SAILOR]:   { emoji: '⛵', scientificName: 'Velella velella', order: 31 },
  [JellyClass.CRYSTAL_JELLY]:        { emoji: '💎', scientificName: 'Aequorea victoria', order: 32 },
  // Comb Jellies
  [JellyClass.SEA_GOOSEBERRY]:    { emoji: '🫐', scientificName: 'Pleurobrachia pileus', order: 40 },
  [JellyClass.BLOODYBELLY_COMB]:  { emoji: '❤️', scientificName: 'Lampocteis cruentiventer', order: 41 },
  [JellyClass.VENUS_GIRDLE]:      { emoji: '🎀', scientificName: 'Cestum veneris', order: 42 },
}

/**
 * Class definitions - body plans and proportions
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MOON JELLY - Classic translucent dome, short tentacles
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.MOON_JELLY]: {
    name: 'Moon Jelly',
    length: { min: 0.10, max: 0.40 },  // Bell diameter
    
    bodyRatios: {
      height: { min: 0.30, max: 0.40 },  // Bell height relative to diameter
    },
    
    palettes: [
      { bell: [0xe6e6fa, 0xd6d6ea, 0xc6c6da], tentacle: [0xf0f0ff, 0xe0e0ef, 0xd0d0df], gonads: 0xdda0dd },
      { bell: [0xf0ffff, 0xe0efef, 0xd0dfdf], tentacle: [0xffffff, 0xf0f0f0, 0xe0e0e0], gonads: 0xee82ee },
    ],
    
    bell: {
      shape: 'dome',
      thickness: 0.08,
      translucent: true,
      opacity: 0.5,
    },
    
    tentacles: {
      count: 100,  // Many short fringe tentacles (simplified)
      lengthRatio: 0.15,
      thickness: 0.003,
      fringe: true,
    },
    
    oralArms: {
      count: 4,
      lengthRatio: 0.30,
      thickness: 0.03,
      frilly: true,
    },
    
    features: {
      gonads: { visible: true, count: 4, shape: 'horseshoe' },
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LION'S MANE - Largest jellyfish, long flowing tentacles
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.LIONS_MANE]: {
    name: "Lion's Mane Jellyfish",
    length: { min: 0.50, max: 2.00 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.35 },
    },
    
    palettes: [
      { bell: [0xdc143c, 0xcc0428, 0xbc0018], tentacle: [0xff6347, 0xef5337, 0xdf4327], oralArm: 0xff4500 },
      { bell: [0xff8c00, 0xef7c00, 0xdf6c00], tentacle: [0xffa500, 0xef9500, 0xdf8500], oralArm: 0xffd700 },
      { bell: [0x8b0000, 0x7b0000, 0x6b0000], tentacle: [0xb22222, 0xa21212, 0x920202], oralArm: 0xcd5c5c },
    ],
    
    bell: {
      shape: 'scalloped',  // Wavy edge
      thickness: 0.06,
      translucent: true,
      opacity: 0.6,
      lobes: 8,
    },
    
    tentacles: {
      count: 150,  // Extremely numerous (simplified)
      lengthRatio: 3.0,  // Very long!
      thickness: 0.004,
      groups: 8,
    },
    
    oralArms: {
      count: 4,
      lengthRatio: 0.80,
      thickness: 0.05,
      frilly: true,
    },
    
    features: {
      gonads: { visible: false },
      bioluminescence: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BARREL JELLY - Large, no tentacles, cauliflower oral arms
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.BARREL_JELLY]: {
    name: 'Barrel Jellyfish',
    length: { min: 0.30, max: 0.90 },
    
    bodyRatios: {
      height: { min: 0.50, max: 0.65 },
    },
    
    palettes: [
      { bell: [0xe6e6fa, 0xd6d6ea, 0xc6c6da], oralArm: [0x9370db, 0x8360cb, 0x7350bb], edge: 0x4169e1 },
      { bell: [0xf5f5f5, 0xe5e5e5, 0xd5d5d5], oralArm: [0x6a5acd, 0x5a4abd, 0x4a3aad], edge: 0x483d8b },
    ],
    
    bell: {
      shape: 'barrel',
      thickness: 0.10,
      translucent: true,
      opacity: 0.7,
    },
    
    tentacles: null,  // No tentacles!
    
    oralArms: {
      count: 8,
      lengthRatio: 0.60,
      thickness: 0.08,
      cauliflower: true,  // Thick, bunchy
    },
    
    features: {
      gonads: { visible: false },
      bioluminescence: false,
      coloredEdge: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FRIED EGG JELLY - Yellow center, looks like sunny-side up egg
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.FRIED_EGG_JELLY]: {
    name: 'Fried Egg Jellyfish',
    length: { min: 0.15, max: 0.35 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.35 },
    },
    
    palettes: [
      { bell: [0xfffacd, 0xffeabd, 0xffdaad], yolk: 0xffa500, tentacle: [0x9370db, 0x8360cb, 0x7350bb] },
    ],
    
    bell: {
      shape: 'flat',
      thickness: 0.06,
      translucent: true,
      opacity: 0.6,
    },
    
    yolk: {
      present: true,
      size: 0.35,  // Relative to bell
      color: 0xffa500,
    },
    
    tentacles: {
      count: 16,
      lengthRatio: 0.50,
      thickness: 0.008,
      fringe: false,
    },
    
    oralArms: {
      count: 8,
      lengthRatio: 0.40,
      thickness: 0.025,
      frilly: true,
    },
    
    features: {
      gonads: { visible: false },
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPASS JELLY - Brown V-shaped markings on bell
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.COMPASS_JELLY]: {
    name: 'Compass Jellyfish',
    length: { min: 0.15, max: 0.30 },
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },
    },
    
    palettes: [
      { bell: [0xfff8dc, 0xefe8cc, 0xdfd8bc], markings: 0x8b4513, tentacle: [0xffe4b5, 0xffd4a5, 0xffc495] },
    ],
    
    bell: {
      shape: 'dome',
      thickness: 0.07,
      translucent: true,
      opacity: 0.65,
    },
    
    tentacles: {
      count: 24,
      lengthRatio: 1.20,
      thickness: 0.006,
      fringe: false,
    },
    
    oralArms: {
      count: 4,
      lengthRatio: 0.50,
      thickness: 0.03,
      frilly: true,
    },
    
    features: {
      gonads: { visible: false },
      compassMarkings: true,  // V-shaped brown markings
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BOX JELLY - Cube-shaped bell, highly venomous
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.BOX_JELLY]: {
    name: 'Box Jellyfish',
    length: { min: 0.10, max: 0.30 },
    
    bodyRatios: {
      height: { min: 0.80, max: 1.00 },  // Cube-ish
    },
    
    palettes: [
      { bell: [0xf0ffff, 0xe0efef, 0xd0dfdf], tentacle: [0xe0ffff, 0xd0efef, 0xc0dfdf] },
      { bell: [0xfff0f5, 0xefe0e5, 0xdfd0d5], tentacle: [0xffe4e1, 0xffd4d1, 0xffc4c1] },
    ],
    
    bell: {
      shape: 'box',
      thickness: 0.05,
      translucent: true,
      opacity: 0.4,  // Very transparent
      corners: 4,
    },
    
    tentacles: {
      count: 16,  // 4 per corner
      lengthRatio: 2.00,
      thickness: 0.005,
      corners: true,  // Attach at corners
    },
    
    oralArms: null,
    
    features: {
      gonads: { visible: false },
      eyes: true,  // Box jellies have complex eyes
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA WASP - Most venomous box jelly
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.SEA_WASP]: {
    name: 'Sea Wasp',
    length: { min: 0.15, max: 0.30 },
    
    bodyRatios: {
      height: { min: 0.85, max: 1.00 },
    },
    
    palettes: [
      { bell: [0xf5fffa, 0xe5efea, 0xd5dfda], tentacle: [0xe0ffff, 0xd0efef, 0xc0dfdf] },
    ],
    
    bell: {
      shape: 'box',
      thickness: 0.04,
      translucent: true,
      opacity: 0.35,
      corners: 4,
    },
    
    tentacles: {
      count: 60,  // Up to 15 per corner
      lengthRatio: 3.00,  // Very long
      thickness: 0.003,
      corners: true,
    },
    
    oralArms: null,
    
    features: {
      gonads: { visible: false },
      eyes: true,
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PORTUGUESE MAN O' WAR - Not a true jelly, colonial organism with float
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.PORTUGUESE_MAN_O_WAR]: {
    name: "Portuguese Man o' War",
    length: { min: 0.15, max: 0.30 },  // Float size
    
    bodyRatios: {
      height: { min: 0.40, max: 0.55 },
    },
    
    palettes: [
      { float: [0x4169e1, 0x3159d1, 0x2149c1], crest: 0xff69b4, tentacle: [0x0000cd, 0x0000bd, 0x0000ad] },
      { float: [0x9400d3, 0x8400c3, 0x7400b3], crest: 0xff1493, tentacle: [0x4b0082, 0x3b0072, 0x2b0062] },
    ],
    
    float: {
      shape: 'bladder',
      thickness: 0.03,
      translucent: true,
      opacity: 0.7,
      crest: true,  // Sail/crest on top
    },
    
    tentacles: {
      count: 20,
      lengthRatio: 10.0,  // Extremely long!
      thickness: 0.004,
      clusters: true,
    },
    
    oralArms: null,
    
    features: {
      gonads: { visible: false },
      bioluminescence: false,
      colonial: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BY THE WIND SAILOR - Small blue float with sail
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.BY_THE_WIND_SAILOR]: {
    name: 'By-the-wind Sailor',
    length: { min: 0.03, max: 0.08 },
    
    bodyRatios: {
      height: { min: 0.30, max: 0.40 },
    },
    
    palettes: [
      { float: [0x4169e1, 0x3159d1, 0x2149c1], sail: 0xadd8e6, tentacle: [0x0000ff, 0x0000ef, 0x0000df] },
    ],
    
    float: {
      shape: 'disc',
      thickness: 0.10,
      translucent: true,
      opacity: 0.6,
      sail: true,  // Triangular sail
    },
    
    tentacles: {
      count: 30,
      lengthRatio: 0.40,
      thickness: 0.002,
      fringe: true,
    },
    
    oralArms: null,
    
    features: {
      gonads: { visible: false },
      bioluminescence: false,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRYSTAL JELLY - Source of GFP, bioluminescent
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.CRYSTAL_JELLY]: {
    name: 'Crystal Jelly',
    length: { min: 0.05, max: 0.25 },
    
    bodyRatios: {
      height: { min: 0.35, max: 0.45 },
    },
    
    palettes: [
      { bell: [0xf0ffff, 0xe0efef, 0xd0dfdf], tentacle: [0xffffff, 0xf0f0f0, 0xe0e0e0], glow: 0x7fff00 },
    ],
    
    bell: {
      shape: 'dome',
      thickness: 0.04,
      translucent: true,
      opacity: 0.3,  // Very transparent
    },
    
    tentacles: {
      count: 100,
      lengthRatio: 0.60,
      thickness: 0.002,
      fringe: true,
    },
    
    oralArms: {
      count: 4,
      lengthRatio: 0.25,
      thickness: 0.015,
      frilly: false,
    },
    
    features: {
      gonads: { visible: true, count: 4, shape: 'radial' },
      bioluminescence: true,
      glowColor: 0x7fff00,  // Green fluorescent
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA GOOSEBERRY - Small round comb jelly
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.SEA_GOOSEBERRY]: {
    name: 'Sea Gooseberry',
    length: { min: 0.01, max: 0.025 },
    
    bodyRatios: {
      height: { min: 0.90, max: 1.10 },  // Nearly spherical
    },
    
    palettes: [
      { body: [0xf0ffff, 0xe0efef, 0xd0dfdf], cilia: 0x00ffff, tentacle: [0xffffff, 0xf0f0f0, 0xe0e0e0] },
    ],
    
    body: {
      shape: 'sphere',
      translucent: true,
      opacity: 0.35,
    },
    
    ciliaRows: {
      count: 8,
      iridescent: true,
    },
    
    tentacles: {
      count: 2,
      lengthRatio: 4.00,  // Very long relative to body
      thickness: 0.01,
      branching: true,
    },
    
    features: {
      combJelly: true,
      bioluminescence: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BLOODYBELLY COMB JELLY - Deep red, bioluminescent
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.BLOODYBELLY_COMB]: {
    name: 'Bloodybelly Comb Jelly',
    length: { min: 0.03, max: 0.15 },
    
    bodyRatios: {
      height: { min: 1.00, max: 1.20 },
    },
    
    palettes: [
      { body: [0x8b0000, 0x7b0000, 0x6b0000], cilia: 0xff6347, glow: 0xff0000 },
      { body: [0x800000, 0x700000, 0x600000], cilia: 0xff4500, glow: 0xff6347 },
    ],
    
    body: {
      shape: 'oval',
      translucent: true,
      opacity: 0.5,
    },
    
    ciliaRows: {
      count: 8,
      iridescent: true,
    },
    
    tentacles: null,  // No tentacles
    
    features: {
      combJelly: true,
      bioluminescence: true,
      glowColor: 0xff0000,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VENUS GIRDLE - Long ribbon-shaped comb jelly
  // ═══════════════════════════════════════════════════════════════════════════
  [JellyClass.VENUS_GIRDLE]: {
    name: "Venus' Girdle",
    length: { min: 0.30, max: 1.50 },  // Can be very long
    
    bodyRatios: {
      height: { min: 0.03, max: 0.05 },  // Very flat ribbon
      width: { min: 0.05, max: 0.08 },
    },
    
    palettes: [
      { body: [0xf0ffff, 0xe0efef, 0xd0dfdf], cilia: 0x00ffff, edge: 0x98fb98 },
    ],
    
    body: {
      shape: 'ribbon',
      translucent: true,
      opacity: 0.4,
    },
    
    ciliaRows: {
      count: 2,  // Along edges
      iridescent: true,
    },
    
    tentacles: null,
    
    features: {
      combJelly: true,
      bioluminescence: true,
      undulating: true,
    },
  },
}

// ============================================================================
// MESH GENERATION
// ============================================================================

const MAX_MESHES = 12

/**
 * Generate a procedural jelly mesh
 */
export function generateJelly(seed, jellyClass = null) {
  const rng = createRNG(seed)
  
  if (!jellyClass) {
    const classes = Object.values(JellyClass)
    jellyClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[jellyClass]
  if (!classDef) {
    console.warn(`Unknown jelly class: ${jellyClass}`)
    return null
  }
  
  const length = range(rng, classDef.length.min, classDef.length.max)
  const height = length * range(rng, classDef.bodyRatios.height.min, classDef.bodyRatios.height.max)
  const width = classDef.bodyRatios.width 
    ? length * range(rng, classDef.bodyRatios.width.min, classDef.bodyRatios.width.max)
    : length
  
  const palette = pick(rng, classDef.palettes)
  const bellColor = pick(rng, palette.bell || palette.body || palette.float)
  const tentacleColor = palette.tentacle ? pick(rng, palette.tentacle) : bellColor
  
  const bellMaterial = new THREE.MeshStandardMaterial({
    color: bellColor,
    metalness: 0.1,
    roughness: 0.3,
    transparent: true,
    opacity: classDef.bell?.opacity || classDef.body?.opacity || classDef.float?.opacity || 0.5,
    side: THREE.DoubleSide,
  })
  
  const tentacleMaterial = new THREE.MeshStandardMaterial({
    color: tentacleColor,
    metalness: 0.0,
    roughness: 0.5,
    transparent: true,
    opacity: 0.7,
  })
  
  const jellyGroup = new THREE.Group()
  const parts = {}
  let meshCount = 0
  
  function addMesh(mesh, name) {
    if (meshCount >= MAX_MESHES) return false
    mesh.castShadow = true
    mesh.receiveShadow = true
    jellyGroup.add(mesh)
    parts[name] = mesh
    meshCount++
    return true
  }
  
  // === PORTUGUESE MAN O' WAR - Special float structure ===
  if (classDef.float) {
    const floatLen = length
    const floatH = height
    
    // Main float/bladder - sits at water surface
    const floatGeom = new THREE.SphereGeometry(floatLen * 0.5, 10, 8)
    const float = new THREE.Mesh(floatGeom, bellMaterial)
    float.scale.set(1, floatH / floatLen, 0.6)
    float.position.set(0, floatH * 0.3, 0)
    addMesh(float, 'float')
    
    // Crest/sail - runs along top of float
    if (classDef.float.crest && meshCount < MAX_MESHES) {
      const crestMaterial = new THREE.MeshStandardMaterial({
        color: palette.crest || 0xff69b4,
        metalness: 0.0,
        roughness: 0.5,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      })
      
      const crestGeom = new THREE.PlaneGeometry(floatLen * 0.8, floatH * 0.5)
      const crest = new THREE.Mesh(crestGeom, crestMaterial)
      crest.position.set(0, floatH * 0.55, 0)
      crest.rotation.y = Math.PI / 2  // Sail runs fore-aft
      addMesh(crest, 'crest')
    }
    
    // Tentacles - hang down from float, trail behind toward +Z
    if (classDef.tentacles && meshCount < MAX_MESHES) {
      const tentLen = floatLen * classDef.tentacles.lengthRatio
      const tentThick = floatLen * classDef.tentacles.thickness
      const numTent = Math.min(classDef.tentacles.count, 6)
      
      for (let i = 0; i < numTent && meshCount < MAX_MESHES; i++) {
        // Distribute tentacles along the float and trailing back
        const tPos = i / (numTent - 1)  // 0 to 1
        const zPos = (tPos - 0.3) * floatLen * 0.8  // Spread from front to back
        const xPos = (tPos % 2 === 0 ? 0.1 : -0.1) * floatLen  // Slight side offset
        
        // Cylinder hangs down from base
        const tentGeom = new THREE.CylinderGeometry(tentThick * 0.3, tentThick, tentLen, 4)
        tentGeom.translate(0, -tentLen / 2, 0)  // Base at origin, hangs down
        
        const tentacle = new THREE.Mesh(tentGeom, tentacleMaterial)
        tentacle.position.set(xPos, -floatH * 0.1, zPos)
        
        // Slight backward trail
        tentacle.rotation.x = range(rng, 0.1, 0.3)
        tentacle.rotation.z = range(rng, -0.15, 0.15)
        
        addMesh(tentacle, `tentacle${i}`)
      }
    }
  }
  // === COMB JELLIES ===
  else if (classDef.body) {
    const bodyLen = length
    const bodyH = height
    
    let bodyGeom
    if (classDef.body.shape === 'ribbon') {
      // Venus girdle - ribbon shape
      bodyGeom = new THREE.BoxGeometry(bodyLen, bodyH, width)
    } else {
      // Spherical/oval comb jellies
      bodyGeom = new THREE.SphereGeometry(bodyLen * 0.5, 10, 8)
    }
    
    const body = new THREE.Mesh(bodyGeom, bellMaterial)
    if (classDef.body.shape !== 'ribbon') {
      body.scale.set(1, bodyH / bodyLen, 0.8)
    }
    addMesh(body, 'body')
    
    // Cilia rows (simplified as stripes)
    if (classDef.ciliaRows && meshCount < MAX_MESHES) {
      const ciliaMaterial = new THREE.MeshStandardMaterial({
        color: palette.cilia || 0x00ffff,
        metalness: 0.3,
        roughness: 0.3,
        emissive: palette.cilia || 0x00ffff,
        emissiveIntensity: 0.3,
      })
      
      const numRows = Math.min(classDef.ciliaRows.count, 4)
      for (let i = 0; i < numRows && meshCount < MAX_MESHES; i++) {
        const angle = (i / numRows) * Math.PI * 2
        
        const ciliaGeom = new THREE.CylinderGeometry(0.002, 0.002, bodyH * 0.8, 4)
        const cilia = new THREE.Mesh(ciliaGeom, ciliaMaterial)
        cilia.position.set(
          Math.sin(angle) * bodyLen * 0.45,
          0,
          Math.cos(angle) * bodyLen * 0.35
        )
        addMesh(cilia, `cilia${i}`)
      }
    }
    
    // Long tentacles for sea gooseberry - trail behind toward +Z
    if (classDef.tentacles && meshCount < MAX_MESHES) {
      const tentLen = bodyLen * classDef.tentacles.lengthRatio
      const tentThick = bodyLen * classDef.tentacles.thickness
      
      for (let i = 0; i < 2 && meshCount < MAX_MESHES; i++) {
        const side = i === 0 ? 1 : -1
        
        // Cylinder with base at origin
        const tentGeom = new THREE.CylinderGeometry(tentThick * 0.3, tentThick, tentLen, 4)
        tentGeom.translate(0, tentLen / 2, 0)
        
        const tentacle = new THREE.Mesh(tentGeom, tentacleMaterial)
        
        // Attach at sides, trail backward
        tentacle.position.set(side * bodyLen * 0.35, 0, bodyLen * 0.2)
        
        // Point backward (+Z) with outward spread
        tentacle.rotation.order = 'ZXY'
        tentacle.rotation.x = Math.PI / 2
        tentacle.rotation.z = side * 0.4  // Spread outward
        
        addMesh(tentacle, `tentacle${i}`)
      }
    }
  }
  // === TRUE JELLYFISH / BOX JELLIES ===
  else if (classDef.bell) {
    const bellDiam = length
    const bellH = height
    
    // Create bell shape
    let bellGeom
    if (classDef.bell.shape === 'box') {
      // Box jelly - cube-ish shape
      bellGeom = new THREE.BoxGeometry(bellDiam, bellH, bellDiam)
    } else if (classDef.bell.shape === 'barrel') {
      // Barrel - cylinder oriented along Z axis
      bellGeom = new THREE.CylinderGeometry(bellDiam * 0.5, bellDiam * 0.4, bellH, 12)
    } else {
      // Dome shape - creates upper hemisphere, cap at +Y, opening at -Y
      bellGeom = new THREE.SphereGeometry(bellDiam * 0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)
    }
    
    const bell = new THREE.Mesh(bellGeom, bellMaterial)
    
    // Position and orient bell: cap toward -Z (front), opening toward +Z (back)
    if (classDef.bell.shape === 'box') {
      // Box is fine as-is, centered at origin
      bell.position.set(0, 0, 0)
    } else if (classDef.bell.shape === 'barrel') {
      // Rotate barrel to lie along Z axis, opening toward +Z
      bell.rotation.x = Math.PI / 2
      bell.position.set(0, 0, 0)
    } else {
      // Dome: rotate so cap points toward -Z (front), opening toward +Z
      // Dome cap starts at +Y; rotate -90° around X so +Y → -Z
      bell.rotation.x = -Math.PI / 2
      bell.scale.set(1, 1, bellH / (bellDiam * 0.5))
      bell.position.set(0, 0, -bellH * 0.2)
    }
    addMesh(bell, 'bell')
    
    // Bell margin Z position (where tentacles attach)
    const bellMarginZ = classDef.bell.shape === 'dome' ? bellH * 0.3 : bellH * 0.5
    
    // Yolk for fried egg jelly
    if (classDef.yolk && classDef.yolk.present && meshCount < MAX_MESHES) {
      const yolkSize = bellDiam * classDef.yolk.size
      const yolkMaterial = new THREE.MeshStandardMaterial({
        color: classDef.yolk.color,
        metalness: 0.1,
        roughness: 0.6,
      })
      
      const yolkGeom = new THREE.SphereGeometry(yolkSize * 0.5, 8, 6)
      const yolk = new THREE.Mesh(yolkGeom, yolkMaterial)
      yolk.position.set(0, 0, 0)
      yolk.scale.set(1, 0.6, 1)
      addMesh(yolk, 'yolk')
    }
    
    // Oral arms - hang from center, trail behind toward +Z
    if (classDef.oralArms && meshCount < MAX_MESHES) {
      const armLen = bellDiam * classDef.oralArms.lengthRatio
      const armThick = bellDiam * classDef.oralArms.thickness
      const numArms = Math.min(classDef.oralArms.count, 4)
      
      const oralMaterial = new THREE.MeshStandardMaterial({
        color: palette.oralArm || tentacleColor,
        metalness: 0.0,
        roughness: 0.6,
        transparent: true,
        opacity: 0.8,
      })
      
      const oralAttachZ = bellH * 0.1  // Slightly behind center
      
      for (let i = 0; i < numArms && meshCount < MAX_MESHES; i++) {
        const angle = (i / numArms) * Math.PI * 2
        
        // Cylinder with base at origin, extending along +Y
        const armGeom = new THREE.CylinderGeometry(armThick * 0.3, armThick, armLen, 5)
        armGeom.translate(0, armLen / 2, 0)
        
        const arm = new THREE.Mesh(armGeom, oralMaterial)
        
        // Position in a small ring at center, slightly behind
        const attachRadius = bellDiam * 0.1
        arm.position.set(
          Math.sin(angle) * attachRadius,
          Math.cos(angle) * attachRadius,
          oralAttachZ
        )
        
        // Rotate to point backward (+Z) - cylinder points +Y, rotate +90° around X
        arm.rotation.order = 'ZXY'
        arm.rotation.x = Math.PI / 2 + range(rng, -0.15, 0.15)
        arm.rotation.z = angle + range(rng, -0.1, 0.1)
        
        addMesh(arm, `oralArm${i}`)
      }
    }
    
    // Tentacles - attach at bell margin, trail behind toward +Z
    if (classDef.tentacles && meshCount < MAX_MESHES) {
      const tentLen = bellDiam * classDef.tentacles.lengthRatio
      const tentThick = bellDiam * classDef.tentacles.thickness
      const numTent = Math.min(classDef.tentacles.count, MAX_MESHES - meshCount, 6)
      
      const attachRadius = bellDiam * 0.45
      
      for (let i = 0; i < numTent && meshCount < MAX_MESHES; i++) {
        const angle = (i / numTent) * Math.PI * 2
        
        // Cylinder with base at origin
        const tentGeom = new THREE.CylinderGeometry(tentThick * 0.3, tentThick, tentLen, 4)
        tentGeom.translate(0, tentLen / 2, 0)
        
        const tentacle = new THREE.Mesh(tentGeom, tentacleMaterial)
        
        // Attach at bell margin (ring around the edge)
        const attachX = Math.sin(angle) * attachRadius
        const attachY = Math.cos(angle) * attachRadius
        
        tentacle.position.set(attachX, attachY, bellMarginZ)
        
        // Point backward (+Z) with slight spread
        tentacle.rotation.order = 'ZXY'
        tentacle.rotation.x = Math.PI / 2 + range(rng, -0.2, 0.1)
        tentacle.rotation.z = range(rng, -0.1, 0.1)
        
        addMesh(tentacle, `tentacle${i}`)
      }
    }
  }
  
  jellyGroup.rotation.order = 'YXZ'
  
  return {
    mesh: jellyGroup,
    parts,
    seed,
    class: jellyClass,
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

export function generateJellyOfClass(jellyClass) {
  return generateJelly(randomSeed(), jellyClass)
}

// ============================================================================
// CLASS METADATA HELPERS
// ============================================================================

export function getClassDisplayName(jellyClass) {
  const meta = CLASS_METADATA[jellyClass]
  if (!meta) return jellyClass
  const def = CLASS_DEFINITIONS[jellyClass]
  const name = def?.name || meta.scientificName
  return `${meta.emoji} ${name} (${meta.scientificName})`
}

export function getClassShortName(jellyClass) {
  const def = CLASS_DEFINITIONS[jellyClass]
  if (def?.name) return def.name
  const meta = CLASS_METADATA[jellyClass]
  return meta?.scientificName || jellyClass
}

export function getOrderedClasses() {
  return Object.values(JellyClass)
    .filter(cc => CLASS_METADATA[cc])
    .sort((a, b) => CLASS_METADATA[a].order - CLASS_METADATA[b].order)
}

export default {
  generateJelly,
  generateJellyOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  JellyClass,
  getClassDisplayName,
  getClassShortName,
  getOrderedClasses,
}