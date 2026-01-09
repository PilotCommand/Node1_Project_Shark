import * as THREE from 'three'
import { 
  CreatureType,
  FishClass,
  generateCreature,
  generateStarter,
  getAllCreatureClasses,
  randomSeed,
  seedToString,
  getClassVariants,
  getVariantCount,
  getVariantName,
  getVariantDisplayName,
  hasVariants,
} from './Encyclopedia.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'
import { PlayerRegistry, VOLUME_CONFIG } from './PlayerRegistry.js'
import { 
  attachCapsuleWireframe, 
  computeCapsuleParams,
  createCapsuleWireframe,
  setWireframeVisible,
  setWireframeColor,
  logCapsuleStats,
  disposeWireframe,
} from './ScaleMesh.js'
import {
  // Pure utility functions (keep using these)
  computeCapsuleVolume,
  scaleCapsuleParams,
  // NPC functions (keep using these)
  computeNPCScaleFactor,
} from './NormalScale.js'
import { showMenu } from './menu.js'

// Capsule wireframe state
let wireframeVisible = false

let currentCreature = null
let creatureParts = null
let currentType = CreatureType.FISH
let currentClass = FishClass.STARTER
let currentIndex = 0
let currentVariantIndex = 0  // Track which variant of current class

// All creature classes from Encyclopedia - fish AND mammals
const CREATURE_CATALOG = getAllCreatureClasses()

let sceneRef = null

// Callbacks for when player is eaten
const onEatenCallbacks = []

export function initPlayer(scene, spawnPosition = null, options = {}) {
  sceneRef = scene
  
  // Get creature selection from options, with defaults
  const {
    creatureType = CreatureType.FISH,
    creatureClass = FishClass.STARTER,
    variantIndex = 0,
  } = options
  
  // Get local player ID (should already be registered by NetworkManager)
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    // Reset volumes for new player spawn
    PlayerRegistry.resetVolumes(localId)
  }
  
  // Generate creature based on selection
  if (creatureClass === FishClass.STARTER || !creatureClass) {
    // Use starter for default/starter selection
    currentCreature = generateStarter(CreatureType.FISH)
    currentType = CreatureType.FISH
    currentClass = FishClass.STARTER
    currentIndex = 0
    currentVariantIndex = 0
  } else {
    // Generate the selected creature
    const seed = randomSeed()
    currentCreature = generateCreature(seed, creatureType, creatureClass, variantIndex)
    currentType = creatureType
    currentClass = creatureClass
    currentVariantIndex = variantIndex
    
    // Find the index in the catalog for cycling purposes
    currentIndex = CREATURE_CATALOG.findIndex(c => c.type === creatureType && c.class === creatureClass)
    if (currentIndex < 0) currentIndex = 0
    
    console.log(`[Player] Spawning as ${creatureClass} (type: ${creatureType}, variant: ${variantIndex})`)
  }
  
  if (!currentCreature) {
    console.error('[Player] Failed to generate creature, falling back to starter')
    currentCreature = generateStarter(CreatureType.FISH)
    currentType = CreatureType.FISH
    currentClass = FishClass.STARTER
    currentIndex = 0
    currentVariantIndex = 0
  }
  
  creatureParts = currentCreature.parts
  
  // Use provided spawn position or default to origin
  if (spawnPosition) {
    currentCreature.mesh.position.copy(spawnPosition)
  } else {
    currentCreature.mesh.position.set(0, 0, 0)
  }
  scene.add(currentCreature.mesh)
  
  // Compute NATURAL capsule params (META FACT - preserved from Encyclopedia)
  const naturalCapsuleParams = computeCapsuleParams(currentCreature.mesh, currentCreature)
  
  // Initialize volumes in PlayerRegistry - this is now the SINGLE SOURCE OF TRUTH
  // It will also apply the scale to the mesh
  if (localId) {
    PlayerRegistry.initVolumes(localId, naturalCapsuleParams)
  }
  
  // Get the computed values from PlayerRegistry
  const volumes = localId ? PlayerRegistry.getVolumes(localId) : null
  const capsule = localId ? PlayerRegistry.getCapsule(localId) : null
  const normalizedCapsuleParams = capsule?.normalized || scaleCapsuleParams(naturalCapsuleParams, 1.0)
  
  // Attach capsule wireframe at NORMALIZED scale
  attachCapsuleWireframe(currentCreature.mesh, null, { color: 0x00ff00 })
  // The wireframe needs to be at normalized scale, so we recreate it
  updateWireframeToNormalizedScale(naturalCapsuleParams)
  setWireframeVisible(currentCreature.mesh, wireframeVisible)
  
  // Log both natural and normalized stats
  console.log(`[Player] Natural capsule:`, {
    radius: naturalCapsuleParams.radius.toFixed(3),
    halfHeight: naturalCapsuleParams.halfHeight.toFixed(3),
    volume: (volumes?.natural || 0).toFixed(3) + ' m^3',
  })
  console.log(`[Player] Normalized capsule:`, {
    radius: normalizedCapsuleParams.radius.toFixed(3),
    halfHeight: normalizedCapsuleParams.halfHeight.toFixed(3),
    volume: (volumes?.effective || VOLUME_CONFIG.STARTER).toFixed(3) + ' m^3',
    scaleFactor: (capsule?.scaleFactor || 1.0).toFixed(3),
  })
  
  MeshRegistry.register('player', {
    mesh: currentCreature.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentCreature.seed,
      creatureType: currentType,
      creatureClass: currentClass,
      traits: currentCreature.traits,
      parts: creatureParts,
      // Store BOTH capsule params
      naturalCapsuleParams: naturalCapsuleParams,    // META FACT
      capsuleParams: normalizedCapsuleParams,        // For physics (gameplay scale)
      worldVolume: volumes?.world || VOLUME_CONFIG.STARTER,
    }
  }, true)
  
  const naturalSize = currentCreature.traits.length?.toFixed(1) || '1.5'
  const gameplayVolume = (volumes?.effective || VOLUME_CONFIG.STARTER).toFixed(2)
  console.log(`Player: ${currentClass} | Natural: ${naturalSize}m | Vol: ${gameplayVolume}m^3 | Seed: ${seedToString(currentCreature.seed)}`)
  
  return currentCreature.mesh
}

