/**
 * MeshVolume.js - Calculate true visual mesh volume + Volume Registry
 * 
 * All creature meshes use BoxGeometry, so we compute volume directly from
 * box dimensions and world scale for maximum accuracy.
 * 
 * VOLUME REGISTRY:
 *   Stores TotalEncyclopediaVolume and TotalWorldVolume for all entities.
 *   - TotalEncyclopediaVolume: Sum of visual mesh boxes at scale=1 (immutable)
 *   - EncyclopediaPhysicsVolume: Capsule volume at scale=1 (immutable)
 *   - TotalWorldVolume: Current gameplay volume [1, 1000] m³ (mutable)
 *   - WorldPhysicsVolume: Always equals TotalWorldVolume (by design)
 * 
 * Usage:
 *   import { 
 *     computeGroupVolume, 
 *     registerVolume, 
 *     getVolume, 
 *     updateWorldVolume 
 *   } from './MeshVolume.js'
 *   
 *   // Register a player (starts at 1 m³)
 *   registerVolume('player', true, mesh, capsuleParams)
 *   
 *   // Register an NPC (gets log-normal distributed volume)
 *   registerVolume(npcId, false, mesh, capsuleParams)
 *   
 *   // Get volume data
 *   const data = getVolume('player')
 *   // { totalWorldVolume, visualScaleFactor, physicsScaleFactor, ... }
 *   
 *   // Update after eating
 *   const updated = updateWorldVolume('player', newVolume)
 *   mesh.scale.setScalar(updated.visualScaleFactor)
 */

import * as THREE from 'three'

// ============================================================================
// VOLUME REGISTRY CONFIGURATION
// ============================================================================

const VOLUME_CONFIG = {
  MIN_VOLUME: 1,        // Minimum world volume (m³)
  MAX_VOLUME: 1000,     // Maximum world volume (m³)
  STARTER_VOLUME: 1,    // Player starting volume (m³)
  
  // Log-normal distribution parameters for NPC spawning
  LOG_MEAN: 3.5,        // ~33 m³ median
  LOG_STD: 1.5,         // Spread
}

// ============================================================================
// VOLUME REGISTRY STORAGE
// ============================================================================

/**
 * Volume registry - stores volumes for all entities (players + NPCs)
 * 
 * Structure per entity:
 * {
 *   entityId: string,
 *   isPlayer: boolean,
 *   
 *   // Encyclopedia (immutable - computed at scale=1)
 *   totalEncyclopediaVolume: number,      // Sum of visual mesh boxes
 *   encyclopediaPhysicsVolume: number,    // Capsule volume at scale=1
 *   
 *   // World (mutable - changes on eating)
 *   totalWorldVolume: number,             // [1, 1000] m³
 *   worldPhysicsVolume: number,           // Always equals totalWorldVolume
 *   
 *   // Scale factors (derived)
 *   visualScaleFactor: number,            // Applied to mesh
 *   physicsScaleFactor: number,           // Applied to capsule (DIFFERENT from visual!)
 * }
 */
const volumeRegistry = new Map()

// ============================================================================
// CORE VOLUME CALCULATION
// ============================================================================

/**
 * Extract scale factors from a Matrix4
 * @param {THREE.Matrix4} matrix 
 * @returns {{x: number, y: number, z: number}}
 */
function getScaleFromMatrix(matrix) {
  const te = matrix.elements
  
  // Extract scale by computing length of each basis vector
  const scaleX = Math.sqrt(te[0] * te[0] + te[1] * te[1] + te[2] * te[2])
  const scaleY = Math.sqrt(te[4] * te[4] + te[5] * te[5] + te[6] * te[6])
  const scaleZ = Math.sqrt(te[8] * te[8] + te[9] * te[9] + te[10] * te[10])
  
  return { x: scaleX, y: scaleY, z: scaleZ }
}

/**
 * Compute volume of a BoxGeometry considering world transform
 * 
 * @param {THREE.BoxGeometry} geometry - The box geometry
 * @param {THREE.Matrix4} worldMatrix - World transform matrix
 * @returns {number} Volume in cubic units
 */
