/**
 * TerrainMaker.js - Visual terrain generation
 * 
 * Creates all terrain visual meshes. Map.js orchestrates placement,
 * this file handles the mesh creation.
 * 
 * Future: TerrainCollider.js will scan these for physics.
 * 
 * Preserved from original:
 * - Sand color: 0xffe4b5
 * - Boulder geometry: DodecahedronGeometry
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

// ============================================================================
// PERLIN NOISE
// ============================================================================

/**
 * Seeded Perlin noise implementation
 */
class PerlinNoise {
  constructor(seed = 0) {
    this.seed = seed
    this.permutation = this.generatePermutation(seed)
  }
  
  generatePermutation(seed) {
    const rng = createRNG(seed)
    const p = []
    for (let i = 0; i < 256; i++) p[i] = i
    
    // Fisher-Yates shuffle with seeded RNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    
    // Duplicate for overflow
    return [...p, ...p]
  }
  
  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  
  lerp(a, b, t) {
    return a + t * (b - a)
  }
  
  grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }
  
  noise2D(x, y) {
    const p = this.permutation
    
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    
    const u = this.fade(xf)
    const v = this.fade(yf)
    
    const aa = p[p[xi] + yi]
    const ab = p[p[xi] + yi + 1]
    const ba = p[p[xi + 1] + yi]
    const bb = p[p[xi + 1] + yi + 1]
    
    const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u)
    const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u)
    
    return this.lerp(x1, x2, v)
  }
  
  /**
   * Fractal Brownian Motion - layered noise for natural terrain
   * @param {number} x 
   * @param {number} y 
   * @param {number} octaves - Number of noise layers
   * @param {number} persistence - Amplitude multiplier per octave
   * @param {number} lacunarity - Frequency multiplier per octave
   * @returns {number} Value between -1 and 1
   */
  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    
    return total / maxValue
  }
  
  /**
   * Ridged noise - creates sharp ridges
   */
  ridged(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0
    
    for (let i = 0; i < octaves; i++) {
      let n = this.noise2D(x * frequency, y * frequency)
      n = 1 - Math.abs(n)  // Create ridges
      n = n * n            // Sharpen
      total += n * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    
    return total / maxValue
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const TerrainConfig = {
  // Sand floor
  sand: {
    color: 0xffe4b5,      // Moccasin - warm sand color (PRESERVED)
    emissive: 0x997755,
    emissiveIntensity: 0.15,
    roughness: 1.0,
    metalness: 0.0,
    
    // Elevation color gradient (low to high) - Realistic Tropical Underwater
    // Natural sand that appears more blue/teal in deeper water
    elevationColors: [
      { height: -50, color: new THREE.Color(0x1a6b6b) },  // Trench - deep teal
      { height: -25, color: new THREE.Color(0x3d9d94) },  // Deep - teal
      { height: -10, color: new THREE.Color(0x7dbdaf) },  // Mid-deep - turquoise tint
      { height: 0,   color: new THREE.Color(0xfff5e0) },  // Mid - pale white sand ← PRIORITY
      { height: 15,  color: new THREE.Color(0xfff9ed) },  // Mid-high - lighter sand
      { height: 30,  color: new THREE.Color(0xfffdf7) },  // High - bright sand
      { height: 50,  color: new THREE.Color(0xffffff) },  // Peak - pure white
    ],
  },
  
  // Boulders/Rocks
  boulder: {
    color: 0x888888,      // Gray (PRESERVED)
    roughness: 0.9,
    metalness: 0.1,
  },
  
  // Water
  water: {
    surfaceColor: 0x88ccff,
    surfaceOpacity: 0.5,
  },
  
  // Sky dome
  sky: {
    waterColors: {
      top: 0x00ced1,      // Bright turquoise (surface light)
      bottom: 0x000033,   // Deep ocean blue
    },
    skyColors: {
      top: 0x4a90d9,      // Natural sky blue
      bottom: 0xc9dff0,   // Pale warm horizon
    },
  },
  
  // Terrain generation defaults
  terrain: {
    // Base terrain
    baseScale: 0.004,         // Slightly larger features
    baseHeight: 25,           // More height variation (was 15)
    
    // Large features (trenches, plateaus)
    featureScale: 0.0015,     // Bigger, broader features
    featureHeight: 45,        // Much taller plateaus (was 25)
    
    // Ridges
    ridgeScale: 0.006,        // Wider ridges
    ridgeHeight: 18,          // Taller ridges (was 8)
    ridgeWeight: 0.5,         // More prominent (was 0.3)
    
    // Detail
    detailScale: 0.02,        // Fine detail frequency
    detailHeight: 3,          // Slightly more detail (was 2)
    
    // Trenches
    trenchScale: 0.0025,      // Wider trenches
    trenchDepth: 40,          // Much deeper (was 20)
    trenchThreshold: 0.5,     // More trenches (was 0.6)
  },
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Get interpolated color based on elevation
 * @param {number} height - Terrain height
 * @param {Array} colorStops - Array of { height, color } objects
 * @returns {THREE.Color}
 */
function getElevationColor(height, colorStops) {
  // Find the two color stops to interpolate between
  let lower = colorStops[0]
  let upper = colorStops[colorStops.length - 1]
  
  for (let i = 0; i < colorStops.length - 1; i++) {
    if (height >= colorStops[i].height && height <= colorStops[i + 1].height) {
      lower = colorStops[i]
      upper = colorStops[i + 1]
      break
    }
  }
  
  // Handle edge cases
  if (height <= lower.height) return lower.color.clone()
  if (height >= upper.height) return upper.color.clone()
  
  // Interpolate
  const t = (height - lower.height) / (upper.height - lower.height)
  const color = new THREE.Color()
  color.lerpColors(lower.color, upper.color, t)
  
  return color
}

// ============================================================================
// SAND FLOOR
// ============================================================================

/**
 * Create sand floor with Perlin noise terrain features and elevation coloring
 * @param {object} options
 * @param {number} [options.size=1000] - Floor size
 * @param {number} [options.segments=100] - Geometry segments (detail level)
 * @param {number} [options.seed=0] - Random seed for consistent generation
 * @param {object} [options.terrain] - Override terrain generation settings
 * @returns {THREE.Mesh}
 */
export function createSandFloor(options = {}) {
  const {
    size = 1000,
    segments = 100,
    seed = 0,
    terrain = {},
  } = options
  
  // Merge terrain config with overrides
  const t = { ...TerrainConfig.terrain, ...terrain }
  
  const perlin = new PerlinNoise(seed)
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  
  const vertices = geometry.attributes.position.array
  const halfSize = size / 2
  
  // Store heights for color calculation
  const heights = []
  
  // First pass: calculate all heights
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]
    const y = vertices[i + 1]
    
    const nx = (x + halfSize) / size
    const ny = (y + halfSize) / size
    
    let height = 0
    
    // 1. Base terrain - rolling hills/valleys (FBM)
    const baseNoise = perlin.fbm(
      nx / t.baseScale * 0.01, 
      ny / t.baseScale * 0.01, 
      4, 0.5, 2.0
    )
    height += baseNoise * t.baseHeight
    
    // 2. Large features - broad plateaus and depressions
    const featureNoise = perlin.fbm(
      nx / t.featureScale * 0.01, 
      ny / t.featureScale * 0.01, 
      2, 0.5, 2.0
    )
    height += featureNoise * t.featureHeight
    
    // 3. Ridges - sharp underwater ridges
    const ridgeNoise = perlin.ridged(
      nx / t.ridgeScale * 0.01, 
      ny / t.ridgeScale * 0.01, 
      3, 0.5, 2.0
    )
    height += ridgeNoise * t.ridgeHeight * t.ridgeWeight
    
    // 4. Trenches - deep cuts in the terrain
    const trenchNoise = perlin.fbm(
      nx / t.trenchScale * 0.01 + 100,
      ny / t.trenchScale * 0.01 + 100, 
      2, 0.5, 2.0
    )
    if (trenchNoise > t.trenchThreshold) {
      const trenchFactor = (trenchNoise - t.trenchThreshold) / (1 - t.trenchThreshold)
      height -= trenchFactor * trenchFactor * t.trenchDepth
    }
    
    // 5. Fine detail - small bumps and texture
    const detailNoise = perlin.fbm(
      nx / t.detailScale * 0.01, 
      ny / t.detailScale * 0.01, 
      2, 0.5, 2.0
    )
    height += detailNoise * t.detailHeight
    
    vertices[i + 2] = height
    heights.push(height)
  }
  
  // Second pass: apply vertex colors based on elevation
  const colors = new Float32Array(heights.length * 3)
  const colorStops = TerrainConfig.sand.elevationColors
  
  for (let i = 0; i < heights.length; i++) {
    const color = getElevationColor(heights[i], colorStops)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,  // Use vertex colors
    roughness: TerrainConfig.sand.roughness,
    metalness: TerrainConfig.sand.metalness,
    // Reduced emissive since we have vertex colors
    emissive: 0x443322,
    emissiveIntensity: 0.08,
  })
  
  const floor = new THREE.Mesh(geometry, material)
  floor.rotation.x = -Math.PI / 2
  
  // Mark for terrain identification
  floor.userData.terrainType = 'sand'
  floor.userData.collidable = true
  floor.userData.seed = seed
  
  return floor
}

