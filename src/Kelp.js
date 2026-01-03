/**
 * Kelp.js - Kelp and seagrass generation
 * 
 * Each kelp is a single continuous ribbon.
 * Scale factor controls all parameters together.
 */

import * as THREE from 'three'

// ============================================================================
// CONFIGURATION - EDIT HERE
// ============================================================================

export const KelpConfig = {
  
  // === RIBBON SHAPE ===
  ribbon: {
    baseWidth: 0.25,       // Width at scale 1
    taperAmount: 0.75,     // 0 = no taper, 1 = point at top
    segments: 14,          // Geometry detail
  },
  
  // === WAVINESS ===
  wave: {
    amount: 1.2,           // 0 = straight, 2+ = very wavy
    frequency: 2.5,        // Waves along length
    twist: 0.6,            // Ribbon twist amount
  },
  
  // === MATERIAL ===
  material: {
    roughness: 0.6,
    metalness: 0.05,
    opacity: 0.9,
  },
  
  // === COLORS ===
  colors: [
    0x2d5a27,  // Dark olive
    0x4a7c3f,  // Forest green
    0x3d6b35,  // Sea green
    0x4d6b3a,  // Kelp green
    0x5a7a4a,  // Medium green
    0x3a5c32,  // Deep green
  ],
  
  // === BASE VALUES (at scale = 1) ===
  base: {
    count: 10,             // Plants per cluster at scale 1
    radius: 3,             // Cluster radius at scale 1
    height: 15,            // Kelp height at scale 1
    spacing: 0.5,          // Min spacing at scale 1
  },
  
  // === SCALING EXPONENTS (how fast each grows with scale) ===
  // Value of 1.0 = linear scaling
  // Value of 0.5 = square root scaling (slower)
  // Value of 2.0 = quadratic scaling (faster)
  scaling: {
    count: 1.8,            // Count grows fast with scale
    radius: 0.7,           // Radius grows slower (keeps density)
    height: 0.5,           // Height grows slowest
    spacing: 0.3,          // Spacing grows very slow
    width: 0.4,            // Ribbon width grows slow
  },
  
  // === VARIATION ===
  variation: {
    height: 0.3,           // Height randomness within cluster
    countRange: 0.2,       // Count varies ±20%
  },
}

// ============================================================================
// SCALE PRESETS - EDIT THESE
// ============================================================================

export const ScalePreset = {
  // Tiny seagrass
  SEAGRASS_TINY:    0.3,
  SEAGRASS_SMALL:   0.5,
  SEAGRASS_MEDIUM:  0.8,
  
  // Kelp sizes
  KELP_SMALL:       1.0,
  KELP_MEDIUM:      1.5,
  KELP_LARGE:       2.5,
  KELP_HUGE:        4.0,
  KELP_COLOSSAL:    6.0,
  KELP_MEGA:        8.0,
}

// ============================================================================
// HELPER: Calculate scaled values
// ============================================================================

function getScaledValues(scale) {
  const cfg = KelpConfig
  const base = cfg.base
  const exp = cfg.scaling
  
  return {
    count: Math.round(base.count * Math.pow(scale, exp.count)),
    radius: base.radius * Math.pow(scale, exp.radius),
    height: base.height * Math.pow(scale, exp.height),
    spacing: base.spacing * Math.pow(scale, exp.spacing),
    width: cfg.ribbon.baseWidth * Math.pow(scale, exp.width),
  }
}

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

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

// ============================================================================
// RIBBON GEOMETRY
// ============================================================================

function createRibbonGeometry(height, width, rng) {
  const cfg = KelpConfig
  const segments = cfg.ribbon.segments
  
  const vertices = []
  const normals = []
  const uvs = []
  const indices = []
  
  const wavePhase = rng() * Math.PI * 2
  const waveDir = rng() * Math.PI * 2
  const twistDir = (rng() - 0.5) * 2
  
  // Scale wave with height
  const heightFactor = Math.min(height / 20, 1.5)
  const waveAmount = cfg.wave.amount * heightFactor
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const y = t * height
    
    // Taper width
    const w = width * (1 - t * cfg.ribbon.taperAmount)
    
    // Wave
    const waveStrength = t * t * waveAmount
    const wave = Math.sin(t * Math.PI * cfg.wave.frequency + wavePhase) * waveStrength
    const waveX = Math.cos(waveDir) * wave
    const waveZ = Math.sin(waveDir) * wave
    
    // Twist
    const twist = t * cfg.wave.twist * twistDir
    const cosT = Math.cos(twist)
    const sinT = Math.sin(twist)
    const halfW = w / 2
    
    vertices.push(-halfW * cosT + waveX, y, -halfW * sinT + waveZ)
    vertices.push(halfW * cosT + waveX, y, halfW * sinT + waveZ)
    
    normals.push(0, 0, 1, 0, 0, 1)
    uvs.push(0, t, 1, t)
  }
  
  for (let i = 0; i < segments; i++) {
    const row = i * 2
    indices.push(row, row + 1, row + 2)
    indices.push(row + 1, row + 3, row + 2)
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  return geometry
}

