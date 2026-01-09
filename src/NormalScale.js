/**
 * NormalScale.js - Volume Utilities and Deprecated Player State Wrappers
 * 
 * ARCHITECTURE CHANGE:
 *   As of the PlayerRegistry consolidation, all player volume/scale state
 *   has moved to PlayerRegistry.js. This file now contains:
 *   
 *   1. PURE UTILITY FUNCTIONS (unchanged, no state)
 *      - computeCapsuleVolume(), computeScaleFactor(), scaleCapsuleParams(), etc.
 *   
 *   2. DEPRECATED WRAPPERS (redirect to PlayerRegistry)
 *      - addVolume(), getWorldVolume(), decreaseScale(), etc.
 *      - These log deprecation warnings and call PlayerRegistry methods
 *   
 *   3. NPC FUNCTIONS (unchanged, self-contained)
 *      - generateNPCTargetVolumeLogNormal(), computeNPCScaleFactor(), etc.
 * 
 * MIGRATION GUIDE:
 *   OLD: import { addVolume, getWorldVolume } from './NormalScale.js'
 *   NEW: import { PlayerRegistry } from './PlayerRegistry.js'
 *        PlayerRegistry.addVolume(id, preyVolume)
 *        PlayerRegistry.getVolumes(id).world
 * 
 * VOLUME SYSTEM:
 *   - TotalWorldVolume: Your current gameplay volume [1, 1000] m^3
 *   - When you eat prey, your volume = your volume + prey's volume (capped at 1000)
 *   - 5% rule: You can eat fish that are <= 95% of your volume
 */

import * as THREE from 'three'
import { Determine } from './determine.js'
import { PlayerRegistry, VOLUME_CONFIG } from './PlayerRegistry.js'

// ============================================================================
// CONFIGURATION (kept for reference and NPC use)
// ============================================================================

const CONFIG = {
  // Starting volume for all player creatures (cubic meters)
  STARTER_VOLUME: 1.0,
  
  // Maximum volume cap (cubic meters)
  MAX_VOLUME: 1000.0,
  
  // Minimum volume (cubic meters)
  MIN_VOLUME: 1.0,
  
  // Manual scale adjustment (R/T keys) - for DEBUG/TESTING
  MANUAL_SCALE_STEP: 0.1,     // 10% per keypress
  MANUAL_SCALE_MIN: 0.1,      // Can't go below 10% of normalized
  MANUAL_SCALE_MAX: 10.0,     // Can't exceed 10x normalized
}

// ============================================================================
// DEPRECATION HELPERS
// ============================================================================

const deprecationWarnings = new Set()

function warnDeprecated(fnName, replacement) {
  if (!deprecationWarnings.has(fnName)) {
    console.warn(`[NormalScale] ${fnName}() is deprecated. Use ${replacement} instead.`)
    deprecationWarnings.add(fnName)
  }
}

function getLocalId() {
  return PlayerRegistry.getLocalId()
}

// ============================================================================
// PURE UTILITY FUNCTIONS (NO STATE - KEEP UNCHANGED)
// ============================================================================

/**
 * Compute capsule volume
 * 
 * Capsule = Cylinder + 2 Hemispheres (= 1 Sphere)
 * V = pi*r^2*h + (4/3)*pi*r^3
 *   = pi*r^2*(h + 4r/3)
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
  
  // V = pi*r^2*(h + 4r/3)
  const volume = Math.PI * r * r * (h + (4 * r / 3))
  
  return volume
}

/**
 * Compute the scale factor needed to achieve target volume
 * 
 * Since volume scales with cube of linear dimension:
 *   targetVolume = currentVolume * scale^3
 *   scale = cbrt(targetVolume / currentVolume)
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

/**
 * Clamp a volume to valid bounds
 * 
 * @param {number} volume - Volume to clamp
 * @returns {number} Clamped volume
 */