/**
 * Get terrain height at a world position
 * Useful for placing objects on terrain
 * @param {number} x - World X position
 * @param {number} z - World Z position  
 * @param {number} size - Terrain size
 * @param {number} seed - Same seed used for terrain
 * @param {object} terrain - Same terrain config used for generation
 * @returns {number} Height at position
 */
export function getTerrainHeight(x, z, size = 1000, seed = 0, terrain = {}) {
  const t = { ...TerrainConfig.terrain, ...terrain }
  const perlin = new PerlinNoise(seed)
  const halfSize = size / 2
  
  const nx = (x + halfSize) / size
  const ny = (z + halfSize) / size
  
  let height = 0
  
  // Same calculations as createSandFloor
  const baseNoise = perlin.fbm(nx / t.baseScale * 0.01, ny / t.baseScale * 0.01, 4, 0.5, 2.0)
  height += baseNoise * t.baseHeight
  
  const featureNoise = perlin.fbm(nx / t.featureScale * 0.01, ny / t.featureScale * 0.01, 2, 0.5, 2.0)
  height += featureNoise * t.featureHeight
  
  const ridgeNoise = perlin.ridged(nx / t.ridgeScale * 0.01, ny / t.ridgeScale * 0.01, 3, 0.5, 2.0)
  height += ridgeNoise * t.ridgeHeight * t.ridgeWeight
  
  const trenchNoise = perlin.fbm(nx / t.trenchScale * 0.01 + 100, ny / t.trenchScale * 0.01 + 100, 2, 0.5, 2.0)
  if (trenchNoise > t.trenchThreshold) {
    const trenchFactor = (trenchNoise - t.trenchThreshold) / (1 - t.trenchThreshold)
    height -= trenchFactor * trenchFactor * t.trenchDepth
  }
  
  const detailNoise = perlin.fbm(nx / t.detailScale * 0.01, ny / t.detailScale * 0.01, 2, 0.5, 2.0)
  height += detailNoise * t.detailHeight
  
  return height
}

