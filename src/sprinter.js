/**
 * sprinter.js - Sprint Ability
 * 
 * Hold Q to swim faster with a trail ribbon effect.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'

// ============================================================================
// â­ CAPACITY CONFIG - EASY TO EDIT! â­
// ============================================================================

const CAPACITY_CONFIG = {
  max: 100,              // Maximum capacity
  depleteRate: 40,       // Units per second when active (holding Q)
  regenRate: 8,          // Units per second when inactive (4-5x slower than depletion)
  regenDelay: 0.8,       // Seconds before regen starts after releasing Q
}

// ============================================================================
// TRAIL RIBBON CONFIG
// ============================================================================

const TRAIL_CONFIG = {
  // === RIBBON SIZE ===
  maxPointsPerSegment: 100,
  width: 1.5,
  taper: 0.25,
  
  // === POINT SPACING ===
  minDistance: 1,
  deployDelay: 0.05,
  behindOffset: 3,
  
  // === APPEARANCE ===
  color: 0x00ffaa,
  opacity: 0.8,
  orientation: 90,
  
  // === FADE OUT ===
  fadeDelay: 0.5,
  fadeSpeed: 0.3,
}

// ============================================================================
// TRAIL RIBBON SYSTEM
// ============================================================================

let sceneRef = null
let allSegments = []
let activeSegment = null
let isDeploying = false
let deployTimer = 0

/**
 * Initialize trail system with scene reference
 */
export function init(scene) {
  sceneRef = scene
}

/**
 * Build ribbon mesh from points array
 */