// ============================================================================
// KELP CREATION
// ============================================================================

/**
 * Create a single kelp ribbon
 * @param {object} options
 * @param {number} [options.height] - Kelp height
 * @param {number} [options.width] - Ribbon width
 * @param {number} [options.seed] - Random seed
 * @param {number} [options.color] - Override color (hex)
 */
export function createKelp(options = {}) {
  const {
    height = 15,
    width = KelpConfig.ribbon.baseWidth,
    seed = null,
    color = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const cfg = KelpConfig
  
  // Color
  const baseColor = color ?? pick(rng, cfg.colors)
  const kelpColor = new THREE.Color(baseColor)
  const hsl = {}
  kelpColor.getHSL(hsl)
  kelpColor.setHSL(
    hsl.h + (rng() - 0.5) * 0.04,
    hsl.s * (0.9 + rng() * 0.2),
    hsl.l * (0.85 + rng() * 0.3)
  )
  
  const geometry = createRibbonGeometry(height, width, rng)
  const material = new THREE.MeshStandardMaterial({
    color: kelpColor,
    roughness: cfg.material.roughness,
    metalness: cfg.material.metalness,
    transparent: true,
    opacity: cfg.material.opacity,
    side: THREE.DoubleSide,
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.y = rng() * Math.PI * 2
  
  mesh.userData.terrainType = 'kelp'
  mesh.userData.kelpHeight = height
  
  return mesh
}

/**
 * Create a kelp cluster with scale factor
 * @param {object} options
 * @param {number} [options.scale] - Scale factor (0.3 = tiny seagrass, 6.0 = colossal)
 * @param {number} [options.seed] - Random seed
 * @param {function} [options.getTerrainHeight] - Height function (x, z) => y
 * @param {number} [options.baseY] - Base Y if no height function
 */
export function createKelpCluster(options = {}) {
  const {
    scale = 1.0,
    seed = null,
    getTerrainHeight = null,
    baseY = 0,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const cfg = KelpConfig
  
  // Get scaled values
  const scaled = getScaledValues(scale)
  
  // Apply count variation
  const countVar = cfg.variation.countRange
  const count = Math.round(scaled.count * (1 + (rng() - 0.5) * countVar * 2))
  
  const group = new THREE.Group()
  const placed = []
  
  // Cluster color
  const clusterColor = pick(rng, cfg.colors)
  
  for (let i = 0; i < count; i++) {
    let x, z, attempts = 0
    
    do {
      const angle = rng() * Math.PI * 2
      const dist = Math.pow(rng(), 0.7) * scaled.radius
      x = Math.cos(angle) * dist
      z = Math.sin(angle) * dist
      attempts++
      
      let ok = true
      for (const p of placed) {
        const dx = x - p.x, dz = z - p.z
        if (Math.sqrt(dx*dx + dz*dz) < scaled.spacing) {
          ok = false
          break
        }
      }
      if (ok) break
    } while (attempts < 30)
    
    // Height variation
    const heightVar = cfg.variation.height
    const h = scaled.height * (1 + (rng() - 0.5) * heightVar * 2)
    
    // Width matches scale
    const w = scaled.width * (0.8 + rng() * 0.4)
    
    // Color variation
    const colorVar = new THREE.Color(clusterColor)
    const hsl = {}
    colorVar.getHSL(hsl)
    colorVar.setHSL(hsl.h, hsl.s, hsl.l * (0.85 + rng() * 0.3))
    
    const kelp = createKelp({
      height: h,
      width: w,
      seed: seed ? seed + i * 777 : null,
      color: colorVar.getHex(),
    })
    
    const y = getTerrainHeight ? getTerrainHeight(x, z) : baseY
    kelp.position.set(x, y, z)
    
    placed.push({ x, z })
    group.add(kelp)
  }
  
  group.userData.terrainType = 'kelpCluster'
  group.userData.scale = scale
  group.userData.plantCount = group.children.length
  group.userData.radius = scaled.radius
  
  return group
}

/**
 * Create a kelp forest with multiple clusters
 * @param {object} options
 * @param {number} [options.forestRadius] - Forest spread
 * @param {Array} [options.scales] - Array of { scale, weight } to spawn
 * @param {number} [options.totalClusters] - Total clusters
 * @param {number} [options.seed] - Random seed
 * @param {function} [options.getTerrainHeight] - Height function
 * @param {number} [options.baseY] - Base Y
 */
export function createKelpForest(options = {}) {
  const {
    forestRadius = 50,
    scales = [
      { scale: ScalePreset.SEAGRASS_SMALL, weight: 2 },
      { scale: ScalePreset.KELP_SMALL, weight: 3 },
      { scale: ScalePreset.KELP_MEDIUM, weight: 2 },
      { scale: ScalePreset.KELP_LARGE, weight: 1 },
    ],
    totalClusters = 8,
    seed = null,
    getTerrainHeight = null,
    baseY = 0,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  // Build weighted list
  const weighted = []
  for (const { scale, weight } of scales) {
    for (let i = 0; i < weight; i++) weighted.push(scale)
  }
  
  const positions = []
  
  for (let i = 0; i < totalClusters; i++) {
    const scale = pick(rng, weighted)
    const scaled = getScaledValues(scale)
    const minSpacing = scaled.radius * 2 + 2
    
    let x, z, attempts = 0
    do {
      const angle = rng() * Math.PI * 2
      const dist = Math.pow(rng(), 0.5) * forestRadius
      x = Math.cos(angle) * dist
      z = Math.sin(angle) * dist
      attempts++
      
      let ok = true
      for (const p of positions) {
        const dx = x - p.x, dz = z - p.z
        if (Math.sqrt(dx*dx + dz*dz) < minSpacing + p.radius) {
          ok = false
          break
        }
      }
      if (ok) break
    } while (attempts < 25)
    
    const cluster = createKelpCluster({
      scale,
      seed: seed ? seed + i * 999 : null,
      getTerrainHeight: getTerrainHeight
        ? (lx, lz) => getTerrainHeight(x + lx, z + lz)
        : null,
      baseY,
    })
    
    cluster.position.set(x, 0, z)
    positions.push({ x, z, radius: scaled.radius })
    group.add(cluster)
  }
  
  group.userData.terrainType = 'kelpForest'
  group.userData.clusterCount = group.children.length
  
  return group
}

// ============================================================================
// SHORTHAND CREATORS
// ============================================================================

export const createSeagrassTiny = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.SEAGRASS_TINY })

export const createSeagrassSmall = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.SEAGRASS_SMALL })

export const createSeagrassMedium = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.SEAGRASS_MEDIUM })