function swapCreature(newCreatureData, newType, newClass) {
  if (!sceneRef || !currentCreature) {
    console.warn('Player not initialized')
    return null
  }
  
  const position = currentCreature.mesh.position.clone()
  const rotation = currentCreature.mesh.rotation.clone()
  
  sceneRef.remove(currentCreature.mesh)
  
  // Dispose old mesh (including wireframe)
  currentCreature.mesh.traverse(child => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  
  MeshRegistry.unregister('player')
  
  // Set new creature
  currentCreature = newCreatureData
  currentType = newType
  currentClass = newClass
  creatureParts = newCreatureData.parts
  
  currentCreature.mesh.position.copy(position)
  currentCreature.mesh.rotation.copy(rotation)
  
  sceneRef.add(currentCreature.mesh)
  
  // Compute NATURAL capsule params (META FACT - preserved from Encyclopedia)
  const naturalCapsuleParams = computeCapsuleParams(currentCreature.mesh, currentCreature)
  
  // Initialize volumes in PlayerRegistry with new capsule params
  // This PRESERVES world volume (progression) but recomputes scale for new creature shape
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.initVolumes(localId, naturalCapsuleParams)
  }
  
  // Get the computed values from PlayerRegistry
  const volumes = localId ? PlayerRegistry.getVolumes(localId) : null
  const capsule = localId ? PlayerRegistry.getCapsule(localId) : null
  const normalizedCapsuleParams = capsule?.normalized || scaleCapsuleParams(naturalCapsuleParams, 1.0)
  
  // Attach capsule wireframe at NORMALIZED scale
  attachCapsuleWireframe(currentCreature.mesh, null, { color: 0x00ff00 })
  updateWireframeToNormalizedScale(naturalCapsuleParams)
  setWireframeVisible(currentCreature.mesh, wireframeVisible)
  
  MeshRegistry.register('player', {
    mesh: currentCreature.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentCreature.seed,
      creatureType: currentType,
      creatureClass: currentClass,
      traits: currentCreature.traits,
      parts: creatureParts,
      naturalCapsuleParams: naturalCapsuleParams,
      capsuleParams: normalizedCapsuleParams,
      worldVolume: volumes?.world || VOLUME_CONFIG.STARTER,
    }
  }, true)
  
  // Update PlayerRegistry with creature info
  if (localId) {
    PlayerRegistry.updateMesh(localId, currentCreature.mesh, creatureParts)
    PlayerRegistry.updateCreature(localId, {
      type: currentType,
      class: currentClass,
      variant: currentVariantIndex,
      seed: currentCreature.seed,
      displayName: currentClass,
    })
  }
  
  return {
    seed: currentCreature.seed,
    creatureType: currentType,
    creatureClass: currentClass,
    traits: currentCreature.traits,
    naturalCapsuleParams: naturalCapsuleParams,
    capsuleParams: normalizedCapsuleParams,
  }
}