function computeBoxVolume(geometry, worldMatrix) {
  // Get base dimensions from geometry parameters
  const params = geometry.parameters
  if (!params) return 0
  
  const baseWidth = params.width || 1
  const baseHeight = params.height || 1
  const baseDepth = params.depth || 1
  
  // Base volume (unscaled)
  const baseVolume = baseWidth * baseHeight * baseDepth
  
  // Get scale from world matrix
  const scale = getScaleFromMatrix(worldMatrix)
  
  // Final volume = base × scaleX × scaleY × scaleZ
  return baseVolume * scale.x * scale.y * scale.z
}

/**
 * Compute volume of a BufferGeometry using signed tetrahedron method
 * Fallback for non-box geometries
 * 
 * @param {THREE.BufferGeometry} geometry - The geometry to measure
 * @param {THREE.Matrix4} worldMatrix - World transform matrix
 * @returns {number} Volume in cubic units
 */
function computeGeneralVolume(geometry, worldMatrix) {
  if (!geometry || !geometry.attributes.position) {
    return 0
  }
  
  const position = geometry.attributes.position
  const index = geometry.index
  
  let totalVolume = 0
  
  // Temporary vectors
  const p1 = new THREE.Vector3()
  const p2 = new THREE.Vector3()
  const p3 = new THREE.Vector3()
  
  if (index) {
    const indices = index.array
    for (let i = 0; i < indices.length; i += 3) {
      p1.fromBufferAttribute(position, indices[i])
      p2.fromBufferAttribute(position, indices[i + 1])
      p3.fromBufferAttribute(position, indices[i + 2])
      
      if (worldMatrix) {
        p1.applyMatrix4(worldMatrix)
        p2.applyMatrix4(worldMatrix)
        p3.applyMatrix4(worldMatrix)
      }
      
      // Signed volume of tetrahedron with origin
      totalVolume += p1.dot(p2.clone().cross(p3)) / 6.0
    }
  } else {
    const count = position.count
    for (let i = 0; i < count; i += 3) {
      p1.fromBufferAttribute(position, i)
      p2.fromBufferAttribute(position, i + 1)
      p3.fromBufferAttribute(position, i + 2)
      
      if (worldMatrix) {
        p1.applyMatrix4(worldMatrix)
        p2.applyMatrix4(worldMatrix)
        p3.applyMatrix4(worldMatrix)
      }
      
      totalVolume += p1.dot(p2.clone().cross(p3)) / 6.0
    }
  }
  
  return Math.abs(totalVolume)
}

/**
 * Compute volume of a geometry, choosing best method based on type
 * 
 * @param {THREE.BufferGeometry} geometry 
 * @param {THREE.Matrix4} worldMatrix 
 * @returns {number}
 */
export function computeGeometryVolume(geometry, worldMatrix) {
  if (!geometry) return 0
  
  // Use optimized method for BoxGeometry
  if (geometry.type === 'BoxGeometry' && geometry.parameters) {
    return computeBoxVolume(geometry, worldMatrix)
  }
  
  // Fallback to general method
  return computeGeneralVolume(geometry, worldMatrix)
}

/**
 * Compute volume of a single Mesh
 * 
 * @param {THREE.Mesh} mesh - The mesh to measure
 * @param {boolean} [useWorldMatrix=true] - Whether to include parent transforms
 * @returns {number} Volume in cubic units
 */
export function computeMeshVolume(mesh, useWorldMatrix = true) {
  if (!mesh || !mesh.geometry) {
    return 0
  }
  
  if (useWorldMatrix) {
    mesh.updateWorldMatrix(true, false)
    return computeGeometryVolume(mesh.geometry, mesh.matrixWorld)
  }
  
  mesh.updateMatrix()
  return computeGeometryVolume(mesh.geometry, mesh.matrix)
}

// ============================================================================
// GROUP VOLUME CALCULATION
// ============================================================================

/**
 * Compute total volume of all meshes in a group/object
 * 
 * @param {THREE.Object3D} object - Group or mesh to measure
 * @param {boolean} [useWorldMatrix=true] - Whether to include all transforms
 * @returns {number} Total volume in cubic units
 */