export function clampVolume(volume) {
  return Math.max(CONFIG.MIN_VOLUME, Math.min(CONFIG.MAX_VOLUME, volume))
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
// DEPRECATED WRAPPERS - REDIRECT TO PLAYERREGISTRY
// ============================================================================

/**
 * Compute total target volume considering world volume and manual scale
 * 
 * @deprecated Use PlayerRegistry.getEffectiveVolume(id) instead
 * @returns {number} Target volume in cubic meters
 */
export function computeTargetVolume() {
  warnDeprecated('computeTargetVolume', 'PlayerRegistry.getEffectiveVolume(id)')
  const localId = getLocalId()
  return localId ? PlayerRegistry.getEffectiveVolume(localId) : VOLUME_CONFIG.STARTER
}

/**
 * Normalize a creature to gameplay scale
 * 
 * @deprecated Use PlayerRegistry.initVolumes(id, naturalCapsuleParams) instead
 * @param {THREE.Object3D} mesh - The creature mesh (will be scaled in place)
 * @param {object} naturalCapsuleParams - { radius, halfHeight, center } at natural scale
 * @param {boolean} applyToMesh - Whether to actually apply scale (default true)
 * @returns {object} Normalization result
 */
export function normalizeCreature(mesh, naturalCapsuleParams, applyToMesh = true) {
  warnDeprecated('normalizeCreature', 'PlayerRegistry.initVolumes(id, capsuleParams)')
  
  if (!naturalCapsuleParams) {
    console.warn('[NormalScale] No capsule params provided')
    return null
  }
  
  const localId = getLocalId()
  if (!localId) {
    console.warn('[NormalScale] No local player registered')
    return null
  }
  
  // Initialize volumes in PlayerRegistry
  PlayerRegistry.initVolumes(localId, naturalCapsuleParams)
  
  // Get results from PlayerRegistry
  const player = PlayerRegistry.get(localId)
  const volumes = player.volumes
  const capsule = player.capsule
  
  // Apply to mesh if requested (PlayerRegistry already does this, but be explicit)
  if (applyToMesh && mesh) {
    mesh.scale.setScalar(capsule.scaleFactor)
  }
  
  return {
    scaleFactor: capsule.scaleFactor,
    naturalCapsuleParams,
    normalizedCapsuleParams: capsule.normalized,
    naturalVolume: volumes.natural,
    targetVolume: volumes.effective,
    worldVolume: volumes.world,
    manualScaleMultiplier: volumes.manualScale,
  }
}

/**
 * Get scale factor without applying to mesh
 * 
 * @deprecated Use PlayerRegistry.getCapsule(id).scaleFactor instead
 * @param {object} naturalCapsuleParams - { radius, halfHeight }
 * @returns {number} Scale factor
 */
export function getScaleFactor(naturalCapsuleParams) {
  warnDeprecated('getScaleFactor', 'PlayerRegistry.getCapsule(id).scaleFactor')
  
  const localId = getLocalId()
  if (localId) {
    const capsule = PlayerRegistry.getCapsule(localId)
    if (capsule) return capsule.scaleFactor
  }
  
  // Fallback to computation
  const { radius, halfHeight } = naturalCapsuleParams
  const naturalVolume = computeCapsuleVolume(radius, halfHeight)
  const targetVolume = PlayerRegistry.getEffectiveVolume(localId) || VOLUME_CONFIG.STARTER
  return computeScaleFactor(naturalVolume, targetVolume)
}

/**
 * Add volume from eating prey (LINEAR ADDITIVE GROWTH)
 * 
 * @deprecated Use PlayerRegistry.addVolume(id, preyVolume) instead
 * @param {number} preyVolume - Volume of prey that was eaten
 * @returns {object} { volumeGained, totalVolume, wasCapped }
 */
export function addVolume(preyVolume) {
  warnDeprecated('addVolume', 'PlayerRegistry.addVolume(id, preyVolume)')
  
  const localId = getLocalId()
  if (!localId) {
    console.warn('[NormalScale] No local player registered')
    return { volumeGained: 0, totalVolume: VOLUME_CONFIG.STARTER, wasCapped: false }
  }
  
  return PlayerRegistry.addVolume(localId, preyVolume)
}

/**
 * Set world volume directly (for loading saved state or syncing)
 * 
 * @deprecated Use PlayerRegistry.setWorldVolume(id, volume) instead
 * @param {number} volume - Volume to set
 */
export function setWorldVolume(volume) {
  warnDeprecated('setWorldVolume', 'PlayerRegistry.setWorldVolume(id, volume)')
  
  const localId = getLocalId()
  if (localId) {
    PlayerRegistry.setWorldVolume(localId, volume)
  }
}

/**
 * Get current world volume (base volume without manual scale)
 * 
 * @deprecated Use PlayerRegistry.getVolumes(id).world instead
 * @returns {number}
 */
export function getWorldVolume() {
  warnDeprecated('getWorldVolume', 'PlayerRegistry.getVolumes(id).world')
  
  const localId = getLocalId()
  if (localId) {
    const volumes = PlayerRegistry.getVolumes(localId)
    return volumes ? volumes.world : VOLUME_CONFIG.STARTER
  }
  return VOLUME_CONFIG.STARTER
}

/**
 * Get effective world volume INCLUDING manual scale multiplier
 * This is what should be used for feeding calculations
 * 
 * @deprecated Use PlayerRegistry.getEffectiveVolume(id) instead
 * @returns {number} Effective volume in m^3
 */
export function getEffectiveWorldVolume() {
  warnDeprecated('getEffectiveWorldVolume', 'PlayerRegistry.getEffectiveVolume(id)')
  
  const localId = getLocalId()
  return localId ? PlayerRegistry.getEffectiveVolume(localId) : VOLUME_CONFIG.STARTER
}

/**
 * Reset to starter volume
 * 
 * @deprecated Use PlayerRegistry.resetVolumes(id) instead
 */
export function resetGrowth() {
  warnDeprecated('resetGrowth', 'PlayerRegistry.resetVolumes(id)')
  
  const localId = getLocalId()
  if (localId) {
    PlayerRegistry.resetVolumes(localId)
  }
}

/**
 * Get current growth stats
 * 
 * @deprecated Use PlayerRegistry.getVolumes(id) and PlayerRegistry.getFeedingStats(id) instead
 * @returns {object} Growth statistics
 */
export function getGrowthStats() {
  warnDeprecated('getGrowthStats', 'PlayerRegistry.getVolumes(id)')
  
  const localId = getLocalId()
  if (!localId) {
    return {
      worldVolume: VOLUME_CONFIG.STARTER,
      manualScaleMultiplier: 1.0,
      targetVolume: VOLUME_CONFIG.STARTER,
      starterVolume: CONFIG.STARTER_VOLUME,
      maxVolume: CONFIG.MAX_VOLUME,
      percentOfMax: (VOLUME_CONFIG.STARTER / CONFIG.MAX_VOLUME) * 100,
    }
  }
  
  const volumes = PlayerRegistry.getVolumes(localId)
  
  return {
    worldVolume: volumes.world,
    manualScaleMultiplier: volumes.manualScale,
    targetVolume: volumes.effective,
    starterVolume: CONFIG.STARTER_VOLUME,
    maxVolume: CONFIG.MAX_VOLUME,
    percentOfMax: (volumes.world / CONFIG.MAX_VOLUME) * 100,
  }
}

/**
 * Decrease scale (R key)
 * 
 * @deprecated Use PlayerRegistry.adjustManualScale(id, -VOLUME_CONFIG.MANUAL_SCALE_STEP) instead
 * @returns {object} { newMultiplier, newVolume }
 */
export function decreaseScale() {
  warnDeprecated('decreaseScale', 'PlayerRegistry.adjustManualScale(id, -step)')
  
  const localId = getLocalId()
  if (!localId) {
    return { newMultiplier: 1.0, newVolume: VOLUME_CONFIG.STARTER }
  }
  
  const result = PlayerRegistry.adjustManualScale(localId, -VOLUME_CONFIG.MANUAL_SCALE_STEP)
  
  return {
    newMultiplier: result ? result.newScale : 1.0,
    newVolume: result ? result.effectiveVolume : VOLUME_CONFIG.STARTER,
  }
}

/**
 * Increase scale (T key)
 * 
 * @deprecated Use PlayerRegistry.adjustManualScale(id, +VOLUME_CONFIG.MANUAL_SCALE_STEP) instead
 * @returns {object} { newMultiplier, newVolume }
 */
export function increaseScale() {
  warnDeprecated('increaseScale', 'PlayerRegistry.adjustManualScale(id, +step)')
  
  const localId = getLocalId()
  if (!localId) {
    return { newMultiplier: 1.0, newVolume: VOLUME_CONFIG.STARTER }
  }
  
  const result = PlayerRegistry.adjustManualScale(localId, VOLUME_CONFIG.MANUAL_SCALE_STEP)
  
  return {
    newMultiplier: result ? result.newScale : 1.0,
    newVolume: result ? result.effectiveVolume : VOLUME_CONFIG.STARTER,
  }
}

/**
 * Reset manual scale to 1.0
 * 
 * @deprecated Manual scale is managed by PlayerRegistry
 */
export function resetManualScale() {
  warnDeprecated('resetManualScale', 'PlayerRegistry volume management')
  
  const localId = getLocalId()
  if (localId) {
    const player = PlayerRegistry.get(localId)
    if (player) {
      // Reset by adjusting to get back to 1.0
      const currentScale = player.volumes.manualScale
      PlayerRegistry.adjustManualScale(localId, 1.0 - currentScale)
    }
  }
}

/**
 * Get current manual scale multiplier
 * 
 * @deprecated Use PlayerRegistry.getVolumes(id).manualScale instead
 * @returns {number}
 */
export function getManualScaleMultiplier() {
  warnDeprecated('getManualScaleMultiplier', 'PlayerRegistry.getVolumes(id).manualScale')
  
  const localId = getLocalId()
  if (localId) {
    const volumes = PlayerRegistry.getVolumes(localId)
    return volumes ? volumes.manualScale : 1.0
  }
  return 1.0
}

/**
 * Set manual scale directly
 * 
 * @deprecated Manual scale is managed by PlayerRegistry
 * @param {number} multiplier
 */
export function setManualScaleMultiplier(multiplier) {
  warnDeprecated('setManualScaleMultiplier', 'PlayerRegistry.adjustManualScale(id, delta)')
  
  const localId = getLocalId()
  if (localId) {
    const player = PlayerRegistry.get(localId)
    if (player) {
      const delta = multiplier - player.volumes.manualScale
      PlayerRegistry.adjustManualScale(localId, delta)
    }
  }
}

/**
 * Compute the equivalent scale state when swapping to a new creature
 * 
 * @deprecated Creature swaps should call PlayerRegistry.initVolumes() with new capsule params
 * @param {object} oldNaturalCapsuleParams - Old creature's natural capsule
 * @param {object} newNaturalCapsuleParams - New creature's natural capsule
 * @returns {object} Transfer info
 */
export function transferToNewCreature(oldNaturalCapsuleParams, newNaturalCapsuleParams) {
  warnDeprecated('transferToNewCreature', 'PlayerRegistry.initVolumes(id, newCapsuleParams)')
  
  const localId = getLocalId()
  const volumes = localId ? PlayerRegistry.getVolumes(localId) : null
  
  const oldNaturalVolume = computeCapsuleVolume(
    oldNaturalCapsuleParams.radius, 
    oldNaturalCapsuleParams.halfHeight
  )
  const newNaturalVolume = computeCapsuleVolume(
    newNaturalCapsuleParams.radius, 
    newNaturalCapsuleParams.halfHeight
  )
  
  const targetVolume = volumes ? volumes.effective : VOLUME_CONFIG.STARTER
  const newScaleFactor = computeScaleFactor(newNaturalVolume, targetVolume)
  
  return {
    worldVolume: volumes ? volumes.world : VOLUME_CONFIG.STARTER,
    manualScaleMultiplier: volumes ? volumes.manualScale : 1.0,
    targetVolume,
    oldNaturalVolume,
    newNaturalVolume,
    newScaleFactor,
  }
}

/**
 * Get comprehensive normalization info for a creature
 * 
 * @deprecated Use PlayerRegistry.getVolumes(id) and PlayerRegistry.getCapsule(id) instead
 * @param {object} naturalCapsuleParams - { radius, halfHeight }
 * @returns {object} All normalization data
 */
export function getNormalizationInfo(naturalCapsuleParams) {
  warnDeprecated('getNormalizationInfo', 'PlayerRegistry.getVolumes(id) and PlayerRegistry.getCapsule(id)')
  
  const { radius, halfHeight } = naturalCapsuleParams
  const naturalVolume = computeCapsuleVolume(radius, halfHeight)
  
  const localId = getLocalId()
  const volumes = localId ? PlayerRegistry.getVolumes(localId) : null
  const capsule = localId ? PlayerRegistry.getCapsule(localId) : null
  
  const targetVolume = volumes ? volumes.effective : VOLUME_CONFIG.STARTER
  const scaleFactor = capsule ? capsule.scaleFactor : computeScaleFactor(naturalVolume, targetVolume)
  const worldVolume = volumes ? volumes.world : VOLUME_CONFIG.STARTER
  const manualScaleMultiplier = volumes ? volumes.manualScale : 1.0
  
  return {
    // Natural (META FACTS - preserved from Encyclopedia)
    natural: {
      radius,
      halfHeight,
      volume: naturalVolume,
      capsuleLength: halfHeight * 2 + radius * 2,
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
    manualScaleMultiplier,
    
    // Volume state
    worldVolume,
    starterVolume: CONFIG.STARTER_VOLUME,
    maxVolume: CONFIG.MAX_VOLUME,
    
    // Percentages for display
    scalePercent: scaleFactor * 100,
    volumePercent: (worldVolume / CONFIG.MAX_VOLUME) * 100,
    
    // Legacy compatibility
    growthMultiplier: 1.0,
    growthPercent: 100,
    foodEaten: worldVolume,
  }
}

/**
 * Debug log current state
 * 
 * @deprecated Use PlayerRegistry.debug() instead
 */
export function debug() {
  warnDeprecated('debug', 'PlayerRegistry.debug()')
  
  const localId = getLocalId()
  const volumes = localId ? PlayerRegistry.getVolumes(localId) : null
  const capsule = localId ? PlayerRegistry.getCapsule(localId) : null
  
  const worldVolume = volumes ? volumes.world : VOLUME_CONFIG.STARTER
  const manualScale = volumes ? volumes.manualScale : 1.0
  const targetVolume = volumes ? volumes.effective : VOLUME_CONFIG.STARTER
  const naturalVolume = volumes ? volumes.natural : null
  
  console.group('[NormalScale] Debug (DEPRECATED - use PlayerRegistry.debug())')
  console.log(`Starter volume:      ${CONFIG.STARTER_VOLUME.toFixed(2)} m^3`)
  console.log(`Max volume:          ${CONFIG.MAX_VOLUME.toFixed(2)} m^3`)
  console.log('----------------------------------------')
  console.log(`World volume:        ${worldVolume.toFixed(2)} m^3`)
  console.log(`Manual scale:        ${manualScale.toFixed(2)}x (${(manualScale * 100).toFixed(0)}%)`)
  console.log('----------------------------------------')
  console.log(`Target volume:       ${targetVolume.toFixed(2)} m^3`)
  console.log(`Percent of max:      ${((worldVolume / CONFIG.MAX_VOLUME) * 100).toFixed(1)}%`)
  if (naturalVolume) {
    const scaleFactor = capsule ? capsule.scaleFactor : 1.0
    console.log(`Natural volume:      ${naturalVolume.toFixed(4)} m^3 (meta fact)`)
    console.log(`Scale factor:        ${scaleFactor.toFixed(3)}x`)
  }
  console.groupEnd()
}

// ============================================================================
// LEGACY COMPATIBILITY - addFood (redirects through addVolume)
// ============================================================================

/**
 * Add food and update growth (LEGACY - redirects to PlayerRegistry)
 * 
 * @deprecated Use PlayerRegistry.addVolume(id, preyVolume) instead
 * @param {number} foodValue - Amount of food eaten (treated as volume)
 * @returns {object} { volumeGained, totalVolume }
 */
export function addFood(foodValue) {
  warnDeprecated('addFood', 'PlayerRegistry.addVolume(id, preyVolume)')
  
  const result = addVolume(foodValue)
  
  return {
    newMultiplier: 1.0,
    volumeGained: result.volumeGained,
    totalVolume: result.totalVolume,
    totalFood: result.totalVolume,
  }
}

/**
 * @deprecated Use PlayerRegistry.getVolumes(id).world instead
 */
export function getFoodEaten() {
  warnDeprecated('getFoodEaten', 'PlayerRegistry.getVolumes(id).world')
  return getWorldVolume()
}

/**
 * @deprecated Use PlayerRegistry.setWorldVolume(id, volume) instead
 */
export function setFoodEaten(food) {
  warnDeprecated('setFoodEaten', 'PlayerRegistry.setWorldVolume(id, volume)')
  setWorldVolume(food)
}

/**
 * @deprecated No longer used - growth is not logarithmic
 */
export function computeGrowthMultiplier(foodEaten) {
  warnDeprecated('computeGrowthMultiplier', 'N/A - growth is now linear')
  return 1.0
}

// ============================================================================
// NPC VISUAL VOLUME NORMALIZATION (UNCHANGED - SELF-CONTAINED)
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
  
  // Log-normal distribution parameters
  LOG_MEAN: 3.5,        // ~33 m^3 median
  LOG_STD: 1.5,         // Spread
  
  // Default target for "medium" creatures
  DEFAULT_VOLUME: 5.0,
}

/**
 * Generate a normally distributed random number using Box-Muller transform
 * Uses Determine for deterministic multiplayer sync
 * @returns {number} Random number from standard normal distribution (mean=0, std=1)
 */
function randomNormal() {
  const u1 = Determine.random()
  const u2 = Determine.random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
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
  // ln(1) = 0, ln(1000) ~= 6.9
  const logMean = NPC_CONFIG.LOG_MEAN
  const logStd = NPC_CONFIG.LOG_STD
  
  const logVolume = logMean + randomNormal() * logStd
  const volume = Math.exp(logVolume)
  
  // Clamp to bounds
  return Math.max(NPC_CONFIG.MIN_VOLUME, Math.min(NPC_CONFIG.MAX_VOLUME, volume))
}

/**
 * Generate a normally distributed target volume for an NPC
 * Clamped to [MIN_VOLUME, MAX_VOLUME]
 * 
 * @deprecated Use generateNPCTargetVolumeLogNormal() for better distribution
 * @returns {number} Target volume in cubic meters
 */
export function generateNPCTargetVolume() {
  return generateNPCTargetVolumeLogNormal()
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
  // targetVolume = currentVolume * scale^3
  // scale = cbrt(targetVolume / currentVolume)
  return Math.cbrt(targetVolume / currentVisualVolume)
}

/**
 * Get scale factor to achieve a normally distributed volume
 * Uses log-normal distribution for natural spread across 1-1000 m^3
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
 * @param {number} naturalVisualVolume - Visual volume at scale=1
 * @param {number} desiredScaleMultiplier - Spawn system's desired scale (e.g., 1-10)
 * @returns {{
 *   scaleFactor: number,
 *   targetVolume: number,
 *   wasClamped: boolean,
 *   clampReason: string|null
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
    console.log(`[NormalScale] NPC volume bounds set to [${min}, ${max}] m^3`)
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
  console.log(`Natural visual volume: ${naturalVisualVolume.toFixed(4)} m^3`)
  console.log(`Desired scale multiplier: ${desiredScaleMultiplier.toFixed(2)}x`)
  console.log(`Desired volume: ${(naturalVisualVolume * Math.pow(desiredScaleMultiplier, 3)).toFixed(2)} m^3`)
  console.log('-------------------------')
  console.log(`Volume bounds: [${NPC_CONFIG.MIN_VOLUME}, ${NPC_CONFIG.MAX_VOLUME}] m^3`)
  console.log(`Was clamped: ${result.wasClamped}${result.clampReason ? ` (${result.clampReason})` : ''}`)
  console.log('-------------------------')
  console.log(`Final scale factor: ${result.scaleFactor.toFixed(3)}x`)
  console.log(`Final visual volume: ${result.targetVolume.toFixed(2)} m^3`)
  console.groupEnd()
  
  return result
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Config
  getConfig,
  
  // Core math (pure utilities - KEEP USING THESE)
  computeCapsuleVolume,
  computeScaleFactor,
  computeTargetVolume,
  clampVolume,
  
  // Main functions (Player) - DEPRECATED, use PlayerRegistry
  normalizeCreature,
  getScaleFactor,
  scaleCapsuleParams,
  
  // Linear additive growth - DEPRECATED, use PlayerRegistry
  addVolume,
  setWorldVolume,
  getWorldVolume,
  getEffectiveWorldVolume,
  resetGrowth,
  getGrowthStats,
  
  // Legacy compatibility - DEPRECATED
  addFood,
  setFoodEaten,
  getFoodEaten,
  computeGrowthMultiplier,
  
  // Manual scale (debug) - DEPRECATED, use PlayerRegistry
  decreaseScale,
  increaseScale,
  resetManualScale,
  getManualScaleMultiplier,
  setManualScaleMultiplier,
  
  // Creature swap - DEPRECATED, use PlayerRegistry
  transferToNewCreature,
  
  // Utility - DEPRECATED, use PlayerRegistry
  getNormalizationInfo,
  debug,
  
  // NPC Visual Volume Normalization (KEEP USING THESE)
  computeNPCScaleFactor,
  clampNPCVolume,
  normalizeNPCVisualVolume,
  getNPCScaleFactor,
  getNPCConfig,
  setNPCVolumeBounds,
  debugNPCNormalization,
  
  // NPC Normal Distribution (KEEP USING THESE)
  generateNPCTargetVolume,
  generateNPCTargetVolumeLogNormal,
  getNPCNormalDistributedScale,
}