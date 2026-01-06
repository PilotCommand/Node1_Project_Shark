/**
 * sprinter.js - Sprint Ability
 * 
 * Hold Q to swim faster with a trail ribbon effect.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'

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
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Sprinter',
  description: 'Hold to swim faster with trail',
  capacityMode: 'hold',  // Continuous drain while Q held
  
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