export function computeGroupVolume(object, useWorldMatrix = true) {
  let totalVolume = 0
  
  // Update ALL world matrices first
  object.updateWorldMatrix(true, true)
  
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      totalVolume += computeMeshVolume(child, useWorldMatrix)
    }
  })
  
  return totalVolume
}

/**
 * Get volume breakdown by mesh name
 * 
 * @param {THREE.Object3D} object - Group to analyze
 * @param {boolean} [useWorldMatrix=true] - Whether to include all transforms
 * @returns {{ [meshName: string]: number, total: number, meshCount: number }}
 */
export function getMeshVolumeBreakdown(object, useWorldMatrix = true) {
  const breakdown = {}
  let total = 0
  let meshCount = 0
  
  // Update all world matrices first
  object.updateWorldMatrix(true, true)
  
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const volume = computeMeshVolume(child, useWorldMatrix)
      const name = child.name || `mesh_${meshCount}`
      
      // Handle duplicate names
      let uniqueName = name
      let suffix = 1
      while (breakdown[uniqueName] !== undefined) {
        uniqueName = `${name}_${suffix++}`
      }
      
      breakdown[uniqueName] = volume
      total += volume
      meshCount++
    }
  })
  
  breakdown.total = total
  breakdown.meshCount = meshCount
  
  return breakdown
}

// ============================================================================
// CAPSULE VOLUME CALCULATION
// ============================================================================

/**
 * Compute capsule volume
 * 
 * Capsule = Cylinder + 2 Hemispheres (= 1 Sphere)
 * V = πr²h + (4/3)πr³
 *   = πr²(h + 4r/3)
 * 
 * @param {number} radius - Capsule radius
 * @param {number} halfHeight - Half the cylinder height
 * @returns {number} Volume in cubic meters
 */
export function computeCapsuleVolume(radius, halfHeight) {
  const r = radius
  const h = halfHeight * 2  // Full cylinder height
  
  // V = πr²(h + 4r/3)
  return Math.PI * r * r * (h + (4 * r / 3))
}

/**
 * Compute capsule volume from params object
 * 
 * @param {object} capsuleParams - { radius, halfHeight }
 * @returns {number} Volume in cubic meters
 */
export function computeCapsuleVolumeFromParams(capsuleParams) {
  if (!capsuleParams) return 0
  return computeCapsuleVolume(capsuleParams.radius, capsuleParams.halfHeight)
}

// ============================================================================
// VOLUME REGISTRY - REGISTRATION
// ============================================================================

/**
 * Generate log-normal distributed volume for NPC spawning
 * More small fish, fewer large fish - natural distribution
 * 
 * @returns {number} Target volume in [MIN_VOLUME, MAX_VOLUME]
 */
function generateNPCTargetVolume() {
  // Box-Muller transform for normal distribution
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  
  const logVolume = VOLUME_CONFIG.LOG_MEAN + z * VOLUME_CONFIG.LOG_STD
  const volume = Math.exp(logVolume)
  
  // Clamp to bounds
  return Math.max(VOLUME_CONFIG.MIN_VOLUME, Math.min(VOLUME_CONFIG.MAX_VOLUME, volume))
}

/**
 * Register an entity in the volume registry
 * 
 * @param {string} entityId - Unique entity ID
 * @param {boolean} isPlayer - True for players, false for NPCs
 * @param {THREE.Object3D} mesh - The creature mesh (at scale=1)
 * @param {object} capsuleParams - { radius, halfHeight } at scale=1
 * @param {number} [targetVolume] - Optional specific target volume (for NPCs with predetermined size)
 * @returns {object} The registered volume data
 */
