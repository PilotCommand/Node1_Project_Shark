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
  getPlayableClasses,
  getVariantCount,
  randomSeed,
  CreatureType,
} from './Encyclopedia.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'
import { SpawnFactory } from './SpawnFactory.js'
import { computeCapsuleParams } from './ScaleMesh.js'
import { computeCapsuleVolume } from './NormalScale.js'

// ============================================================================
// SPECIES CLASSIFICATION
// ============================================================================

const SCHOOLING_SPECIES = new Set([
  'tuna', 'barracuda', 'tang', 'piranha', 'flyingfish', 'catfish', 'angelfish',
])

const SOLITARY_SPECIES = new Set([
  'shark', 'hammerhead', 'ray', 'manta', 'eel', 'moray', 'grouper',
  'marlin', 'flounder', 'seahorse', 'sunfish', 'anglerfish', 'lionfish',
  'puffer', 'betta',
])

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Population
  targetPopulation: 100,
  
  // School spawning
  schoolChance: 0.7,
  schoolSize: { min: 4, max: 8 },
  
  // Size distribution
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
  
  // GRID-BASED PATHS
  pathLength: 10,              // Exactly 10 grid steps
  waypointArrivalDist: 5,      // Arrived at grid point
  
  // DIRECTION BIAS (easy to edit!)
  forwardBias: 0,              // 0 = no bias, 2 = strong forward preference
  targetBias: 3,               // How strongly to chase/flee toward/away from target
  randomness: 0.5,             // Random factor in direction choice
  
  // Detection (checked when planning new path)
  fleeRange: 75,               // ~3 grid units
  chaseRange: 60,              // ~2.5 grid units
  eatRange: 10,
  
  // Size thresholds
  predatorSizeRatio: 1.3,
  
  // Growth
  growthPerEat: 0.08,
  maxScale: 15.0,
  
  // Schooling
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

let fishClasses = []
let fishIdCounter = 0
let schoolIdCounter = 0

// GRID DATA
let gridPoints = []           // All playable points from SpawnFactory
let gridSpacing = 25          // Distance between grid points
let adjacencyMap = new Map()  // pointIndex -> [neighborIndices]

// SPATIAL HASH (for O(1) lookups instead of O(n))
const gridHash = new Map()    // "cellX,cellY,cellZ" -> [gridPointIndices]
const fishHash = new Map()    // "cellX,cellY,cellZ" -> [fishIds]
let hashCellSize = 50         // Size of spatial hash cells

// OBJECT POOL (avoid GC)
const _tempVec = new THREE.Vector3()
const _tempVec2 = new THREE.Vector3()

// STAGGERED UPDATES
let updateIndex = 0           // Which fish to update this frame
const FISH_PER_FRAME = 10     // Only update N fish per frame

// ============================================================================
// SPATIAL HASH FUNCTIONS
// ============================================================================

function posToCell(x, y, z) {
  return `${Math.floor(x / hashCellSize)},${Math.floor(y / hashCellSize)},${Math.floor(z / hashCellSize)}`
}

function posToVec3Cell(pos) {
  return posToCell(pos.x, pos.y, pos.z)
}

/**
 * Build spatial hash for grid points (run once at init)
 */
function buildGridSpatialHash() {
  gridHash.clear()
  
  for (let i = 0; i < gridPoints.length; i++) {
    const p = gridPoints[i]
    const cell = posToVec3Cell(p)
    
    if (!gridHash.has(cell)) {
      gridHash.set(cell, [])
    }
    gridHash.get(cell).push(i)
  }
  
  console.log(`[FishAdder] Grid spatial hash: ${gridHash.size} cells`)
}

/**
 * Update fish's position in spatial hash
 */
function updateFishInHash(npc, oldPos = null) {
  // Remove from old cell
  if (oldPos) {
    const oldCell = posToVec3Cell(oldPos)
    const oldList = fishHash.get(oldCell)
    if (oldList) {
      const idx = oldList.indexOf(npc.id)
      if (idx !== -1) oldList.splice(idx, 1)
    }
  }
  
  // Add to new cell
  const newCell = posToVec3Cell(npc.mesh.position)
  if (!fishHash.has(newCell)) {
    fishHash.set(newCell, [])
  }
  fishHash.get(newCell).push(npc.id)
  npc._hashCell = newCell
}

/**
 * Get all fish IDs in nearby cells
 */
