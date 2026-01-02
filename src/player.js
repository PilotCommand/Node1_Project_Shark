import * as THREE from 'three'
import { 
  CreatureType,
  FishClass,
  generateCreature,
  generateStarter,
  getAllCreatureClasses,
  randomSeed,
  seedToString,
} from './Encyclopedia.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

let currentCreature = null
let creatureParts = null
let currentType = CreatureType.FISH
let currentClass = FishClass.STARTER
let currentIndex = 0

// All creature classes from Encyclopedia - fish AND mammals
const CREATURE_CATALOG = getAllCreatureClasses()

let sceneRef = null

export function initPlayer(scene) {
  sceneRef = scene
  
  // Start with the fish starter
  currentCreature = generateStarter(CreatureType.FISH)
  currentType = CreatureType.FISH
  currentClass = FishClass.STARTER
  currentIndex = 0
  creatureParts = currentCreature.parts
  
  currentCreature.mesh.position.set(0, 0, 0)
  scene.add(currentCreature.mesh)
  
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
      parts: creatureParts
    }
  }, true)
  
  const size = currentCreature.traits.length?.toFixed(1) || '1.5'
  console.log(`Player: ${currentClass} | ${size}m | Seed: ${seedToString(currentCreature.seed)}`)
  
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
  
  // Dispose old mesh
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
      parts: creatureParts
    }
  }, true)
  
  return {
    seed: currentCreature.seed,
    creatureType: currentType,
    creatureClass: currentClass,
    traits: currentCreature.traits
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

// Legacy aliases for compatibility
export const getFishParts = getCreatureParts
export const getCurrentFish = getCurrentCreature
export const regeneratePlayerFish = regeneratePlayerCreature

export let player = null
export { creatureParts as fishParts }

export function _updateExports() {
  player = currentCreature?.mesh
}