export const createKelpSmall = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_SMALL })

export const createKelpMedium = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_MEDIUM })

export const createKelpLarge = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_LARGE })

export const createKelpHuge = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_HUGE })

export const createKelpColossal = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_COLOSSAL })

export const createKelpMega = (opts = {}) => 
  createKelpCluster({ ...opts, scale: ScalePreset.KELP_MEGA })

// ============================================================================
// UTILITIES
// ============================================================================

/** Get what values a scale produces (for debugging/tuning) */
export function previewScale(scale) {
  return getScaledValues(scale)
}

/** Cull kelp inside boulders */
export function cullKelpInBoulders(kelpGroup, boulders) {
  if (!boulders?.length) return 0
  
  const toRemove = []
  
  const check = (obj, wx = 0, wz = 0) => {
    if (obj.userData?.terrainType === 'kelp') {
      const kx = wx + obj.position.x
      const kz = wz + obj.position.z
      
      for (const b of boulders) {
        const bx = b.x ?? b.mesh?.position?.x ?? 0
        const bz = b.z ?? b.mesh?.position?.z ?? 0
        const size = b.size ?? 1
        
        const dx = kx - bx, dz = kz - bz
        if (Math.sqrt(dx*dx + dz*dz) < size * 0.7) {
          toRemove.push({ obj, parent: obj.parent })
          break
        }
      }
    } else if (obj.children) {
      for (const c of obj.children) {
        check(c, wx + obj.position.x, wz + obj.position.z)
      }
    }
  }
  
  check(kelpGroup)
  
  for (const { obj, parent } of toRemove) {
    parent?.remove(obj)
    obj.geometry?.dispose()
    obj.material?.dispose()
  }
  
  return toRemove.length
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  KelpConfig,
  ScalePreset,
  previewScale,
  createKelp,
  createKelpCluster,
  createKelpForest,
  createSeagrassTiny,
  createSeagrassSmall,
  createSeagrassMedium,
  createKelpSmall,
  createKelpMedium,
  createKelpLarge,
  createKelpHuge,
  createKelpColossal,
  createKelpMega,
  cullKelpInBoulders,
}