function getFishInNearbyCells(pos, radius) {
  const result = []
  const cellRadius = Math.ceil(radius / hashCellSize)
  
  const cx = Math.floor(pos.x / hashCellSize)
  const cy = Math.floor(pos.y / hashCellSize)
  const cz = Math.floor(pos.z / hashCellSize)
  
  for (let dx = -cellRadius; dx <= cellRadius; dx++) {
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cell = `${cx + dx},${cy + dy},${cz + dz}`
        const fishInCell = fishHash.get(cell)
        if (fishInCell) {
          result.push(...fishInCell)
        }
      }
    }
  }
  
  return result
}

// ============================================================================
// GRID FUNCTIONS
// ============================================================================

/**
 * Build adjacency map from SpawnFactory grid
 * Uses spatial hashing for O(k) neighbor lookup instead of O(n²)
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
  
  // Use spatial hash to find neighbors (much faster than O(n²))
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
  // Check nearby cells first
  const cx = Math.floor(position.x / hashCellSize)
  const cy = Math.floor(position.y / hashCellSize)
  const cz = Math.floor(position.z / hashCellSize)
  
  let nearestIdx = -1
  let nearestDistSq = Infinity
  
  // Expand search radius until we find something
  for (let radius = 0; radius <= 3; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check shell (skip interior on larger radii)
          if (radius > 0 && 
              Math.abs(dx) < radius && 
              Math.abs(dy) < radius && 
              Math.abs(dz) < radius) continue
          
          const cell = `${cx + dx},${cy + dy},${cz + dz}`
          const pointsInCell = gridHash.get(cell)
          
          if (pointsInCell) {
            for (const idx of pointsInCell) {
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
    
    // Found something in this radius? Done.
    if (nearestIdx !== -1) break
  }
  
  // Fallback to random if nothing found (shouldn't happen)
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
function pickNextGridStep(currentIdx, forwardDir, biasTarget = null, avoidTarget = false) {
  const neighbors = adjacencyMap.get(currentIdx)
  if (!neighbors || neighbors.length === 0) {
    return getRandomGridIndex()
  }
  
  const currentPos = gridPoints[currentIdx]
  
  // Pre-compute target direction if needed
  let targetDir = null
  if (biasTarget && CONFIG.targetBias > 0) {
    targetDir = _tempVec2.subVectors(biasTarget, currentPos).normalize()
  }
  
  let bestIdx = neighbors[0]
  let bestScore = -Infinity
  
  for (const neighborIdx of neighbors) {
    const neighborPos = gridPoints[neighborIdx]
    
    // Reuse _tempVec for direction calculation
    _tempVec.subVectors(neighborPos, currentPos).normalize()
    
    // Start with zero score
    let score = 0
    
    // Forward bias (configurable, 0 = disabled)
    if (CONFIG.forwardBias > 0) {
      score += forwardDir.dot(_tempVec) * CONFIG.forwardBias
    }
    
    // Target bias (chase/flee)
    if (targetDir && CONFIG.targetBias > 0) {
      const targetDot = _tempVec.dot(targetDir)
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
  fishClasses = getPlayableClasses()
  
  // Build adjacency map from SpawnFactory grid
  buildAdjacencyMap()
  
  isInitialized = true
  console.log(`[FishAdder] Initialized with ${fishClasses.length} fish classes, ${gridPoints.length} grid points`)
}

// ============================================================================
// SPAWNING
// ============================================================================

function spawnInitialFish(count = CONFIG.targetPopulation) {
  if (!isInitialized) {
    console.error('[FishAdder] Not initialized')
    return
  }
  
  console.log(`[FishAdder] Spawning ~${count} fish...`)
  
  let spawned = 0
  
  while (spawned < count) {
    if (Math.random() < CONFIG.schoolChance && spawned + CONFIG.schoolSize.min <= count) {
      const schoolResult = spawnSchool()
      if (schoolResult) spawned += schoolResult.count
    } else {
      if (spawnOneFish()) spawned++
    }
  }
  
  console.log(`[FishAdder] Spawned ${spawned} fish in ${schools.size} schools`)
  return { spawned, schools: schools.size }
}

function spawnSchool() {
  if (gridPoints.length === 0) return null
  
  const startIdx = getRandomGridIndex()
  const position = gridPoints[startIdx].clone()
  
  const schoolingClasses = fishClasses.filter(fc => SCHOOLING_SPECIES.has(fc))
  if (schoolingClasses.length === 0) return null
  
  const fishClass = schoolingClasses[Math.floor(Math.random() * schoolingClasses.length)]
  const variantCount = getVariantCount(fishClass)
  const variantIndex = Math.floor(Math.random() * variantCount)
  const scaleMultiplier = pickRandomSize()
  
  const schoolSize = CONFIG.schoolSize.min + 
    Math.floor(Math.random() * (CONFIG.schoolSize.max - CONFIG.schoolSize.min + 1))
  
  const schoolId = `school_${schoolIdCounter++}`
  const memberIds = []
  let leaderId = null
  
  for (let i = 0; i < schoolSize; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 15
    )
    const spawnPos = position.clone().add(offset)
    
    const fish = spawnOneFish({
      position: spawnPos,
      fishClass,
      variantIndex,
      scaleMultiplier: scaleMultiplier * (0.9 + Math.random() * 0.2),
      schoolId,
      isLeader: i === 0,
    })
    
    if (fish) {
      memberIds.push(fish.id)
      if (i === 0) leaderId = fish.id
    }
  }
  
  if (leaderId && memberIds.length > 1) {
    schools.set(schoolId, { leaderId, memberIds, fishClass })
    console.log(`[FishAdder] Spawned school of ${memberIds.length} ${fishClass}`)
  }
  
  return { count: memberIds.length, schoolId }
}

function spawnOneFish(options = {}) {
  if (gridPoints.length === 0) return null
  
  const {
    position = gridPoints[getRandomGridIndex()].clone(),
    fishClass = fishClasses[Math.floor(Math.random() * fishClasses.length)],
    variantIndex = Math.floor(Math.random() * getVariantCount(fishClass)),
    scaleMultiplier = pickRandomSize(),
    schoolId = null,
    isLeader = false,
  } = options
  
  const seed = randomSeed()
  const creatureData = generateCreature(seed, CreatureType.FISH, fishClass, variantIndex)
  
  if (!creatureData?.mesh) return null
  
  creatureData.mesh.scale.setScalar(scaleMultiplier)
  creatureData.mesh.position.copy(position)
  creatureData.mesh.rotation.y = Math.random() * Math.PI * 2
  
  sceneRef.add(creatureData.mesh)
  
  const capsuleParams = computeCapsuleParams(creatureData.mesh, creatureData)
  const volume = computeCapsuleVolume(capsuleParams.radius, capsuleParams.halfHeight)
  
  const fishId = `npc_fish_${fishIdCounter++}`
  
  // Find starting grid index
  const currentGridIdx = findNearestGridIndex(position)
  
  const npcData = {
    id: fishId,
    mesh: creatureData.mesh,
    seed,
    fishClass,
    variantIndex,
    scaleMultiplier,
    capsuleParams,
    volume,
    traits: creatureData.traits,
    
    // AI state
    state: schoolId && !isLeader ? State.SCHOOL : State.WANDER,
    schoolId,
    isLeader,
    
    // Movement
    direction: new THREE.Vector3(0, 0, 1),
    speed: CONFIG.baseSpeed * (0.7 + Math.random() * CONFIG.speedVariation),
    baseSpeed: CONFIG.baseSpeed * (0.7 + Math.random() * CONFIG.speedVariation),
    
    // GRID-BASED PATH (array of grid indices)
    path: [],           // Array of grid point indices
    pathIndex: 0,       // Current step in path
    currentGridIdx,     // Current grid position
    
    // Targets (set during planning)
    threatId: null,
    preyId: null,
  }
  
  // Generate initial path
  planGridPath(npcData)
  
  npcs.set(fishId, npcData)
  
  // Add to spatial hash
  updateFishInHash(npcData)
  
  MeshRegistry.register(fishId, {
    mesh: creatureData.mesh,
    body: null,
    category: Category.NPC,
    tags: [Tag.ANIMATED],
    metadata: { fishClass, variantIndex, scaleMultiplier, volume, seed, schoolId }
  }, true)
  
  return npcData
}

function pickRandomSize() {
  const dist = CONFIG.sizeDistribution
  const totalWeight = Object.values(dist).reduce((sum, d) => sum + d.weight, 0)
  let roll = Math.random() * totalWeight
  
  for (const [, data] of Object.entries(dist)) {
    roll -= data.weight
    if (roll <= 0) {
      const [min, max] = data.scale
      return min + Math.random() * (max - min)
    }
  }
  return 1.0
}

// ============================================================================
// REMOVAL
// ============================================================================

function removeFish(fishId, respawn = true) {
  const npc = npcs.get(fishId)
  if (!npc) return null
  
  // Remove from spatial hash
  if (npc._hashCell) {
    const cellList = fishHash.get(npc._hashCell)
    if (cellList) {
      const idx = cellList.indexOf(fishId)
      if (idx !== -1) cellList.splice(idx, 1)
    }
  }
  
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
    planFleePath(npc, threat)
    return
  }
  
  const prey = findNearestPrey(npc)
  if (prey) {
    npc.state = State.CHASE
    npc.preyId = prey.id
    npc.threatId = null
    npc.speed = npc.baseSpeed * 1.3
    planChasePath(npc, prey)
    return
  }
  
  // Default: wander
  npc.state = State.WANDER
  npc.threatId = null
  npc.preyId = null
  npc.speed = npc.baseSpeed
  planWanderPath(npc)
}

/**
 * Plan 10 grid steps with forward bias
 */
