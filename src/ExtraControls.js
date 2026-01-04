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
  maxPoints: 100,          // Maximum trail length
  minDistance: 0.5,        // Minimum distance between points
  color: 0x00ffaa,         // Trail color
  opacity: 0.6,
  fadeOut: true,           // Fade trail when stopping
  fadeSpeed: 0.1,          // How fast trail fades (per second)
}

let trailLine = null
let trailPoints = []
let trailGeometry = null
let trailMaterial = null
let sceneRef = null
let isFading = false

/**
 * Initialize trail system with scene reference
 */
export function initTrail(scene) {
  sceneRef = scene
}

/**
 * Create the trail line object
 */
function createTrailLine() {
  if (!sceneRef) return
  
  // Dispose old trail if exists
  disposeTrailLine()
  
  trailPoints = []
  
  trailGeometry = new THREE.BufferGeometry()
  trailMaterial = new THREE.LineBasicMaterial({
    color: TRAIL_CONFIG.color,
    transparent: true,
    opacity: TRAIL_CONFIG.opacity,
  })
  
  trailLine = new THREE.Line(trailGeometry, trailMaterial)
  trailLine.frustumCulled = false
  sceneRef.add(trailLine)
  isFading = false
}

/**
 * Add a point to the trail
 */
function addTrailPoint(position) {
  if (!trailLine) return
  
  // Check minimum distance from last point
  if (trailPoints.length > 0) {
    const last = trailPoints[trailPoints.length - 1]
    const dist = position.distanceTo(last)
    if (dist < TRAIL_CONFIG.minDistance) return
  }
  
  // Add new point
  trailPoints.push(position.clone())
  
  // Limit trail length
  if (trailPoints.length > TRAIL_CONFIG.maxPoints) {
    trailPoints.shift()
  }
  
  // Update geometry
  updateTrailGeometry()
}

/**
 * Update the trail line geometry
 */
function updateTrailGeometry() {
  if (!trailGeometry || trailPoints.length < 2) return
  
  const positions = []
  for (const p of trailPoints) {
    positions.push(p.x, p.y, p.z)
  }
  
  trailGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  trailGeometry.attributes.position.needsUpdate = true
}

/**
 * Start fading out the trail
 */
function startTrailFade() {
  if (TRAIL_CONFIG.fadeOut && trailLine) {
    isFading = true
  } else {
    disposeTrailLine()
  }
}

/**
 * Update trail fade (call each frame)
 */
function updateTrailFade(delta) {
  if (!isFading || !trailMaterial) return
  
  trailMaterial.opacity -= TRAIL_CONFIG.fadeSpeed * delta
  
  if (trailMaterial.opacity <= 0) {
    disposeTrailLine()
    isFading = false
  }
}

/**
 * Dispose trail line and clean up
 */
function disposeTrailLine() {
  if (trailLine && sceneRef) {
    sceneRef.remove(trailLine)
  }
  if (trailGeometry) {
    trailGeometry.dispose()
    trailGeometry = null
  }
  if (trailMaterial) {
    trailMaterial.dispose()
    trailMaterial = null
  }
  trailLine = null
  trailPoints = []
  isFading = false
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
      // Create trail
      createTrailLine()
    },
    
    // Called when Q is released
    onDeactivate: () => {
      // Start fading trail
      startTrailFade()
    },
    
    // Called every frame while Q is held
    onUpdate: (delta) => {
      const player = getPlayer()
      if (player && trailLine) {
        addTrailPoint(player.position)
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
 * Called every frame (handles both active extra and trail fade)
 */
export function updateExtra(delta) {
  // Always update trail fade (even when not active)
  updateTrailFade(delta)
  
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
  console.log('Trail Points:', trailPoints.length)
  console.log('Is Fading:', isFading)
  console.log('Available:', getAvailableExtras())
  console.groupEnd()
}