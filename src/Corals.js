/**
 * Corals.js - Coral reef generation
 * 
 * Creates coral reef clusters with unusual prisms and tropical colors.
 */

import * as THREE from 'three'

// ============================================================================
// SEEDED RANDOM HELPERS
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

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CoralConfig = {
  roughness: 0.8,
  metalness: 0.1,
  
  // Tropical coral colors
  colors: [
    0xff6b9d,  // Hot pink
    0xff8c69,  // Salmon/coral
    0xffa500,  // Orange
    0xffdb58,  // Mustard yellow
    0x9370db,  // Medium purple
    0x00cdb7,  // Teal/turquoise
    0xff4757,  // Red-pink
    0xc9a0dc,  // Lavender
    0xf0e68c,  // Khaki/pale yellow
    0x20b2aa,  // Light sea green
    0xff7f50,  // Coral (the color!)
    0xdda0dd,  // Plum
  ],
}

// ============================================================================
// CORAL TYPES
// ============================================================================

export const CoralType = {
  BRANCHING: 'branching',     // Tree-like branching coral
  FAN: 'fan',                 // Flat fan/plate coral
  TUBE: 'tube',               // Tall tube/pillar coral
  BRAIN: 'brain',             // Bumpy spherical brain coral
  STAGHORN: 'staghorn',       // Spiky antler-like coral
  MUSHROOM: 'mushroom',       // Wide top, narrow base
  RANDOM: 'random',
}

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

/**
 * Create a tapered prism (narrower at top)
 */
function createTaperedPrism(rng, baseRadius, topRadius, height, sides) {
  const shape = new THREE.Shape()
  
  // Create irregular polygon base
  const basePoints = []
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2
    const variation = 0.7 + rng() * 0.6
    const r = baseRadius * variation
    basePoints.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r
    })
  }
  
  // Build shape
  basePoints.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y)
    else shape.lineTo(p.x, p.y)
  })
  shape.closePath()
  
  // Custom extrude with taper
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  const normals = []
  
  const segments = 3
  for (let s = 0; s < segments; s++) {
    const t0 = s / segments
    const t1 = (s + 1) / segments
    const r0 = baseRadius + (topRadius - baseRadius) * t0
    const r1 = baseRadius + (topRadius - baseRadius) * t1
    const y0 = height * t0
    const y1 = height * t1
    const scale0 = r0 / baseRadius
    const scale1 = r1 / baseRadius
    
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides
      
      // Get scaled points
      const p0 = basePoints[i]
      const p1 = basePoints[i2]
      
      // Bottom quad vertices
      const v0 = { x: p0.x * scale0, y: y0, z: p0.y * scale0 }
      const v1 = { x: p1.x * scale0, y: y0, z: p1.y * scale0 }
      const v2 = { x: p1.x * scale1, y: y1, z: p1.y * scale1 }
      const v3 = { x: p0.x * scale1, y: y1, z: p0.y * scale1 }
      
      // Two triangles for quad
      vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
      vertices.push(v0.x, v0.y, v0.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z)
      
      // Calculate normal
      const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z }
      const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z }
      const nx = edge1.y * edge2.z - edge1.z * edge2.y
      const ny = edge1.z * edge2.x - edge1.x * edge2.z
      const nz = edge1.x * edge2.y - edge1.y * edge2.x
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1
      
      for (let n = 0; n < 6; n++) {
        normals.push(nx/len, ny/len, nz/len)
      }
    }
  }
  
  // Add top cap
  const topY = height
  const topScale = topRadius / baseRadius
  const centerTop = { x: 0, y: topY, z: 0 }
  
  for (let i = 0; i < sides; i++) {
    const i2 = (i + 1) % sides
    const p0 = basePoints[i]
    const p1 = basePoints[i2]
    
    vertices.push(
      centerTop.x, centerTop.y, centerTop.z,
      p1.x * topScale, topY, p1.y * topScale,
      p0.x * topScale, topY, p0.y * topScale
    )
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
  }
  
  // Add bottom cap
  const centerBot = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < sides; i++) {
    const i2 = (i + 1) % sides
    const p0 = basePoints[i]
    const p1 = basePoints[i2]
    
    vertices.push(
      centerBot.x, centerBot.y, centerBot.z,
      p0.x, 0, p0.y,
      p1.x, 0, p1.y
    )
    normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0)
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  
  return geometry
}

/**
 * Create a branching coral structure
 */
