/**
 * ExtraControls.js - Modular Extra Abilities
 * 
 * Press Q to activate the current extra ability.
 * Change ACTIVE_EXTRA below to switch which ability Q uses.
 * 
 * ============================================================================
 * HOW TO ADD A NEW EXTRA:
 * ============================================================================
 * 
 * 1. Add your extra to the EXTRAS object below
 * 2. Each extra has: name, onActivate(), onDeactivate(), onUpdate(delta)
 * 3. Set ACTIVE_EXTRA to your extra's key
 * 
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'

// ============================================================================
// 
//  ██████╗██╗  ██╗ ██████╗  ██████╗ ███████╗███████╗    ███████╗██╗  ██╗████████╗██████╗  █████╗ 
// ██╔════╝██║  ██║██╔═══██╗██╔═══██╗██╔════╝██╔════╝    ██╔════╝╚██╗██╔╝╚══██╔══╝██╔══██╗██╔══██╗
// ██║     ███████║██║   ██║██║   ██║███████╗█████╗      █████╗   ╚███╔╝    ██║   ██████╔╝███████║
// ██║     ██╔══██║██║   ██║██║   ██║╚════██║██╔══╝      ██╔══╝   ██╔██╗    ██║   ██╔══██╗██╔══██║
// ╚██████╗██║  ██║╚██████╔╝╚██████╔╝███████║███████╗    ███████╗██╔╝ ██╗   ██║   ██║  ██║██║  ██║
//  ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝    ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
//
// ============================================================================

/**
 * ⭐ CHANGE THIS TO SWITCH WHICH EXTRA Q USES ⭐
 * 
 * Options: 'boost', 'opacity', 'predator', 'none'
 */
const ACTIVE_EXTRA = 'boost'

// ============================================================================
// TRAIL RIBBON SYSTEM
// ============================================================================

const TRAIL_CONFIG = {
  maxPoints: 80,           // Maximum ribbon length (number of segments)
  minDistance: 0.5,        // Minimum distance between points
  width: 2.0,              // Ribbon width (make it visible!)
  color: 0x00ffaa,         // Ribbon color
  opacity: 0.8,
  
  // Delays
  deployDelay: 0.1,        // Seconds before ribbon starts appearing behind fish
  deleteDelay: 1.5,        // Seconds ribbon persists after releasing Q
  fadeSpeed: 1.5,          // How fast ribbon fades during deletion
}

let ribbonMesh = null
let ribbonPoints = []      // Array of {position, time}
let ribbonGeometry = null
let ribbonMaterial = null
let sceneRef = null

let isDeploying = false
let deployTimer = 0
let isDeleting = false
let deleteTimer = 0

/**
 * Initialize trail system with scene reference
 */
export function initTrail(scene) {
  sceneRef = scene
}

/**
 * Create the ribbon mesh
 */
