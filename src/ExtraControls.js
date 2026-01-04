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
// TRAIL RIBBON CONFIG - Easy to edit!
// ============================================================================

const TRAIL_CONFIG = {
  // === RIBBON SIZE ===
  maxPointsPerSegment: 100, // Max points per segment (oldest drop off after this)
  width: 1.5,               // Ribbon width (thickness)
  taper: 0.25,               // Taper amount (0=no taper, 1=full taper to point, 0.5=half taper)
  
  // === POINT SPACING ===
  minDistance: 1,         // Min distance between points (smaller = more dense)
  deployDelay: 0.05,        // Seconds before ribbon starts after pressing Q
  behindOffset: 3,        // How far behind the fish points spawn
  
  // === APPEARANCE ===
  color: 0x00ffaa,          // Ribbon color (hex)
  opacity: 0.8,             // Ribbon opacity (0-1)
  orientation: 90,           // Ribbon rotation in degrees (0=horizontal, 90=vertical, 45=diagonal)
  
  // === FADE OUT ===
  fadeDelay: 0.5,           // Seconds after releasing Q before fade starts
  fadeSpeed: 0.3,           // Opacity reduction per second (lower = slower fade)
}

// ============================================================================
// TRAIL RIBBON SYSTEM (airplane smoke trail style)
// ============================================================================

let sceneRef = null
let allSegments = []       // Array of segment objects
let activeSegment = null   // Segment currently being drawn
let isDeploying = false
let deployTimer = 0

/**
 * Segment structure:
 * {
 *   mesh: THREE.Mesh,
 *   points: [{position, right}, ...],
 *   state: 'active' | 'fading',
 *   fadeTimer: number,
 *   opacity: number
 * }
 */

/**
 * Initialize trail system with scene reference
 */
export function initTrail(scene) {
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
    
    // Calculate taper: 0 at tail (oldest), 1 at head (newest)
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
  
  // Remove old mesh
  if (segment.mesh && sceneRef) {
    sceneRef.remove(segment.mesh)
    segment.mesh.geometry.dispose()
    segment.mesh.material.dispose()
  }
  
  // Build new mesh
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
  
  // Check min distance
  if (points.length > 0) {
    const last = points[points.length - 1]
    if (position.distanceTo(last.position) < TRAIL_CONFIG.minDistance) {
      return
    }
  }
  
  // Calculate perpendicular for ribbon width
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(direction, up).normalize()
  if (right.lengthSq() < 0.01) {
    right.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
  }
  
  // Apply orientation rotation around the direction axis
  if (TRAIL_CONFIG.orientation !== 0) {
    const angle = TRAIL_CONFIG.orientation * Math.PI / 180
    right.applyAxisAngle(direction, angle)
  }
  
  points.push({
    position: position.clone(),
    right: right.clone()
  })
  
  // Remove oldest points if over max (FIFO - trail follows you)
  while (points.length > TRAIL_CONFIG.maxPointsPerSegment) {
    points.shift()
  }
  
  // Rebuild mesh
  rebuildSegmentMesh(activeSegment)
}

/**
 * Start new segment (Q pressed)
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
 * Stop segment (Q released) - segment will start fading
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
 * Update active ribbon (call each frame)
 */
function updateRibbon(delta, playerPosition, playerDirection) {
  // Update active segment (add points)
  if (isDeploying && activeSegment) {
    deployTimer += delta
    
    if (deployTimer >= TRAIL_CONFIG.deployDelay && playerPosition && playerDirection) {
      const offsetPos = playerPosition.clone().addScaledVector(playerDirection, -TRAIL_CONFIG.behindOffset)
      addPoint(offsetPos, playerDirection)
    }
  }
  
  // Update all fading segments
  const toRemove = []
  
  for (const segment of allSegments) {
    if (segment.state === 'fading') {
      segment.fadeTimer += delta
      
      // Start fading after delay
      if (segment.fadeTimer >= TRAIL_CONFIG.fadeDelay) {
        segment.opacity -= TRAIL_CONFIG.fadeSpeed * delta
        
        // Update material opacity
        if (segment.mesh && segment.mesh.material) {
          segment.mesh.material.opacity = Math.max(0, segment.opacity)
        }
        
        // Mark for removal when fully faded
        if (segment.opacity <= 0) {
          toRemove.push(segment)
        }
      }
    }
  }
  
  // Remove fully faded segments
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
export function clearRibbon() {
  for (const seg of allSegments) {
    disposeSegment(seg)
  }
  allSegments = []
  activeSegment = null
  isDeploying = false
}

/**
 * Get total point count (for debug)
 */
function getTotalPointCount() {
  return allSegments.reduce((sum, seg) => sum + seg.points.length, 0)
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
 * Called every frame
 */
export function updateExtra(delta) {
  // Always update ribbon fading (even when Q not held)
  updateRibbon(delta, null, null)
  
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
  console.log('Ribbon Segments:', allSegments.length)
  console.log('Total Points:', getTotalPointCount())
  console.log('Max Points:', TRAIL_CONFIG.maxPoints)
  console.log('Is Deploying:', isDeploying)
  console.log('Available:', getAvailableExtras())
  console.groupEnd()
}