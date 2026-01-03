/**
 * Regions.js - Point-based biome/region placement system
 * 
 * Define region anchor points with radius. Each region spawns
 * appropriate content (corals, boulders, kelp, etc.)
 * 
 * Regions can overlap - content from both will spawn.
 */

import * as THREE from 'three'
import { createBoulder, BoulderType } from './Boulders.js'
import { createCoral, createCoralReef, CoralType } from './Corals.js'

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

// ============================================================================
// REGION TYPES
// ============================================================================

export const RegionType = {
  CORAL_REEF: 'coral_reef',
  BOULDER_FIELD: 'boulder_field',
  CORAL_GARDEN: 'coral_garden',     // Dense small corals
  ROCKY_OUTCROP: 'rocky_outcrop',   // Mixed boulders and corals
  // Future types:
  // KELP_FOREST: 'kelp_forest',
  // SANDY_PLAINS: 'sandy_plains',
  // THERMAL_VENT: 'thermal_vent',
}

// ============================================================================
// REGION CONFIGURATION - EDIT HERE
// ============================================================================
// x, z     : World position of region center
// type     : RegionType 
// radius   : How far the region extends
// density  : 0-1, how packed with content (1 = very dense)
// seed     : Optional seed offset for this region
// ============================================================================

export const REGIONS = [
  // Main coral reef - large area with diverse corals
  { x: 0,    z: 0,    type: RegionType.CORAL_REEF,    radius: 120, density: 0.7 },
  
  // Secondary reef
  { x: 200,  z: 150,  type: RegionType.CORAL_REEF,    radius: 80,  density: 0.6 },
  
  // Boulder field - rocky area
  { x: -180, z: -120, type: RegionType.BOULDER_FIELD, radius: 100, density: 0.5 },
  
  // Coral garden - dense small corals
  { x: 150,  z: -180, type: RegionType.CORAL_GARDEN,  radius: 60,  density: 0.9 },
  
  // Rocky outcrop - mixed
  { x: -100, z: 200,  type: RegionType.ROCKY_OUTCROP, radius: 70,  density: 0.6 },
  
  // Another boulder field
  { x: 250,  z: -50,  type: RegionType.BOULDER_FIELD, radius: 60,  density: 0.4 },
]

// ============================================================================
// REGION SPAWN SETTINGS
// ============================================================================

const SPAWN_SETTINGS = {
  [RegionType.CORAL_REEF]: {
    coral: { count: 25, minSize: 1, maxSize: 4 },
    boulder: { count: 5, minSize: 2, maxSize: 8 },
  },
  [RegionType.BOULDER_FIELD]: {
    coral: { count: 3, minSize: 0.5, maxSize: 1.5 },
    boulder: { count: 20, minSize: 3, maxSize: 15 },
  },
  [RegionType.CORAL_GARDEN]: {
    coral: { count: 40, minSize: 0.3, maxSize: 1.5 },
    boulder: { count: 2, minSize: 1, maxSize: 3 },
  },
  [RegionType.ROCKY_OUTCROP]: {
    coral: { count: 15, minSize: 0.5, maxSize: 2 },
    boulder: { count: 12, minSize: 2, maxSize: 10 },
  },
}

// ============================================================================
// REGION UTILITIES
// ============================================================================

/**
 * Get all regions that contain a point
 * @param {number} x - World X
 * @param {number} z - World Z
 * @returns {Array} Regions containing this point
 */
export function getRegionsAt(x, z) {
  const result = []
  
  for (const region of REGIONS) {
    const dx = x - region.x
    const dz = z - region.z
    const distSq = dx * dx + dz * dz
    
    if (distSq <= region.radius * region.radius) {
      const dist = Math.sqrt(distSq)
      result.push({
        ...region,
        distance: dist,
        // 1 at center, 0 at edge
        influence: 1 - (dist / region.radius),
      })
    }
  }
  
  return result
}

/**
 * Check if a point is in any region
 * @param {number} x - World X
 * @param {number} z - World Z
 * @returns {boolean}
 */
export function isInRegion(x, z) {
  return getRegionsAt(x, z).length > 0
}

/**
 * Get the dominant region at a point (highest influence)
 * @param {number} x - World X
 * @param {number} z - World Z
 * @returns {object|null}
 */
