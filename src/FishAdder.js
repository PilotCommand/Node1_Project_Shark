/**
 * FishAdder.js - NPC Fish Spawning & AI (Grid-Based)
 * 
 * Fish navigate on SpawnFactory's grid:
 *   - Each grid point has up to 26 adjacent neighbors
 *   - Fish plan paths of exactly 10 grid steps
 *   - No replanning until path is complete
 * 
 * Usage:
 *   import { FishAdder } from './FishAdder.js'
 *   FishAdder.init(scene)
 *   FishAdder.spawnInitialFish(100)
 *   FishAdder.update(deltaTime)
 */

import * as THREE from 'three'
import { 
  generateCreature,
  getAllCreatureClasses,
  getVariantCount,
  randomSeed,
  CreatureType,
  getTypeFromClass,
} from './Encyclopedia.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'
import { SpawnFactory } from './SpawnFactory.js'
import { computeCapsuleParams } from './ScaleMesh.js'
import { computeCapsuleVolume, getNPCNormalDistributedScale } from './NormalScale.js'
import { computeGroupVolume, getMeshVolumeBreakdown } from './MeshVolume.js'

// ============================================================================
// SPECIES BEHAVIOR CLASSIFICATION
// ============================================================================

// Species that school (swim in groups)
const SCHOOLING_SPECIES = new Set([
  // Fish
  'tuna', 'barracuda', 'tang', 'piranha', 'flyingfish', 'catfish', 'angelfish',
  // Cephalopods
  'squid', 'humboldt_squid', 'firefly_squid',
  // Jellies (drift in groups)
  'moon_jelly', 'crystal_jelly', 'sea_gooseberry',
])

// Species that are solitary
const SOLITARY_SPECIES = new Set([
  // Fish
  'shark', 'hammerhead', 'ray', 'manta', 'eel', 'moray', 'grouper',
  'marlin', 'flounder', 'seahorse', 'sunfish', 'anglerfish', 'lionfish',
  'puffer', 'betta',
  // Mammals (mostly solitary or small pods handled differently)
  'blue_whale', 'humpback', 'sperm_whale', 'narwhal',
  // Cephalopods
  'octopus', 'giant_pacific_octopus', 'blue_ringed_octopus', 'dumbo_octopus', 'mimic_octopus',
  'giant_squid', 'colossal_squid', 'cuttlefish', 'flamboyant_cuttlefish',
  // Crustaceans
  'lobster', 'king_crab', 'coconut_crab', 'mantis_shrimp',
  // Jellies (large solitary)
  'lions_mane', 'box_jelly', 'sea_wasp', 'portuguese_man_o_war',
])

// Bottom dwellers (spawn near floor, move slowly)
const BOTTOM_DWELLERS = new Set([
  // Crustaceans
  'crab', 'king_crab', 'spider_crab', 'coconut_crab', 'fiddler_crab',
  'lobster', 'crayfish', 'horseshoe_crab',
  // Sea cucumbers
  'sea_cucumber', 'giant_california', 'leopard_sea_cucumber',
  'sea_apple', 'sea_pig', 'medusa_worm', 'sticky_snake', 'donkey_dung',
  // Some cephalopods
  'octopus', 'giant_pacific_octopus', 'blue_ringed_octopus', 'mimic_octopus',
  // Fish
  'flounder',
])

// Drifters (slow, passive movement)
const DRIFTERS = new Set([
  // Jellies
  'moon_jelly', 'lions_mane', 'barrel_jelly', 'fried_egg_jelly', 'compass_jelly',
  'box_jelly', 'sea_wasp', 'portuguese_man_o_war', 'by_the_wind_sailor',
  'crystal_jelly', 'sea_gooseberry',
  // Some fish
  'sunfish',
])

// ============================================================================
// CONFIGURATION (edit these!)
// ============================================================================

const CONFIG = {
  // *** POPULATION - Change this to control how many creatures spawn ***
  targetPopulation: 50,
  
  // Schooling
  schoolChance: 0.7,          // 0-1, chance to spawn as school
  schoolSize: { min: 4, max: 8 },
  
  // Size distribution (weights)
  sizeDistribution: {
    tiny:   { weight: 20, scale: [1.0, 2.0] },
    small:  { weight: 20, scale: [2.0, 4.0] },
    medium: { weight: 20, scale: [4.0, 6.0] },
    large:  { weight: 20, scale: [6.0, 8.0] },
    huge:   { weight: 20, scale: [8.0, 10.0] },
  },
  
  // Movement
  baseSpeed: 4.0,
  speedVariation: 1.0,
  turnRate: 2.5,
  
  // Pathing
  pathLength: 10,
  waypointArrivalDist: 5,
  forwardBias: 0,
  targetBias: 3,
  randomness: 0.5,
  preferredDirBias: 2.5,
  
  // Detection ranges
  fleeRange: 75,
  chaseRange: 60,
  eatRange: 10,
  
  // Predation
  predatorSizeRatio: 1.3,
  growthPerEat: 0.08,
  maxScale: 15.0,
  
  // Internal
  schoolPathOffset: 10,
}

// AI States
const State = {
  WANDER: 'wander',
  FLEE: 'flee',
  CHASE: 'chase',
  SCHOOL: 'school',
}

// ============================================================================
// STATE
// ============================================================================

let sceneRef = null
let isInitialized = false

const npcs = new Map()
const schools = new Map()

// All spawnable creatures: [{type, class, displayName, shortName}, ...]
let allCreatures = []
let npcIdCounter = 0
let schoolIdCounter = 0

// GRID DATA
let gridPoints = []           // All playable points from SpawnFactory
let gridSpacing = 25          // Distance between grid points
let adjacencyMap = new Map()  // pointIndex -> [neighborIndices]

// SPATIAL HASH (for O(1) lookups instead of O(n))
const gridHash = new Map()    // "cellX,cellY,cellZ" -> [gridPointIndices]
const fishHash = new Map()    // "cellX,cellY,cellZ" -> Set<fishId> for O(1) add/remove
let hashCellSize = 50
let invHashCellSize = 0.02    // 1/hashCellSize - precomputed for faster division

// OBJECT POOL (avoid GC - reuse instead of new Vector3())
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

// CACHED CONFIG (avoid property lookups in hot path)
let _arrivalDistSq = 25       // waypointArrivalDist^2
let _fleeRangeSq = 5625       // fleeRange^2
let _chaseRangeSq = 3600      // chaseRange^2
let _eatRangeSq = 100         // eatRange^2

// ACTIVE CHASERS (only check predation for these)
const activeChasers = new Set()

// VOLUME LABELS
let labelsVisible = false
const labelSprites = new Map()  // npcId -> THREE.Sprite

// ============================================================================
// SPATIAL HASH FUNCTIONS (optimized)
// ============================================================================

// Bitwise floor is faster than Math.floor for positive numbers
function posToCell(x, y, z) {
  return `${(x * invHashCellSize) | 0},${(y * invHashCellSize) | 0},${(z * invHashCellSize) | 0}`
}

function posToCellFromVec(pos) {
  return `${(pos.x * invHashCellSize) | 0},${(pos.y * invHashCellSize) | 0},${(pos.z * invHashCellSize) | 0}`
}

/**
 * Build spatial hash for grid points (run once at init)
 */
function buildGridSpatialHash() {
  gridHash.clear()
  
  const len = gridPoints.length
  for (let i = 0; i < len; i++) {
    const p = gridPoints[i]
    const cell = posToCellFromVec(p)
    
    let bucket = gridHash.get(cell)
    if (!bucket) {
      bucket = []
      gridHash.set(cell, bucket)
    }
    bucket.push(i)
  }
  
  console.log(`[FishAdder] Grid spatial hash: ${gridHash.size} cells`)
}

/**
 * Update fish's position in spatial hash (uses Set for O(1) operations)
 */
