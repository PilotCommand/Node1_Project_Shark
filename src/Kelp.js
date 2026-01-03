/**
 * Kelp.js - Kelp and seagrass generation
 * 
 * Each kelp is a single continuous ribbon.
 * Multiple size presets from tiny seagrass to colossal kelp forests.
 */

import * as THREE from 'three'

// ============================================================================
// CONFIGURATION - EDIT HERE
// ============================================================================

export const KelpConfig = {
  
  // === RIBBON SHAPE ===
  ribbon: {
    width: 0.35,           // Base width
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
}

// ============================================================================
// CLUSTER PRESETS - EDIT THESE FOR DIFFERENT SIZES
// ============================================================================

export const ClusterPreset = {
  
  // Tiny seagrass patch
  SEAGRASS_TINY: {
    name: 'seagrass_tiny',
    count: { min: 3, max: 6 },
    radius: { min: 1, max: 2 },
    height: { min: 2, max: 5 },
    spacing: 0.3,
    heightVariation: 0.3,
  },
  
  // Small seagrass cluster
  SEAGRASS_SMALL: {
    name: 'seagrass_small',
    count: { min: 5, max: 10 },
    radius: { min: 1.5, max: 3 },
    height: { min: 3, max: 8 },
    spacing: 0.35,
    heightVariation: 0.35,
  },
  
  // Medium seagrass patch
  SEAGRASS_MEDIUM: {
    name: 'seagrass_medium',
    count: { min: 10, max: 20 },
    radius: { min: 2, max: 4 },
    height: { min: 4, max: 10 },
    spacing: 0.4,
    heightVariation: 0.3,
  },
  
  // Small kelp cluster
  KELP_SMALL: {
    name: 'kelp_small',
    count: { min: 8, max: 15 },
    radius: { min: 2, max: 4 },
    height: { min: 12, max: 25 },
    spacing: 0.5,
    heightVariation: 0.3,
  },
  
  // Medium kelp cluster
  KELP_MEDIUM: {
    name: 'kelp_medium',
    count: { min: 15, max: 30 },
    radius: { min: 4, max: 7 },
    height: { min: 20, max: 40 },
    spacing: 0.6,
    heightVariation: 0.35,
  },
  
  // Large kelp forest
  KELP_LARGE: {
    name: 'kelp_large',
    count: { min: 35, max: 55 },
    radius: { min: 6, max: 10 },
    height: { min: 25, max: 50 },
    spacing: 0.7,
    heightVariation: 0.3,
  },
  
  // Huge kelp forest
  KELP_HUGE: {
    name: 'kelp_huge',
    count: { min: 55, max: 80 },
    radius: { min: 10, max: 15 },
    height: { min: 30, max: 55 },
    spacing: 0.8,
    heightVariation: 0.35,
  },
  
  // Colossal kelp forest
  KELP_COLOSSAL: {
    name: 'kelp_colossal',
    count: { min: 80, max: 120 },
    radius: { min: 12, max: 20 },
    height: { min: 35, max: 60 },
    spacing: 0.9,
    heightVariation: 0.4,
  },
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

function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1))
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

// ============================================================================
// RIBBON GEOMETRY
// ============================================================================