function planWanderPath(npc) {
  const path = []
  let currentIdx = npc.currentGridIdx
  let forwardDir = npc.direction.clone()
  
  if (forwardDir.lengthSq() < 0.01) {
    forwardDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
  }
  
  for (let i = 0; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir)
    path.push(nextIdx)
    
    // Update forward direction
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
  let currentIdx = npc.currentGridIdx
  let forwardDir = npc.direction.clone()
  
  const threatPos = threat.mesh.position
  
  for (let i = 0; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir, threatPos, true) // avoidTarget = true
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
  let currentIdx = npc.currentGridIdx
  let forwardDir = npc.direction.clone()
  
  // Predict where prey will be
  let targetPos = prey.mesh.position.clone()
  if (prey.path && prey.path.length > 0 && prey.pathIndex < prey.path.length) {
    const futureIdx = Math.min(prey.pathIndex + 5, prey.path.length - 1)
    targetPos = gridPoints[prey.path[futureIdx]].clone()
  }
  
  for (let i = 0; i < CONFIG.pathLength; i++) {
    const nextIdx = pickNextGridStep(currentIdx, forwardDir, targetPos, false) // toward target
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
  let nearest = null
  let nearestDistSq = CONFIG.fleeRange * CONFIG.fleeRange
  
  // Only check fish in nearby cells (O(k) instead of O(n))
  const nearbyFishIds = getFishInNearbyCells(pos, CONFIG.fleeRange)
  
  for (const otherId of nearbyFishIds) {
    if (otherId === npc.id) continue
    
    const other = npcs.get(otherId)
    if (!other) continue
    if (other.volume < npc.volume * CONFIG.predatorSizeRatio) continue
    
    const distSq = pos.distanceToSquared(other.mesh.position)
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = other
    }
  }
  
  // Check player (always check, not in hash)
  const player = MeshRegistry.get('player')
  if (player?.mesh) {
    const playerVolume = player.metadata?.volume || 1
    if (playerVolume > npc.volume * CONFIG.predatorSizeRatio) {
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
  let nearest = null
  let nearestDistSq = CONFIG.chaseRange * CONFIG.chaseRange
  
  // Only check fish in nearby cells
  const nearbyFishIds = getFishInNearbyCells(pos, CONFIG.chaseRange)
  
  for (const otherId of nearbyFishIds) {
    if (otherId === npc.id) continue
    
    const other = npcs.get(otherId)
    if (!other) continue
    if (npc.volume < other.volume * CONFIG.predatorSizeRatio) continue
    
    const distSq = pos.distanceToSquared(other.mesh.position)
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = other
    }
  }
  
  return nearest
}

// ============================================================================
// UPDATE LOOP (staggered for performance)
// ============================================================================

function update(deltaTime) {
  if (!isInitialized) return
  
  const fishArray = [...npcs.values()]
  const fishCount = fishArray.length
  
  if (fishCount === 0) return
  
  // STAGGERED: Only process FISH_PER_FRAME fish for path completion
  // But ALL fish get movement updates (cheap)
  const startIdx = updateIndex % fishCount
  let processed = 0
  
  for (let i = 0; i < fishCount; i++) {
    const npc = fishArray[i]
    
    // Movement update for ALL fish (cheap)
    const moved = followGridPath(npc, deltaTime)
    
    // Update spatial hash if moved to new cell
    if (moved && npc._hashCell) {
      const newCell = posToVec3Cell(npc.mesh.position)
      if (newCell !== npc._hashCell) {
        // Remove from old cell
        const oldList = fishHash.get(npc._hashCell)
        if (oldList) {
          const idx = oldList.indexOf(npc.id)
          if (idx !== -1) oldList.splice(idx, 1)
        }
        // Add to new cell
        if (!fishHash.has(newCell)) fishHash.set(newCell, [])
        fishHash.get(newCell).push(npc.id)
        npc._hashCell = newCell
      }
    }
    
    // Path planning only for subset (expensive, but fish won't replan
    // until their path is done anyway, so this just staggers the load)
  }
  
  updateIndex += FISH_PER_FRAME
  
  // Check for eating (only fish in CHASE state)
  checkPredation()
}

/**
 * Move fish along grid path
 * Returns true if fish moved
 */
function followGridPath(npc, deltaTime) {
  const { mesh, path, pathIndex } = npc
  
  // No path or path complete? Plan new one
  if (!path || path.length === 0 || pathIndex >= path.length) {
    planGridPath(npc)
    return false
  }
  
  // Get current target grid point
  const targetIdx = path[pathIndex]
  const targetPos = gridPoints[targetIdx]
  
  if (!targetPos) {
    planGridPath(npc)
    return false
  }
  
  // Direction to target (use pooled vector)
  _tempVec.subVectors(targetPos, mesh.position)
  const dist = _tempVec.length()
  
  // Arrived at grid point?
  if (dist < CONFIG.waypointArrivalDist) {
    npc.currentGridIdx = targetIdx
    npc.pathIndex++
    
    // Path complete? Will plan new one next frame
    if (npc.pathIndex >= path.length) {
      return false
    }
  }
  
  // Update direction
  if (dist > 0.1) {
    _tempVec.normalize()
    npc.direction.lerp(_tempVec, 0.2).normalize()
  }
  
  // Move
  const moveDistance = npc.speed * deltaTime
  mesh.position.addScaledVector(npc.direction, moveDistance)
  
  // Rotate to face direction
  if (npc.direction.lengthSq() > 0.001) {
    const targetRotation = Math.atan2(npc.direction.x, npc.direction.z) + Math.PI
    
    let angleDiff = targetRotation - mesh.rotation.y
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    
    const maxTurn = CONFIG.turnRate * deltaTime
    mesh.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, angleDiff))
  }
  
  return true
}