/**
 * Mutate - generate new random creature of same type/class
 */
export function regeneratePlayerCreature() {
  const newSeed = randomSeed()
  
  // If on starter, jump to first real class
  let targetType = currentType
  let targetClass = currentClass
  
  if (currentClass === FishClass.STARTER) {
    // Find first non-starter fish
    const firstFish = CREATURE_CATALOG.find(c => c.type === CreatureType.FISH && !c.isStarter)
    if (firstFish) {
      targetType = firstFish.type
      targetClass = firstFish.class
      currentIndex = CREATURE_CATALOG.indexOf(firstFish)
    }
  }
  
  const newCreatureData = generateCreature(newSeed, targetType, targetClass)
  if (!newCreatureData) return null
  
  const result = swapCreature(newCreatureData, targetType, targetClass)
  
  if (result) {
    const size = result.traits?.length?.toFixed(1) || '?'
    console.log(`New ${result.creatureClass}: ${size}m | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

/**
 * Cycle to next creature class (across ALL types)
 */
export function cyclePlayerClass() {
  currentIndex = (currentIndex + 1) % CREATURE_CATALOG.length
  currentVariantIndex = 0  // Reset variant when changing class
  const next = CREATURE_CATALOG[currentIndex]
  
  const newSeed = randomSeed()
  
  let newCreatureData
  if (next.isStarter) {
    newCreatureData = generateStarter(next.type)
  } else {
    newCreatureData = generateCreature(newSeed, next.type, next.class)
  }
  
  if (!newCreatureData) return null
  
  const result = swapCreature(newCreatureData, next.type, next.class)
  
  if (result) {
    const size = result.traits?.length?.toFixed(1) || '?'
    console.log(`Switched to ${result.creatureClass}: ${size}m | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

/**
 * Cycle to previous creature class
 */
export function cyclePreviousClass() {
  currentIndex = (currentIndex - 1 + CREATURE_CATALOG.length) % CREATURE_CATALOG.length
  currentVariantIndex = 0  // Reset variant when changing class
  const prev = CREATURE_CATALOG[currentIndex]
  
  const newSeed = randomSeed()
  
  let newCreatureData
  if (prev.isStarter) {
    newCreatureData = generateStarter(prev.type)
  } else {
    newCreatureData = generateCreature(newSeed, prev.type, prev.class)
  }
  
  if (!newCreatureData) return null
  
  const result = swapCreature(newCreatureData, prev.type, prev.class)
  
  if (result) {
    const size = result.traits?.length?.toFixed(1) || '?'
    console.log(`Switched to ${result.creatureClass}: ${size}m | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

/**
 * Cycle to next variant of current creature class (Z key)
 * Variants affect both the name AND the colors (e.g., Yellowfin has yellow fins)
 * This regenerates the creature with the new variant's palette
 */
export function cycleVariant() {
  const variantCount = getVariantCount(currentClass)
  
  if (variantCount <= 1) {
    // No variants for this class
    return {
      hasVariants: false,
      variantName: getVariantName(currentClass, 0),
      variantIndex: 0,
      variantCount: 1,
      regenerated: false,
    }
  }
  
  // Cycle to next variant
  currentVariantIndex = (currentVariantIndex + 1) % variantCount
  const variantName = getVariantName(currentClass, currentVariantIndex)
  
  console.log(`Variant: ${variantName} [${currentVariantIndex + 1}/${variantCount}]`)
  
  // Regenerate creature with new variant (keeps same seed for consistent size)
  const currentSeed = currentCreature?.seed || randomSeed()
  const newCreatureData = generateCreature(currentSeed, currentType, currentClass, currentVariantIndex)
  
  if (newCreatureData) {
    // Swap to new creature with variant colors
    swapCreature(newCreatureData, currentType, currentClass)
  }
  
  return {
    hasVariants: true,
    variantName,
    variantIndex: currentVariantIndex,
    variantCount,
    displayName: getVariantDisplayName(currentClass, currentVariantIndex),
    regenerated: true,
  }
}

/**
 * Set player to specific creature
 */
export function setPlayerCreature(seed, creatureType, creatureClass) {
  const targetType = creatureType || currentType
  const targetClass = creatureClass || currentClass
  
  let newCreatureData
  
  // Find index in catalog
  const catalogEntry = CREATURE_CATALOG.find(c => c.type === targetType && c.class === targetClass)
  if (catalogEntry) {
    currentIndex = CREATURE_CATALOG.indexOf(catalogEntry)
  }
  
  if (catalogEntry?.isStarter) {
    newCreatureData = generateStarter(targetType)
  } else {
    newCreatureData = generateCreature(seed, targetType, targetClass)
  }
  
  if (!newCreatureData) return null
  
  const result = swapCreature(newCreatureData, targetType, targetClass)
  
  if (result) {
    console.log(`Creature set: ${result.creatureClass} | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

// ============================================================================
// GETTERS
// ============================================================================

export function getPlayer() {
  return currentCreature?.mesh
}

export function getCreatureParts() {
  return creatureParts
}

export function getCurrentSeed() {
  return currentCreature?.seed
}

export function getCurrentType() {
  return currentType
}

export function getCurrentClass() {
  return currentClass
}

export function getCurrentCreature() {
  return currentCreature
}

export function getCreatureCatalog() {
  return CREATURE_CATALOG
}

export function getCurrentIndex() {
  return currentIndex
}

export function getCurrentVariantIndex() {
  return currentVariantIndex
}

export function getCurrentVariantName() {
  return getVariantName(currentClass, currentVariantIndex)
}

export function getCurrentVariantDisplayName() {
  return getVariantDisplayName(currentClass, currentVariantIndex)
}

export function getCurrentVariantCount() {
  return getVariantCount(currentClass)
}

// Legacy aliases for compatibility
export const getFishParts = getCreatureParts
export const getCurrentFish = getCurrentCreature
export const regeneratePlayerFish = regeneratePlayerCreature

// ============================================================================
// CAPSULE / WIREFRAME CONTROLS
// ============================================================================

/**
 * Toggle capsule wireframe visibility
 * @returns {boolean} - New visibility state
 */
export function toggleWireframe() {
  wireframeVisible = !wireframeVisible
  if (currentCreature?.mesh) {
    setWireframeVisible(currentCreature.mesh, wireframeVisible)
  }
  console.log(`Capsule wireframe: ${wireframeVisible ? 'ON' : 'OFF'}`)
  return wireframeVisible
}

/**
 * Set wireframe visibility explicitly
 * @param {boolean} visible
 */
export function setPlayerWireframeVisible(visible) {
  wireframeVisible = visible
  if (currentCreature?.mesh) {
    setWireframeVisible(currentCreature.mesh, wireframeVisible)
  }
}

/**
 * Set wireframe color (useful for state indication)
 * @param {number} color - Hex color (e.g., 0xff0000 for red)
 */
export function setPlayerWireframeColor(color) {
  if (currentCreature?.mesh) {
    setWireframeColor(currentCreature.mesh, color)
  }
}

/**
 * Get current capsule params for physics (NORMALIZED scale)
 * @returns {{ radius: number, halfHeight: number, center: THREE.Vector3 } | null}
 */
export function getPlayerCapsuleParams() {
  // First try PlayerRegistry
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    const capsule = PlayerRegistry.getCapsule(localId)
    if (capsule?.normalized) {
      return capsule.normalized
    }
  }
  
  // Fallback to MeshRegistry (capsule stored there during initPlayer)
  const playerEntry = MeshRegistry.get('player')
  if (playerEntry?.metadata?.capsuleParams) {
    return playerEntry.metadata.capsuleParams
  }
  
  return null
}

/**
 * Get NATURAL capsule params (META FACT from Encyclopedia)
 * @returns {{ radius: number, halfHeight: number, center: THREE.Vector3 } | null}
 */
export function getNaturalCapsuleParams() {
  // First try PlayerRegistry
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    const capsule = PlayerRegistry.getCapsule(localId)
    if (capsule?.natural) {
      return capsule.natural
    }
  }
  
  // Fallback to MeshRegistry (capsule stored there during initPlayer)
  const playerEntry = MeshRegistry.get('player')
  if (playerEntry?.metadata?.naturalCapsuleParams) {
    return playerEntry.metadata.naturalCapsuleParams
  }
  
  return null
}

/**
 * Check if wireframe is currently visible
 * @returns {boolean}
 */
export function isWireframeVisible() {
  return wireframeVisible
}

// ============================================================================
// NORMALIZATION / SCALE CONTROLS
// ============================================================================

/**
 * Helper: Update wireframe to match normalized scale
 * Called after normalization or scale change
 * @param {object} naturalCapsuleParams - Natural capsule params (optional, will fetch from registry if not provided)
 */
function updateWireframeToNormalizedScale(naturalCapsuleParams = null) {
  if (!currentCreature?.mesh) return
  
  // Get natural params from registry if not provided
  if (!naturalCapsuleParams) {
    const localId = PlayerRegistry.getLocalId()
    if (localId) {
      const capsule = PlayerRegistry.getCapsule(localId)
      naturalCapsuleParams = capsule?.natural
    }
  }
  
  if (!naturalCapsuleParams) return
  
  // Remove old wireframe
  const oldWireframe = currentCreature.mesh.getObjectByName('capsule-wireframe')
  if (oldWireframe) {
    currentCreature.mesh.remove(oldWireframe)
    disposeWireframe(oldWireframe)
  }
  
  // Create new wireframe at normalized scale
  // Since the mesh is already scaled, we need to create wireframe at original scale
  // (the wireframe will be scaled along with the mesh)
  const wireframeParams = {
    radius: naturalCapsuleParams.radius,
    halfHeight: naturalCapsuleParams.halfHeight,
    center: naturalCapsuleParams.center || new THREE.Vector3(),
  }
  
  const wireframe = createCapsuleWireframe(wireframeParams, { color: 0x00ff00 })
  currentCreature.mesh.add(wireframe)
}

/**
 * Apply current scale to mesh and update physics
 * Called after scale change (R/T keys, eating, etc.)
 * 
 * Note: With PlayerRegistry consolidation, scaling is handled automatically
 * by PlayerRegistry._updateCapsuleAndScale(). This function now just
 * updates MeshRegistry and returns current state.
 */
export function applyCurrentScale() {
  if (!currentCreature?.mesh) return null
  
  const localId = PlayerRegistry.getLocalId()
  if (!localId) return null
  
  const player = PlayerRegistry.get(localId)
  if (!player) return null
  
  const volumes = player.volumes
  const capsule = player.capsule
  
  // Update MeshRegistry
  const entry = MeshRegistry.get('player')
  if (entry) {
    entry.metadata.capsuleParams = capsule.normalized
    entry.metadata.worldVolume = volumes.world
  }
  
  return {
    scaleFactor: capsule.scaleFactor,
    normalizedCapsuleParams: capsule.normalized,
    volume: volumes.world,
  }
}

/**
 * Decrease player scale (R key) - DEBUG
 * @returns {object} { scalePercent, volume, newScale, effectiveVolume }
 */
export function decreasePlayerScale() {
  const localId = PlayerRegistry.getLocalId()
  if (!localId) {
    return { scalePercent: 100, volume: VOLUME_CONFIG.STARTER }
  }
  
  const result = PlayerRegistry.adjustManualScale(localId, -VOLUME_CONFIG.MANUAL_SCALE_STEP)
  
  if (!result) {
    return { scalePercent: 100, volume: VOLUME_CONFIG.STARTER }
  }
  
  // Update MeshRegistry
  applyCurrentScale()
  
  console.log(`[Player] Scale decreased to ${(result.newScale * 100).toFixed(0)}%`)
  
  return {
    scalePercent: result.newScale * 100,
    volume: result.effectiveVolume,
    newScale: result.newScale,
    effectiveVolume: result.effectiveVolume,
    normalizedCapsuleParams: PlayerRegistry.getCapsule(localId)?.normalized,
  }
}

/**
 * Increase player scale (T key) - DEBUG
 * @returns {object} { scalePercent, volume, newScale, effectiveVolume }
 */
export function increasePlayerScale() {
  const localId = PlayerRegistry.getLocalId()
  if (!localId) {
    return { scalePercent: 100, volume: VOLUME_CONFIG.STARTER }
  }
  
  const result = PlayerRegistry.adjustManualScale(localId, VOLUME_CONFIG.MANUAL_SCALE_STEP)
  
  if (!result) {
    return { scalePercent: 100, volume: VOLUME_CONFIG.STARTER }
  }
  
  // Update MeshRegistry
  applyCurrentScale()
  
  console.log(`[Player] Scale increased to ${(result.newScale * 100).toFixed(0)}%`)
  
  return {
    scalePercent: result.newScale * 100,
    volume: result.effectiveVolume,
    newScale: result.newScale,
    effectiveVolume: result.effectiveVolume,
    normalizedCapsuleParams: PlayerRegistry.getCapsule(localId)?.normalized,
  }
}

/**
 * Add volume to player (LINEAR ADDITIVE GROWTH)
 * Called when eating prey
 * 
 * @param {number} preyVolume - Volume of prey eaten (added directly)
 * @returns {object} { volumeGained, totalVolume, wasCapped }
 */
export function addFood(preyVolume) {
  const localId = PlayerRegistry.getLocalId()
  if (!localId) {
    console.warn('[Player] Cannot add food - no local player registered')
    return { volumeGained: 0, totalVolume: VOLUME_CONFIG.STARTER, wasCapped: false }
  }
  
  const result = PlayerRegistry.addVolume(localId, preyVolume)
  
  if (!result) {
    return { volumeGained: 0, totalVolume: VOLUME_CONFIG.STARTER, wasCapped: false }
  }
  
  // Update MeshRegistry
  applyCurrentScale()
  
  console.log(`[Player] Ate: +${result.volumeGained.toFixed(2)} m^3 | Total: ${result.totalVolume.toFixed(2)} m^3${result.wasCapped ? ' (CAPPED)' : ''}`)
  
  return result
}

/**
 * Get player's current effective volume (includes manual scale)
 * Used for feeding calculations
 * @returns {number} Volume in m^3
 */
export function getPlayerWorldVolume() {
  const localId = PlayerRegistry.getLocalId()
  return localId ? PlayerRegistry.getEffectiveVolume(localId) : VOLUME_CONFIG.STARTER
}

/**
 * Get player's world volume for NETWORK transmission
 * This returns ONLY the base world volume, NOT including manual scale
 * R/T debug keys should be local-only visual effects
 * @returns {number} Volume in m^3
 */
export function getPlayerNetworkVolume() {
  const localId = PlayerRegistry.getLocalId()
  return localId ? PlayerRegistry.getNetworkVolume(localId) : VOLUME_CONFIG.STARTER
}

/**
 * Set player's world volume directly (for syncing/loading)
 * @param {number} volume - Volume to set
 */
export function setPlayerWorldVolume(volume) {
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.setWorldVolume(localId, volume)
    applyCurrentScale()
  }
}

/**
 * Get current normalization info for display/debug
 * @returns {object}
 */
export function getPlayerNormalizationInfo() {
  const localId = PlayerRegistry.getLocalId()
  if (!localId) return null
  
  const player = PlayerRegistry.get(localId)
  if (!player) return null
  
  const volumes = player.volumes
  const capsule = player.capsule
  
  if (!capsule.natural) return null
  
  return {
    // Natural (META FACTS - preserved from Encyclopedia)
    natural: {
      radius: capsule.natural.radius,
      halfHeight: capsule.natural.halfHeight,
      volume: volumes.natural,
      capsuleLength: capsule.natural.halfHeight * 2 + capsule.natural.radius * 2,
    },
    
    // Gameplay (normalized)
    gameplay: {
      radius: capsule.normalized?.radius || 0,
      halfHeight: capsule.normalized?.halfHeight || 0,
      volume: volumes.effective,
      capsuleLength: capsule.normalized ? (capsule.normalized.halfHeight * 2 + capsule.normalized.radius * 2) : 0,
    },
    
    // Multipliers
    scaleFactor: capsule.scaleFactor,
    manualScaleMultiplier: volumes.manualScale,
    
    // Volume state
    worldVolume: volumes.world,
    starterVolume: VOLUME_CONFIG.STARTER,
    maxVolume: VOLUME_CONFIG.MAX,
    
    // Percentages for display
    scalePercent: capsule.scaleFactor * 100,
    volumePercent: (volumes.world / VOLUME_CONFIG.MAX) * 100,
    
    // Legacy compatibility
    growthMultiplier: 1.0,
    growthPercent: 100,
    foodEaten: volumes.world,
  }
}

/**
 * Debug player normalization state
 */
export function debugPlayerScale() {
  console.group('[Player] Scale Debug')
  
  const localId = PlayerRegistry.getLocalId()
  if (!localId) {
    console.log('No local player registered')
    console.groupEnd()
    return
  }
  
  const info = getPlayerNormalizationInfo()
  if (info) {
    console.log('Natural (META FACT):')
    console.log(`  Length: ${currentCreature?.traits?.length?.toFixed(2) || '?'}m`)
    console.log(`  Capsule: r=${info.natural.radius.toFixed(3)}, h=${info.natural.halfHeight.toFixed(3)}`)
    console.log(`  Volume: ${info.natural.volume.toFixed(3)} m^3`)
    console.log('Gameplay (Normalized):')
    console.log(`  Scale factor: ${info.scaleFactor.toFixed(3)}x`)
    console.log(`  Capsule: r=${info.gameplay.radius.toFixed(3)}, h=${info.gameplay.halfHeight.toFixed(3)}`)
    console.log(`  Volume: ${info.gameplay.volume.toFixed(3)} m^3`)
    console.log('Volume State:')
    console.log(`  World Volume: ${info.worldVolume.toFixed(2)} m^3`)
    console.log(`  Manual Scale: ${info.manualScaleMultiplier.toFixed(2)}x (${(info.manualScaleMultiplier * 100).toFixed(0)}%)`)
    console.log(`  Max Volume: ${VOLUME_CONFIG.MAX} m^3`)
    console.log(`  Progress: ${((info.worldVolume / VOLUME_CONFIG.MAX) * 100).toFixed(1)}%`)
  } else {
    console.log('No normalization data available')
  }
  
  // Also show PlayerRegistry debug for this player
  const player = PlayerRegistry.get(localId)
  if (player) {
    console.log('PlayerRegistry State:')
    console.log(`  volumes:`, player.volumes)
    console.log(`  capsule.scaleFactor:`, player.capsule.scaleFactor)
  }
  
  console.groupEnd()
}

// ============================================================================
// DEATH / EATEN HANDLING
// ============================================================================

/**
 * Called when the local player is eaten by another player
 * Cleans up player state and returns to menu
 * 
 * @param {object} eaterData - Data about who ate us (optional)
 */
export function onEaten(eaterData = null) {
  console.log('[Player] Was eaten!', eaterData ? `by ${eaterData.id}` : '')
  
  // Fire callbacks before cleanup
  for (const callback of onEatenCallbacks) {
    try {
      callback(eaterData)
    } catch (e) {
      console.error('[Player] Error in onEaten callback:', e)
    }
  }
  
  // Clean up player from scene
  if (sceneRef && currentCreature?.mesh) {
    sceneRef.remove(currentCreature.mesh)
    
    // Dispose mesh resources
    currentCreature.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
  
  // Unregister from MeshRegistry
  MeshRegistry.unregister('player')
  
  // Reset volumes in PlayerRegistry (will start at 1 m^3 again on respawn)
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.resetVolumes(localId)
    // Note: We don't unregister from PlayerRegistry here - that's handled by NetworkManager
    // when we fully disconnect. We just reset volumes for respawn.
  }
  
  // Reset local state
  currentCreature = null
  creatureParts = null
  
  // Return to menu
  showMenu()
}

/**
 * Register callback for when player is eaten
 * @param {function} callback - Called with eater data
 */
export function registerOnEaten(callback) {
  if (typeof callback === 'function') {
    onEatenCallbacks.push(callback)
  }
}

/**
 * Remove eaten callback
 * @param {function} callback
 */
export function unregisterOnEaten(callback) {
  const index = onEatenCallbacks.indexOf(callback)
  if (index > -1) {
    onEatenCallbacks.splice(index, 1)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export let player = null
export { creatureParts as fishParts }

export function _updateExports() {
  player = currentCreature?.mesh
}