function createRibbonGeometry(height, rng) {
  const cfg = KelpConfig
  const segments = cfg.ribbon.segments
  
  const vertices = []
  const normals = []
  const uvs = []
  const indices = []
  
  const wavePhase = rng() * Math.PI * 2
  const waveDir = rng() * Math.PI * 2
  const twistDir = (rng() - 0.5) * 2
  
  // Scale wave amount with height (taller = more wave)
  const heightFactor = Math.min(height / 30, 1.5)
  const waveAmount = cfg.wave.amount * heightFactor
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const y = t * height
    
    // Width (tapers toward top)
    const width = cfg.ribbon.width * (1 - t * cfg.ribbon.taperAmount)
    
    // Wave (increases toward top)
    const waveStrength = t * t * waveAmount
    const wave = Math.sin(t * Math.PI * cfg.wave.frequency + wavePhase) * waveStrength
    const waveX = Math.cos(waveDir) * wave
    const waveZ = Math.sin(waveDir) * wave
    
    // Twist
    const twist = t * cfg.wave.twist * twistDir
    const cosT = Math.cos(twist)
    const sinT = Math.sin(twist)
    const halfW = width / 2
    
    // Left vertex
    vertices.push(-halfW * cosT + waveX, y, -halfW * sinT + waveZ)
    // Right vertex
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
 * @param {number} [options.seed] - Random seed
 * @param {number} [options.color] - Override color (hex)
 */
export function createKelp(options = {}) {
  const {
    height = 20,
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
  
  // Geometry & Material
  const geometry = createRibbonGeometry(height, rng)
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
 * Create a kelp cluster using a preset
 * @param {object} options
 * @param {object} [options.preset] - ClusterPreset (default: KELP_MEDIUM)
 * @param {number} [options.count] - Override count
 * @param {number} [options.radius] - Override radius
 * @param {number} [options.height] - Override base height
 * @param {number} [options.seed] - Random seed
 * @param {function} [options.getTerrainHeight] - Height function (x, z) => y
 * @param {number} [options.baseY] - Base Y if no height function
 */
export function createKelpCluster(options = {}) {
  const {
    preset = ClusterPreset.KELP_MEDIUM,
    count = null,
    radius = null,
    height = null,
    seed = null,
    getTerrainHeight = null,
    baseY = 0,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  
  // Resolve values from preset or overrides
  const clusterCount = count ?? rangeInt(rng, preset.count.min, preset.count.max)
  const clusterRadius = radius ?? range(rng, preset.radius.min, preset.radius.max)
  const baseHeight = height ?? range(rng, preset.height.min, preset.height.max)
  const spacing = preset.spacing
  const heightVar = preset.heightVariation
  
  const group = new THREE.Group()
  const placed = []
  
  // Cluster color
  const clusterColor = pick(rng, KelpConfig.colors)
  
  for (let i = 0; i < clusterCount; i++) {
    let x, z, attempts = 0
    
    do {
      const angle = rng() * Math.PI * 2
      const dist = Math.pow(rng(), 0.7) * clusterRadius
      x = Math.cos(angle) * dist
      z = Math.sin(angle) * dist
      attempts++
      
      let ok = true
      for (const p of placed) {
        const dx = x - p.x, dz = z - p.z
        if (Math.sqrt(dx*dx + dz*dz) < spacing) {
          ok = false
          break
        }
      }
      if (ok) break
    } while (attempts < 30)
    
    // Height variation
    const h = baseHeight * (1 + (rng() - 0.5) * heightVar * 2)
    
    // Color variation
    const colorVar = new THREE.Color(clusterColor)
    const hsl = {}
    colorVar.getHSL(hsl)
    colorVar.setHSL(hsl.h, hsl.s, hsl.l * (0.85 + rng() * 0.3))
    
    const kelp = createKelp({
      height: h,
      seed: seed ? seed + i * 777 : null,
      color: colorVar.getHex(),
    })
    
    const y = getTerrainHeight ? getTerrainHeight(x, z) : baseY
    kelp.position.set(x, y, z)
    
    placed.push({ x, z })
    group.add(kelp)
  }
  
  group.userData.terrainType = 'kelpCluster'
  group.userData.presetName = preset.name
  group.userData.plantCount = group.children.length
  
  return group
}

/**
 * Create a kelp forest with multiple clusters of varying sizes
 * @param {object} options
 * @param {number} [options.forestRadius] - Forest spread
 * @param {Array} [options.presets] - Array of { preset, weight } to spawn
 * @param {number} [options.totalClusters] - Total clusters to spawn
 * @param {number} [options.seed] - Random seed
 * @param {function} [options.getTerrainHeight] - Height function
 * @param {number} [options.baseY] - Base Y
 */
export function createKelpForest(options = {}) {
  const {
    forestRadius = 40,
    presets = [
      { preset: ClusterPreset.SEAGRASS_SMALL, weight: 3 },
      { preset: ClusterPreset.KELP_SMALL, weight: 2 },
      { preset: ClusterPreset.KELP_MEDIUM, weight: 2 },
      { preset: ClusterPreset.KELP_LARGE, weight: 1 },
    ],
    totalClusters = 8,
    seed = null,
    getTerrainHeight = null,
    baseY = 0,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  // Build weighted list
  const weightedPresets = []
  for (const { preset, weight } of presets) {
    for (let i = 0; i < weight; i++) {
      weightedPresets.push(preset)
    }
  }
  
  const positions = []
  
  for (let i = 0; i < totalClusters; i++) {
    // Pick random preset
    const preset = pick(rng, weightedPresets)
    const minSpacing = (preset.radius.max + preset.radius.min) / 2 + 2
    
    // Find position
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
      preset,
      seed: seed ? seed + i * 999 : null,
      getTerrainHeight: getTerrainHeight
        ? (lx, lz) => getTerrainHeight(x + lx, z + lz)
        : null,
      baseY,
    })
    
    cluster.position.set(x, 0, z)
    positions.push({ x, z, radius: cluster.userData.plantCount * 0.3 })
    group.add(cluster)
  }
  
  group.userData.terrainType = 'kelpForest'
  group.userData.clusterCount = group.children.length
  
  return group
}

// ============================================================================
// SHORTHAND CREATORS
// ============================================================================

/** Create tiny seagrass patch (3-6 plants) */
export function createSeagrassTiny(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.SEAGRASS_TINY })
}

/** Create small seagrass cluster (5-10 plants) */
export function createSeagrassSmall(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.SEAGRASS_SMALL })
}

/** Create medium seagrass patch (10-20 plants) */
export function createSeagrassMedium(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.SEAGRASS_MEDIUM })
}

/** Create small kelp cluster (8-15 plants) */
export function createKelpSmall(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.KELP_SMALL })
}

/** Create medium kelp cluster (15-30 plants) */
export function createKelpMedium(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.KELP_MEDIUM })
}

/** Create large kelp forest (35-55 plants) */
export function createKelpLarge(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.KELP_LARGE })
}

/** Create huge kelp forest (55-80 plants) */
export function createKelpHuge(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.KELP_HUGE })
}

/** Create colossal kelp forest (80-120 plants) */
export function createKelpColossal(options = {}) {
  return createKelpCluster({ ...options, preset: ClusterPreset.KELP_COLOSSAL })
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Cull kelp inside boulders
 */
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
  ClusterPreset,
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
  cullKelpInBoulders,
}