function createBranchingCoral(rng, size) {
  const group = new THREE.Group()
  
  // Main trunk
  const trunkHeight = size * (0.8 + rng() * 0.4)
  const trunkRadius = size * 0.15
  const trunkGeo = createTaperedPrism(rng, trunkRadius, trunkRadius * 0.6, trunkHeight, 5 + Math.floor(rng() * 3))
  
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  const trunk = new THREE.Mesh(trunkGeo, material)
  group.add(trunk)
  
  // Add branches
  const branchCount = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < branchCount; i++) {
    const branchHeight = size * (0.3 + rng() * 0.4)
    const branchRadius = trunkRadius * (0.4 + rng() * 0.3)
    const branchGeo = createTaperedPrism(rng, branchRadius, branchRadius * 0.3, branchHeight, 4 + Math.floor(rng() * 2))
    
    const branch = new THREE.Mesh(branchGeo, material)
    
    // Position along trunk
    const heightOnTrunk = trunkHeight * (0.3 + rng() * 0.5)
    const angle = rng() * Math.PI * 2
    const tilt = Math.PI * 0.15 + rng() * Math.PI * 0.25
    
    branch.position.set(0, heightOnTrunk, 0)
    branch.rotation.set(0, 0, tilt)
    branch.rotation.y = angle
    
    group.add(branch)
    
    // Sub-branches
    if (rng() > 0.5) {
      const subBranchGeo = createTaperedPrism(rng, branchRadius * 0.5, branchRadius * 0.2, branchHeight * 0.5, 4)
      const subBranch = new THREE.Mesh(subBranchGeo, material)
      subBranch.position.set(0, heightOnTrunk + branchHeight * 0.3, 0)
      subBranch.rotation.set(0, angle + Math.PI * 0.3, tilt * 1.3)
      group.add(subBranch)
    }
  }
  
  return group
}

/**
 * Create a fan/plate coral
 */
function createFanCoral(rng, size) {
  const group = new THREE.Group()
  
  // Create flat fan shape using multiple thin prisms
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  
  // Base/stem
  const stemHeight = size * 0.3
  const stemGeo = createTaperedPrism(rng, size * 0.1, size * 0.08, stemHeight, 5)
  const stem = new THREE.Mesh(stemGeo, material)
  group.add(stem)
  
  // Fan plates
  const plateCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < plateCount; i++) {
    const plateWidth = size * (0.6 + rng() * 0.4)
    const plateHeight = size * (0.5 + rng() * 0.3)
    const plateThickness = size * 0.03
    
    const plateGeo = new THREE.BoxGeometry(plateWidth, plateHeight, plateThickness)
    const plate = new THREE.Mesh(plateGeo, material)
    
    plate.position.y = stemHeight + plateHeight * 0.4
    plate.rotation.y = (i / plateCount) * Math.PI + rng() * 0.3
    plate.rotation.x = -0.2 + rng() * 0.4
    
    group.add(plate)
  }
  
  return group
}

/**
 * Create a tube coral
 */
function createTubeCoral(rng, size) {
  const group = new THREE.Group()
  
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  // Create cluster of tubes
  const tubeCount = 4 + Math.floor(rng() * 5)
  
  for (let i = 0; i < tubeCount; i++) {
    const tubeHeight = size * (0.5 + rng() * 0.8)
    const tubeRadius = size * (0.08 + rng() * 0.1)
    const sides = 5 + Math.floor(rng() * 3)
    
    // Tube with slight flare at top
    const tubeGeo = createTaperedPrism(rng, tubeRadius, tubeRadius * (1.1 + rng() * 0.3), tubeHeight, sides)
    const tube = new THREE.Mesh(tubeGeo, material)
    
    // Cluster position
    const angle = rng() * Math.PI * 2
    const dist = rng() * size * 0.3
    tube.position.set(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    )
    
    // Slight random tilt
    tube.rotation.x = (rng() - 0.5) * 0.2
    tube.rotation.z = (rng() - 0.5) * 0.2
    
    group.add(tube)
  }
  
  return group
}

/**
 * Create a brain coral (bumpy sphere)
 */
function createBrainCoral(rng, size) {
  // Start with icosahedron and displace vertices
  const detail = 2
  const geometry = new THREE.IcosahedronGeometry(size * 0.5, detail)
  
  const positions = geometry.attributes.position.array
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    
    // Add bumpy displacement
    const dist = Math.sqrt(x*x + y*y + z*z)
    const theta = Math.atan2(z, x)
    const phi = Math.acos(y / dist)
    
    const bump = 1 + Math.sin(theta * 8) * Math.cos(phi * 6) * 0.15
    const noise = 1 + (rng() - 0.5) * 0.1
    
    const scale = bump * noise
    positions[i] *= scale
    positions[i + 1] *= scale
    positions[i + 2] *= scale
  }
  
  geometry.attributes.position.needsUpdate = true
  geometry.computeVertexNormals()
  
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = size * 0.3  // Lift so it sits on ground
  
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

/**
 * Create staghorn coral (spiky antler-like)
 */
