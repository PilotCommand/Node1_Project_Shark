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
// EXTRAS DEFINITIONS
// ============================================================================

const EXTRAS = {
  
  // -------------------------------------------------------------------------
  // BOOST - Hold Q to swim faster
  // -------------------------------------------------------------------------
  boost: {
    name: 'Boost',
    description: 'Hold to swim faster',
    
    // Called when Q is pressed
    onActivate: () => {
      // Handled by Swimming.js via setBoosting()
    },
    
    // Called when Q is released
    onDeactivate: () => {
      // Handled by Swimming.js via setBoosting()
    },
    
    // Called every frame while Q is held (optional)
    onUpdate: (delta) => {
      // Nothing needed - Swimming.js handles it
    },
  },
  
  // -------------------------------------------------------------------------
  // OPACITY - Hold Q to change fish opacity (TODO)
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
 * Called every frame (optional per-frame logic)
 */
export function updateExtra(delta) {
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
  console.log('Available:', getAvailableExtras())
  console.groupEnd()
}