// ============================================================================
// BOULDERS / ROCKS
// ============================================================================

/**
 * Create a single boulder (Dodecahedron geometry - PRESERVED)
 * @param {object} options
 * @param {number} [options.size=1] - Boulder size
 * @param {number} [options.color] - Override color
 * @param {number} [options.seed] - Random seed for rotation
 * @returns {THREE.Mesh}
 */
export function createBoulder(options = {}) {
  const {
    size = 1,
    color = TerrainConfig.boulder.color,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  
  // Dodecahedron gives nice boulder shape (PRESERVED)
  const geometry = new THREE.DodecahedronGeometry(size, 0)
  
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: TerrainConfig.boulder.roughness,
    metalness: TerrainConfig.boulder.metalness,
  })
  
  const boulder = new THREE.Mesh(geometry, material)
  
  // Random rotation for variety
  boulder.rotation.set(
    rng() * Math.PI,
    rng() * Math.PI,
    rng() * Math.PI
  )
  
  // Mark for terrain identification
  boulder.userData.terrainType = 'boulder'
  boulder.userData.collidable = true
  
  return boulder
}

/**
 * Create a cluster of boulders
 * @param {object} options
 * @param {number} [options.count=5] - Number of boulders
 * @param {number} [options.spread=5] - Spread radius
 * @param {number} [options.minSize=0.5] - Minimum boulder size
 * @param {number} [options.maxSize=2] - Maximum boulder size
 * @param {number} [options.seed] - Random seed
 * @returns {THREE.Group}
 */