export function registerVolume(entityId, isPlayer, mesh, capsuleParams, targetVolume = null) {
  // Compute encyclopedia volumes at scale=1
  // IMPORTANT: Mesh should be at scale=1 when this is called
  const savedScale = mesh.scale.x  // Save current scale
  mesh.scale.setScalar(1)          // Reset to scale=1
  mesh.updateWorldMatrix(true, true)
  
  const totalEncyclopediaVolume = computeGroupVolume(mesh, false)
  const encyclopediaPhysicsVolume = computeCapsuleVolumeFromParams(capsuleParams)
  
  mesh.scale.setScalar(savedScale) // Restore scale
  
  // Determine target world volume
  let totalWorldVolume
  if (targetVolume !== null) {
    // Use provided target volume
    totalWorldVolume = Math.max(VOLUME_CONFIG.MIN_VOLUME, Math.min(VOLUME_CONFIG.MAX_VOLUME, targetVolume))
  } else if (isPlayer) {
    // Players always start at STARTER_VOLUME
    totalWorldVolume = VOLUME_CONFIG.STARTER_VOLUME
  } else {
    // NPCs get log-normal distributed volume
    totalWorldVolume = generateNPCTargetVolume()
  }
  
  // World physics volume equals world visual volume (by design)
  const worldPhysicsVolume = totalWorldVolume
  
  // Compute scale factors
  // Visual: scale mesh so its volume = totalWorldVolume
  const visualScaleFactor = Math.cbrt(totalWorldVolume / totalEncyclopediaVolume)
  
  // Physics: scale capsule so its volume = totalWorldVolume (DIFFERENT scale!)
  const physicsScaleFactor = Math.cbrt(totalWorldVolume / encyclopediaPhysicsVolume)
  
  const volumeData = {
    entityId,
    isPlayer,
    
    // Encyclopedia (immutable)
    totalEncyclopediaVolume,
    encyclopediaPhysicsVolume,
    
    // World (mutable)
    totalWorldVolume,
    worldPhysicsVolume,
    
    // Scale factors (derived)
    visualScaleFactor,
    physicsScaleFactor,
    
    // Timestamp
    registeredAt: Date.now(),
    updatedAt: Date.now(),
  }
  
  volumeRegistry.set(entityId, volumeData)
  
  console.log(`[VolumeRegistry] Registered ${isPlayer ? 'player' : 'NPC'} "${entityId}":`, {
    encyclopediaVolume: totalEncyclopediaVolume.toFixed(4),
    encyclopediaPhysics: encyclopediaPhysicsVolume.toFixed(4),
    worldVolume: totalWorldVolume.toFixed(2),
    visualScale: visualScaleFactor.toFixed(4),
    physicsScale: physicsScaleFactor.toFixed(4),
  })
  
  return volumeData
}

// ============================================================================
// VOLUME REGISTRY - QUERIES
// ============================================================================

/**
 * Get volume data for an entity
 * 
 * @param {string} entityId - Entity ID
 * @returns {object|null} Volume data or null if not found
 */
export function getVolume(entityId) {
  return volumeRegistry.get(entityId) || null
}

/**
 * Check if an entity is registered
 * 
 * @param {string} entityId - Entity ID
 * @returns {boolean}
 */
export function hasVolume(entityId) {
  return volumeRegistry.has(entityId)
}

/**
 * Get all registered volumes
 * 
 * @returns {Map} Copy of volume registry
 */
export function getAllVolumes() {
  return new Map(volumeRegistry)
}

/**
 * Get volume data for all players
 * 
 * @returns {Array} Array of player volume data
 */
export function getPlayerVolumes() {
  const players = []
  for (const data of volumeRegistry.values()) {
    if (data.isPlayer) {
      players.push(data)
    }
  }
  return players
}

/**
 * Get volume data for all NPCs
 * 
 * @returns {Array} Array of NPC volume data
 */
export function getNPCVolumes() {
  const npcs = []
  for (const data of volumeRegistry.values()) {
    if (!data.isPlayer) {
      npcs.push(data)
    }
  }
  return npcs
}

// ============================================================================
// VOLUME REGISTRY - UPDATES
// ============================================================================

/**
 * Update an entity's world volume (after eating)
 * 
 * This recalculates scale factors and returns them for application.
 * The caller is responsible for applying the scales to mesh and physics.
 * 
 * @param {string} entityId - Entity ID
 * @param {number} newTotalWorldVolume - New total world volume
 * @returns {object|null} Updated volume data with new scale factors, or null if not found
 */
