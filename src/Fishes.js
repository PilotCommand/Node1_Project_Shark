/**
 * Fishes.js - Procedural fish generation
 * 
 * Each fish is determined by a numeric seed. Same seed = same fish.
 * This allows saving/sharing fish designs and ensuring uniqueness.
 */

import * as THREE from 'three'

// Seeded random number generator (Mulberry32)
function createRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Helper to get random in range using seeded RNG
function range(rng, min, max) {
  return min + rng() * (max - min)
}

// Helper to pick from array using seeded RNG
function pick(rng, array) {
  return array[Math.floor(rng() * array.length)]
}

// Color palettes for fish
const COLOR_PALETTES = [
  // Tropical
  { body: [0xff6600, 0xff8800, 0xffaa00], fin: [0xff8833, 0xffaa55, 0xffcc77] },
  // Ocean blue
  { body: [0x0066cc, 0x0088ff, 0x00aaff], fin: [0x00ccff, 0x66ddff, 0x99eeff] },
  // Reef pink
  { body: [0xff66aa, 0xff88cc, 0xffaadd], fin: [0xff99cc, 0xffbbdd, 0xffddee] },
  // Deep purple
  { body: [0x6600cc, 0x8800ff, 0xaa33ff], fin: [0xbb66ff, 0xcc88ff, 0xddaaff] },
  // Toxic green
  { body: [0x00cc66, 0x00ff88, 0x33ffaa], fin: [0x66ffbb, 0x88ffcc, 0xaaffdd] },
  // Golden
  { body: [0xccaa00, 0xffcc00, 0xffdd33], fin: [0xffee66, 0xffff88, 0xffffaa] },
  // Blood red
  { body: [0xcc0000, 0xff0000, 0xff3333], fin: [0xff6666, 0xff8888, 0xffaaaa] },
  // Silver
  { body: [0x888899, 0xaaaabb, 0xccccdd], fin: [0xddddee, 0xeeeeff, 0xffffff] },
  // Sunset
  { body: [0xff4400, 0xff6600, 0xff8800], fin: [0xffaa00, 0xffcc00, 0xffee00] },
  // Midnight
  { body: [0x000033, 0x000066, 0x000099], fin: [0x0000cc, 0x3333ff, 0x6666ff] },
]

// Preset seeds for saved fish designs
export const FISH_PRESETS = {
  // The original starter fish
  STARTER: 0x5461524E,  // "STRN" in hex - we'll tune this to match original
  
  // Some interesting ones we might find
  NEMO: null,
  DORY: null,
  SHARK: null,
}

/**
 * Generate a fish mesh from a numeric seed
 * @param {number} seed - The seed determining fish appearance
 * @returns {{ mesh: THREE.Group, parts: object, seed: number, traits: object }}
 */
