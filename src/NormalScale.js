/**
 * NormalScale.js - Normalize creatures to equal starting volume
 * 
 * PURPOSE:
 *   Encyclopedia.js contains real-world accurate sizes (meta facts).
 *   This module normalizes all creatures to equal gameplay volume
 *   while PRESERVING the original data.
 * 
 * CONCEPT:
 *   - All creatures start at STARTER_VOLUME (1 m³)
 *   - Capsule volume determines "size" for gameplay
 *   - Growth multiplier increases volume logarithmically
 *   - Scale factor = ∛(targetVolume / naturalVolume)
 * 
 * USAGE:
 *   import { normalizeCreature, addFood, decreaseScale } from './NormalScale.js'
 *   
 *   // Normalize a creature to gameplay scale
 *   const result = normalizeCreature(mesh, naturalCapsuleParams)
 *   
 *   // When eating food
 *   addFood(0.1)
 *   
 *   // R/T keys for manual testing
 *   decreaseScale()  // R
 *   increaseScale()  // T
 */

import * as THREE from 'three'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Starting volume for all creatures (cubic meters)
  STARTER_VOLUME: 1.0,
  
  // Logarithmic growth: volume = STARTER * (1 + k * ln(1 + food))
  // Higher = faster initial growth, slower later
  GROWTH_RATE: 0.5,
  
  // Manual scale adjustment (R/T keys)
  MANUAL_SCALE_STEP: 0.1,     // 10% per keypress
  MANUAL_SCALE_MIN: 0.1,      // Can't go below 10% of normalized
  MANUAL_SCALE_MAX: 10.0,     // Can't exceed 10× normalized
}

// ============================================================================
// STATE
// ============================================================================

let currentFoodEaten = 0             // Tracks food for growth calculation
let manualScaleMultiplier = 1.0      // R/T key adjustment (multiplier on top)

// Cache for creature's natural volume (before normalization)
let cachedNaturalVolume = null

// ============================================================================
// CORE MATH FUNCTIONS
// ============================================================================

/**
 * Compute capsule volume
 * 
 * Capsule = Cylinder + 2 Hemispheres (= 1 Sphere)
 * V = πr²h + (4/3)πr³
 *   = πr²(h + 4r/3)
 * 
 * Where:
 *   r = capsule radius
 *   h = cylinder height (= 2 * halfHeight)
 * 
 * @param {number} radius - Capsule radius
 * @param {number} halfHeight - Half the cylinder height
 * @returns {number} Volume in cubic meters
 */
export function computeCapsuleVolume(radius, halfHeight) {
  const r = radius
  const h = halfHeight * 2  // Full cylinder height
  
  // V = πr²(h + 4r/3)
  const volume = Math.PI * r * r * (h + (4 * r / 3))
  
  return volume
}

/**
 * Compute the scale factor needed to achieve target volume
 * 
 * Since volume scales with cube of linear dimension:
 *   targetVolume = currentVolume × scale³
 *   scale = ∛(targetVolume / currentVolume)
 * 
 * @param {number} currentVolume - Current/natural capsule volume
 * @param {number} targetVolume - Desired gameplay volume
 * @returns {number} Uniform scale factor to apply to mesh
 */
export function computeScaleFactor(currentVolume, targetVolume) {
  if (currentVolume <= 0) {
    console.warn('[NormalScale] Invalid current volume:', currentVolume)
    return 1.0
  }
  
  return Math.cbrt(targetVolume / currentVolume)
}

/**
 * Compute growth multiplier from food eaten (logarithmic curve)
 * 
 * Formula: multiplier = 1 + GROWTH_RATE × ln(1 + foodEaten)
 * 
 * Properties:
 *   - At 0 food: multiplier = 1.0 (starter size)
 *   - Fast early growth, slows as you get bigger
 *   - Never fully plateaus (always some reward)
 * 
 * Example values (with GROWTH_RATE = 0.5):
 *   Food:     0     10     50    100    500   1000
 *   Mult:    1.0   1.20   1.96   2.31   3.11   3.45
 * 
 * @param {number} foodEaten - Total food consumed
 * @returns {number} Volume multiplier (1.0 = starter size)
 */
export function computeGrowthMultiplier(foodEaten) {
  return 1 + CONFIG.GROWTH_RATE * Math.log(1 + foodEaten)
}

/**
 * Compute total target volume considering all factors
 * 
 * @returns {number} Target volume in cubic meters
 */
