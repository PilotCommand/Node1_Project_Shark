/**
 * NormalScale.js - Normalize creatures to equal starting volume
 * 
 * PURPOSE:
 *   Encyclopedia.js contains real-world accurate sizes (meta facts).
 *   This module normalizes all creatures to equal gameplay volume
 *   while PRESERVING the original data.
 * 
 * CONCEPT:
 *   - All creatures start at STARTER_VOLUME (1 mÂ³)
 *   - Capsule volume determines "size" for gameplay
 *   - Growth multiplier increases volume logarithmically
 *   - Scale factor = âˆ›(targetVolume / naturalVolume)
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
  MANUAL_SCALE_MAX: 10.0,     // Can't exceed 10Ã— normalized
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
 * V = Ï€rÂ²h + (4/3)Ï€rÂ³
 *   = Ï€rÂ²(h + 4r/3)
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
  
  // V = Ï€rÂ²(h + 4r/3)
  const volume = Math.PI * r * r * (h + (4 * r / 3))
  
  return volume
}

/**
 * Compute the scale factor needed to achieve target volume
 * 
 * Since volume scales with cube of linear dimension:
 *   targetVolume = currentVolume Ã— scaleÂ³
 *   scale = âˆ›(targetVolume / currentVolume)
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
 * Formula: multiplier = 1 + GROWTH_RATE Ã— ln(1 + foodEaten)
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
 *   2. Calculates target volume (starter Ã— growth Ã— manual)
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
  
  console.log(`[NormalScale] Scale decreased: ${(oldMultiplier * 100).toFixed(0)}% â†’ ${(manualScaleMultiplier * 100).toFixed(0)}%`)
  
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
  
  console.log(`[NormalScale] Scale increased: ${(oldMultiplier * 100).toFixed(0)}% â†’ ${(manualScaleMultiplier * 100).toFixed(0)}%`)
  
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
  // A player at 2.0Ã— growth will have 2 mÂ³ volume regardless of creature.
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
  console.log(`Starter volume:      ${CONFIG.STARTER_VOLUME.toFixed(2)} mÂ³`)
  console.log(`Growth rate:         ${CONFIG.GROWTH_RATE}`)
  console.log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€')
  console.log(`Food eaten:          ${currentFoodEaten.toFixed(1)}`)
  console.log(`Growth multiplier:   ${growthMultiplier.toFixed(2)}Ã— (${(growthMultiplier * 100).toFixed(0)}%)`)
  console.log(`Manual scale:        ${manualScaleMultiplier.toFixed(2)}Ã— (${(manualScaleMultiplier * 100).toFixed(0)}%)`)
  console.log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€')
  console.log(`Target volume:       ${targetVolume.toFixed(2)} mÂ³`)
  if (cachedNaturalVolume) {
    const scaleFactor = computeScaleFactor(cachedNaturalVolume, targetVolume)
    console.log(`Natural volume:      ${cachedNaturalVolume.toFixed(2)} mÂ³ (meta fact)`)
    console.log(`Scale factor:        ${scaleFactor.toFixed(3)}Ã—`)
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
// NPC VISUAL VOLUME NORMALIZATION
// ============================================================================

/**
 * NPC Volume Configuration
 * 
 * Unlike player (which uses capsule volume for physics),
 * NPCs are normalized based on their actual visual mesh volume.
 */
const NPC_CONFIG = {
  // Visual volume bounds (cubic meters)
  MIN_VOLUME: 1.0,      // Smallest NPC visual volume
  MAX_VOLUME: 1000.0,   // Largest NPC visual volume
  
  // Normal distribution parameters
  // Mean at geometric center of log scale (sqrt(1 * 1000) ≈ 31.6)
  // This gives a nice spread across the range
  VOLUME_MEAN: 50.0,    // Center of distribution
  VOLUME_STD_DEV: 150.0, // Standard deviation (wide spread)
  
  // Default target for "medium" creatures
  DEFAULT_VOLUME: 5.0,
}

/**
 * Generate a normally distributed random number using Box-Muller transform
 * @returns {number} Random number from standard normal distribution (mean=0, std=1)
 */
function randomNormal() {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
}

/**
 * Generate a normally distributed target volume for an NPC
 * Clamped to [MIN_VOLUME, MAX_VOLUME]
 * 
 * @returns {number} Target volume in cubic meters
 */