export function updateWorldVolume(entityId, newTotalWorldVolume) {
  const data = volumeRegistry.get(entityId)
  if (!data) {
    console.warn(`[VolumeRegistry] Cannot update unknown entity: ${entityId}`)
    return null
  }
  
  // Clamp to bounds
  const clampedVolume = Math.max(VOLUME_CONFIG.MIN_VOLUME, Math.min(VOLUME_CONFIG.MAX_VOLUME, newTotalWorldVolume))
  
  const oldVolume = data.totalWorldVolume
  
  // Update world volumes
  data.totalWorldVolume = clampedVolume
  data.worldPhysicsVolume = clampedVolume  // Always equal
  
  // Recalculate scale factors
  data.visualScaleFactor = Math.cbrt(clampedVolume / data.totalEncyclopediaVolume)
  data.physicsScaleFactor = Math.cbrt(clampedVolume / data.encyclopediaPhysicsVolume)
  
  data.updatedAt = Date.now()
  
  console.log(`[VolumeRegistry] Updated "${entityId}": ${oldVolume.toFixed(2)} → ${clampedVolume.toFixed(2)} m³`)
  
  return {
    ...data,
    volumeGained: clampedVolume - oldVolume,
    wasCapped: newTotalWorldVolume > VOLUME_CONFIG.MAX_VOLUME,
  }
}

/**
 * Add volume to an entity (convenience wrapper for eating)
 * 
 * @param {string} entityId - Entity ID
 * @param {number} volumeToAdd - Volume to add
 * @returns {object|null} Updated volume data
 */
export function addVolume(entityId, volumeToAdd) {
  const data = volumeRegistry.get(entityId)
  if (!data) return null
  
  return updateWorldVolume(entityId, data.totalWorldVolume + volumeToAdd)
}

// ============================================================================
// VOLUME REGISTRY - REMOVAL
// ============================================================================

/**
 * Unregister an entity from the volume registry
 * 
 * @param {string} entityId - Entity ID
 * @returns {boolean} True if entity was removed
 */
export function unregisterVolume(entityId) {
  const existed = volumeRegistry.has(entityId)
  if (existed) {
    volumeRegistry.delete(entityId)
    console.log(`[VolumeRegistry] Unregistered "${entityId}"`)
  }
  return existed
}

/**
 * Clear all entries from the volume registry
 */
export function clearVolumeRegistry() {
  const count = volumeRegistry.size
  volumeRegistry.clear()
  console.log(`[VolumeRegistry] Cleared ${count} entries`)
}

// ============================================================================
// FEEDING HELPERS
// ============================================================================

/**
 * Get feeding relationship between two entities
 * 
 * @param {string} entityId1 - First entity ID
 * @param {string} entityId2 - Second entity ID
 * @returns {'CAN_EAT' | 'CAN_BE_EATEN' | 'NEUTRAL' | 'UNKNOWN'}
 */
export function getFeedingRelationship(entityId1, entityId2) {
  const data1 = volumeRegistry.get(entityId1)
  const data2 = volumeRegistry.get(entityId2)
  
  if (!data1 || !data2) return 'UNKNOWN'
  
  const ratio = data1.totalWorldVolume / data2.totalWorldVolume
  
  if (ratio >= 1.05) return 'CAN_EAT'       // entity1 can eat entity2 (5% larger)
  if (ratio <= 0.95) return 'CAN_BE_EATEN'  // entity1 can be eaten by entity2
  return 'NEUTRAL'                           // Neither can eat the other
}

/**
 * Check if predator can eat prey (by volume comparison)
 * 
 * @param {number} predatorVolume - Predator's world volume
 * @param {number} preyVolume - Prey's world volume
 * @returns {boolean}
 */
export function canEatByVolume(predatorVolume, preyVolume) {
  if (preyVolume <= 0) return false
  return predatorVolume / preyVolume >= 1.05  // Must be 5% larger
}