function createStaghornCoral(rng, size) {
  const group = new THREE.Group()
  
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  // Create many spiky protrusions
  const spikeCount = 8 + Math.floor(rng() * 8)
  
  for (let i = 0; i < spikeCount; i++) {
    const spikeHeight = size * (0.4 + rng() * 0.6)
    const spikeRadius = size * (0.04 + rng() * 0.06)
    
    const spikeGeo = createTaperedPrism(rng, spikeRadius, spikeRadius * 0.1, spikeHeight, 4)
    const spike = new THREE.Mesh(spikeGeo, material)
    
    // Radiate outward from center
    const angle = (i / spikeCount) * Math.PI * 2 + rng() * 0.5
    const tilt = Math.PI * 0.1 + rng() * Math.PI * 0.3
    const dist = rng() * size * 0.15
    
    spike.position.set(
      Math.cos(angle) * dist,
      rng() * size * 0.2,
      Math.sin(angle) * dist
    )
    spike.rotation.set(tilt * Math.cos(angle), 0, tilt * Math.sin(angle))
    
    group.add(spike)
  }
  
  return group
}

/**
 * Create mushroom coral (wide top, narrow base)
 */
function createMushroomCoral(rng, size) {
  const group = new THREE.Group()
  
  const color = pick(rng, CoralConfig.colors)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  // Stem
  const stemHeight = size * (0.3 + rng() * 0.2)
  const stemRadius = size * 0.1
  const stemGeo = createTaperedPrism(rng, stemRadius, stemRadius * 1.2, stemHeight, 6)
  const stem = new THREE.Mesh(stemGeo, material)
  group.add(stem)
  
  // Cap
  const capRadius = size * (0.4 + rng() * 0.2)
  const capHeight = size * (0.15 + rng() * 0.1)
  const capGeo = createTaperedPrism(rng, capRadius * 0.3, capRadius, capHeight, 8 + Math.floor(rng() * 4))
  const cap = new THREE.Mesh(capGeo, material)
  cap.position.y = stemHeight
  group.add(cap)
  
  return group
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a single coral
 * @param {object} options
 * @param {number} [options.size=1] - Base coral size
 * @param {string} [options.type='random'] - Coral type
 * @param {number} [options.seed] - Random seed
 * @returns {THREE.Group}
 */
export function createCoral(options = {}) {
  const {
    size = 1,
    type = CoralType.RANDOM,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  
  let coralType = type
  if (type === CoralType.RANDOM) {
    const types = [
      CoralType.BRANCHING,
      CoralType.BRANCHING,  // Weighted
      CoralType.FAN,
      CoralType.TUBE,
      CoralType.TUBE,       // Weighted
      CoralType.BRAIN,
      CoralType.STAGHORN,
      CoralType.MUSHROOM,
    ]
    coralType = pick(rng, types)
  }
  
  let coral
  switch (coralType) {
    case CoralType.BRANCHING:
      coral = createBranchingCoral(rng, size)
      break
    case CoralType.FAN:
      coral = createFanCoral(rng, size)
      break
    case CoralType.TUBE:
      coral = createTubeCoral(rng, size)
      break
    case CoralType.BRAIN:
      coral = createBrainCoral(rng, size)
      break
    case CoralType.STAGHORN:
      coral = createStaghornCoral(rng, size)
      break
    case CoralType.MUSHROOM:
      coral = createMushroomCoral(rng, size)
      break
    default:
      coral = createBranchingCoral(rng, size)
  }
  
  // Random rotation
  coral.rotation.y = rng() * Math.PI * 2
  
  // Mark for identification
  coral.userData.terrainType = 'coral'
  coral.userData.coralType = coralType
  coral.userData.baseSize = size
  
  return coral
}

/**
 * Create a coral reef cluster
 * @param {object} options
 * @param {number} [options.count=10] - Number of corals
 * @param {number} [options.spread=5] - Spread radius
 * @param {number} [options.minSize=0.5] - Minimum coral size
 * @param {number} [options.maxSize=2] - Maximum coral size
 * @param {number} [options.seed] - Random seed
 * @returns {THREE.Group}
 */
export function createCoralReef(options = {}) {
  const {
    count = 10,
    spread = 5,
    minSize = 0.5,
    maxSize = 2,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  for (let i = 0; i < count; i++) {
    const size = range(rng, minSize, maxSize)
    const coral = createCoral({
      size,
      type: CoralType.RANDOM,
      seed: seed ? seed + i * 7777 : null,
    })
    
    // Position within spread (clustered toward center)
    const angle = rng() * Math.PI * 2
    const dist = Math.pow(rng(), 0.7) * spread  // Clustered distribution
    coral.position.set(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    )
    
    group.add(coral)
  }
  
  group.userData.terrainType = 'coralReef'
  
  return group
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  CoralConfig,
  CoralType,
  createCoral,
  createCoralReef,
}