export function generateNPCTargetVolume() {
  // Generate from normal distribution
  const volume = NPC_CONFIG.VOLUME_MEAN + randomNormal() * NPC_CONFIG.VOLUME_STD_DEV
  
  // Clamp to bounds
  return Math.max(NPC_CONFIG.MIN_VOLUME, Math.min(NPC_CONFIG.MAX_VOLUME, volume))
}

/**
 * Generate a log-normally distributed target volume for an NPC
 * This gives a more natural distribution where small fish are common
 * and large fish are rare, but still spans the full range.
 * 
 * @returns {number} Target volume in cubic meters
 */
export function generateNPCTargetVolumeLogNormal() {
  // Log-normal parameters
  // We want the distribution to span 1 to 1000
  // ln(1) = 0, ln(1000) ≈ 6.9
  // Mean in log space: ~3.5 (corresponds to ~33 m³)
  // Std in log space: ~1.5 (gives good spread)
  const logMean = 3.5
  const logStd = 1.5
  
  const logVolume = logMean + randomNormal() * logStd
  const volume = Math.exp(logVolume)
  
  // Clamp to bounds
  return Math.max(NPC_CONFIG.MIN_VOLUME, Math.min(NPC_CONFIG.MAX_VOLUME, volume))
}

/**
 * Compute scale factor to achieve target visual volume
 * 
 * @param {number} currentVisualVolume - Current visual mesh volume (unscaled)
 * @param {number} targetVolume - Desired visual volume
 * @returns {number} Scale factor to apply to mesh
 */
export function computeNPCScaleFactor(currentVisualVolume, targetVolume) {
  if (currentVisualVolume <= 0) {
    console.warn('[NormalScale] Invalid visual volume:', currentVisualVolume)
    return 1.0
  }
  
  // Volume scales with cube of linear dimension
  // targetVolume = currentVolume × scale³
  // scale = ∛(targetVolume / currentVolume)
  return Math.cbrt(targetVolume / currentVisualVolume)
}

/**
 * Get scale factor to achieve a normally distributed volume
 * Uses log-normal distribution for natural spread across 1-1000 m³
 * 
 * @param {number} naturalVisualVolume - Visual volume at scale=1
 * @returns {{ scaleFactor: number, targetVolume: number }}
 */
export function getNPCNormalDistributedScale(naturalVisualVolume) {
  if (naturalVisualVolume <= 0) {
    console.warn('[NormalScale] Invalid natural visual volume:', naturalVisualVolume)
    return {
      scaleFactor: 1.0,
      targetVolume: NPC_CONFIG.DEFAULT_VOLUME,
    }
  }
  
  // Generate log-normally distributed target volume
  // This gives more small fish, fewer large fish - natural distribution
  const targetVolume = generateNPCTargetVolumeLogNormal()
  
  // Compute scale factor to achieve target
  const scaleFactor = computeNPCScaleFactor(naturalVisualVolume, targetVolume)
  
  return {
    scaleFactor,
    targetVolume,
  }
}

/**
 * Clamp a volume to NPC bounds
 * 
 * @param {number} volume - Volume to clamp
 * @returns {number} Clamped volume between MIN and MAX
 */
export function clampNPCVolume(volume) {
  return Math.max(NPC_CONFIG.MIN_VOLUME, Math.min(NPC_CONFIG.MAX_VOLUME, volume))
}

/**
 * Normalize an NPC creature to fit within visual volume bounds
 * 
 * This is the main function for NPC normalization. It:
 *   1. Computes the creature's natural visual volume
 *   2. Applies the desired scale multiplier
 *   3. Clamps the result to [MIN_VOLUME, MAX_VOLUME]
 *   4. Returns the final scale factor to apply
 * 
 * @param {number} naturalVisualVolume - Visual volume at scale=1
 * @param {number} desiredScaleMultiplier - Spawn system's desired scale (e.g., 1-10)
 * @returns {{
 *   scaleFactor: number,        // Final scale to apply to mesh
 *   targetVolume: number,       // Target volume after clamping
 *   wasClamped: boolean,        // Whether clamping was applied
 *   clampReason: string|null    // 'min' or 'max' if clamped
 * }}
 */
