/**
 * ExtraControls.js - Ability Executor
 * 
 * Press Q to activate the current ability.
 * Change ACTIVE_ABILITY below to switch which ability Q uses.
 * 
 * Abilities are defined in their own files:
 *   - sprinter.js  (sprint with trail)
 *   - stacker.js   (build pentagonal prisms)
 *   - camper.js    (camouflage/blend into environment)
 *   - attacker.js  (predator vision - threat detection)
 */

import Sprinter, { init as initSprinter, clear as clearSprinter } from './sprinter.js'
import Stacker, { init as initStacker, debugStacker } from './stacker.js'
import Camper, { init as initCamper, debugCamper } from './camper.js'
import Attacker, { init as initAttacker, debugAttacker } from './attacker.js'

// ============================================================================
// 
//  ██████╗██╗  ██╗ ██████╗  ██████╗ ███████╗███████╗     █████╗ ██████╗ ██╗██╗     ██╗████████╗██╗   ██╗
// ██╔════╝██║  ██║██╔═══██╗██╔═══██╗██╔════╝██╔════╝    ██╔══██╗██╔══██╗██║██║     ██║╚══██╔══╝╚██╗ ██╔╝
// ██║     ███████║██║   ██║██║   ██║███████╗█████╗      ███████║██████╔╝██║██║     ██║   ██║    ╚████╔╝ 
// ██║     ██╔══██║██║   ██║██║   ██║╚════██║██╔══╝      ██╔══██║██╔══██╗██║██║     ██║   ██║     ╚██╔╝  
// ╚██████╗██║  ██║╚██████╔╝╚██████╔╝███████║███████╗    ██║  ██║██████╔╝██║███████╗██║   ██║      ██║   
//  ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝    ╚═╝  ╚═╝╚═════╝ ╚═╝╚══════╝╚═╝   ╚═╝      ╚═╝   
//
// ============================================================================

/**
 * ⭐ CHANGE THIS TO SWITCH WHICH ABILITY Q USES ⭐
 * 
 * Options: 'sprinter', 'stacker', 'camper', 'attacker', 'none'
 */
const ACTIVE_ABILITY = 'stacker'

// ============================================================================
// ABILITIES REGISTRY
// ============================================================================

const ABILITIES = {
  sprinter: Sprinter,
  stacker: Stacker,
  camper: Camper,
  attacker: Attacker,
  
  none: {
    name: 'None',
    description: 'No ability',
    capacityMode: 'none',
    onActivate: () => {},
    onDeactivate: () => {},
    onUpdate: () => {},
    onPassiveUpdate: () => {},
  },
}

// ============================================================================
// STATE
// ============================================================================

let isActive = false

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize ability system with scene reference
 */
export function initAbilities(scene) {
  // Initialize abilities that need scene reference
  initSprinter(scene)
  initStacker(scene)
  initCamper(scene)
  initAttacker(scene)
}

/**
 * Alias for backwards compatibility
 */
export function initTrail(scene) {
  initAbilities(scene)
}

// ============================================================================
// API
// ============================================================================

/**
 * Get the current active ability
 */
export function getActiveAbility() {
  return ABILITIES[ACTIVE_ABILITY] || ABILITIES.none
}

/**
 * Get the active ability key name
 */
export function getActiveAbilityName() {
  return ACTIVE_ABILITY
}

/**
 * Get the active ability's capacity mode
 * @returns {'hold' | 'toggle' | 'perUse' | 'none'} - How capacity is consumed
 *   - 'hold': Continuous drain while Q held (sprinter, attacker)
 *   - 'toggle': Ability manages its own drain (camper)
 *   - 'perUse': One-time cost per use (stacker)
 *   - 'none': No capacity cost
 */
export function getActiveCapacityMode() {
  const ability = getActiveAbility()
  return ability.capacityMode || 'hold'  // Default to 'hold' for backwards compatibility
}

/**
 * Get the active ability's capacity configuration
 * @returns {Object} - Capacity config with max, depleteRate, regenRate, regenDelay
 */
export function getActiveCapacityConfig() {
  const ability = getActiveAbility()
  // Return ability's config if defined, otherwise return default
  return ability.capacityConfig || {
    max: 100,
    depleteRate: 40,
    regenRate: 25,
    regenDelay: 0.5,
  }
}

/**
 * Backwards compatibility aliases
 */
export function getActiveExtra() {
  return getActiveAbility()
}

export function getActiveExtraName() {
  return getActiveAbilityName()
}

/**
 * Called when Q is pressed
 */
export function activateExtra() {
  if (isActive) return
  isActive = true
  
  const ability = getActiveAbility()
  if (ability.onActivate) {
    ability.onActivate()
  }
}

/**
 * Called when Q is released
 */
export function deactivateExtra() {
  if (!isActive) return
  isActive = false
  
  const ability = getActiveAbility()
  if (ability.onDeactivate) {
    ability.onDeactivate()
  }
}

/**
 * Called every frame
 */
export function updateExtra(delta) {
  // Run passive updates for all abilities that need it
  for (const key in ABILITIES) {
    const ability = ABILITIES[key]
    if (ability.onPassiveUpdate) {
      ability.onPassiveUpdate(delta)
    }
  }
  
  if (!isActive) return
  
  const ability = getActiveAbility()
  if (ability.onUpdate) {
    ability.onUpdate(delta)
  }
}

/**
 * Check if ability is currently active
 */
export function isExtraActive() {
  return isActive
}

/**
 * Get list of all available abilities
 */
export function getAvailableExtras() {
  return Object.keys(ABILITIES)
}

/**
 * Clear/reset ability state
 */
export function clearRibbon() {
  clearSprinter()
}

/**
 * Debug info
 */
export function debugExtra() {
  const ability = getActiveAbility()
  console.group('[Ability] Debug')
  console.log('Active Ability:', ACTIVE_ABILITY)
  console.log('Name:', ability.name)
  console.log('Description:', ability.description)
  console.log('Is Active:', isActive)
  console.log('Available:', getAvailableExtras())
  console.groupEnd()
  
  // Also debug specific abilities if relevant
  if (ACTIVE_ABILITY === 'camper') {
    debugCamper()
  } else if (ACTIVE_ABILITY === 'stacker') {
    debugStacker()
  } else if (ACTIVE_ABILITY === 'attacker') {
    debugAttacker()
  }
}