export function computeTargetVolume() {
  const growthMultiplier = computeGrowthMultiplier(currentFoodEaten)
  return CONFIG.STARTER_VOLUME * growthMultiplier * manualScaleMultiplier
}

// ============================================================================
// MAIN NORMALIZATION FUNCTION
// ============================================================================

/**
 * Normalize a creature to gameplay scale
 * 
 * This is the main entry point. It:
 *   1. Computes the natural volume from capsule params
 *   2. Calculates target volume (starter × growth × manual)
 *   3. Determines scale factor to apply
 *   4. Applies scale to mesh
 *   5. Returns normalized capsule params for physics
 * 
 * @param {THREE.Object3D} mesh - The creature mesh (will be scaled in place)
 * @param {object} naturalCapsuleParams - { radius, halfHeight, center } at natural scale
 * @param {boolean} applyToMesh - Whether to actually apply scale (default true)
 * @returns {object} Normalization result
 */
export function normalizeCreature(mesh, naturalCapsuleParams, applyToMesh = true) {
  if (!naturalCapsuleParams) {
    console.warn('[NormalScale] No capsule params provided')
    return null
  }
  
  const { radius, halfHeight, center } = naturalCapsuleParams
  
  // 1. Compute natural volume (this is a META FACT we preserve)
  const naturalVolume = computeCapsuleVolume(radius, halfHeight)
  cachedNaturalVolume = naturalVolume
  
  // 2. Compute target volume for gameplay
  const targetVolume = computeTargetVolume()
  
  // 3. Compute scale factor
  const scaleFactor = computeScaleFactor(naturalVolume, targetVolume)
  
  // 4. Apply to mesh (uniform scale)
  if (applyToMesh && mesh) {
    mesh.scale.setScalar(scaleFactor)
  }
  
  // 5. Compute normalized capsule params for physics
  const normalizedCapsuleParams = {
    radius: radius * scaleFactor,
    halfHeight: halfHeight * scaleFactor,
    center: center ? center.clone().multiplyScalar(scaleFactor) : new THREE.Vector3(),
  }
  
  // 6. Return comprehensive result
  return {
    // Scale info
    scaleFactor,
    
    // Capsule params
    naturalCapsuleParams,           // Original (preserved)
    normalizedCapsuleParams,        // For physics
    
    // Volume info
    naturalVolume,                  // META FACT (preserved)
    targetVolume,                   // Current gameplay volume
    
    // Growth state
    growthMultiplier: computeGrowthMultiplier(currentFoodEaten),
    manualScaleMultiplier,
    foodEaten: currentFoodEaten,
  }
}

/**
 * Get scale factor without applying to mesh
 * Useful for queries and physics updates
 * 
 * @param {object} naturalCapsuleParams - { radius, halfHeight }
 * @returns {number} Scale factor
 */
export function getScaleFactor(naturalCapsuleParams) {
  const { radius, halfHeight } = naturalCapsuleParams
  const naturalVolume = computeCapsuleVolume(radius, halfHeight)
  const targetVolume = computeTargetVolume()
  return computeScaleFactor(naturalVolume, targetVolume)
}

/**
 * Scale capsule params by a factor
 * 
 * @param {object} capsuleParams - { radius, halfHeight, center }
 * @param {number} scaleFactor - Scale to apply
 * @returns {object} Scaled capsule params
 */
export function scaleCapsuleParams(capsuleParams, scaleFactor) {
  return {
    radius: capsuleParams.radius * scaleFactor,
    halfHeight: capsuleParams.halfHeight * scaleFactor,
    center: capsuleParams.center 
      ? capsuleParams.center.clone().multiplyScalar(scaleFactor) 
      : new THREE.Vector3(),
  }
}

// ============================================================================
// GROWTH SYSTEM
// ============================================================================

/**
 * Add food and update growth
 * 
 * @param {number} foodValue - Amount of food eaten (arbitrary units)
 * @returns {object} { newMultiplier, volumeGained, totalVolume }
 */
export function addFood(foodValue) {
  const oldMultiplier = computeGrowthMultiplier(currentFoodEaten)
  const oldVolume = CONFIG.STARTER_VOLUME * oldMultiplier * manualScaleMultiplier
  
  currentFoodEaten += foodValue
  
  const newMultiplier = computeGrowthMultiplier(currentFoodEaten)
  const newVolume = CONFIG.STARTER_VOLUME * newMultiplier * manualScaleMultiplier
  
  return {
    newMultiplier,
    volumeGained: newVolume - oldVolume,
    totalVolume: newVolume,
    totalFood: currentFoodEaten,
  }
}

