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
// SEEDED RANDOM (for multiplayer sync)
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
}

// ============================================================================
// SAND FLOOR
// ============================================================================

/**
 * Create sand floor with gentle height variation
 * @param {object} options
 * @param {number} [options.size=1000] - Floor size
 * @param {number} [options.segments=100] - Geometry segments (detail level)
 * @param {number} [options.bumpiness=2] - Height variation amount
 * @param {number} [options.seed] - Random seed for consistent generation
 * @returns {THREE.Mesh}
 */
export function createSandFloor(options = {}) {
  const {
    size = 1000,
    segments = 100,
    bumpiness = 2,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  
  // Add random height variation for natural look
  const vertices = geometry.attributes.position.array
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + 2] += rng() * bumpiness - bumpiness / 2
  }
  geometry.computeVertexNormals()
  
  const material = new THREE.MeshStandardMaterial({
    color: TerrainConfig.sand.color,
    roughness: TerrainConfig.sand.roughness,
    metalness: TerrainConfig.sand.metalness,
    emissive: TerrainConfig.sand.emissive,
    emissiveIntensity: TerrainConfig.sand.emissiveIntensity,
  })
  
  const floor = new THREE.Mesh(geometry, material)
  floor.rotation.x = -Math.PI / 2
  
  // Mark for terrain identification
  floor.userData.terrainType = 'sand'
  floor.userData.collidable = true
  
  return floor
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
  
  // Rocks
  createBoulder,
  createBoulderCluster,
  
  // Environment
  createWaterSurface,
  createSkyDome,
}