function updateFishInHash(npc, oldCell = null) {
  const id = npc.id
  
  // Remove from old cell
  if (oldCell) {
    const oldSet = fishHash.get(oldCell)
    if (oldSet) oldSet.delete(id)
  }
  
  // Add to new cell
  const newCell = posToCellFromVec(npc.mesh.position)
  let bucket = fishHash.get(newCell)
  if (!bucket) {
    bucket = new Set()
    fishHash.set(newCell, bucket)
  }
  bucket.add(id)
  npc._hashCell = newCell
}

/**
 * Get all fish IDs in nearby cells (reuses result array)
 */
const _nearbyFishResult = []
function getFishInNearbyCells(pos, rangeSq) {
  _nearbyFishResult.length = 0  // Clear without allocation
  
  // Only check 1 cell radius for most cases (range < cellSize)
  const cellRadius = rangeSq > 2500 ? 2 : 1  // sqrt(2500) = 50 = cellSize
  
  const cx = (pos.x * invHashCellSize) | 0
  const cy = (pos.y * invHashCellSize) | 0
  const cz = (pos.z * invHashCellSize) | 0
  
  for (let dx = -cellRadius; dx <= cellRadius; dx++) {
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cell = `${cx + dx},${cy + dy},${cz + dz}`
        const fishSet = fishHash.get(cell)
        if (fishSet) {
          for (const id of fishSet) {
            _nearbyFishResult.push(id)
          }
        }
      }
    }
  }
  
  return _nearbyFishResult
}

// ============================================================================
// GRID FUNCTIONS
// ============================================================================

/**
 * Build adjacency map from SpawnFactory grid
 * Uses spatial hashing for O(k) neighbor lookup instead of O(nÂ²)
 */
function buildAdjacencyMap() {
  gridPoints = SpawnFactory.playablePoints
  gridSpacing = SpawnFactory.getConfig().gridSpacing || 25
  hashCellSize = gridSpacing * 2  // Cell slightly larger than neighbor distance
  
  if (gridPoints.length === 0) {
    console.error('[FishAdder] No grid points from SpawnFactory!')
    return
  }
  
  // First build spatial hash of grid points
  buildGridSpatialHash()
  
  const neighborDist = gridSpacing * 1.8
  const neighborDistSq = neighborDist * neighborDist
  
  console.log(`[FishAdder] Building adjacency for ${gridPoints.length} grid points...`)
  
  adjacencyMap.clear()
  
  // Use spatial hash to find neighbors (much faster than O(nÂ²))
  for (let i = 0; i < gridPoints.length; i++) {
    const neighbors = []
    const p1 = gridPoints[i]
    
    // Only check points in nearby cells
    const cx = Math.floor(p1.x / hashCellSize)
    const cy = Math.floor(p1.y / hashCellSize)
    const cz = Math.floor(p1.z / hashCellSize)
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = `${cx + dx},${cy + dy},${cz + dz}`
          const pointsInCell = gridHash.get(cell)
          
          if (pointsInCell) {
            for (const j of pointsInCell) {
              if (i === j) continue
              
              const p2 = gridPoints[j]
              const distSq = p1.distanceToSquared(p2)
              
              if (distSq <= neighborDistSq) {
                neighbors.push(j)
              }
            }
          }
        }
      }
    }
    
    adjacencyMap.set(i, neighbors)
  }
  
  // Stats
  let totalNeighbors = 0
  let maxNeighbors = 0
  let minNeighbors = Infinity
  
  for (const [, neighbors] of adjacencyMap) {
    totalNeighbors += neighbors.length
    maxNeighbors = Math.max(maxNeighbors, neighbors.length)
    minNeighbors = Math.min(minNeighbors, neighbors.length)
  }
  
  const avgNeighbors = (totalNeighbors / adjacencyMap.size).toFixed(1)
  console.log(`[FishAdder] Adjacency built: avg ${avgNeighbors} neighbors (min ${minNeighbors}, max ${maxNeighbors})`)
}

/**
 * Find the grid point index closest to a position
 * Uses spatial hash for O(k) lookup instead of O(n)
 */
function findNearestGridIndex(position) {
  const cx = (position.x * invHashCellSize) | 0
  const cy = (position.y * invHashCellSize) | 0
  const cz = (position.z * invHashCellSize) | 0
  
  let nearestIdx = -1
  let nearestDistSq = Infinity
  
  // Check expanding shells until we find something
  for (let radius = 0; radius <= 3; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check shell on radius > 0
          if (radius > 0) {
            const adx = dx < 0 ? -dx : dx
            const ady = dy < 0 ? -dy : dy
            const adz = dz < 0 ? -dz : dz
            if (adx < radius && ady < radius && adz < radius) continue
          }
          
          const cell = `${cx + dx},${cy + dy},${cz + dz}`
          const pointsInCell = gridHash.get(cell)
          
          if (pointsInCell) {
            for (let i = 0, len = pointsInCell.length; i < len; i++) {
              const idx = pointsInCell[i]
              const distSq = position.distanceToSquared(gridPoints[idx])
              if (distSq < nearestDistSq) {
                nearestDistSq = distSq
                nearestIdx = idx
              }
            }
          }
        }
      }
    }
    
    if (nearestIdx !== -1) break
  }
  
  return nearestIdx !== -1 ? nearestIdx : getRandomGridIndex()
}

/**
 * Get a random grid point index
 */
function getRandomGridIndex() {
  return Math.floor(Math.random() * gridPoints.length)
}

/**
 * Pick next grid step with forward bias
 * @param {number} currentIdx - Current grid index
 * @param {THREE.Vector3} forwardDir - Preferred direction
 * @param {THREE.Vector3} [biasTarget] - Optional target to bias toward
 * @param {boolean} [avoidTarget] - If true, bias away from biasTarget
 */