export function normalizeNPCVisualVolume(naturalVisualVolume, desiredScaleMultiplier = 1.0) {
  if (naturalVisualVolume <= 0) {
    console.warn('[NormalScale] Invalid natural visual volume:', naturalVisualVolume)
    return {
      scaleFactor: desiredScaleMultiplier,
      targetVolume: NPC_CONFIG.DEFAULT_VOLUME,
      wasClamped: false,
      clampReason: null,
    }
  }
  
  // Compute what the visual volume would be at desired scale
  // Volume scales with cube of linear scale
  const desiredVolume = naturalVisualVolume * Math.pow(desiredScaleMultiplier, 3)
  
  // Check if clamping is needed
  let targetVolume = desiredVolume
  let wasClamped = false
  let clampReason = null
  
  if (desiredVolume < NPC_CONFIG.MIN_VOLUME) {
    targetVolume = NPC_CONFIG.MIN_VOLUME
    wasClamped = true
    clampReason = 'min'
  } else if (desiredVolume > NPC_CONFIG.MAX_VOLUME) {
    targetVolume = NPC_CONFIG.MAX_VOLUME
    wasClamped = true
    clampReason = 'max'
  }
  
  // Compute final scale factor to achieve target volume
  const scaleFactor = computeNPCScaleFactor(naturalVisualVolume, targetVolume)
  
  return {
    scaleFactor,
    targetVolume,
    wasClamped,
    clampReason,
  }
}

/**
 * Quick helper to get scale factor for NPC with clamping
 * 
 * @param {number} naturalVisualVolume - Visual volume at scale=1
 * @param {number} desiredScaleMultiplier - Desired scale multiplier
 * @returns {number} Final scale factor (clamped to volume bounds)
 */
export function getNPCScaleFactor(naturalVisualVolume, desiredScaleMultiplier = 1.0) {
  const result = normalizeNPCVisualVolume(naturalVisualVolume, desiredScaleMultiplier)
  return result.scaleFactor
}

/**
 * Get NPC configuration (read-only)
 * 
 * @returns {object} Copy of NPC config
 */
export function getNPCConfig() {
  return { ...NPC_CONFIG }
}

/**
 * Set NPC volume bounds at runtime
 * 
 * @param {number} min - Minimum visual volume
 * @param {number} max - Maximum visual volume
 */
export function setNPCVolumeBounds(min, max) {
  if (min > 0 && max > min) {
    NPC_CONFIG.MIN_VOLUME = min
    NPC_CONFIG.MAX_VOLUME = max
    console.log(`[NormalScale] NPC volume bounds set to [${min}, ${max}] m³`)
  } else {
    console.warn('[NormalScale] Invalid volume bounds:', min, max)
  }
}

/**
 * Debug NPC normalization for a given creature
 * 
 * @param {number} naturalVisualVolume - Visual volume at scale=1
 * @param {number} desiredScaleMultiplier - Desired scale multiplier
 */
export function debugNPCNormalization(naturalVisualVolume, desiredScaleMultiplier) {
  const result = normalizeNPCVisualVolume(naturalVisualVolume, desiredScaleMultiplier)
  
  console.group('[NormalScale] NPC Normalization Debug')
  console.log(`Natural visual volume: ${naturalVisualVolume.toFixed(4)} m³`)
  console.log(`Desired scale multiplier: ${desiredScaleMultiplier.toFixed(2)}×`)
  console.log(`Desired volume: ${(naturalVisualVolume * Math.pow(desiredScaleMultiplier, 3)).toFixed(2)} m³`)
  console.log(`─────────────────────────`)
  console.log(`Volume bounds: [${NPC_CONFIG.MIN_VOLUME}, ${NPC_CONFIG.MAX_VOLUME}] m³`)
  console.log(`Was clamped: ${result.wasClamped}${result.clampReason ? ` (${result.clampReason})` : ''}`)
  console.log(`─────────────────────────`)
  console.log(`Final scale factor: ${result.scaleFactor.toFixed(3)}×`)
  console.log(`Final visual volume: ${result.targetVolume.toFixed(2)} m³`)
  console.groupEnd()
  
  return result
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
  
  // Main functions (Player)
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
  
  // NPC Visual Volume Normalization
  computeNPCScaleFactor,
  clampNPCVolume,
  normalizeNPCVisualVolume,
  getNPCScaleFactor,
  getNPCConfig,
  setNPCVolumeBounds,
  debugNPCNormalization,
  
  // NPC Normal Distribution
  generateNPCTargetVolume,
  generateNPCTargetVolumeLogNormal,
  getNPCNormalDistributedScale,
}