// ============================================================================
// PREDATION
// ============================================================================

function checkPredation() {
  const toRemove = []
  
  for (const [predatorId, predator] of npcs) {
    if (predator.state !== State.CHASE || !predator.preyId) continue
    
    const prey = npcs.get(predator.preyId)
    if (!prey) continue
    
    const dist = predator.mesh.position.distanceTo(prey.mesh.position)
    
    if (dist < CONFIG.eatRange) {
      toRemove.push({ preyId: prey.id, predatorId })
    }
  }
  
  for (const { preyId, predatorId } of toRemove) {
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
    // Path continues - no forced replan until path complete
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
  console.log(`  Fish hash: ${fishHash.size} cells, cell size: ${hashCellSize}`)
  console.log(`  Population: ${npcs.size} / ${CONFIG.targetPopulation}`)
  console.log(`  Schools: ${schools.size}`)
  
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
      console.log(`    ${schoolId}: ${school.fishClass} (${school.memberIds.length} fish)`)
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const FishAdder = {
  init,
  spawnInitialFish,
  spawnOneFish,
  spawnSchool,
  removeFish,
  maintainPopulation,
  update,
  
  getAllFish,
  getFish,
  getCount,
  getSchoolCount,
  getFishNear,
  getFishSmallerThan,
  getFishLargerThan,
  
  isSchoolingSpecies,
  isSolitarySpecies,
  
  debug,
  
  get config() { return CONFIG },
  get State() { return State },
  get SCHOOLING_SPECIES() { return SCHOOLING_SPECIES },
  get SOLITARY_SPECIES() { return SOLITARY_SPECIES },
  get gridPoints() { return gridPoints },
  get adjacencyMap() { return adjacencyMap },
}

export default FishAdder