function createRibbonMesh() {
  if (!sceneRef) return
  
  // Dispose old ribbon if exists
  disposeRibbon()
  
  ribbonPoints = []
  
  // Create geometry (will be populated with vertices)
  ribbonGeometry = new THREE.BufferGeometry()
  
  // Pre-allocate buffers for max points
  // Each segment needs 2 triangles (6 vertices), but we share vertices
  // For N points, we need N*2 vertices (left and right edge)
  const maxVerts = TRAIL_CONFIG.maxPoints * 2
  const positions = new Float32Array(maxVerts * 3)
  const uvs = new Float32Array(maxVerts * 2)
  
  ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  ribbonGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  
  // Create index buffer for triangles
  const maxIndices = (TRAIL_CONFIG.maxPoints - 1) * 6
  const indices = new Uint16Array(maxIndices)
  ribbonGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
  
  ribbonMaterial = new THREE.MeshBasicMaterial({
    color: TRAIL_CONFIG.color,
    transparent: true,
    opacity: TRAIL_CONFIG.opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  
  ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial)
  ribbonMesh.frustumCulled = false
  sceneRef.add(ribbonMesh)
  
  isDeleting = false
  deleteTimer = 0
}

/**
 * Add a point to the ribbon
 */
function addRibbonPoint(position, direction) {
  if (!ribbonMesh) return
  
  // Check minimum distance from last point
  if (ribbonPoints.length > 0) {
    const last = ribbonPoints[ribbonPoints.length - 1]
    const dist = position.distanceTo(last.position)
    if (dist < TRAIL_CONFIG.minDistance) return
  }
  
  // Calculate perpendicular direction for ribbon width
  // Cross product of direction with up vector
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(direction, up).normalize()
  
  // If direction is nearly vertical, use different reference
  if (right.lengthSq() < 0.01) {
    right.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
  }
  
  // Add new point with perpendicular
  ribbonPoints.push({
    position: position.clone(),
    right: right.clone(),
    time: performance.now()
  })
  
  // Limit ribbon length
  if (ribbonPoints.length > TRAIL_CONFIG.maxPoints) {
    ribbonPoints.shift()
  }
  
  // Update geometry
  updateRibbonGeometry()
}

/**
 * Update the ribbon mesh geometry
 */
function updateRibbonGeometry() {
  if (!ribbonGeometry || ribbonPoints.length < 2) {
    // Hide mesh if not enough points
    if (ribbonMesh) ribbonMesh.visible = false
    return
  }
  
  ribbonMesh.visible = true
  
  const posAttr = ribbonGeometry.attributes.position
  const uvAttr = ribbonGeometry.attributes.uv
  const indexAttr = ribbonGeometry.index
  
  const halfWidth = TRAIL_CONFIG.width / 2
  const numPoints = ribbonPoints.length
  
  // Build vertices (2 per point - left and right edge)
  for (let i = 0; i < numPoints; i++) {
    const point = ribbonPoints[i]
    const pos = point.position
    const right = point.right
    
    // Left vertex
    const li = i * 2
    posAttr.setXYZ(li, 
      pos.x - right.x * halfWidth,
      pos.y - right.y * halfWidth,
      pos.z - right.z * halfWidth
    )
    
    // Right vertex
    const ri = i * 2 + 1
    posAttr.setXYZ(ri,
      pos.x + right.x * halfWidth,
      pos.y + right.y * halfWidth,
      pos.z + right.z * halfWidth
    )
    
    // UVs (v goes from 0 at start to 1 at end)
    const v = i / (numPoints - 1)
    uvAttr.setXY(li, 0, v)
    uvAttr.setXY(ri, 1, v)
  }
  
  // Build indices (2 triangles per segment)
  let idx = 0
  for (let i = 0; i < numPoints - 1; i++) {
    const bl = i * 2       // bottom left
    const br = i * 2 + 1   // bottom right
    const tl = (i + 1) * 2     // top left
    const tr = (i + 1) * 2 + 1 // top right
    
    // Triangle 1
    indexAttr.setX(idx++, bl)
    indexAttr.setX(idx++, br)
    indexAttr.setX(idx++, tr)
    
    // Triangle 2
    indexAttr.setX(idx++, bl)
    indexAttr.setX(idx++, tr)
    indexAttr.setX(idx++, tl)
  }
  
  // Update draw range
  ribbonGeometry.setDrawRange(0, (numPoints - 1) * 6)
  
  // Mark buffers as needing update
  posAttr.needsUpdate = true
  uvAttr.needsUpdate = true
  indexAttr.needsUpdate = true
  ribbonGeometry.computeBoundingSphere()
}

/**
 * Start the ribbon (called when Q pressed)
 */
function startRibbon() {
  console.log('[Ribbon] Starting ribbon')
  createRibbonMesh()
  // Set flags AFTER createRibbonMesh (which calls disposeRibbon that resets flags)
  isDeploying = true
  deployTimer = 0
  isDeleting = false
  deleteTimer = 0
}

/**
 * Stop adding to ribbon, start delete timer (called when Q released)
 */
function stopRibbon() {
  console.log('[Ribbon] Stopping, points:', ribbonPoints.length)
  isDeploying = false
  deployTimer = 0
  isDeleting = true
  deleteTimer = 0
}

/**
 * Update ribbon (call each frame)
 */
function updateRibbon(delta, playerPosition, playerDirection) {
  // Handle deploy delay
  if (isDeploying) {
    deployTimer += delta
    
    // Only add points after deploy delay
    if (deployTimer >= TRAIL_CONFIG.deployDelay && playerPosition && playerDirection) {
      // Offset position slightly behind the fish
      const offsetPos = playerPosition.clone().addScaledVector(playerDirection, -1.5)
      addRibbonPoint(offsetPos, playerDirection)
    }
  }
  
  // Handle delete delay and fade
  if (isDeleting) {
    deleteTimer += delta
    
    if (deleteTimer >= TRAIL_CONFIG.deleteDelay) {
      // Start fading
      if (ribbonMaterial) {
        ribbonMaterial.opacity -= TRAIL_CONFIG.fadeSpeed * delta
        
        if (ribbonMaterial.opacity <= 0) {
          disposeRibbon()
          isDeleting = false
        }
      }
    }
  }
}

/**
 * Dispose ribbon and clean up
 */
function disposeRibbon() {
  if (ribbonMesh && sceneRef) {
    sceneRef.remove(ribbonMesh)
  }
  if (ribbonGeometry) {
    ribbonGeometry.dispose()
    ribbonGeometry = null
  }
  if (ribbonMaterial) {
    ribbonMaterial.dispose()
    ribbonMaterial = null
  }
  ribbonMesh = null
  ribbonPoints = []
  isDeploying = false
  isDeleting = false
}


// ============================================================================
// EXTRAS DEFINITIONS
// ============================================================================

const EXTRAS = {
  
  // -------------------------------------------------------------------------
  // BOOST - Hold Q to swim faster + trail ribbon
  // -------------------------------------------------------------------------
  boost: {
    name: 'Boost',
    description: 'Hold to swim faster',
    
    // Called when Q is pressed
    onActivate: () => {
      startRibbon()
    },
    
    // Called when Q is released
    onDeactivate: () => {
      stopRibbon()
    },
    
    // Called every frame while Q is held
    onUpdate: (delta) => {
      const player = getPlayer()
      if (player) {
        // Get player's forward direction from its rotation
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
  },
  
  // -------------------------------------------------------------------------
  // OPACITY - Hold Q to change fish opacity
  // -------------------------------------------------------------------------
  opacity: {
    name: 'Fade',
    description: 'Hold to become transparent',
    
    targetOpacity: 0.3,  // How transparent when active
    
    onActivate: () => {
      const player = getPlayer()
      if (!player) return
      
      player.traverse((child) => {
        if (child.material) {
          child.material.transparent = true
          child.material.opacity = EXTRAS.opacity.targetOpacity
        }
      })
    },
    
    onDeactivate: () => {
      const player = getPlayer()
      if (!player) return
      
      player.traverse((child) => {
        if (child.material) {
          child.material.opacity = 1.0
        }
      })
    },
    
    onUpdate: (delta) => {},
  },
  
  // -------------------------------------------------------------------------
  // PREDATOR - Hold Q for predator vision (TODO)
  // -------------------------------------------------------------------------
  predator: {
    name: 'Predator Vision',
    description: 'Hold to see through the world',
    
    onActivate: () => {
      // TODO: Change world materials opacity
      // TODO: Highlight other creatures
      console.log('[Extra] Predator vision ON')
    },
    
    onDeactivate: () => {
      // TODO: Restore world materials
      console.log('[Extra] Predator vision OFF')
    },
    
    onUpdate: (delta) => {},
  },
  
  // -------------------------------------------------------------------------
  // NONE - Q does nothing
  // -------------------------------------------------------------------------
  none: {
    name: 'None',
    description: 'No extra ability',
    onActivate: () => {},
    onDeactivate: () => {},
    onUpdate: (delta) => {},
  },
}


// ============================================================================
// STATE
// ============================================================================

let isActive = false


// ============================================================================
// API
// ============================================================================

/**
 * Get the current active extra
 */
export function getActiveExtra() {
  return EXTRAS[ACTIVE_EXTRA] || EXTRAS.none
}

/**
 * Get the active extra key name
 */
export function getActiveExtraName() {
  return ACTIVE_EXTRA
}

/**
 * Called when Q is pressed
 */
export function activateExtra() {
  if (isActive) return
  isActive = true
  
  const extra = getActiveExtra()
  if (extra.onActivate) {
    extra.onActivate()
  }
}

/**
 * Called when Q is released
 */
export function deactivateExtra() {
  if (!isActive) return
  isActive = false
  
  const extra = getActiveExtra()
  if (extra.onDeactivate) {
    extra.onDeactivate()
  }
}

/**
 * Called every frame (handles both active extra and ribbon fade)
 */
export function updateExtra(delta) {
  // Always update ribbon deletion/fade (even when not active)
  if (isDeleting) {
    updateRibbon(delta, null, null)
  }
  
  if (!isActive) return
  
  const extra = getActiveExtra()
  if (extra.onUpdate) {
    extra.onUpdate(delta)
  }
}

/**
 * Check if extra is currently active
 */
export function isExtraActive() {
  return isActive
}

/**
 * Get list of all available extras
 */
export function getAvailableExtras() {
  return Object.keys(EXTRAS)
}

/**
 * Debug info
 */
export function debugExtra() {
  const extra = getActiveExtra()
  console.group('[Extra] Debug')
  console.log('Active Extra:', ACTIVE_EXTRA)
  console.log('Name:', extra.name)
  console.log('Description:', extra.description)
  console.log('Is Active:', isActive)
  console.log('Ribbon Points:', ribbonPoints.length)
  console.log('Is Deploying:', isDeploying)
  console.log('Is Deleting:', isDeleting)
  console.log('Available:', getAvailableExtras())
  console.groupEnd()
}