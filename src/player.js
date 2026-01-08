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
import { PlayerRegistry } from './PlayerRegistry.js'
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
  normalizeCreature,
  getNormalizationInfo,
  getScaleFactor,
  scaleCapsuleParams,
  decreaseScale as normalDecreaseScale,
  increaseScale as normalIncreaseScale,
  getGrowthStats,
  addVolume as normalAddVolume,
  getWorldVolume,
  getEffectiveWorldVolume,
  setWorldVolume,
  resetGrowth,
  debug as debugNormalScale,
  computeCapsuleVolume,
  getManualScaleMultiplier,
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

// Normalization state - tracks natural vs gameplay capsule params
let naturalCapsuleParams = null      // Original size from Encyclopedia (META FACT)
let normalizedCapsuleParams = null   // Gameplay size after normalization

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
  
  // Reset growth state for new player
  resetGrowth()
  
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
  naturalCapsuleParams = computeCapsuleParams(currentCreature.mesh, currentCreature)
  
  // Apply normalization - this scales the mesh to gameplay volume (starts at 1 mÂ³)
  const normalization = normalizeCreature(currentCreature.mesh, naturalCapsuleParams)
  normalizedCapsuleParams = normalization.normalizedCapsuleParams
  
  // Attach capsule wireframe at NORMALIZED scale
  attachCapsuleWireframe(currentCreature.mesh, null, { color: 0x00ff00 })
  // The wireframe needs to be at normalized scale, so we recreate it
  updateWireframeToNormalizedScale()
  setWireframeVisible(currentCreature.mesh, wireframeVisible)
  
  // Log both natural and normalized stats
  console.log(`[Player] Natural capsule:`, {
    radius: naturalCapsuleParams.radius.toFixed(3),
    halfHeight: naturalCapsuleParams.halfHeight.toFixed(3),
    volume: normalization.naturalVolume.toFixed(3) + ' mÂ³',
  })
  console.log(`[Player] Normalized capsule:`, {
    radius: normalizedCapsuleParams.radius.toFixed(3),
    halfHeight: normalizedCapsuleParams.halfHeight.toFixed(3),
    volume: normalization.targetVolume.toFixed(3) + ' mÂ³',
    scaleFactor: normalization.scaleFactor.toFixed(3),
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
      normalization: normalization,
      worldVolume: getWorldVolume(),                 // Track world volume
    }
  }, true)
  
  const naturalSize = currentCreature.traits.length?.toFixed(1) || '1.5'
  const gameplayVolume = normalization.targetVolume.toFixed(2)
  console.log(`Player: ${currentClass} | Natural: ${naturalSize}m | Vol: ${gameplayVolume}mÂ³ | Seed: ${seedToString(currentCreature.seed)}`)
  
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
  naturalCapsuleParams = computeCapsuleParams(currentCreature.mesh, currentCreature)
  
  // Apply normalization - this scales the mesh to gameplay volume
  // World volume is preserved, so player keeps their "size progression"
  const normalization = normalizeCreature(currentCreature.mesh, naturalCapsuleParams)
  normalizedCapsuleParams = normalization.normalizedCapsuleParams
  
  // Attach capsule wireframe at NORMALIZED scale
  attachCapsuleWireframe(currentCreature.mesh, null, { color: 0x00ff00 })
  updateWireframeToNormalizedScale()
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
      normalization: normalization,
      worldVolume: getWorldVolume(),
    }
  }, true)
  
  // Notify PlayerRegistry of creature change
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.updateMesh(localId, currentCreature.mesh, creatureParts)
    PlayerRegistry.updateCreature(localId, {
      type: currentType,
      class: currentClass,
      variant: currentVariantIndex,
      seed: currentCreature.seed,
      displayName: currentClass,
    })
    PlayerRegistry.update(localId, {
      capsuleParams: normalizedCapsuleParams,
      naturalCapsuleParams: naturalCapsuleParams,
    })
  }
  
  return {
    seed: currentCreature.seed,
    creatureType: currentType,
    creatureClass: currentClass,
    traits: currentCreature.traits,
    naturalCapsuleParams: naturalCapsuleParams,
    capsuleParams: normalizedCapsuleParams,
    normalization: normalization,
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
  // Return NORMALIZED capsule params for physics
  return normalizedCapsuleParams
}

/**
 * Get NATURAL capsule params (META FACT from Encyclopedia)
 * @returns {{ radius: number, halfHeight: number, center: THREE.Vector3 } | null}
 */
