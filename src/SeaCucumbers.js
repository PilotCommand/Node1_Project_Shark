/**
 * SeaCucumbers.js - Procedural sea cucumber generation
 * 
 * Body plan: elongated cylindrical body + tube feet + feeding tentacles
 * 
 * Key features:
 * - Soft, leathery body (some with calcified skin)
 * - Tube feet on ventral surface for locomotion
 * - Ring of feeding tentacles around mouth
 * - Some have papillae (bumps/spikes) on body
 * - Can expel internal organs as defense (not modeled)
 * 
 * Orientation: mouth at -Z (front), anus at +Z (back)
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
// SEA CUCUMBER CLASSES
// ============================================================================

export const SeaCucumberClass = {
  // Common types
  SEA_CUCUMBER: 'sea_cucumber',
  GIANT_CALIFORNIA: 'giant_california',
  LEOPARD_SEA_CUCUMBER: 'leopard_sea_cucumber',
  // Colorful types
  SEA_APPLE: 'sea_apple',
  SEA_PIG: 'sea_pig',
  // Unusual types
  MEDUSA_WORM: 'medusa_worm',
  STICKY_SNAKE: 'sticky_snake',
  DONKEY_DUNG: 'donkey_dung',
}

/**
 * Metadata for display names and ordering
 */
const CLASS_METADATA = {
  [SeaCucumberClass.SEA_CUCUMBER]:        { emoji: '🥒', scientificName: 'Holothuroidea', order: 10 },
  [SeaCucumberClass.GIANT_CALIFORNIA]:    { emoji: '🥒', scientificName: 'Apostichopus californicus', order: 11 },
  [SeaCucumberClass.LEOPARD_SEA_CUCUMBER]:{ emoji: '🥒', scientificName: 'Bohadschia argus', order: 12 },
  [SeaCucumberClass.SEA_APPLE]:           { emoji: '🍎', scientificName: 'Pseudocolochirus violaceus', order: 20 },
  [SeaCucumberClass.SEA_PIG]:             { emoji: '🐷', scientificName: 'Scotoplanes globosa', order: 21 },
  [SeaCucumberClass.MEDUSA_WORM]:         { emoji: '🪱', scientificName: 'Pelagothuria natatrix', order: 30 },
  [SeaCucumberClass.STICKY_SNAKE]:        { emoji: '🐍', scientificName: 'Synapta maculata', order: 31 },
  [SeaCucumberClass.DONKEY_DUNG]:         { emoji: '🥒', scientificName: 'Holothuria mexicana', order: 32 },
}

/**
 * Class definitions - body plans and proportions
 */