/**
 * Set food eaten directly (for loading saved state)
 * 
 * @param {number} food - Food value to set
 */
export function setFoodEaten(food) {
  currentFoodEaten = Math.max(0, food)
}

/**
 * Get current food eaten
 * 
 * @returns {number}
 */
export function getFoodEaten() {
  return currentFoodEaten
}

/**
 * Reset growth to starter (no food eaten)
 */
export function resetGrowth() {
  currentFoodEaten = 0
  console.log('[NormalScale] Growth reset to starter')
}

/**
 * Get current growth stats
 * 
 * @returns {object} Growth statistics
 */
export function getGrowthStats() {
  const growthMultiplier = computeGrowthMultiplier(currentFoodEaten)
  const targetVolume = computeTargetVolume()
  
  return {
    foodEaten: currentFoodEaten,
    growthMultiplier,
    manualScaleMultiplier,
    targetVolume,
    starterVolume: CONFIG.STARTER_VOLUME,
  }
}

// ============================================================================
// MANUAL SCALE (R/T Keys)
// ============================================================================

/**
 * Decrease scale (R key)
 * 
 * @returns {object} { newMultiplier, newVolume }
 */
export function decreaseScale() {
  const oldMultiplier = manualScaleMultiplier
  manualScaleMultiplier = Math.max(
    CONFIG.MANUAL_SCALE_MIN,
    manualScaleMultiplier - CONFIG.MANUAL_SCALE_STEP
  )
  
  const newVolume = computeTargetVolume()
  
  console.log(`[NormalScale] Scale decreased: ${(oldMultiplier * 100).toFixed(0)}% → ${(manualScaleMultiplier * 100).toFixed(0)}%`)
  
  return {
    newMultiplier: manualScaleMultiplier,
    newVolume,
  }
}

/**
 * Increase scale (T key)
 * 
 * @returns {object} { newMultiplier, newVolume }
 */
export function increaseScale() {
  const oldMultiplier = manualScaleMultiplier
  manualScaleMultiplier = Math.min(
    CONFIG.MANUAL_SCALE_MAX,
    manualScaleMultiplier + CONFIG.MANUAL_SCALE_STEP
  )
  
  const newVolume = computeTargetVolume()
  
  console.log(`[NormalScale] Scale increased: ${(oldMultiplier * 100).toFixed(0)}% → ${(manualScaleMultiplier * 100).toFixed(0)}%`)
  
  return {
    newMultiplier: manualScaleMultiplier,
    newVolume,
  }
}

/**
 * Reset manual scale to 1.0
 */
export function resetManualScale() {
  manualScaleMultiplier = 1.0
  console.log('[NormalScale] Manual scale reset to 100%')
}

/**
 * Get current manual scale multiplier
 * 
 * @returns {number}
 */
export function getManualScaleMultiplier() {
  return manualScaleMultiplier
}

/**
 * Set manual scale directly
 * 
 * @param {number} multiplier
 */
export function setManualScaleMultiplier(multiplier) {
  manualScaleMultiplier = Math.max(
    CONFIG.MANUAL_SCALE_MIN,
    Math.min(CONFIG.MANUAL_SCALE_MAX, multiplier)
  )
}

// ============================================================================
// CREATURE SWAP - Equivalent Scale Transfer
// ============================================================================

/**
 * Compute the equivalent scale state when swapping to a new creature
 * 
 * When player switches creatures (N/B keys), we want to maintain
 * their "progression" - same gameplay volume, different shape.
 * 
 * @param {object} oldNaturalCapsuleParams - Old creature's natural capsule
 * @param {object} newNaturalCapsuleParams - New creature's natural capsule
 * @returns {object} No state change needed - growth/manual scale carry over
 */
export function transferToNewCreature(oldNaturalCapsuleParams, newNaturalCapsuleParams) {
  // The beauty of volume-based normalization:
  // We don't need to change anything!
  // 
  // The growth multiplier and manual scale are INDEPENDENT of creature type.
  // A player at 2.0× growth will have 2 m³ volume regardless of creature.
  // 
  // The scale FACTOR will be different (to achieve same volume from different natural size)
  // but the gameplay VOLUME remains the same.
  
  const oldNaturalVolume = computeCapsuleVolume(
    oldNaturalCapsuleParams.radius, 
    oldNaturalCapsuleParams.halfHeight
  )
  const newNaturalVolume = computeCapsuleVolume(
    newNaturalCapsuleParams.radius, 
    newNaturalCapsuleParams.halfHeight
  )
  
  const targetVolume = computeTargetVolume()
  const newScaleFactor = computeScaleFactor(newNaturalVolume, targetVolume)
  
  return {
    // These stay the same (progression preserved)
    foodEaten: currentFoodEaten,
    growthMultiplier: computeGrowthMultiplier(currentFoodEaten),
    manualScaleMultiplier,
    targetVolume,
    
    // These change (different creature shape)
    oldNaturalVolume,
    newNaturalVolume,
    newScaleFactor,
  }
}