export function getDominantRegion(x, z) {
  const regions = getRegionsAt(x, z)
  if (regions.length === 0) return null
  
  return regions.reduce((best, r) => 
    r.influence > best.influence ? r : best
  )
}

// ============================================================================
// REGION CONTENT SPAWNING
// ============================================================================

/**
 * Spawn content for a single region
 * @param {object} region - Region definition
 * @param {object} options
 * @param {function} options.getTerrainHeight - Function to get Y at (x,z)
 * @param {number} options.seed - Base seed
 * @returns {THREE.Group}
 */
function spawnRegionContent(region, options = {}) {
  const { getTerrainHeight, seed = 12345 } = options
  
  const group = new THREE.Group()
  const rng = createRNG(seed + region.x * 1000 + region.z)
  const settings = SPAWN_SETTINGS[region.type]
  
  if (!settings) {
    console.warn(`No spawn settings for region type: ${region.type}`)
    return group
  }
  
  // Scale counts by density
  const coralCount = Math.floor(settings.coral.count * region.density)
  const boulderCount = Math.floor(settings.boulder.count * region.density)
  
  // Spawn corals
  for (let i = 0; i < coralCount; i++) {
    const size = range(rng, settings.coral.minSize, settings.coral.maxSize)
    
    // Random position within region radius
    const angle = rng() * Math.PI * 2
    const dist = Math.pow(rng(), 0.5) * region.radius  // Square root for even distribution
    const x = region.x + Math.cos(angle) * dist
    const z = region.z + Math.sin(angle) * dist
    
    const coral = createCoral({
      size,
      type: CoralType.RANDOM,
      seed: seed + i * 7777 + region.x,
    })
    
    // Get terrain height
    const y = getTerrainHeight ? getTerrainHeight(x, z) : 0
    coral.position.set(x, y, z)
    
    coral.userData.regionType = region.type
    group.add(coral)
  }
  
  // Spawn boulders
  for (let i = 0; i < boulderCount; i++) {
    const size = range(rng, settings.boulder.minSize, settings.boulder.maxSize)
    
    const angle = rng() * Math.PI * 2
    const dist = Math.pow(rng(), 0.5) * region.radius
    const x = region.x + Math.cos(angle) * dist
    const z = region.z + Math.sin(angle) * dist
    
    const boulder = createBoulder({
      size,
      type: BoulderType.RANDOM,
      seed: seed + i * 3333 + region.z,
    })
    
    const y = getTerrainHeight ? getTerrainHeight(x, z) : 0
    boulder.position.set(x, y + size * 0.3, z)  // Partially buried
    
    boulder.userData.regionType = region.type
    group.add(boulder)
  }
  
  return group
}

/**
 * Spawn all region content
 * @param {object} options
 * @param {function} options.getTerrainHeight - Function to get Y at (x,z)
 * @param {number} options.floorY - Base floor Y level
 * @param {number} options.seed - Base seed
 * @returns {THREE.Group}
 */
export function spawnAllRegions(options = {}) {
  const { getTerrainHeight, floorY = -50, seed = 12345 } = options
  
  const group = new THREE.Group()
  
  // Height function that includes floor offset
  const getHeight = (x, z) => {
    const terrainY = getTerrainHeight ? getTerrainHeight(x, z) : 0
    return floorY + terrainY
  }
  
  for (const region of REGIONS) {
    const regionGroup = spawnRegionContent(region, {
      getTerrainHeight: getHeight,
      seed,
    })
    
    regionGroup.userData.regionType = region.type
    regionGroup.userData.regionCenter = { x: region.x, z: region.z }
    regionGroup.userData.regionRadius = region.radius
    
    group.add(regionGroup)
  }
  
  group.userData.terrainType = 'regions'
  
  console.log(`Spawned ${REGIONS.length} regions`)
  
  return group
}

/**
 * Get region info for debug/display
 * @returns {Array}
 */
export function getRegionInfo() {
  return REGIONS.map(r => ({
    type: r.type,
    position: { x: r.x, z: r.z },
    radius: r.radius,
    density: r.density,
    settings: SPAWN_SETTINGS[r.type],
  }))
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  RegionType,
  REGIONS,
  getRegionsAt,
  isInRegion,
  getDominantRegion,
  spawnAllRegions,
  getRegionInfo,
}