export function generateFish(seed) {
  const rng = createRNG(seed)
  
  // Generate all traits from seed
  const traits = {
    // Color
    palette: pick(rng, COLOR_PALETTES),
    bodyColorIndex: Math.floor(rng() * 3),
    finColorIndex: Math.floor(rng() * 3),
    
    // Size
    scale: range(rng, 0.6, 1.8),
    
    // Body proportions
    bodyLength: range(rng, 1.2, 2.0),
    bodyHeight: range(rng, 0.4, 0.7),
    bodyWidth: range(rng, 0.6, 1.0),
    
    // Head
    headSize: range(rng, 0.7, 1.2),
    headOffset: range(rng, 0.8, 1.1),
    
    // Tail
    tailHeight: range(rng, 0.4, 0.9),
    tailWidth: range(rng, 0.08, 0.15),
    tailAngle: range(rng, 0.3, 0.7),
    
    // Dorsal fin
    dorsalHeight: range(rng, 0.3, 0.6),
    dorsalLength: range(rng, 0.4, 0.8),
    dorsalOffset: range(rng, -0.2, 0.2),
    
    // Side fins
    sideFinSize: range(rng, 0.3, 0.7),
    sideFinAngle: range(rng, 0.3, 0.7),
    sideFinOffset: range(rng, -0.3, 0.0),
    
    // Style
    metallic: rng() > 0.7,
    roughness: range(rng, 0.4, 0.9),
    emissive: rng() > 0.8,
    emissiveIntensity: range(rng, 0.05, 0.2),
  }
  
  // Extract colors from palette
  const bodyColor = traits.palette.body[traits.bodyColorIndex]
  const finColor = traits.palette.fin[traits.finColorIndex]
  
  // Build the fish
  const fishGroup = new THREE.Group()
  
  // Materials
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: traits.metallic ? 0.6 : 0.3,
    roughness: traits.roughness,
    emissive: traits.emissive ? bodyColor : 0x000000,
    emissiveIntensity: traits.emissive ? traits.emissiveIntensity : 0
  })
  
  const finMaterial = new THREE.MeshStandardMaterial({
    color: finColor,
    metalness: traits.metallic ? 0.5 : 0.2,
    roughness: traits.roughness + 0.1,
    emissive: traits.emissive ? finColor : 0x000000,
    emissiveIntensity: traits.emissive ? traits.emissiveIntensity * 0.5 : 0
  })
  
  // 1. Main body
  const bodyGeometry = new THREE.BoxGeometry(
    traits.bodyWidth,
    traits.bodyHeight,
    traits.bodyLength
  )
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  fishGroup.add(body)
  
  // 2. Head
  const headGeometry = new THREE.BoxGeometry(
    traits.bodyWidth * traits.headSize * 0.75,
    traits.bodyHeight * traits.headSize * 0.8,
    traits.bodyLength * 0.35
  )
  const head = new THREE.Mesh(headGeometry, bodyMaterial)
  head.position.set(0, 0, -traits.bodyLength * 0.5 * traits.headOffset)
  fishGroup.add(head)
  
  // 3. Tail
  const tailGeometry = new THREE.BoxGeometry(
    traits.tailWidth,
    traits.tailHeight,
    traits.bodyLength * 0.35
  )
  const tail = new THREE.Mesh(tailGeometry, finMaterial)
  tail.position.set(0, 0, traits.bodyLength * 0.65)
  tail.rotation.x = traits.tailAngle
  fishGroup.add(tail)
  
  // 4. Dorsal fin
  const dorsalGeometry = new THREE.BoxGeometry(
    0.08,
    traits.dorsalHeight,
    traits.dorsalLength
  )
  const dorsalFin = new THREE.Mesh(dorsalGeometry, finMaterial)
  dorsalFin.position.set(0, traits.bodyHeight * 0.5 + traits.dorsalHeight * 0.4, traits.dorsalOffset)
  fishGroup.add(dorsalFin)
  
  // 5. Left side fin
  const leftFinGeometry = new THREE.BoxGeometry(
    traits.sideFinSize,
    0.08,
    traits.sideFinSize * 0.6
  )
  const leftFin = new THREE.Mesh(leftFinGeometry, finMaterial)
  leftFin.position.set(
    -traits.bodyWidth * 0.5 - traits.sideFinSize * 0.3,
    -traits.bodyHeight * 0.2,
    traits.sideFinOffset
  )
  leftFin.rotation.z = -traits.sideFinAngle
  fishGroup.add(leftFin)
  
  // 6. Right side fin
  const rightFinGeometry = new THREE.BoxGeometry(
    traits.sideFinSize,
    0.08,
    traits.sideFinSize * 0.6
  )
  const rightFin = new THREE.Mesh(rightFinGeometry, finMaterial)
  rightFin.position.set(
    traits.bodyWidth * 0.5 + traits.sideFinSize * 0.3,
    -traits.bodyHeight * 0.2,
    traits.sideFinOffset
  )
  rightFin.rotation.z = traits.sideFinAngle
  fishGroup.add(rightFin)
  
  // Apply overall scale
  fishGroup.scale.setScalar(traits.scale)
  
  // Set rotation order for proper 3D rotation
  fishGroup.rotation.order = 'YXZ'
  
  return {
    mesh: fishGroup,
    parts: {
      body,
      head,
      tail,
      dorsalFin,
      leftFin,
      rightFin
    },
    seed,
    traits
  }
}

/**
 * Generate the original starter fish (matches the original design)
 * This is a hand-tuned version that looks like the original
 */
export function generateStarterFish() {
  const fishGroup = new THREE.Group()
  
  // Original colors
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
  
  // 1. Main body - rectangular prism
  const bodyGeometry = new THREE.BoxGeometry(0.8, 0.5, 1.5)
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  fishGroup.add(body)
  
  // 2. Head - tapered box at front
  const headGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.5)
  const head = new THREE.Mesh(headGeometry, bodyMaterial)
  head.position.set(0, 0, -0.9)
  fishGroup.add(head)
  
  // 3. Tail - flat triangle shape
  const tailGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.5)
  const tail = new THREE.Mesh(tailGeometry, finMaterial)
  tail.position.set(0, 0, 1.0)
  tail.rotation.x = Math.PI / 6
  fishGroup.add(tail)
  
  // 4. Dorsal fin (top)
  const dorsalGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.6)
  const dorsalFin = new THREE.Mesh(dorsalGeometry, finMaterial)
  dorsalFin.position.set(0, 0.4, 0)
  fishGroup.add(dorsalFin)
  
  // 5. Left side fin
  const leftFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
  const leftFin = new THREE.Mesh(leftFinGeometry, finMaterial)
  leftFin.position.set(-0.5, -0.1, -0.2)
  leftFin.rotation.z = -Math.PI / 6
  fishGroup.add(leftFin)
  
  // 6. Right side fin
  const rightFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
  const rightFin = new THREE.Mesh(rightFinGeometry, finMaterial)
  rightFin.position.set(0.5, -0.1, -0.2)
  rightFin.rotation.z = Math.PI / 6
  fishGroup.add(rightFin)
  
  fishGroup.rotation.order = 'YXZ'
  
  return {
    mesh: fishGroup,
    parts: {
      body,
      head,
      tail,
      dorsalFin,
      leftFin,
      rightFin
    },
    seed: FISH_PRESETS.STARTER,
    traits: { preset: 'STARTER' }
  }
}

/**
 * Generate a random seed
 * @returns {number}
 */
export function randomSeed() {
  return Math.floor(Math.random() * 0xFFFFFFFF)
}

/**
 * Convert seed to shareable string (hex)
 * @param {number} seed
 * @returns {string}
 */
export function seedToString(seed) {
  return seed.toString(16).toUpperCase().padStart(8, '0')
}

/**
 * Parse seed from string
 * @param {string} str
 * @returns {number}
 */
export function stringToSeed(str) {
  return parseInt(str, 16)
}

export default {
  generateFish,
  generateStarterFish,
  randomSeed,
  seedToString,
  stringToSeed,
  FISH_PRESETS
}