// ============================================================================
// UTILITY / DEBUG
// ============================================================================

/**
 * Get comprehensive normalization info for a creature
 * Useful for HUD display or debugging
 * 
 * @param {object} naturalCapsuleParams - { radius, halfHeight }
 * @returns {object} All normalization data
 */
export function getNormalizationInfo(naturalCapsuleParams) {
  const { radius, halfHeight } = naturalCapsuleParams
  const naturalVolume = computeCapsuleVolume(radius, halfHeight)
  const targetVolume = computeTargetVolume()
  const scaleFactor = computeScaleFactor(naturalVolume, targetVolume)
  const growthMultiplier = computeGrowthMultiplier(currentFoodEaten)
  
  return {
    // Natural (META FACTS - preserved from Encyclopedia)
    natural: {
      radius,
      halfHeight,
      volume: naturalVolume,
      capsuleLength: halfHeight * 2 + radius * 2,  // Total capsule length
    },
    
    // Gameplay (normalized)
    gameplay: {
      radius: radius * scaleFactor,
      halfHeight: halfHeight * scaleFactor,
      volume: targetVolume,
      capsuleLength: (halfHeight * 2 + radius * 2) * scaleFactor,
    },
    
    // Multipliers
    scaleFactor,
    growthMultiplier,
    manualScaleMultiplier,
    
    // Progression
    foodEaten: currentFoodEaten,
    starterVolume: CONFIG.STARTER_VOLUME,
    
    // Percentages for display
    scalePercent: scaleFactor * 100,
    growthPercent: growthMultiplier * 100,
    volumePercent: (targetVolume / CONFIG.STARTER_VOLUME) * 100,
  }
}

/**
 * Debug log current state
 */
export function debug() {
  const growthMultiplier = computeGrowthMultiplier(currentFoodEaten)
  const targetVolume = computeTargetVolume()
  
  console.group('[NormalScale] Debug')
  console.log(`Starter volume:      ${CONFIG.STARTER_VOLUME.toFixed(2)} m³`)
  console.log(`Growth rate:         ${CONFIG.GROWTH_RATE}`)
  console.log('─────────────────────')
  console.log(`Food eaten:          ${currentFoodEaten.toFixed(1)}`)
  console.log(`Growth multiplier:   ${growthMultiplier.toFixed(2)}× (${(growthMultiplier * 100).toFixed(0)}%)`)
  console.log(`Manual scale:        ${manualScaleMultiplier.toFixed(2)}× (${(manualScaleMultiplier * 100).toFixed(0)}%)`)
  console.log('─────────────────────')
  console.log(`Target volume:       ${targetVolume.toFixed(2)} m³`)
  if (cachedNaturalVolume) {
    const scaleFactor = computeScaleFactor(cachedNaturalVolume, targetVolume)
    console.log(`Natural volume:      ${cachedNaturalVolume.toFixed(2)} m³ (meta fact)`)
    console.log(`Scale factor:        ${scaleFactor.toFixed(3)}×`)
  }
  console.groupEnd()
}

/**
 * Get configuration (read-only)
 * 
 * @returns {object} Copy of config
 */
export function getConfig() {
  return { ...CONFIG }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Config
  getConfig,
  
  // Core math
  computeCapsuleVolume,
  computeScaleFactor,
  computeGrowthMultiplier,
  computeTargetVolume,
  
  // Main functions
  normalizeCreature,
  getScaleFactor,
  scaleCapsuleParams,
  
  // Growth
  addFood,
  setFoodEaten,
  getFoodEaten,
  resetGrowth,
  getGrowthStats,
  
  // Manual scale
  decreaseScale,
  increaseScale,
  resetManualScale,
  getManualScaleMultiplier,
  setManualScaleMultiplier,
  
  // Creature swap
  transferToNewCreature,
  
  // Utility
  getNormalizationInfo,
  debug,
}