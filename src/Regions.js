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
import { createCoral } from './Corals.js'

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
// Coral sizes: medium (5-12), large (15-30), colossal (35-50)
// Boulder reference: medium 5-12, large 15-30, colossal 35-60

const SPAWN_SETTINGS = {
  [RegionType.CORAL_REEF]: {
    coral: { count: 15, minSize: 8, maxSize: 45 },
    boulder: { count: 5, minSize: 5, maxSize: 15 },
  },
  [RegionType.BOULDER_FIELD]: {
    coral: { count: 3, minSize: 5, maxSize: 15 },
    boulder: { count: 20, minSize: 8, maxSize: 25 },
  },
  [RegionType.CORAL_GARDEN]: {
    coral: { count: 20, minSize: 5, maxSize: 25 },
    boulder: { count: 2, minSize: 3, maxSize: 8 },
  },
  [RegionType.ROCKY_OUTCROP]: {
    coral: { count: 10, minSize: 6, maxSize: 30 },
    boulder: { count: 12, minSize: 5, maxSize: 20 },
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
 * @param {THREE.Mesh[]} options.globalBoulders - Boulders from map.js to check against
 * @returns {THREE.Group}
 */
function spawnRegionContent(region, options = {}) {
  const { getTerrainHeight, seed = 12345, globalBoulders = [] } = options
  
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
  
  // =========================================================================
  // SPAWN BOULDERS FIRST (so we can cull corals against them)
  // =========================================================================
  const regionBoulders = []
  
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
    boulder.userData.baseSize = size
    
    regionBoulders.push({ mesh: boulder, size, x, y: y + size * 0.3, z })
    group.add(boulder)
  }
  
  // Combine global boulders with region boulders for culling
  const allBoulders = [
    ...globalBoulders.map(b => ({
      mesh: b.mesh || b,
      size: b.size || b.userData?.baseSize || 1,
      x: b.x ?? b.mesh?.position?.x ?? b.position?.x ?? 0,
      y: b.y ?? b.mesh?.position?.y ?? b.position?.y ?? 0,
      z: b.z ?? b.mesh?.position?.z ?? b.position?.z ?? 0,
    })),
    ...regionBoulders,
  ]
  
  // =========================================================================
  // SPAWN CORALS AND CULL PIECES INSIDE BOULDERS
  // =========================================================================
  const corals = []
  
  for (let i = 0; i < coralCount; i++) {
    const size = range(rng, settings.coral.minSize, settings.coral.maxSize)
    
    // Random position within region radius
    const angle = rng() * Math.PI * 2
    const dist = Math.pow(rng(), 0.5) * region.radius
    const x = region.x + Math.cos(angle) * dist
    const z = region.z + Math.sin(angle) * dist
    
    const coral = createCoral({
      size,
      seed: seed + i * 7777 + region.x,
    })
    
    const y = getTerrainHeight ? getTerrainHeight(x, z) : 0
    coral.position.set(x, y, z)
    coral.userData.regionType = region.type
    coral.userData.coralSize = size
    
    // -----------------------------------------------------------------------
    // CULL INDIVIDUAL CORAL PIECES INSIDE BOULDERS
    // -----------------------------------------------------------------------
    const piecesToRemove = []
    
    // Get the coral group's rotation
    const groupRotationY = coral.rotation.y
    const cosR = Math.cos(groupRotationY)
    const sinR = Math.sin(groupRotationY)
    
    for (const piece of coral.children) {
      // Get piece LOCAL position
      const localX = piece.position.x
      const localY = piece.position.y
      const localZ = piece.position.z
      
      // Apply Y-axis rotation to get rotated local position
      const rotatedX = localX * cosR - localZ * sinR
      const rotatedZ = localX * sinR + localZ * cosR
      
      // Get piece WORLD position
      const pieceWorldX = x + rotatedX
      const pieceWorldY = y + localY  // Y rotation doesn't affect Y position
      const pieceWorldZ = z + rotatedZ
      
      // Check against all boulders
      for (const boulder of allBoulders) {
        const bx = boulder.x ?? boulder.mesh?.position?.x ?? 0
        const by = boulder.y ?? boulder.mesh?.position?.y ?? 0
        const bz = boulder.z ?? boulder.mesh?.position?.z ?? 0
        
        // Get boulder size accounting for scale
        let boulderSize = boulder.size
        if (boulder.mesh && boulder.mesh.scale) {
          const maxScale = Math.max(boulder.mesh.scale.x, boulder.mesh.scale.y, boulder.mesh.scale.z)
          boulderSize = boulder.size * maxScale
        }
        
        // Distance between piece center and boulder center
        const dx = pieceWorldX - bx
        const dy = pieceWorldY - by
        const dz = pieceWorldZ - bz
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz)
        
        // Piece is culled if its CENTER is inside the boulder
        // (more aggressive than requiring entire piece to be inside)
        const isContained = distance < boulderSize
        
        if (isContained) {
          piecesToRemove.push(piece)
          break  // No need to check other boulders
        }
      }
    }
    
    // Remove contained pieces
    for (const piece of piecesToRemove) {
      coral.remove(piece)
      if (piece.geometry) piece.geometry.dispose()
      if (piece.material) piece.material.dispose()
    }
    
    // Update piece count
    coral.userData.pieceCount = coral.children.length
    
    // Only add coral if it has pieces left
    if (coral.children.length > 0) {
      corals.push({ mesh: coral, size, x, y, z })
    } else {
      // Dispose empty coral group
      coral.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
    }
  }
  
  // =========================================================================
  // CULL CORAL CLUSTERS WITH 60%+ OVERLAP (delete smaller)
  // =========================================================================
  const cullOverlappingCorals = (coralList) => {
    const toRemove = new Set()
    
    for (let i = 0; i < coralList.length; i++) {
      if (toRemove.has(i)) continue
      
      const a = coralList[i]
      
      for (let j = i + 1; j < coralList.length; j++) {
        if (toRemove.has(j)) continue
        
        const b = coralList[j]
        
        // Distance between centers (3D)
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dz = a.z - b.z
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
        
        // Determine smaller and larger
        const [smaller, larger, smallerIdx] = a.size < b.size 
          ? [a, b, i] 
          : [b, a, j]
        
        // Approximate overlap fraction of smaller sphere
        const overlapFraction = (larger.size + smaller.size - dist) / (2 * smaller.size)
        
        // If 60%+ overlap, remove smaller
        if (overlapFraction >= 0.6) {
          toRemove.add(smallerIdx)
        }
      }
    }
    
    return toRemove
  }
  
  const culledIndices = cullOverlappingCorals(corals)
  let culledCount = 0
  
  // Add surviving corals
  for (let i = 0; i < corals.length; i++) {
    if (culledIndices.has(i)) {
      // Dispose culled coral
      corals[i].mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
      culledCount++
      continue
    }
    group.add(corals[i].mesh)
  }
  
  if (culledCount > 0) {
    console.log(`Region ${region.type}: culled ${culledCount} overlapping corals`)
  }
  
  return group
}

/**
 * Spawn all region content
 * @param {object} options
 * @param {function} options.getTerrainHeight - Function to get Y at (x,z)
 * @param {number} options.floorY - Base floor Y level
 * @param {number} options.seed - Base seed
 * @param {Array} options.globalBoulders - Boulders from map.js to cull corals against
 * @returns {THREE.Group}
 */
export function spawnAllRegions(options = {}) {
  const { getTerrainHeight, floorY = -50, seed = 12345, globalBoulders = [] } = options
  
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
      globalBoulders,
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