function buildRibbonMesh(points, opacity) {
  if (points.length < 2) return null
  
  const baseHalfWidth = TRAIL_CONFIG.width / 2
  const numPoints = points.length
  const taper = TRAIL_CONFIG.taper
  
  const vertices = []
  const indices = []
  
  for (let i = 0; i < numPoints; i++) {
    const p = points[i]
    
    const t = i / (numPoints - 1)
    const taperMultiplier = (1 - taper) + taper * t
    const halfWidth = baseHalfWidth * taperMultiplier
    
    vertices.push(
      p.position.x - p.right.x * halfWidth,
      p.position.y - p.right.y * halfWidth,
      p.position.z - p.right.z * halfWidth
    )
    vertices.push(
      p.position.x + p.right.x * halfWidth,
      p.position.y + p.right.y * halfWidth,
      p.position.z + p.right.z * halfWidth
    )
  }
  
  for (let i = 0; i < numPoints - 1; i++) {
    const bl = i * 2
    const br = i * 2 + 1
    const tl = (i + 1) * 2
    const tr = (i + 1) * 2 + 1
    
    indices.push(bl, br, tr)
    indices.push(bl, tr, tl)
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  const material = new THREE.MeshBasicMaterial({
    color: TRAIL_CONFIG.color,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  
  return mesh
}

/**
 * Update a segment's mesh (rebuild geometry)
 */
function rebuildSegmentMesh(segment) {
  if (!segment || segment.points.length < 2) {
    if (segment && segment.mesh) {
      segment.mesh.visible = false
    }
    return
  }
  
  if (segment.mesh && sceneRef) {
    sceneRef.remove(segment.mesh)
    segment.mesh.geometry.dispose()
    segment.mesh.material.dispose()
  }
  
  segment.mesh = buildRibbonMesh(segment.points, segment.opacity)
  if (segment.mesh && sceneRef) {
    sceneRef.add(segment.mesh)
  }
}

/**
 * Dispose a single segment
 */
function disposeSegment(segment) {
  if (!segment) return
  if (segment.mesh && sceneRef) {
    sceneRef.remove(segment.mesh)
    segment.mesh.geometry.dispose()
    segment.mesh.material.dispose()
    segment.mesh = null
  }
}

/**
 * Add point to active segment
 */
function addPoint(position, direction) {
  if (!activeSegment) return
  
  const points = activeSegment.points
  
  if (points.length > 0) {
    const last = points[points.length - 1]
    if (position.distanceTo(last.position) < TRAIL_CONFIG.minDistance) {
      return
    }
  }
  
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(direction, up).normalize()
  if (right.lengthSq() < 0.01) {
    right.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
  }
  
  if (TRAIL_CONFIG.orientation !== 0) {
    const angle = TRAIL_CONFIG.orientation * Math.PI / 180
    right.applyAxisAngle(direction, angle)
  }
  
  points.push({
    position: position.clone(),
    right: right.clone()
  })
  
  while (points.length > TRAIL_CONFIG.maxPointsPerSegment) {
    points.shift()
  }
  
  rebuildSegmentMesh(activeSegment)
}

/**
 * Start new segment
 */
function startRibbon() {
  activeSegment = {
    mesh: null,
    points: [],
    state: 'active',
    fadeTimer: 0,
    opacity: TRAIL_CONFIG.opacity
  }
  allSegments.push(activeSegment)
  
  isDeploying = true
  deployTimer = 0
}

/**
 * Stop segment - will start fading
 */
function stopRibbon() {
  if (activeSegment) {
    activeSegment.state = 'fading'
    activeSegment.fadeTimer = 0
  }
  activeSegment = null
  isDeploying = false
  deployTimer = 0
}

/**
 * Update ribbon system
 */
function updateRibbon(delta, playerPosition, playerDirection) {
  if (isDeploying && activeSegment) {
    deployTimer += delta
    
    if (deployTimer >= TRAIL_CONFIG.deployDelay && playerPosition && playerDirection) {
      const offsetPos = playerPosition.clone().addScaledVector(playerDirection, -TRAIL_CONFIG.behindOffset)
      addPoint(offsetPos, playerDirection)
    }
  }
  
  const toRemove = []
  
  for (const segment of allSegments) {
    if (segment.state === 'fading') {
      segment.fadeTimer += delta
      
      if (segment.fadeTimer >= TRAIL_CONFIG.fadeDelay) {
        segment.opacity -= TRAIL_CONFIG.fadeSpeed * delta
        
        if (segment.mesh && segment.mesh.material) {
          segment.mesh.material.opacity = Math.max(0, segment.opacity)
        }
        
        if (segment.opacity <= 0) {
          toRemove.push(segment)
        }
      }
    }
  }
  
  for (const segment of toRemove) {
    disposeSegment(segment)
    const idx = allSegments.indexOf(segment)
    if (idx !== -1) {
      allSegments.splice(idx, 1)
    }
  }
}

/**
 * Clear all ribbons
 */
export function clear() {
  for (const seg of allSegments) {
    disposeSegment(seg)
  }
  allSegments = []
  activeSegment = null
  isDeploying = false
}

// ============================================================================
// REMOTE PLAYER TRAIL SYSTEM
// ============================================================================

/**
 * Stores trail data for each remote player
 * Key: playerId, Value: { 
 *   scene: THREE.Scene,
 *   segments: [],        // Array of all segments (like local allSegments)
 *   activeSegment: null, // Currently deploying segment (like local activeSegment)
 *   isDeploying: bool,   
 *   deployTimer: number 
 * }
 */
const remoteTrails = new Map()

/**
 * Get or create trail data for a remote player
 * @param {number} playerId - The remote player's ID
 * @param {THREE.Scene} scene - The scene to add meshes to
 * @returns {Object} Trail data object
 */
function getOrCreateRemoteTrailData(playerId, scene) {
  if (!remoteTrails.has(playerId)) {
    remoteTrails.set(playerId, {
      scene: scene,
      segments: [],
      activeSegment: null,
      isDeploying: false,
      deployTimer: 0,
    })
  }
  return remoteTrails.get(playerId)
}

/**
 * Start a new trail segment for a remote player (mirrors startRibbon)
 * @param {number} playerId - The remote player's ID
 * @param {THREE.Scene} scene - The scene to add meshes to
 */
export function createRemoteTrail(playerId, scene) {
  if (!scene) {
    console.warn('[Sprinter] Cannot create remote trail - no scene reference')
    return
  }
  
  const trailData = getOrCreateRemoteTrailData(playerId, scene)
  
  // Create a NEW segment (don't destroy old ones - they may still be fading)
  const newSegment = {
    mesh: null,
    points: [],
    state: 'active',
    fadeTimer: 0,
    opacity: TRAIL_CONFIG.opacity
  }
  
  // Add to segments array and set as active
  trailData.segments.push(newSegment)
  trailData.activeSegment = newSegment
  trailData.isDeploying = true
  trailData.deployTimer = 0
  
  console.log(`[Sprinter] Remote player ${playerId} started trail (${trailData.segments.length} total segments)`)
}

/**
 * Update a remote player's trail - adds points while deploying (mirrors updateRibbon's deploy logic)
 * @param {number} playerId - The remote player's ID
 * @param {number} delta - Time since last frame
 * @param {THREE.Vector3} position - The player's current position
 * @param {THREE.Vector3} direction - The player's facing direction
 */
export function updateRemoteTrail(playerId, delta, position, direction) {
  const trailData = remoteTrails.get(playerId)
  if (!trailData || !trailData.isDeploying || !trailData.activeSegment) return
  
  trailData.deployTimer += delta
  
  if (trailData.deployTimer >= TRAIL_CONFIG.deployDelay && position && direction) {
    // Add point behind the player
    const offsetPos = position.clone().addScaledVector(direction, -TRAIL_CONFIG.behindOffset)
    addPointToRemoteSegment(trailData, trailData.activeSegment, offsetPos, direction)
  }
}

/**
 * Add a point to a remote trail segment (mirrors addPoint)
 */
function addPointToRemoteSegment(trailData, segment, position, direction) {
  if (!segment) return
  
  const points = segment.points
  
  // Check minimum distance
  if (points.length > 0) {
    const last = points[points.length - 1]
    if (position.distanceTo(last.position) < TRAIL_CONFIG.minDistance) {
      return
    }
  }
  
  // Calculate right vector for ribbon orientation
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(direction, up).normalize()
  if (right.lengthSq() < 0.01) {
    right.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
  }
  
  if (TRAIL_CONFIG.orientation !== 0) {
    const angle = TRAIL_CONFIG.orientation * Math.PI / 180
    right.applyAxisAngle(direction, angle)
  }
  
  points.push({
    position: position.clone(),
    right: right.clone()
  })
  
  // Limit points
  while (points.length > TRAIL_CONFIG.maxPointsPerSegment) {
    points.shift()
  }
  
  // Rebuild the mesh
  rebuildRemoteSegmentMesh(trailData, segment)
}

/**
 * Rebuild the mesh for a remote trail segment (mirrors rebuildSegmentMesh)
 */
function rebuildRemoteSegmentMesh(trailData, segment) {
  if (!segment || segment.points.length < 2) {
    if (segment && segment.mesh) {
      segment.mesh.visible = false
    }
    return
  }
  
  // Remove old mesh
  if (segment.mesh && trailData.scene) {
    trailData.scene.remove(segment.mesh)
    segment.mesh.geometry.dispose()
    segment.mesh.material.dispose()
  }
  
  // Build new mesh using the shared buildRibbonMesh function
  segment.mesh = buildRibbonMesh(segment.points, segment.opacity)
  if (segment.mesh && trailData.scene) {
    trailData.scene.add(segment.mesh)
  }
}

/**
 * Dispose a remote segment (mirrors disposeSegment)
 */
function disposeRemoteSegment(trailData, segment) {
  if (!segment) return
  if (segment.mesh && trailData.scene) {
    trailData.scene.remove(segment.mesh)
    segment.mesh.geometry.dispose()
    segment.mesh.material.dispose()
    segment.mesh = null
  }
}

/**
 * Stop a remote player's trail - marks active segment as fading (mirrors stopRibbon)
 * @param {number} playerId - The remote player's ID
 */
export function stopRemoteTrail(playerId) {
  const trailData = remoteTrails.get(playerId)
  if (!trailData) return
  
  // Mark active segment as fading (don't destroy it!)
  if (trailData.activeSegment) {
    trailData.activeSegment.state = 'fading'
    trailData.activeSegment.fadeTimer = 0
  }
  
  // Clear active segment reference but keep it in segments array
  trailData.activeSegment = null
  trailData.isDeploying = false
  trailData.deployTimer = 0
  
  console.log(`[Sprinter] Remote player ${playerId} stopped trail (${trailData.segments.length} segments fading)`)
}

/**
 * Destroy ALL trails for a remote player immediately (for when player leaves)
 * @param {number} playerId - The remote player's ID
 */
export function destroyRemoteTrail(playerId) {
  const trailData = remoteTrails.get(playerId)
  if (!trailData) return
  
  // Dispose all segments
  for (const segment of trailData.segments) {
    disposeRemoteSegment(trailData, segment)
  }
  
  remoteTrails.delete(playerId)
  console.log(`[Sprinter] Remote player ${playerId} trails destroyed`)
}

/**
 * Update all remote trails - handles fading for ALL segments (mirrors updateRibbon's fade logic)
 * This should be called every frame regardless of whether players are actively sprinting
 * @param {number} delta - Time since last frame
 */
export function updateAllRemoteTrails(delta) {
  for (const [playerId, trailData] of remoteTrails) {
    const toRemove = []
    
    // Update ALL segments (both active and fading)
    for (const segment of trailData.segments) {
      if (segment.state === 'fading') {
        segment.fadeTimer += delta
        
        if (segment.fadeTimer >= TRAIL_CONFIG.fadeDelay) {
          segment.opacity -= TRAIL_CONFIG.fadeSpeed * delta
          
          if (segment.mesh && segment.mesh.material) {
            segment.mesh.material.opacity = Math.max(0, segment.opacity)
          }
          
          if (segment.opacity <= 0) {
            toRemove.push(segment)
          }
        }
      }
    }
    
    // Remove fully faded segments
    for (const segment of toRemove) {
      disposeRemoteSegment(trailData, segment)
      const idx = trailData.segments.indexOf(segment)
      if (idx !== -1) {
        trailData.segments.splice(idx, 1)
      }
    }
    
    // If all segments are gone and not deploying, we can clean up the trail data
    // But keep the entry in the map so we don't lose the scene reference
    // (it will be reused if the player starts sprinting again)
  }
}

/**
 * Check if a remote player has any active or fading trails
 * @param {number} playerId - The remote player's ID
 * @returns {boolean}
 */
export function hasRemoteTrail(playerId) {
  const trailData = remoteTrails.get(playerId)
  return trailData && (trailData.segments.length > 0 || trailData.isDeploying)
}

/**
 * Get the number of active trail segments for a remote player (for debugging)
 * @param {number} playerId - The remote player's ID
 * @returns {number}
 */
export function getRemoteTrailSegmentCount(playerId) {
  const trailData = remoteTrails.get(playerId)
  return trailData ? trailData.segments.length : 0
}

/**
 * Clear ALL remote trails (for map changes, etc.)
 * Mirrors the local clear() function
 */
export function clearAllRemoteTrails() {
  for (const [playerId, trailData] of remoteTrails) {
    for (const segment of trailData.segments) {
      disposeRemoteSegment(trailData, segment)
    }
    trailData.segments = []
    trailData.activeSegment = null
    trailData.isDeploying = false
  }
  console.log(`[Sprinter] Cleared all remote trails (${remoteTrails.size} players)`)
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Sprinter',
  description: 'Hold to swim faster with trail',
  capacityMode: 'hold',  // Continuous drain while Q held
  capacityConfig: CAPACITY_CONFIG,  // Per-ability capacity settings
  
  onActivate: () => {
    startRibbon()
  },
  
  onDeactivate: () => {
    stopRibbon()
  },
  
  onUpdate: (delta) => {
    const player = getPlayer()
    if (player) {
      const yaw = player.rotation.y
      const pitch = player.rotation.x
      
      const direction = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      ).normalize()
      
      updateRibbon(delta, player.position, direction)
    }
  },
  
  // Called every frame even when not active (for fading ribbons)
  onPassiveUpdate: (delta) => {
    updateRibbon(delta, null, null)
  },
}