const CLASS_DEFINITIONS = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA CUCUMBER - Generic/common type
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.SEA_CUCUMBER]: {
    name: 'Sea Cucumber',
    length: { min: 0.10, max: 0.30 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.35 },
      width: { min: 0.30, max: 0.40 },
    },
    
    palettes: [
      { body: [0x8b4513, 0x7b3503, 0x6b2500], tentacle: [0xdeb887, 0xcda876, 0xbc9865] },
      { body: [0x556b2f, 0x455b1f, 0x354b0f], tentacle: [0x9acd32, 0x8abd22, 0x7aad12] },
      { body: [0x2f4f4f, 0x1f3f3f, 0x0f2f2f], tentacle: [0x708090, 0x607080, 0x506070] },
    ],
    
    body: {
      shape: 'cylinder',
      segments: 3,
      taperFront: 0.7,
      taperBack: 0.8,
    },
    
    tentacles: {
      count: 10,
      lengthRatio: 0.25,
      thickness: 0.02,
      branching: false,
    },
    
    features: {
      papillae: { density: 0.3, size: 0.03 },
      tubeFeet: { rows: 3, visible: false },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GIANT CALIFORNIA SEA CUCUMBER - Large, reddish, spiky
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.GIANT_CALIFORNIA]: {
    name: 'Giant California Sea Cucumber',
    length: { min: 0.25, max: 0.50 },
    
    bodyRatios: {
      height: { min: 0.30, max: 0.40 },
      width: { min: 0.35, max: 0.45 },
    },
    
    palettes: [
      { body: [0x8b0000, 0x7b0000, 0x6b0000], tentacle: [0xcd5c5c, 0xbd4c4c, 0xad3c3c] },
      { body: [0xa52a2a, 0x951a1a, 0x850a0a], tentacle: [0xf08080, 0xe07070, 0xd06060] },
    ],
    
    body: {
      shape: 'cylinder',
      segments: 4,
      taperFront: 0.65,
      taperBack: 0.75,
    },
    
    tentacles: {
      count: 12,
      lengthRatio: 0.20,
      thickness: 0.025,
      branching: true,
    },
    
    features: {
      papillae: { density: 0.6, size: 0.04, spiky: true },
      tubeFeet: { rows: 3, visible: false },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEOPARD SEA CUCUMBER - Spotted pattern
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.LEOPARD_SEA_CUCUMBER]: {
    name: 'Leopard Sea Cucumber',
    length: { min: 0.20, max: 0.40 },
    
    bodyRatios: {
      height: { min: 0.25, max: 0.35 },
      width: { min: 0.30, max: 0.40 },
    },
    
    palettes: [
      { body: [0xf5deb3, 0xe5cda3, 0xd5bc93], tentacle: [0xdeb887, 0xcda876, 0xbc9865], spots: 0x3d2b1f },
      { body: [0xfaebd7, 0xeadbc7, 0xdacbb7], tentacle: [0xd2b48c, 0xc2a47c, 0xb2946c], spots: 0x2f1f0f },
    ],
    
    body: {
      shape: 'cylinder',
      segments: 3,
      taperFront: 0.7,
      taperBack: 0.8,
    },
    
    tentacles: {
      count: 10,
      lengthRatio: 0.22,
      thickness: 0.02,
      branching: false,
    },
    
    features: {
      papillae: { density: 0.2, size: 0.025 },
      spots: true,
      tubeFeet: { rows: 3, visible: false },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA APPLE - Colorful, round, feathery tentacles
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.SEA_APPLE]: {
    name: 'Sea Apple',
    length: { min: 0.08, max: 0.15 },
    
    bodyRatios: {
      height: { min: 0.60, max: 0.80 },  // More round
      width: { min: 0.65, max: 0.85 },
    },
    
    palettes: [
      { body: [0x9400d3, 0x8400c3, 0x7400b3], tentacle: [0xffff00, 0xffd700, 0xffc000], feet: 0xff69b4 },
      { body: [0x4169e1, 0x3159d1, 0x2149c1], tentacle: [0xffffff, 0xf0f0f0, 0xe0e0e0], feet: 0xff1493 },
      { body: [0xdc143c, 0xcc0428, 0xbc0018], tentacle: [0xffd700, 0xffc700, 0xffb700], feet: 0x9400d3 },
    ],
    
    body: {
      shape: 'oval',
      segments: 2,
      taperFront: 0.85,
      taperBack: 0.85,
    },
    
    tentacles: {
      count: 10,
      lengthRatio: 0.50,  // Long feathery tentacles
      thickness: 0.015,
      branching: true,
      feathery: true,
    },
    
    features: {
      papillae: { density: 0.1, size: 0.02 },
      tubeFeet: { rows: 5, visible: true, colorful: true },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEA PIG - Deep sea, walks on legs, pink/translucent
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.SEA_PIG]: {
    name: 'Sea Pig',
    length: { min: 0.05, max: 0.15 },
    
    bodyRatios: {
      height: { min: 0.50, max: 0.65 },
      width: { min: 0.55, max: 0.70 },
    },
    
    palettes: [
      { body: [0xffb6c1, 0xffa6b1, 0xff96a1], tentacle: [0xffc0cb, 0xffb0bb, 0xffa0ab], legs: 0xffe4e1 },
      { body: [0xffdab9, 0xffcaa9, 0xffba99], tentacle: [0xffe4b5, 0xffd4a5, 0xffc495], legs: 0xfff0e0 },
    ],
    
    body: {
      shape: 'plump',
      segments: 2,
      taperFront: 0.75,
      taperBack: 0.80,
      translucent: true,
    },
    
    tentacles: {
      count: 6,
      lengthRatio: 0.30,
      thickness: 0.025,
      branching: false,
      antennae: true,  // Upper tentacles look like antennae
    },
    
    legs: {
      count: 10,
      lengthRatio: 0.35,
      thickness: 0.04,
    },
    
    features: {
      papillae: { density: 0, size: 0 },
      tubeFeet: { rows: 0, visible: false },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MEDUSA WORM - Swimming sea cucumber, umbrella-like
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.MEDUSA_WORM]: {
    name: 'Medusa Worm',
    length: { min: 0.05, max: 0.15 },
    
    bodyRatios: {
      height: { min: 0.40, max: 0.50 },
      width: { min: 0.45, max: 0.55 },
    },
    
    palettes: [
      { body: [0xdda0dd, 0xcd90cd, 0xbd80bd], tentacle: [0xee82ee, 0xde72de, 0xce62ce], veil: 0xe6e6fa },
      { body: [0xffc0cb, 0xffb0bb, 0xffa0ab], tentacle: [0xff69b4, 0xef59a4, 0xdf4994], veil: 0xfff0f5 },
    ],
    
    body: {
      shape: 'oval',
      segments: 2,
      taperFront: 0.80,
      taperBack: 0.70,
      translucent: true,
    },
    
    tentacles: {
      count: 12,
      lengthRatio: 0.60,
      thickness: 0.01,
      branching: false,
    },
    
    veil: {
      present: true,
      size: 0.80,
    },
    
    features: {
      papillae: { density: 0, size: 0 },
      tubeFeet: { rows: 0, visible: false },
      swimming: true,
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STICKY SNAKE - Very long and thin
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.STICKY_SNAKE]: {
    name: 'Sticky Snake Sea Cucumber',
    length: { min: 0.50, max: 2.00 },  // Very long!
    
    bodyRatios: {
      height: { min: 0.05, max: 0.08 },  // Very thin
      width: { min: 0.06, max: 0.09 },
    },
    
    palettes: [
      { body: [0xf5f5dc, 0xe5e5cc, 0xd5d5bc], tentacle: [0xffffff, 0xf0f0f0, 0xe0e0e0], stripes: 0x8b4513 },
      { body: [0xfaebd7, 0xeadbc7, 0xdacbb7], tentacle: [0xffe4c4, 0xffd4b4, 0xffc4a4], stripes: 0x654321 },
    ],
    
    body: {
      shape: 'worm',
      segments: 8,
      taperFront: 0.6,
      taperBack: 0.5,
    },
    
    tentacles: {
      count: 15,
      lengthRatio: 0.08,
      thickness: 0.008,
      branching: true,
      pinnate: true,
    },
    
    features: {
      papillae: { density: 0, size: 0 },
      stripes: true,
      tubeFeet: { rows: 0, visible: false },
      anchor: true,  // Has anchor-shaped ossicles
    },
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DONKEY DUNG - Large, dark, common Caribbean species
  // ═══════════════════════════════════════════════════════════════════════════
  [SeaCucumberClass.DONKEY_DUNG]: {
    name: 'Donkey Dung Sea Cucumber',
    length: { min: 0.25, max: 0.50 },
    
    bodyRatios: {
      height: { min: 0.30, max: 0.40 },
      width: { min: 0.35, max: 0.45 },
    },
    
    palettes: [
      { body: [0x3d3d3d, 0x2d2d2d, 0x1d1d1d], tentacle: [0x696969, 0x595959, 0x494949] },
      { body: [0x4a4a4a, 0x3a3a3a, 0x2a2a2a], tentacle: [0x808080, 0x707070, 0x606060] },
    ],
    
    body: {
      shape: 'cylinder',
      segments: 3,
      taperFront: 0.70,
      taperBack: 0.75,
    },
    
    tentacles: {
      count: 10,
      lengthRatio: 0.15,
      thickness: 0.025,
      branching: false,
    },
    
    features: {
      papillae: { density: 0.2, size: 0.03 },
      tubeFeet: { rows: 3, visible: false },
      sand: true,  // Often covered in sand
    },
  },
}

// ============================================================================
// MESH GENERATION
// ============================================================================

const MAX_MESHES = 12

/**
 * Generate a procedural sea cucumber mesh
 */
export function generateSeaCucumber(seed, seaCucumberClass = null) {
  const rng = createRNG(seed)
  
  if (!seaCucumberClass) {
    const classes = Object.values(SeaCucumberClass)
    seaCucumberClass = pick(rng, classes)
  }
  
  const classDef = CLASS_DEFINITIONS[seaCucumberClass]
  if (!classDef) {
    console.warn(`Unknown sea cucumber class: ${seaCucumberClass}`)
    return null
  }
  
  const length = range(rng, classDef.length.min, classDef.length.max)
  const height = length * range(rng, classDef.bodyRatios.height.min, classDef.bodyRatios.height.max)
  const width = length * range(rng, classDef.bodyRatios.width.min, classDef.bodyRatios.width.max)
  
  const palette = pick(rng, classDef.palettes)
  const bodyColor = pick(rng, palette.body)
  const tentacleColor = pick(rng, palette.tentacle)
  
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.1,
    roughness: 0.8,
    transparent: classDef.body.translucent || false,
    opacity: classDef.body.translucent ? 0.85 : 1.0,
  })
  
  const tentacleMaterial = new THREE.MeshStandardMaterial({
    color: tentacleColor,
    metalness: 0.05,
    roughness: 0.7,
  })
  
  const cucumberGroup = new THREE.Group()
  const parts = {}
  let meshCount = 0
  
  function addMesh(mesh, name) {
    if (meshCount >= MAX_MESHES) return false
    mesh.castShadow = true
    mesh.receiveShadow = true
    cucumberGroup.add(mesh)
    parts[name] = mesh
    meshCount++
    return true
  }
  
  // === BODY ===
  const bodyDef = classDef.body
  const numSegments = Math.min(bodyDef.segments, 4)
  const segmentLen = length / numSegments
  
  for (let i = 0; i < numSegments && meshCount < MAX_MESHES; i++) {
    const t = i / (numSegments - 1 || 1)
    
    // Taper from front to back
    const frontTaper = bodyDef.taperFront
    const backTaper = bodyDef.taperBack
    const taper = frontTaper + (backTaper - frontTaper) * t
    
    // Slight bulge in middle
    const bulge = 0.9 + 0.2 * Math.sin(t * Math.PI)
    const segW = width * taper * bulge
    const segH = height * taper * bulge
    
    let segment
    if (bodyDef.shape === 'oval' || bodyDef.shape === 'plump') {
      // Spherical segments for sea apple, sea pig
      const segGeom = new THREE.SphereGeometry(segmentLen * 0.55, 8, 6)
      segment = new THREE.Mesh(segGeom, bodyMaterial)
      segment.scale.set(segW / segmentLen, segH / segmentLen, 1)
    } else if (bodyDef.shape === 'worm') {
      // Long thin worm shape - use cylinder
      const segGeom = new THREE.CylinderGeometry(segW * 0.5, segW * 0.5, segmentLen, 8)
      segment = new THREE.Mesh(segGeom, bodyMaterial)
      segment.rotation.x = Math.PI / 2  // Orient along Z
      segment.scale.set(1, segH / segW, 1)
    } else {
      // Standard cucumber - capsule shape
      const radius = Math.min(segW, segH) * 0.5
      const segGeom = new THREE.CapsuleGeometry(radius, segmentLen * 0.6, 4, 8)
      segment = new THREE.Mesh(segGeom, bodyMaterial)
      segment.rotation.x = Math.PI / 2  // Orient along Z
      segment.scale.set(segW / (radius * 2), segH / (radius * 2), 1)
    }
    
    // Position segments from front (-Z) to back (+Z)
    const zPos = -length * 0.5 + segmentLen * 0.5 + i * segmentLen * 0.85
    segment.position.set(0, 0, zPos)
    
    addMesh(segment, `body${i}`)
  }
  
  // === FEEDING TENTACLES ===
  // Tentacles ring around the mouth at the front (-Z), extending forward
  if (classDef.tentacles && meshCount < MAX_MESHES) {
    const tentLen = length * classDef.tentacles.lengthRatio
    const tentThick = length * classDef.tentacles.thickness
    const numTent = Math.min(classDef.tentacles.count, 8)
    
    const availableMeshes = MAX_MESHES - meshCount
    const tentsToAdd = Math.min(numTent, availableMeshes)
    
    // Mouth is at front of body
    const mouthZ = -length * 0.5
    const attachRadius = Math.min(width, height) * 0.35
    const spreadAngle = 0.5  // How much tentacles fan outward
    
    for (let i = 0; i < tentsToAdd && meshCount < MAX_MESHES; i++) {
      const ringAngle = (i / numTent) * Math.PI * 2
      
      // Cylinder with base at origin, extends along +Y
      const tentGeom = new THREE.CylinderGeometry(tentThick * 0.3, tentThick, tentLen, 4)
      tentGeom.translate(0, tentLen / 2, 0)
      
      const tentacle = new THREE.Mesh(tentGeom, tentacleMaterial)
      
      // Attach point in ring around mouth
      const attachX = Math.sin(ringAngle) * attachRadius
      const attachY = Math.cos(ringAngle) * attachRadius
      
      tentacle.position.set(attachX, attachY, mouthZ)
      
      // Point forward (-Z) and spread outward
      // Use rotation to fan tentacles out from center
      tentacle.rotation.order = 'YXZ'
      tentacle.rotation.x = -Math.PI / 2 + spreadAngle * Math.cos(ringAngle)  // Forward with up/down spread
      tentacle.rotation.y = -spreadAngle * Math.sin(ringAngle)  // Left/right spread
      
      addMesh(tentacle, `tentacle${i}`)
    }
  }
  
  // === LEGS (Sea Pig) ===
  if (classDef.legs && meshCount < MAX_MESHES) {
    const legLen = length * classDef.legs.lengthRatio
    const legThick = length * classDef.legs.thickness
    const numLegs = Math.min(classDef.legs.count, MAX_MESHES - meshCount)
    
    const legMaterial = new THREE.MeshStandardMaterial({
      color: palette.legs || tentacleColor,
      metalness: 0.05,
      roughness: 0.8,
    })
    
    for (let i = 0; i < numLegs && meshCount < MAX_MESHES; i++) {
      const side = i % 2 === 0 ? 1 : -1
      const zPos = -length * 0.3 + (Math.floor(i / 2) / (numLegs / 2)) * length * 0.6
      
      const legGeom = new THREE.CylinderGeometry(legThick * 0.5, legThick, legLen, 4)
      legGeom.translate(0, -legLen / 2, 0)
      
      const leg = new THREE.Mesh(legGeom, legMaterial)
      leg.position.set(side * width * 0.3, -height * 0.3, zPos)
      leg.rotation.z = side * 0.3
      
      addMesh(leg, `leg${i}`)
    }
  }
  
  // === SWIMMING VEIL (Medusa Worm) ===
  if (classDef.veil && classDef.veil.present && meshCount < MAX_MESHES) {
    const veilSize = length * classDef.veil.size
    
    const veilMaterial = new THREE.MeshStandardMaterial({
      color: palette.veil || 0xe6e6fa,
      metalness: 0.0,
      roughness: 0.5,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
    
    const veilGeom = new THREE.CircleGeometry(veilSize, 12)
    const veil = new THREE.Mesh(veilGeom, veilMaterial)
    veil.position.set(0, 0, 0)
    veil.rotation.x = Math.PI / 2
    addMesh(veil, 'veil')
  }
  
  cucumberGroup.rotation.order = 'YXZ'
  
  return {
    mesh: cucumberGroup,
    parts,
    seed,
    class: seaCucumberClass,
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

export function generateSeaCucumberOfClass(seaCucumberClass) {
  return generateSeaCucumber(randomSeed(), seaCucumberClass)
}

// ============================================================================
// CLASS METADATA HELPERS
// ============================================================================

export function getClassDisplayName(seaCucumberClass) {
  const meta = CLASS_METADATA[seaCucumberClass]
  if (!meta) return seaCucumberClass
  const def = CLASS_DEFINITIONS[seaCucumberClass]
  const name = def?.name || meta.scientificName
  return `${meta.emoji} ${name} (${meta.scientificName})`
}

export function getClassShortName(seaCucumberClass) {
  const def = CLASS_DEFINITIONS[seaCucumberClass]
  if (def?.name) return def.name
  const meta = CLASS_METADATA[seaCucumberClass]
  return meta?.scientificName || seaCucumberClass
}

export function getOrderedClasses() {
  return Object.values(SeaCucumberClass)
    .filter(cc => CLASS_METADATA[cc])
    .sort((a, b) => CLASS_METADATA[a].order - CLASS_METADATA[b].order)
}

export default {
  generateSeaCucumber,
  generateSeaCucumberOfClass,
  randomSeed,
  seedToString,
  stringToSeed,
  SeaCucumberClass,
  getClassDisplayName,
  getClassShortName,
  getOrderedClasses,
}