/**
 * Get the volume ratio between two entities
 * 
 * @param {string} entityId1 - First entity ID
 * @param {string} entityId2 - Second entity ID
 * @returns {number|null} Ratio (entity1 / entity2) or null if not found
 */
export function getVolumeRatio(entityId1, entityId2) {
  const data1 = volumeRegistry.get(entityId1)
  const data2 = volumeRegistry.get(entityId2)
  
  if (!data1 || !data2 || data2.totalWorldVolume === 0) return null
  
  return data1.totalWorldVolume / data2.totalWorldVolume
}

// ============================================================================
// CREATURE-SPECIFIC HELPERS
// ============================================================================

/**
 * Compute volume for a creature and return detailed stats
 * 
 * @param {object} creatureData - Creature data from generateCreature()
 * @returns {object}
 */
export function analyzeCreatureVolume(creatureData) {
  if (!creatureData?.mesh) {
    console.warn('[MeshVolume] Invalid creature data')
    return null
  }
  
  const breakdown = getMeshVolumeBreakdown(creatureData.mesh)
  const visualVolume = breakdown.total
  
  // Find largest and smallest parts
  let largest = { name: '', volume: 0 }
  let smallest = { name: '', volume: Infinity }
  
  for (const [name, volume] of Object.entries(breakdown)) {
    if (name === 'total' || name === 'meshCount') continue
    
    if (volume > largest.volume) {
      largest = { name, volume }
    }
    if (volume < smallest.volume && volume > 0) {
      smallest = { name, volume }
    }
  }
  
  // Compute capsule volume for comparison
  let capsuleVolume = null
  let volumeRatio = null
  
  if (creatureData.traits) {
    const length = creatureData.traits.length || 1
    const height = creatureData.traits.height || length * 0.3
    const width = creatureData.traits.width || height
    
    const radius = Math.min(height, width) / 2
    const halfHeight = Math.max(0, length / 2 - radius)
    
    capsuleVolume = Math.PI * radius * radius * (halfHeight * 2 + (4 * radius / 3))
    volumeRatio = visualVolume / capsuleVolume
  }
  
  return {
    visualVolume,
    capsuleVolume,
    volumeRatio,
    breakdown,
    largestPart: largest.volume > 0 ? largest : null,
    smallestPart: smallest.volume < Infinity ? smallest : null,
    meshCount: breakdown.meshCount,
  }
}

/**
 * Quick volume calculation for spawned NPC
 * 
 * @param {THREE.Object3D} mesh - The creature mesh
 * @param {number} [scaleMultiplier=1] - Scale multiplier applied to creature
 * @returns {{ visualVolume: number, meshCount: number }}
 */