function pickNextGridStep(currentIdx, forwardDir, biasTarget = null, avoidTarget = false, preferredDir = null) {
  const neighbors = adjacencyMap.get(currentIdx)
  if (!neighbors || neighbors.length === 0) {
    return getRandomGridIndex()
  }
  
  const currentPos = gridPoints[currentIdx]
  
  // Pre-compute target direction if needed
  let targetDir = null
  if (biasTarget && CONFIG.targetBias > 0) {
    targetDir = _v2.subVectors(biasTarget, currentPos).normalize()
  }
  
  let bestIdx = neighbors[0]
  let bestScore = -Infinity
  
  for (const neighborIdx of neighbors) {
    const neighborPos = gridPoints[neighborIdx]
    
    // Reuse _v1 for direction calculation
    _v1.subVectors(neighborPos, currentPos).normalize()
    
    // Start with zero score
    let score = 0
    
    // Preferred direction bias (creature's personal tendency - makes them turn less)
    if (preferredDir && CONFIG.preferredDirBias > 0) {
      score += preferredDir.dot(_v1) * CONFIG.preferredDirBias
    }
    
    // Forward bias (configurable, 0 = disabled)
    if (CONFIG.forwardBias > 0) {
      score += forwardDir.dot(_v1) * CONFIG.forwardBias
    }
    
    // Target bias (chase/flee)
    if (targetDir && CONFIG.targetBias > 0) {
      const targetDot = _v1.dot(targetDir)
      score += avoidTarget ? -targetDot * CONFIG.targetBias : targetDot * CONFIG.targetBias
    }
    
    // Randomness
    if (CONFIG.randomness > 0) {
      score += Math.random() * CONFIG.randomness
    }
    
    if (score > bestScore) {
      bestScore = score
      bestIdx = neighborIdx
    }
  }
  
  return bestIdx
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(scene) {
  if (isInitialized) {
    console.warn('[FishAdder] Already initialized')
    return
  }
  
  sceneRef = scene
  
  // Cache squared distances for hot path
  _arrivalDistSq = CONFIG.waypointArrivalDist * CONFIG.waypointArrivalDist
  _fleeRangeSq = CONFIG.fleeRange * CONFIG.fleeRange
  _chaseRangeSq = CONFIG.chaseRange * CONFIG.chaseRange
  _eatRangeSq = CONFIG.eatRange * CONFIG.eatRange
  
  // Get ALL creature classes (fish, mammals, crustaceans, cephalopods, jellies, sea cucumbers)
  allCreatures = getAllCreatureClasses().filter(c => c.class !== 'starter')
  
  // Build adjacency map from SpawnFactory grid
  buildAdjacencyMap()
  
  // Update hash cell inverse
  invHashCellSize = 1 / hashCellSize
  
  isInitialized = true
  
  // Log creature breakdown
  const byType = {}
  for (const c of allCreatures) {
    byType[c.type] = (byType[c.type] || 0) + 1
  }
  console.log(`[FishAdder] Initialized with ${allCreatures.length} creature types:`, byType)
  console.log(`[FishAdder] Grid: ${gridPoints.length} points`)
}

// ============================================================================
// SPAWNING
// ============================================================================

function spawnInitialFish() {
  if (!isInitialized) {
    console.error('[FishAdder] Not initialized')
    return
  }
  
  const count = CONFIG.targetPopulation
  console.log(`[FishAdder] Spawning ${count} creatures from ${allCreatures.length} species...`)
  
  let spawned = 0
  
  // Spawn mix of schools and individuals up to target
  while (spawned < count) {
    if (Math.random() < CONFIG.schoolChance && spawned + CONFIG.schoolSize.min <= count) {
      const schoolResult = spawnSchool()
      if (schoolResult) spawned += schoolResult.count
    } else {
      if (spawnOneCreature()) spawned++
    }
  }
  
  // Log breakdown by type
  const byType = {}
  for (const [, npc] of npcs) {
    byType[npc.creatureType] = (byType[npc.creatureType] || 0) + 1
  }
  
  console.log(`[FishAdder] Spawned ${spawned} total:`, byType)
  console.log(`[FishAdder] Schools: ${schools.size}`)
  
  return { spawned, schools: schools.size, byType }
}

function spawnSchool() {
  if (gridPoints.length === 0) return null
  
  const startIdx = getRandomGridIndex()
  
  // Filter to only schooling species from all creature types
  const schoolingCreatures = allCreatures.filter(c => SCHOOLING_SPECIES.has(c.class))
  if (schoolingCreatures.length === 0) return null
  
  const creature = schoolingCreatures[Math.floor(Math.random() * schoolingCreatures.length)]
  const variantCount = getVariantCount(creature.class)
  const variantIndex = Math.floor(Math.random() * variantCount)
  const scaleMultiplier = pickRandomSize(creature.class)
  
  const schoolSize = CONFIG.schoolSize.min + 
    Math.floor(Math.random() * (CONFIG.schoolSize.max - CONFIG.schoolSize.min + 1))
  
  const schoolId = `school_${schoolIdCounter++}`
  const memberIds = []
  let leaderId = null
  
  // Get nearby grid points for school members (all MUST be valid grid points)
  const usedIndices = new Set([startIdx])
  const nearbyIndices = [startIdx]
  
  // Collect nearby grid points for school members
  const neighbors = adjacencyMap.get(startIdx) || []
  for (const neighborIdx of neighbors) {
    if (nearbyIndices.length >= schoolSize) break
    nearbyIndices.push(neighborIdx)
    usedIndices.add(neighborIdx)
    
    // Also add neighbors of neighbors for larger schools
    const secondNeighbors = adjacencyMap.get(neighborIdx) || []
    for (const secondIdx of secondNeighbors) {
      if (nearbyIndices.length >= schoolSize) break
      if (!usedIndices.has(secondIdx)) {
        nearbyIndices.push(secondIdx)
        usedIndices.add(secondIdx)
      }
    }
  }
  
  for (let i = 0; i < schoolSize && i < nearbyIndices.length; i++) {
    // Spawn at VALID grid point only
    const gridIdx = nearbyIndices[i]
    const spawnPos = gridPoints[gridIdx].clone()
    
    const npc = spawnOneCreature({
      position: spawnPos,
      creatureType: creature.type,
      creatureClass: creature.class,
      variantIndex,
      scaleMultiplier: scaleMultiplier * (0.9 + Math.random() * 0.2),
      schoolId,
      isLeader: i === 0,
    })
    
    if (npc) {
      memberIds.push(npc.id)
      if (i === 0) leaderId = npc.id
    }
  }
  
  if (leaderId && memberIds.length > 1) {
    schools.set(schoolId, { leaderId, memberIds, creatureClass: creature.class })
    console.log(`[FishAdder] Spawned school of ${memberIds.length} ${creature.displayName}`)
  }
  
  return { count: memberIds.length, schoolId }
}

/**
 * Spawn a single creature of any type
 * ALWAYS spawns at a valid grid point
 */
function spawnOneCreature(options = {}) {
  if (gridPoints.length === 0) return null
  
  // Pick random creature if not specified
  let creature = null
  if (!options.creatureClass) {
    creature = allCreatures[Math.floor(Math.random() * allCreatures.length)]
  } else {
    creature = allCreatures.find(c => c.class === options.creatureClass)
  }
  
  if (!creature) return null
  
  const {
    creatureType = creature.type,
    creatureClass = creature.class,
    variantIndex = Math.floor(Math.random() * getVariantCount(creatureClass)),
    scaleMultiplier = pickRandomSize(creatureClass),
    schoolId = null,
    isLeader = false,
  } = options
  
  // ALWAYS use a valid grid point - either find nearest to requested position or pick random
  let gridIdx
  if (options.position) {
    gridIdx = findNearestGridIndex(options.position)
  } else {
    gridIdx = getRandomGridIndex()
  }
  
  // Spawn position is ALWAYS a grid point
  const spawnPosition = gridPoints[gridIdx].clone()
  
  const seed = randomSeed()
  const creatureData = generateCreature(seed, creatureType, creatureClass, variantIndex)
  
  if (!creatureData?.mesh) return null
  
  // Compute NATURAL visual volume at scale=1 (before any scaling)
  const naturalVisualVolume = computeGroupVolume(creatureData.mesh, false)
  
  // Get normally distributed scale (volumes from 1 to 1000 m³)
  const normalization = getNPCNormalDistributedScale(naturalVisualVolume)
  const finalScaleMultiplier = normalization.scaleFactor
  
  // Apply normalized scale
  creatureData.mesh.scale.setScalar(finalScaleMultiplier)
  creatureData.mesh.position.copy(spawnPosition)  // Always at grid point
  creatureData.mesh.rotation.y = Math.random() * Math.PI * 2
  
  sceneRef.add(creatureData.mesh)
  
  // Compute capsule volume (for physics/AI) - after scaling
  const capsuleParams = computeCapsuleParams(creatureData.mesh, creatureData)
  const capsuleVolume = computeCapsuleVolume(capsuleParams.radius, capsuleParams.halfHeight)
  
  // Final visual volume is the target volume from normal distribution
  const visualVolume = normalization.targetVolume
  const visualVolumeBreakdown = getMeshVolumeBreakdown(creatureData.mesh, true)
  const meshCount = visualVolumeBreakdown.meshCount
  
  const npcId = `npc_${creatureType}_${npcIdCounter++}`
  
  // Determine base speed based on creature type
  let speedMult = 1.0
  if (BOTTOM_DWELLERS.has(creatureClass)) speedMult = 0.3
  else if (DRIFTERS.has(creatureClass)) speedMult = 0.4
  
  const npcData = {
    id: npcId,
    mesh: creatureData.mesh,
    seed,
    creatureType,
    creatureClass,
    variantIndex,
    scaleMultiplier: finalScaleMultiplier,  // Use normalized scale
    capsuleParams,
    volume: capsuleVolume,           // Capsule volume (for AI predation)
    visualVolume,                    // True mesh volume (from distribution)
    naturalVisualVolume,             // Volume at scale=1 (before normalization)
    meshCount,                       // Number of meshes in creature
    volumeBreakdown: visualVolumeBreakdown,  // Per-part breakdown
    traits: creatureData.traits,
    displayName: creature.displayName,
    
    // AI state
    state: schoolId && !isLeader ? State.SCHOOL : State.WANDER,
    schoolId,
    isLeader,
    
    // Movement
    direction: new THREE.Vector3(0, 0, 1),
    speed: CONFIG.baseSpeed * speedMult * (0.7 + Math.random() * CONFIG.speedVariation),
    baseSpeed: CONFIG.baseSpeed * speedMult * (0.7 + Math.random() * CONFIG.speedVariation),
    
    // Preferred direction (each creature has its own bias - makes them turn less)
    preferredDirection: new THREE.Vector3(
      Math.random() - 0.5,
      (Math.random() - 0.5) * 0.3,  // Less vertical bias
      Math.random() - 0.5
    ).normalize(),
    
    // Behavior flags
    isBottomDweller: BOTTOM_DWELLERS.has(creatureClass),
    isDrifter: DRIFTERS.has(creatureClass),
    
    // GRID-BASED PATH (array of grid indices)
    path: [],
    pathIndex: 0,
    currentGridIdx: gridIdx,  // Start at the grid point we spawned at
    
    // Targets (set during planning)
    threatId: null,
    preyId: null,
  }
  
  // Generate initial path
  planGridPath(npcData)
  
  npcs.set(npcId, npcData)
  
  // Add to spatial hash
  updateFishInHash(npcData)
  
  MeshRegistry.register(npcId, {
    mesh: creatureData.mesh,
    body: null,
    category: Category.NPC,
    tags: [Tag.ANIMATED],
    metadata: { 
      creatureType, 
      creatureClass, 
      variantIndex, 
      scaleMultiplier: finalScaleMultiplier, 
      capsuleVolume,
      visualVolume,
      naturalVisualVolume,
      meshCount,
      seed, 
      schoolId 
    }
  }, true)
  
  // Create volume label if labels are enabled
  if (labelsVisible) {
    createLabelForNPC(npcData)
  }
  
  return npcData
}

// Alias for backwards compatibility
function spawnOneFish(options = {}) {
  return spawnOneCreature(options)
}

function pickRandomSize(creatureClass = null) {
  const dist = CONFIG.sizeDistribution
  const totalWeight = Object.values(dist).reduce((sum, d) => sum + d.weight, 0)
  let roll = Math.random() * totalWeight
  
  let baseScale = 1.0
  for (const [, data] of Object.entries(dist)) {
    roll -= data.weight
    if (roll <= 0) {
      const [min, max] = data.scale
      baseScale = min + Math.random() * (max - min)
      break
    }
  }
  
  // Adjust scale for specific creature types
  if (creatureClass) {
    // Large creatures
    if (['blue_whale', 'humpback', 'sperm_whale', 'giant_squid', 'colossal_squid', 
         'giant_pacific_octopus', 'lions_mane', 'whale_shark'].includes(creatureClass)) {
      baseScale *= 2.0
    }
    // Medium-large creatures
    else if (['orca', 'manta', 'hammerhead', 'king_crab', 'walrus'].includes(creatureClass)) {
      baseScale *= 1.5
    }
    // Small creatures
    else if (['shrimp', 'fiddler_crab', 'seahorse', 'blue_ringed_octopus', 
              'firefly_squid', 'sea_gooseberry'].includes(creatureClass)) {
      baseScale *= 0.5
    }
  }
  
  return baseScale
}

// ============================================================================
// REMOVAL
// ============================================================================

function removeFish(fishId, respawn = true) {
  const npc = npcs.get(fishId)
  if (!npc) return null
  
  // Remove from spatial hash (O(1) with Set)
  if (npc._hashCell) {
    const cellSet = fishHash.get(npc._hashCell)
    if (cellSet) cellSet.delete(fishId)
  }
  
  // Remove from active chasers
  activeChasers.delete(fishId)
  
  // Remove from school
  if (npc.schoolId) {
    const school = schools.get(npc.schoolId)
    if (school) {
      school.memberIds = school.memberIds.filter(id => id !== fishId)
      
      if (school.leaderId === fishId && school.memberIds.length > 0) {
        school.leaderId = school.memberIds[0]
        const newLeader = npcs.get(school.leaderId)
        if (newLeader) {
          newLeader.isLeader = true
          newLeader.state = State.WANDER
          planGridPath(newLeader)
        }
      }
      
      if (school.memberIds.length <= 1) {
        schools.delete(npc.schoolId)
        if (school.memberIds.length === 1) {
          const lastFish = npcs.get(school.memberIds[0])
          if (lastFish) {
            lastFish.schoolId = null
            lastFish.state = State.WANDER
          }
        }
      }
    }
  }
  
  if (sceneRef && npc.mesh) {
    sceneRef.remove(npc.mesh)
  }
  
  if (npc.mesh) {
    npc.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
  
  // Remove volume label
  removeLabelForNPC(fishId)
  
  MeshRegistry.unregister(fishId)
  npcs.delete(fishId)
  
  if (respawn) maintainPopulation()
  
  return { volume: npc.volume, fishClass: npc.fishClass }
}

function maintainPopulation() {
  const needed = CONFIG.targetPopulation - npcs.size
  if (needed <= 0) return
  
  let spawned = 0
  while (spawned < needed) {
    if (Math.random() < CONFIG.schoolChance && needed - spawned >= CONFIG.schoolSize.min) {
      const result = spawnSchool()
      if (result) spawned += result.count
      else spawned++
    } else {
      if (spawnOneFish()) spawned++
      else break
    }
  }
}

// ============================================================================
// PATH PLANNING (only when path is complete)
// ============================================================================

/**
 * Plan a path of exactly 10 grid steps
 */
function planGridPath(npc) {
  // School followers copy leader's path
  if (npc.schoolId && !npc.isLeader) {
    planSchoolFollowerPath(npc)
    return
  }
  
  const pos = npc.mesh.position
  
  // Update current grid index
  npc.currentGridIdx = findNearestGridIndex(pos)
  
  // Check for threats/prey
  const threat = findNearestThreat(npc)
  if (threat) {
    npc.state = State.FLEE
    npc.threatId = threat.id
    npc.preyId = null
    npc.speed = npc.baseSpeed * 1.5
    activeChasers.delete(npc.id)  // Not chasing anymore
    planFleePath(npc, threat)
    return
  }
  
  const prey = findNearestPrey(npc)
  if (prey) {
    npc.state = State.CHASE
    npc.preyId = prey.id
    npc.threatId = null
    npc.speed = npc.baseSpeed * 1.3
    activeChasers.add(npc.id)  // Track as chaser
    planChasePath(npc, prey)
    return
  }
  
  // Default: wander
  npc.state = State.WANDER
  npc.threatId = null
  npc.preyId = null
  npc.speed = npc.baseSpeed
  activeChasers.delete(npc.id)  // Not chasing
  planWanderPath(npc)
}

/**
 * Plan 10 grid steps with forward bias
 */
function planWanderPath(npc) {
  const path = []
  
  // Find nearest grid point to current position
  let currentIdx = findNearestGridIndex(npc.mesh.position)
  npc.currentGridIdx = currentIdx
  
  let forwardDir = npc.direction.clone()
  
  if (forwardDir.lengthSq() < 0.01) {
    forwardDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
  }
  
  // For FIRST step, pick neighbor that's in front of the fish's ACTUAL position
  // (not relative to grid point, which might be behind the fish)
  const neighbors = adjacencyMap.get(currentIdx)
  if (neighbors && neighbors.length > 0) {
    let bestIdx = neighbors[0]
    let bestScore = -Infinity
    
    for (const neighborIdx of neighbors) {
      const neighborPos = gridPoints[neighborIdx]
      // Direction from FISH to neighbor (not from grid point)
      _v1.subVectors(neighborPos, npc.mesh.position).normalize()
      
      // Prefer neighbors in front of fish
      let score = forwardDir.dot(_v1) * 3
      
      // Add preferred direction bias
      if (npc.preferredDirection && CONFIG.preferredDirBias > 0) {
        score += npc.preferredDirection.dot(_v1) * CONFIG.preferredDirBias
      }
      
      score += Math.random() * CONFIG.randomness
      
      if (score > bestScore) {
        bestScore = score
        bestIdx = neighborIdx
      }
    }
    path.push(bestIdx)
    
    // Update for next iterations
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[bestIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    currentIdx = bestIdx
  }
  
  // Build rest of path normally
  for (let i = path.length; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir, null, false, npc.preferredDirection)
    path.push(nextIdx)
    
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[nextIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    
    currentIdx = nextIdx
  }
  
  npc.path = path
  npc.pathIndex = 0
}

/**
 * Plan 10 grid steps AWAY from threat
 */
function planFleePath(npc, threat) {
  const path = []
  
  // Find nearest grid point to current position
  let currentIdx = findNearestGridIndex(npc.mesh.position)
  npc.currentGridIdx = currentIdx
  
  let forwardDir = npc.direction.clone()
  const threatPos = threat.mesh.position
  
  // For FIRST step, pick neighbor relative to fish's ACTUAL position
  const neighbors = adjacencyMap.get(currentIdx)
  if (neighbors && neighbors.length > 0) {
    let bestIdx = neighbors[0]
    let bestScore = -Infinity
    
    // Direction away from threat
    _v2.subVectors(npc.mesh.position, threatPos).normalize()
    
    for (const neighborIdx of neighbors) {
      const neighborPos = gridPoints[neighborIdx]
      _v1.subVectors(neighborPos, npc.mesh.position).normalize()
      
      // Prefer neighbors AWAY from threat
      let score = _v1.dot(_v2) * CONFIG.targetBias
      // Also prefer forward momentum
      score += forwardDir.dot(_v1) * 2
      score += Math.random() * CONFIG.randomness
      
      if (score > bestScore) {
        bestScore = score
        bestIdx = neighborIdx
      }
    }
    path.push(bestIdx)
    
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[bestIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    currentIdx = bestIdx
  }
  
  // Build rest of path
  for (let i = path.length; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir, threatPos, true, npc.preferredDirection)
    path.push(nextIdx)
    
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[nextIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    
    currentIdx = nextIdx
  }
  
  npc.path = path
  npc.pathIndex = 0
}

/**
 * Plan 10 grid steps TOWARD prey
 */
function planChasePath(npc, prey) {
  const path = []
  
  // Find nearest grid point to current position
  let currentIdx = findNearestGridIndex(npc.mesh.position)
  npc.currentGridIdx = currentIdx
  
  let forwardDir = npc.direction.clone()
  
  // Predict where prey will be
  let targetPos = prey.mesh.position.clone()
  if (prey.path && prey.path.length > 0 && prey.pathIndex < prey.path.length) {
    const futureIdx = Math.min(prey.pathIndex + 5, prey.path.length - 1)
    targetPos = gridPoints[prey.path[futureIdx]].clone()
  }
  
  // For FIRST step, pick neighbor relative to fish's ACTUAL position
  const neighbors = adjacencyMap.get(currentIdx)
  if (neighbors && neighbors.length > 0) {
    let bestIdx = neighbors[0]
    let bestScore = -Infinity
    
    // Direction toward prey
    _v2.subVectors(targetPos, npc.mesh.position).normalize()
    
    for (const neighborIdx of neighbors) {
      const neighborPos = gridPoints[neighborIdx]
      _v1.subVectors(neighborPos, npc.mesh.position).normalize()
      
      // Prefer neighbors TOWARD prey
      let score = _v1.dot(_v2) * CONFIG.targetBias
      // Also prefer forward momentum
      score += forwardDir.dot(_v1) * 2
      score += Math.random() * CONFIG.randomness
      
      if (score > bestScore) {
        bestScore = score
        bestIdx = neighborIdx
      }
    }
    path.push(bestIdx)
    
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[bestIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    currentIdx = bestIdx
  }
  
  // Build rest of path
  for (let i = path.length; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir, targetPos, false, npc.preferredDirection)
    path.push(nextIdx)
    
    const currentPos = gridPoints[currentIdx]
    const nextPos = gridPoints[nextIdx]
    forwardDir.subVectors(nextPos, currentPos).normalize()
    
    currentIdx = nextIdx
  }
  
  npc.path = path
  npc.pathIndex = 0
}

/**
 * School followers: offset from leader's path
 */
function planSchoolFollowerPath(npc) {
  const school = schools.get(npc.schoolId)
  if (!school) {
    npc.state = State.WANDER
    npc.schoolId = null
    planWanderPath(npc)
    return
  }
  
  const leader = npcs.get(school.leaderId)
  if (!leader || !leader.path || leader.path.length === 0) {
    planWanderPath(npc)
    return
  }
  
  npc.state = State.SCHOOL
  
  // Copy leader's path (followers go to same grid points)
  npc.path = [...leader.path]
  npc.pathIndex = Math.min(leader.pathIndex, npc.path.length - 1)
  npc.speed = leader.speed
}

// ============================================================================
// THREAT/PREY DETECTION (uses spatial hash)
// ============================================================================

function findNearestThreat(npc) {
  const pos = npc.mesh.position
  const npcVol = npc.volume
  const sizeRatio = CONFIG.predatorSizeRatio
  let nearest = null
  let nearestDistSq = _fleeRangeSq
  
  // Only check fish in nearby cells
  const nearbyFishIds = getFishInNearbyCells(pos, _fleeRangeSq)
  const len = nearbyFishIds.length
  
  for (let i = 0; i < len; i++) {
    const otherId = nearbyFishIds[i]
    if (otherId === npc.id) continue
    
    const other = npcs.get(otherId)
    if (!other || other.volume < npcVol * sizeRatio) continue
    
    const distSq = pos.distanceToSquared(other.mesh.position)
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = other
    }
  }
  
  // Check player (not in hash)
  const player = MeshRegistry.get('player')
  if (player?.mesh) {
    const playerVolume = player.metadata?.volume || 1
    if (playerVolume > npcVol * sizeRatio) {
      const distSq = pos.distanceToSquared(player.mesh.position)
      if (distSq < nearestDistSq) {
        nearest = { mesh: player.mesh, volume: playerVolume, id: 'player' }
      }
    }
  }
  
  return nearest
}

function findNearestPrey(npc) {
  const pos = npc.mesh.position
  const npcVol = npc.volume
  const sizeRatio = CONFIG.predatorSizeRatio
  let nearest = null
  let nearestDistSq = _chaseRangeSq
  
  const nearbyFishIds = getFishInNearbyCells(pos, _chaseRangeSq)
  const len = nearbyFishIds.length
  
  for (let i = 0; i < len; i++) {
    const otherId = nearbyFishIds[i]
    if (otherId === npc.id) continue
    
    const other = npcs.get(otherId)
    if (!other || npcVol < other.volume * sizeRatio) continue
    
    const distSq = pos.distanceToSquared(other.mesh.position)
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = other
    }
  }
  
  return nearest
}

// ============================================================================
// UPDATE LOOP (optimized)
// ============================================================================

function update(deltaTime) {
  if (!isInitialized) return
  
  // Iterate directly over Map (no array allocation)
  for (const [, npc] of npcs) {
    // Movement update
    const moved = followGridPath(npc, deltaTime)
    
    // Update spatial hash if moved to new cell
    if (moved) {
      const newCell = posToCellFromVec(npc.mesh.position)
      if (newCell !== npc._hashCell) {
        // Remove from old cell (O(1) with Set)
        const oldSet = fishHash.get(npc._hashCell)
        if (oldSet) oldSet.delete(npc.id)
        
        // Add to new cell
        let newSet = fishHash.get(newCell)
        if (!newSet) {
          newSet = new Set()
          fishHash.set(newCell, newSet)
        }
        newSet.add(npc.id)
        npc._hashCell = newCell
      }
    }
  }
  
  // Check for eating (only active chasers)
  checkPredation()
}

/**
 * Move fish along grid path
 * Returns true if fish moved
 */
function followGridPath(npc, deltaTime) {
  const path = npc.path
  const pathIndex = npc.pathIndex
  
  // No path or path complete? Plan new one
  if (!path || pathIndex >= path.length) {
    planGridPath(npc)
    return false
  }
  
  // Get current target grid point
  const targetPos = gridPoints[path[pathIndex]]
  if (!targetPos) {
    planGridPath(npc)
    return false
  }
  
  const mesh = npc.mesh
  const pos = mesh.position
  
  // Direction to target (inline for speed)
  const dx = targetPos.x - pos.x
  const dy = targetPos.y - pos.y
  const dz = targetPos.z - pos.z
  const distSq = dx * dx + dy * dy + dz * dz
  
  // Arrived at grid point? (use squared distance)
  if (distSq < _arrivalDistSq) {
    npc.currentGridIdx = path[pathIndex]
    npc.pathIndex++
    
    if (npc.pathIndex >= path.length) {
      return false
    }
  }
  
  // Update direction (smooth turn toward target)
  if (distSq > 0.01) {
    const invDist = 1 / Math.sqrt(distSq)
    _v1.set(dx * invDist, dy * invDist, dz * invDist)
    npc.direction.lerp(_v1, 0.15).normalize()
  }
  
  // Move
  const moveDistance = npc.speed * deltaTime
  pos.x += npc.direction.x * moveDistance
  pos.y += npc.direction.y * moveDistance
  pos.z += npc.direction.z * moveDistance
  
  // Rotate to face direction
  const dir = npc.direction
  if (dir.x * dir.x + dir.z * dir.z > 0.001) {
    const targetRot = Math.atan2(dir.x, dir.z) + Math.PI
    let angleDiff = targetRot - mesh.rotation.y
    
    // Normalize angle
    if (angleDiff > 3.14159) angleDiff -= 6.28318
    else if (angleDiff < -3.14159) angleDiff += 6.28318
    
    const maxTurn = CONFIG.turnRate * deltaTime
    if (angleDiff > maxTurn) angleDiff = maxTurn
    else if (angleDiff < -maxTurn) angleDiff = -maxTurn
    
    mesh.rotation.y += angleDiff
  }
  
  return true
}

// ============================================================================
// PREDATION (only checks active chasers)
// ============================================================================

function checkPredation() {
  if (activeChasers.size === 0) return
  
  const toRemove = []
  
  for (const predatorId of activeChasers) {
    const predator = npcs.get(predatorId)
    if (!predator || !predator.preyId) continue
    
    const prey = npcs.get(predator.preyId)
    if (!prey) {
      predator.preyId = null
      continue
    }
    
    // Use squared distance (faster)
    const distSq = predator.mesh.position.distanceToSquared(prey.mesh.position)
    
    if (distSq < _eatRangeSq) {
      toRemove.push({ preyId: prey.id, predatorId })
    }
  }
  
  for (let i = 0; i < toRemove.length; i++) {
    const { preyId, predatorId } = toRemove[i]
    const predator = npcs.get(predatorId)
    if (!predator) continue
    
    removeFish(preyId, true)
    
    if (predator.scaleMultiplier < CONFIG.maxScale) {
      predator.scaleMultiplier *= (1 + CONFIG.growthPerEat)
      predator.mesh.scale.setScalar(predator.scaleMultiplier)
      
      const newCapsule = computeCapsuleParams(predator.mesh, { traits: predator.traits })
      predator.volume = computeCapsuleVolume(newCapsule.radius, newCapsule.halfHeight)
      predator.capsuleParams = newCapsule
      
      console.log(`[FishAdder] ${predatorId} ate ${preyId}, grew to ${predator.scaleMultiplier.toFixed(2)}x`)
    }
    
    predator.preyId = null
  }
}

// ============================================================================
// QUERIES
// ============================================================================

function getAllFish() { return npcs }
function getFish(fishId) { return npcs.get(fishId) || null }
function getCount() { return npcs.size }
function getSchoolCount() { return schools.size }

function getFishNear(position, radius) {
  const radiusSq = radius * radius
  const results = []
  
  for (const [, npc] of npcs) {
    const distSq = npc.mesh.position.distanceToSquared(position)
    if (distSq <= radiusSq) {
      results.push({ ...npc, distance: Math.sqrt(distSq) })
    }
  }
  
  return results.sort((a, b) => a.distance - b.distance)
}

function getFishSmallerThan(maxVolume) {
  return [...npcs.values()].filter(npc => npc.volume < maxVolume)
}

function getFishLargerThan(minVolume) {
  return [...npcs.values()].filter(npc => npc.volume > minVolume)
}

function isSchoolingSpecies(fishClass) { return SCHOOLING_SPECIES.has(fishClass) }
function isSolitarySpecies(fishClass) { return SOLITARY_SPECIES.has(fishClass) }

// ============================================================================
// DEBUG
// ============================================================================

function debug() {
  console.log('[FishAdder] Debug:')
  console.log(`  Grid: ${gridPoints.length} points, ${gridHash.size} hash cells`)
  console.log(`  Fish hash: ${fishHash.size} cells (Sets), cell size: ${hashCellSize}`)
  console.log(`  Population: ${npcs.size} / ${CONFIG.targetPopulation}`)
  console.log(`  Active chasers: ${activeChasers.size}`)
  console.log(`  Available species: ${allCreatures.length}`)
  console.log(`  Schools: ${schools.size}`)
  
  // Count by creature type
  const byType = {}
  for (const [, npc] of npcs) {
    byType[npc.creatureType] = (byType[npc.creatureType] || 0) + 1
  }
  console.log(`  By type:`, byType)
  
  const stateCounts = { wander: 0, flee: 0, chase: 0, school: 0 }
  for (const [, npc] of npcs) {
    stateCounts[npc.state] = (stateCounts[npc.state] || 0) + 1
  }
  console.log(`  States:`, stateCounts)
  
  const sizeCounts = { tiny: 0, small: 0, medium: 0, large: 0, huge: 0 }
  for (const [, npc] of npcs) {
    const s = npc.scaleMultiplier
    if (s < 2) sizeCounts.tiny++
    else if (s < 4) sizeCounts.small++
    else if (s < 6) sizeCounts.medium++
    else if (s < 8) sizeCounts.large++
    else sizeCounts.huge++
  }
  console.log(`  Sizes:`, sizeCounts)
  
  // Behavior breakdown
  let bottomDwellers = 0, drifters = 0, swimmers = 0
  for (const [, npc] of npcs) {
    if (npc.isBottomDweller) bottomDwellers++
    else if (npc.isDrifter) drifters++
    else swimmers++
  }
  console.log(`  Behavior: ${swimmers} swimmers, ${drifters} drifters, ${bottomDwellers} bottom-dwellers`)
  
  // Path progress
  let avgProgress = 0
  let count = 0
  for (const [, npc] of npcs) {
    if (npc.path && npc.path.length > 0) {
      avgProgress += npc.pathIndex / npc.path.length
      count++
    }
  }
  if (count > 0) {
    console.log(`  Avg path progress: ${(avgProgress / count * 100).toFixed(0)}% through 10 steps`)
  }
  
  if (schools.size > 0) {
    console.log(`  Active schools:`)
    for (const [schoolId, school] of schools) {
      console.log(`    ${schoolId}: ${school.creatureClass} (${school.memberIds.length} members)`)
    }
  }
}

/**
 * Debug volumes for all NPCs
 * Shows visual volume distribution stats
 */
function debugVolumes() {
  console.group('[FishAdder] Volume Analysis')
  
  let totalVisual = 0
  let totalCapsule = 0
  let totalMeshes = 0
  let minVolume = Infinity
  let maxVolume = 0
  const volumes = []
  const byClass = new Map()
  
  for (const [id, npc] of npcs) {
    const vol = npc.visualVolume || 0
    totalVisual += vol
    totalCapsule += npc.volume || 0
    totalMeshes += npc.meshCount || 0
    volumes.push(vol)
    
    if (vol < minVolume) minVolume = vol
    if (vol > maxVolume) maxVolume = vol
    
    if (!byClass.has(npc.creatureClass)) {
      byClass.set(npc.creatureClass, { 
        count: 0, 
        visualVolume: 0, 
        capsuleVolume: 0,
        meshCount: 0,
        minVol: Infinity,
        maxVol: 0
      })
    }
    const classData = byClass.get(npc.creatureClass)
    classData.count++
    classData.visualVolume += vol
    classData.capsuleVolume += npc.volume || 0
    classData.meshCount += npc.meshCount || 0
    if (vol < classData.minVol) classData.minVol = vol
    if (vol > classData.maxVol) classData.maxVol = vol
  }
  
  // Compute median
  volumes.sort((a, b) => a - b)
  const median = volumes.length > 0 ? volumes[Math.floor(volumes.length / 2)] : 0
  const mean = volumes.length > 0 ? totalVisual / volumes.length : 0
  
  console.log(`Total NPCs: ${npcs.size}`)
  console.log(`Total Visual Volume: ${totalVisual.toFixed(3)} m³`)
  console.log(`Total Capsule Volume: ${totalCapsule.toFixed(3)} m³`)
  console.log(`Total Meshes: ${totalMeshes}`)
  console.log(`─────────────────────────`)
  console.log(`Volume Distribution:`)
  console.log(`  Min: ${minVolume.toFixed(2)} m³`)
  console.log(`  Max: ${maxVolume.toFixed(2)} m³`)
  console.log(`  Mean: ${mean.toFixed(2)} m³`)
  console.log(`  Median: ${median.toFixed(2)} m³`)
  
  console.group('By Species')
  const sortedClasses = [...byClass.entries()].sort((a, b) => b[1].visualVolume - a[1].visualVolume)
  for (const [className, data] of sortedClasses) {
    const avgVol = (data.visualVolume / data.count).toFixed(2)
    const avgMeshes = (data.meshCount / data.count).toFixed(1)
    console.log(`${className}: ${data.count} creatures | avg: ${avgVol} m³ | range: [${data.minVol.toFixed(1)}, ${data.maxVol.toFixed(1)}] | meshes: ${avgMeshes}`)
  }
  console.groupEnd()
  
  console.groupEnd()
}

/**
 * Get volume stats for a specific fish
 * @param {string} fishId - NPC ID
 * @returns {object|null} Volume data
 */
function getVolumeStats(fishId) {
  const npc = npcs.get(fishId)
  if (!npc) return null
  
  return {
    id: npc.id,
    creatureClass: npc.creatureClass,
    visualVolume: npc.visualVolume,
    naturalVisualVolume: npc.naturalVisualVolume,
    capsuleVolume: npc.volume,
    ratio: npc.volume > 0 ? npc.visualVolume / npc.volume : 0,
    meshCount: npc.meshCount,
    breakdown: npc.volumeBreakdown,
    scaleMultiplier: npc.scaleMultiplier,
  }
}

/**
 * Get all volume data as array (for export/analysis)
 * @returns {Array} Volume stats for all NPCs
 */
function getAllVolumeStats() {
  const stats = []
  for (const [id, npc] of npcs) {
    stats.push({
      id,
      creatureType: npc.creatureType,
      creatureClass: npc.creatureClass,
      visualVolume: npc.visualVolume,
      naturalVisualVolume: npc.naturalVisualVolume,
      capsuleVolume: npc.volume,
      ratio: npc.volume > 0 ? npc.visualVolume / npc.volume : 0,
      meshCount: npc.meshCount,
      scaleMultiplier: npc.scaleMultiplier,
    })
  }
  return stats
}

// ============================================================================
// VOLUME LABELS (3D floating labels above creatures)
// ============================================================================

/**
 * Create a text sprite for volume label
 * @param {string} text - Text to display
 * @param {number} [scale=1] - Scale multiplier for the label
 * @returns {THREE.Sprite}
 */
function createTextSprite(text, scale = 1) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  
  // Base font size, will be used for measurement
  const fontSize = 36
  const padding = 16
  
  // Set font BEFORE measuring
  context.font = `bold ${fontSize}px Arial`
  const metrics = context.measureText(text)
  const textWidth = metrics.width
  
  // Size canvas to fit text with padding
  const canvasWidth = Math.ceil(textWidth + padding * 2)
  const canvasHeight = Math.ceil(fontSize + padding * 2)
  
  // Resize canvas (must re-set font after resize)
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  
  // Clear
  context.clearRect(0, 0, canvas.width, canvas.height)
  
  // Re-set font after canvas resize
  context.font = `bold ${fontSize}px Arial`
  
  // Draw background pill
  context.fillStyle = 'rgba(0, 0, 0, 0.75)'
  roundRect(context, 2, 2, canvasWidth - 4, canvasHeight - 4, 10)
  context.fill()
  
  // Draw border
  context.strokeStyle = 'rgba(0, 255, 170, 0.5)'
  context.lineWidth = 2
  roundRect(context, 2, 2, canvasWidth - 4, canvasHeight - 4, 10)
  context.stroke()
  
  // Draw text
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#00ffaa'
  context.fillText(text, canvasWidth / 2, canvasHeight / 2)
  
  // Create sprite
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  
  const material = new THREE.SpriteMaterial({ 
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  
  const sprite = new THREE.Sprite(material)
  
  // Scale sprite to maintain aspect ratio
  // Base world size, then multiply by scale factor
  const baseSize = 0.4  // Small base size for compact labels
  const aspect = canvasWidth / canvasHeight
  sprite.scale.set(baseSize * aspect * scale, baseSize * scale, 1)
  
  return sprite
}

/**
 * Helper to draw rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * Compute label scale based on creature volume
 * Uses cube root to keep labels readable but proportional
 * @param {number} volume - Visual volume
 * @returns {number} Scale factor for label
 */
function computeLabelScale(volume) {
  // Cube root gives perceptually linear scaling
  // Clamp to reasonable range - keep labels small
  const minScale = 0.3
  const maxScale = 1.5
  
  // Base scale on cube root of volume
  // Small multiplier for compact labels
  const scale = Math.cbrt(volume) * 0.15
  
  return Math.max(minScale, Math.min(maxScale, scale))
}

/**
 * Create label for an NPC
 * @param {object} npc - NPC data
 */
function createLabelForNPC(npc) {
  if (!sceneRef || !npc.mesh) return
  
  // Format volume text
  const volText = `${npc.visualVolume.toFixed(2)} m³`
  
  // Compute label scale based on volume
  const labelScale = computeLabelScale(npc.visualVolume)
  
  const sprite = createTextSprite(volText, labelScale)
  
  // Fixed offset above creature
  sprite.position.set(0, 1, 0)
  sprite.userData.isVolumeLabel = true
  
  npc.mesh.add(sprite)
  labelSprites.set(npc.id, sprite)
  
  // Set initial visibility
  sprite.visible = labelsVisible
}

/**
 * Remove label for an NPC
 * @param {string} npcId - NPC ID
 */
function removeLabelForNPC(npcId) {
  const sprite = labelSprites.get(npcId)
  if (sprite) {
    if (sprite.parent) {
      sprite.parent.remove(sprite)
    }
    sprite.material.map?.dispose()
    sprite.material.dispose()
    labelSprites.delete(npcId)
  }
}

/**
 * Update label text for an NPC (e.g., after eating/growing)
 * @param {string} npcId - NPC ID
 */
function updateLabelForNPC(npcId) {
  const npc = npcs.get(npcId)
  const sprite = labelSprites.get(npcId)
  
  if (!npc || !sprite) return
  
  // Remove old label and create new one with updated text
  removeLabelForNPC(npcId)
  createLabelForNPC(npc)
}

/**
 * Create labels for all existing NPCs
 */
function createAllLabels() {
  for (const [id, npc] of npcs) {
    if (!labelSprites.has(id)) {
      createLabelForNPC(npc)
    }
  }
}

/**
 * Remove all labels
 */
function removeAllLabels() {
  for (const [id] of labelSprites) {
    removeLabelForNPC(id)
  }
}

/**
 * Toggle volume labels on/off
 * @returns {boolean} New visibility state
 */
function toggleLabels() {
  labelsVisible = !labelsVisible
  
  if (labelsVisible) {
    // Create labels for any NPCs that don't have them
    createAllLabels()
  }
  
  // Update visibility of all labels
  for (const [, sprite] of labelSprites) {
    sprite.visible = labelsVisible
  }
  
  console.log(`[FishAdder] Volume labels: ${labelsVisible ? 'ON' : 'OFF'}`)
  return labelsVisible
}

/**
 * Set labels visibility explicitly
 * @param {boolean} visible
 */
function setLabelsVisible(visible) {
  labelsVisible = visible
  
  if (visible) {
    createAllLabels()
  }
  
  for (const [, sprite] of labelSprites) {
    sprite.visible = visible
  }
}

/**
 * Check if labels are currently visible
 * @returns {boolean}
 */
function areLabelsVisible() {
  return labelsVisible
}

// ============================================================================
// CONFIG HELPERS (easy runtime control)
// ============================================================================

/**
 * Set target population and adjust current population to match
 * @param {number} count - New target population
 */
function setPopulation(count) {
  CONFIG.targetPopulation = count
  
  const current = npcs.size
  if (current < count) {
    // Spawn more
    const toSpawn = count - current
    for (let i = 0; i < toSpawn; i++) {
      if (Math.random() < CONFIG.schoolChance && npcs.size + CONFIG.schoolSize.min <= count) {
        spawnSchool()
      } else {
        spawnOneCreature()
      }
    }
    console.log(`[FishAdder] Spawned ${npcs.size - current} creatures (now ${npcs.size})`)
  } else if (current > count) {
    // Remove excess (random selection)
    const toRemove = current - count
    const ids = [...npcs.keys()]
    for (let i = 0; i < toRemove && ids.length > 0; i++) {
      const idx = Math.floor(Math.random() * ids.length)
      removeFish(ids[idx], false)
      ids.splice(idx, 1)
    }
    console.log(`[FishAdder] Removed ${current - npcs.size} creatures (now ${npcs.size})`)
  }
  
  return npcs.size
}

/**
 * Set a config value
 * @param {string} key - Config key (e.g., 'baseSpeed', 'fleeRange')
 * @param {*} value - New value
 */
function setConfig(key, value) {
  if (!(key in CONFIG)) {
    console.warn(`[FishAdder] Unknown config key: ${key}`)
    return false
  }
  
  CONFIG[key] = value
  
  // Update cached values if needed
  if (key === 'waypointArrivalDist') _arrivalDistSq = value * value
  if (key === 'fleeRange') _fleeRangeSq = value * value
  if (key === 'chaseRange') _chaseRangeSq = value * value
  if (key === 'eatRange') _eatRangeSq = value * value
  
  console.log(`[FishAdder] Set ${key} = ${value}`)
  return true
}

/**
 * Get a config value
 * @param {string} key - Config key
 */
function getConfig(key) {
  return CONFIG[key]
}

/**
 * Set multiple config values at once
 * @param {object} settings - Object with key-value pairs
 */
function configure(settings) {
  for (const [key, value] of Object.entries(settings)) {
    setConfig(key, value)
  }
}

/**
 * Reset config to defaults (keeps current population)
 */
function resetConfig() {
  const currentPop = CONFIG.targetPopulation
  Object.assign(CONFIG, {
    targetPopulation: currentPop,  // Keep current
    schoolChance: 0.7,
    schoolSize: { min: 4, max: 8 },
    baseSpeed: 4.0,
    speedVariation: 1.0,
    turnRate: 2.5,
    pathLength: 10,
    waypointArrivalDist: 5,
    forwardBias: 0,
    targetBias: 3,
    randomness: 0.5,
    preferredDirBias: 2.5,
    fleeRange: 75,
    chaseRange: 60,
    eatRange: 10,
    predatorSizeRatio: 1.3,
    growthPerEat: 0.08,
    maxScale: 15.0,
    schoolPathOffset: 10,
  })
  
  // Update cached values
  _arrivalDistSq = 25
  _fleeRangeSq = 5625
  _chaseRangeSq = 3600
  _eatRangeSq = 100
  
  console.log('[FishAdder] Config reset to defaults')
}

/**
 * Remove all creatures
 */
function clear() {
  const ids = [...npcs.keys()]
  for (const id of ids) {
    removeFish(id, false)
  }
  activeChasers.clear()
  console.log('[FishAdder] Cleared all creatures')
}

/**
 * Print current config
 */
function printConfig() {
  console.log('[FishAdder] Current config:')
  for (const [key, value] of Object.entries(CONFIG)) {
    if (typeof value === 'object') {
      console.log(`  ${key}:`, value)
    } else {
      console.log(`  ${key}: ${value}`)
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const FishAdder = {
  // Lifecycle
  init,
  update,
  clear,
  
  // Spawning
  spawnInitialFish,
  spawnOneFish,
  spawnOneCreature,
  spawnSchool,
  removeFish,
  maintainPopulation,
  
  // Config (easy to use!)
  setPopulation,
  setConfig,
  getConfig,
  configure,
  resetConfig,
  printConfig,
  
  // Queries
  getAllFish,
  getFish,
  getCount,
  getSchoolCount,
  getFishNear,
  getFishSmallerThan,
  getFishLargerThan,
  
  // Species checks
  isSchoolingSpecies,
  isSolitarySpecies,
  isBottomDweller: (c) => BOTTOM_DWELLERS.has(c),
  isDrifter: (c) => DRIFTERS.has(c),
  
  // Debug
  debug,
  
  // Volume analysis
  debugVolumes,
  getVolumeStats,
  getAllVolumeStats,
  
  // Volume labels
  toggleLabels,
  setLabelsVisible,
  areLabelsVisible,
  
  // Direct access (advanced)
  get config() { return CONFIG },
  get State() { return State },
  get SCHOOLING_SPECIES() { return SCHOOLING_SPECIES },
  get SOLITARY_SPECIES() { return SOLITARY_SPECIES },
  get BOTTOM_DWELLERS() { return BOTTOM_DWELLERS },
  get DRIFTERS() { return DRIFTERS },
  get allCreatures() { return allCreatures },
  get gridPoints() { return gridPoints },
  get adjacencyMap() { return adjacencyMap },
  get activeChasers() { return activeChasers },
}

export default FishAdder