export function createBoulderCluster(options = {}) {
  const {
    count = 5,
    spread = 5,
    minSize = 0.5,
    maxSize = 2,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  for (let i = 0; i < count; i++) {
    const size = range(rng, minSize, maxSize)
    const boulder = createBoulder({ size, seed: seed ? seed + i : null })
    
    // Random position within spread
    boulder.position.set(
      range(rng, -spread, spread),
      size * 0.3,  // Partially buried
      range(rng, -spread, spread)
    )
    
    group.add(boulder)
  }
  
  group.userData.terrainType = 'boulderCluster'
  group.userData.collidable = true
  
  return group
}

// ============================================================================
// WATER SURFACE
// ============================================================================

/**
 * Create water surface (ceiling boundary)
 * @param {object} options
 * @param {number} [options.size=1000] - Surface size
 * @param {number} [options.color] - Water color
 * @param {number} [options.opacity] - Transparency
 * @returns {THREE.Mesh}
 */
export function createWaterSurface(options = {}) {
  const {
    size = 1000,
    color = TerrainConfig.water.surfaceColor,
    opacity = TerrainConfig.water.surfaceOpacity,
  } = options
  
  const geometry = new THREE.PlaneGeometry(size, size)
  
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  })
  
  const surface = new THREE.Mesh(geometry, material)
  surface.rotation.x = -Math.PI / 2
  
  // Mark for terrain identification
  surface.userData.terrainType = 'waterSurface'
  surface.userData.collidable = true
  surface.userData.boundary = true
  
  return surface
}

// ============================================================================
// SKY DOME
// ============================================================================

/**
 * Create sky dome with underwater/atmosphere gradient
 * @param {object} options
 * @param {number} [options.radius=500] - Sky sphere radius
 * @param {number} [options.waterLevel=30] - Y level where water meets air
 * @returns {THREE.Mesh}
 */
export function createSkyDome(options = {}) {
  const {
    radius = 500,
    waterLevel = 30,
  } = options
  
  const { waterColors, skyColors } = TerrainConfig.sky
  
  const geometry = new THREE.SphereGeometry(radius, 64, 64)
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      waterTopColor: { value: new THREE.Color(waterColors.top) },
      waterBottomColor: { value: new THREE.Color(waterColors.bottom) },
      skyTopColor: { value: new THREE.Color(skyColors.top) },
      skyBottomColor: { value: new THREE.Color(skyColors.bottom) },
      waterLevel: { value: waterLevel },
      offset: { value: 50 },
      exponent: { value: 0.4 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 waterTopColor;
      uniform vec3 waterBottomColor;
      uniform vec3 skyTopColor;
      uniform vec3 skyBottomColor;
      uniform float waterLevel;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        
        if (vWorldPosition.y > waterLevel) {
          // Above water - atmosphere gradient
          float skyH = (vWorldPosition.y - waterLevel) / (500.0 - waterLevel);
          gl_FragColor = vec4(mix(skyBottomColor, skyTopColor, skyH), 1.0);
        } else {
          // Below water - underwater gradient
          gl_FragColor = vec4(mix(waterBottomColor, waterTopColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      }
    `,
    side: THREE.BackSide,
  })
  
  const skyDome = new THREE.Mesh(geometry, material)
  
  // Mark for terrain identification
  skyDome.userData.terrainType = 'skyDome'
  skyDome.userData.collidable = false
  
  return skyDome
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Config
  TerrainConfig,
  
  // Floor
  createSandFloor,
  getTerrainHeight,
  
  // Rocks
  createBoulder,
  createBoulderCluster,
  
  // Environment
  createWaterSurface,
  createSkyDome,
}