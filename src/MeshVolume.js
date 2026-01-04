/**
 * MeshVolume.js - Calculate true visual mesh volume
 * 
 * All creature meshes use BoxGeometry, so we compute volume directly from
 * box dimensions and world scale for maximum accuracy.
 * 
 * Usage:
 *   import { computeMeshVolume, computeGroupVolume, getMeshVolumeBreakdown } from './MeshVolume.js'
 *   
 *   // Single geometry
 *   const vol = computeMeshVolume(mesh)
 *   
 *   // Entire creature (group of meshes)
 *   const totalVol = computeGroupVolume(fishGroup)
 *   
 *   // Detailed breakdown by part
 *   const breakdown = getMeshVolumeBreakdown(fishGroup)
 *   // { body: 0.5, tail: 0.1, dorsalFin: 0.02, ... total: 0.62 }
 */

import * as THREE from 'three'

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

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core
  computeGeometryVolume,
  computeMeshVolume,
  computeGroupVolume,
  getMeshVolumeBreakdown,
  
  // Creature-specific
  analyzeCreatureVolume,
  computeNPCVolume,
  
  // Batch
  computeAllNPCVolumes,
  debugNPCVolumes,
}