export function getNaturalCapsuleParams() {
  return naturalCapsuleParams
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
 */
function updateWireframeToNormalizedScale() {
  if (!currentCreature?.mesh || !normalizedCapsuleParams) return
  
  // Remove old wireframe
  const oldWireframe = currentCreature.mesh.getObjectByName('capsule-wireframe')
  if (oldWireframe) {
    currentCreature.mesh.remove(oldWireframe)
    disposeWireframe(oldWireframe)
  }
  
  // Create new wireframe at normalized scale
  // Since the mesh is already scaled, we need to create wireframe at original scale
  // (the wireframe will be scaled along with the mesh)
  // So we use the natural params divided by the mesh scale
  const meshScale = currentCreature.mesh.scale.x  // Uniform scale
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
 */
export function applyCurrentScale() {
  if (!currentCreature?.mesh || !naturalCapsuleParams) return null
  
  // Get new scale factor based on current world volume + manual scale
  const scaleFactor = getScaleFactor(naturalCapsuleParams)
  
  // Apply to mesh
  currentCreature.mesh.scale.setScalar(scaleFactor)
  
  // Update normalized capsule params
  normalizedCapsuleParams = scaleCapsuleParams(naturalCapsuleParams, scaleFactor)
  
  // Update registry
  const entry = MeshRegistry.get('player')
  if (entry) {
    entry.metadata.capsuleParams = normalizedCapsuleParams
    entry.metadata.normalization = getNormalizationInfo(naturalCapsuleParams)
    entry.metadata.worldVolume = getWorldVolume()
  }
  
  // Sync to PlayerRegistry
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.update(localId, {
      capsuleParams: normalizedCapsuleParams,
      physics: { scaleFactor },
    })
    PlayerRegistry.updateStats(localId, {
      volume: getWorldVolume(),
    })
  }
  
  return {
    scaleFactor,
    normalizedCapsuleParams,
    volume: getWorldVolume(),
  }
}

/**
 * Decrease player scale (R key) - DEBUG
 * @returns {object} { scalePercent, volume }
 */
export function decreasePlayerScale() {
  const result = normalDecreaseScale()
  const scaleResult = applyCurrentScale()
  
  console.log(`[Player] Scale decreased to ${(getManualScaleMultiplier() * 100).toFixed(0)}%`)
  
  return {
    scalePercent: getManualScaleMultiplier() * 100,
    volume: scaleResult?.volume || 0,
    normalizedCapsuleParams: scaleResult?.normalizedCapsuleParams,
  }
}

/**
 * Increase player scale (T key) - DEBUG
 * @returns {object} { scalePercent, volume }
 */
export function increasePlayerScale() {
  const result = normalIncreaseScale()
  const scaleResult = applyCurrentScale()
  
  console.log(`[Player] Scale increased to ${(getManualScaleMultiplier() * 100).toFixed(0)}%`)
  
  return {
    scalePercent: getManualScaleMultiplier() * 100,
    volume: scaleResult?.volume || 0,
    normalizedCapsuleParams: scaleResult?.normalizedCapsuleParams,
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
  const result = normalAddVolume(preyVolume)
  applyCurrentScale()
  
  console.log(`[Player] Ate: +${result.volumeGained.toFixed(2)} mÂ³ | Total: ${result.totalVolume.toFixed(2)} mÂ³${result.wasCapped ? ' (CAPPED)' : ''}`)
  
  return result
}

/**
 * Get player's current world volume
 * @returns {number} Volume in mÂ³
 */
export function getPlayerWorldVolume() {
  return getEffectiveWorldVolume()
}

/**
 * Set player's world volume directly (for syncing/loading)
 * @param {number} volume - Volume to set
 */
export function setPlayerWorldVolume(volume) {
  setWorldVolume(volume)
  applyCurrentScale()
}

/**
 * Get current normalization info for display/debug
 * @returns {object}
 */
export function getPlayerNormalizationInfo() {
  if (!naturalCapsuleParams) return null
  return getNormalizationInfo(naturalCapsuleParams)
}

/**
 * Debug player normalization state
 */
export function debugPlayerScale() {
  console.group('[Player] Scale Debug')
  
  if (naturalCapsuleParams) {
    const info = getNormalizationInfo(naturalCapsuleParams)
    console.log('Natural (META FACT):')
    console.log(`  Length: ${currentCreature?.traits?.length?.toFixed(2) || '?'}m`)
    console.log(`  Capsule: r=${info.natural.radius.toFixed(3)}, h=${info.natural.halfHeight.toFixed(3)}`)
    console.log(`  Volume: ${info.natural.volume.toFixed(3)} mÂ³`)
    console.log('Gameplay (Normalized):')
    console.log(`  Scale factor: ${info.scaleFactor.toFixed(3)}Ã—`)
    console.log(`  Capsule: r=${info.gameplay.radius.toFixed(3)}, h=${info.gameplay.halfHeight.toFixed(3)}`)
    console.log(`  Volume: ${info.gameplay.volume.toFixed(3)} mÂ³`)
    console.log('Volume State:')
    console.log(`  World Volume: ${getWorldVolume().toFixed(2)} mÂ³`)
    console.log(`  Manual Scale: ${info.manualScaleMultiplier.toFixed(2)}Ã— (${(info.manualScaleMultiplier * 100).toFixed(0)}%)`)
    console.log(`  Max Volume: 1000 mÂ³`)
    console.log(`  Progress: ${((getWorldVolume() / 1000) * 100).toFixed(1)}%`)
  } else {
    console.log('No normalization data available')
  }
  
  debugNormalScale()
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
  
  // Unregister from PlayerRegistry
  const localId = PlayerRegistry.getLocalId()
  if (localId) {
    PlayerRegistry.unregister(localId)
  }
  
  // Reset state
  currentCreature = null
  creatureParts = null
  naturalCapsuleParams = null
  normalizedCapsuleParams = null
  
  // Reset growth (will start at 1 mÂ³ again)
  resetGrowth()
  
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