export function computeNPCVolume(mesh, scaleMultiplier = 1) {
  if (!mesh) return { visualVolume: 0, meshCount: 0 }
  
  const breakdown = getMeshVolumeBreakdown(mesh, true)
  
  return {
    visualVolume: breakdown.total,
    meshCount: breakdown.meshCount,
    baseVolume: breakdown.total / Math.pow(scaleMultiplier, 3),
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Compute volumes for all NPCs
 * 
 * @param {Map} npcs - FishAdder's npc map
 * @returns {Map}
 */
export function computeAllNPCVolumes(npcs) {
  const results = new Map()
  
  for (const [id, npc] of npcs) {
    const { visualVolume, meshCount, baseVolume } = computeNPCVolume(npc.mesh, npc.scaleMultiplier)
    
    results.set(id, {
      visualVolume,
      baseVolume,
      capsuleVolume: npc.volume,
      ratio: npc.volume > 0 ? visualVolume / npc.volume : 0,
      meshCount,
      creatureClass: npc.creatureClass,
      scaleMultiplier: npc.scaleMultiplier,
    })
  }
  
  return results
}

/**
 * Debug: log volume stats for all NPCs
 * 
 * @param {Map} npcs - FishAdder's npc map
 */
export function debugNPCVolumes(npcs) {
  const volumes = computeAllNPCVolumes(npcs)
  
  console.group('[MeshVolume] NPC Volume Analysis')
  console.log(`Total NPCs: ${volumes.size}`)
  
  let totalVisual = 0
  let totalCapsule = 0
  const byClass = new Map()
  
  for (const [id, data] of volumes) {
    totalVisual += data.visualVolume
    totalCapsule += data.capsuleVolume
    
    if (!byClass.has(data.creatureClass)) {
      byClass.set(data.creatureClass, { count: 0, visualVolume: 0, capsuleVolume: 0 })
    }
    const classData = byClass.get(data.creatureClass)
    classData.count++
    classData.visualVolume += data.visualVolume
    classData.capsuleVolume += data.capsuleVolume
  }
  
  console.log(`Total Visual Volume: ${totalVisual.toFixed(2)} m³`)
  console.log(`Total Capsule Volume: ${totalCapsule.toFixed(2)} m³`)
  console.log(`Average Ratio (Visual/Capsule): ${(totalVisual / totalCapsule).toFixed(2)}`)
  
  console.group('By Class')
  for (const [className, data] of byClass) {
    const avgRatio = data.capsuleVolume > 0 ? data.visualVolume / data.capsuleVolume : 0
    console.log(`${className}: ${data.count} creatures, ${data.visualVolume.toFixed(2)} m³ visual, ratio: ${avgRatio.toFixed(2)}`)
  }
  console.groupEnd()
  
  console.groupEnd()
}

/**
 * Debug: log volume registry state
 */
export function debugVolumeRegistry() {
  console.group('[VolumeRegistry] Debug')
  console.log(`Total entities: ${volumeRegistry.size}`)
  
  const players = getPlayerVolumes()
  const npcs = getNPCVolumes()
  
  console.log(`Players: ${players.length}`)
  console.log(`NPCs: ${npcs.length}`)
  
  if (players.length > 0) {
    console.group('Players')
    for (const p of players) {
      console.log(`${p.entityId}: ${p.totalWorldVolume.toFixed(2)} m³ (visual: ${p.visualScaleFactor.toFixed(3)}×, physics: ${p.physicsScaleFactor.toFixed(3)}×)`)
    }
    console.groupEnd()
  }
  
  if (npcs.length > 0) {
    console.group('NPCs (sample of 10)')
    const sample = npcs.slice(0, 10)
    for (const n of sample) {
      console.log(`${n.entityId}: ${n.totalWorldVolume.toFixed(2)} m³`)
    }
    if (npcs.length > 10) {
      console.log(`... and ${npcs.length - 10} more`)
    }
    console.groupEnd()
  }
  
  console.groupEnd()
}

// ============================================================================
// CONFIGURATION ACCESS
// ============================================================================

/**
 * Get volume configuration
 * @returns {object} Copy of config
 */
export function getVolumeConfig() {
  return { ...VOLUME_CONFIG }
}

/**
 * Set volume bounds
 * @param {number} min - Minimum volume
 * @param {number} max - Maximum volume
 */
export function setVolumeBounds(min, max) {
  if (min > 0 && max > min) {
    VOLUME_CONFIG.MIN_VOLUME = min
    VOLUME_CONFIG.MAX_VOLUME = max
    console.log(`[VolumeRegistry] Bounds set to [${min}, ${max}] m³`)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core volume calculation
  computeGeometryVolume,
  computeMeshVolume,
  computeGroupVolume,
  getMeshVolumeBreakdown,
  
  // Capsule volume
  computeCapsuleVolume,
  computeCapsuleVolumeFromParams,
  
  // Volume registry
  registerVolume,
  getVolume,
  hasVolume,
  getAllVolumes,
  getPlayerVolumes,
  getNPCVolumes,
  updateWorldVolume,
  addVolume,
  unregisterVolume,
  clearVolumeRegistry,
  
  // Feeding helpers
  getFeedingRelationship,
  canEatByVolume,
  getVolumeRatio,
  
  // Creature-specific
  analyzeCreatureVolume,
  computeNPCVolume,
  
  // Batch
  computeAllNPCVolumes,
  debugNPCVolumes,
  
  // Debug
  debugVolumeRegistry,
  
  // Config
  getVolumeConfig,
  setVolumeBounds,
}