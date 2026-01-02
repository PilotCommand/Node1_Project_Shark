import * as THREE from 'three'
import { generateFish, generateStarterFish, randomSeed, seedToString } from './Fishes.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// Current fish data
let currentFish = null
let fishParts = null

// Reference to scene (set during init)
let sceneRef = null

/**
 * Initialize player with starter fish
 * @param {THREE.Scene} scene - The scene to add player to
 */
export function initPlayer(scene) {
  sceneRef = scene
  
  // Create starter fish
  currentFish = generateStarterFish()
  fishParts = currentFish.parts
  
  // Starting position
  currentFish.mesh.position.set(0, 0, 0)
  
  // Add to scene
  scene.add(currentFish.mesh)
  
  // Register with MeshRegistry
  MeshRegistry.register('player', {
    mesh: currentFish.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentFish.seed,
      parts: fishParts
    }
  }, true)
  
  console.log(`Player fish created with seed: ${seedToString(currentFish.seed)}`)
  
  return currentFish.mesh
}

/**
 * Regenerate player fish with a new random design
 * @returns {number} The new seed
 */
export function regeneratePlayerFish() {
  if (!sceneRef || !currentFish) {
    console.warn('Player not initialized')
    return null
  }
  
  // Store current position and rotation
  const position = currentFish.mesh.position.clone()
  const rotation = currentFish.mesh.rotation.clone()
  
  // Remove old fish from scene
  sceneRef.remove(currentFish.mesh)
  
  // Dispose old mesh
  currentFish.mesh.traverse(child => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  
  // Unregister old fish
  MeshRegistry.unregister('player')
  
  // Generate new fish with random seed
  const newSeed = randomSeed()
  currentFish = generateFish(newSeed)
  fishParts = currentFish.parts
  
  // Restore position and rotation
  currentFish.mesh.position.copy(position)
  currentFish.mesh.rotation.copy(rotation)
  
  // Add to scene
  sceneRef.add(currentFish.mesh)
  
  // Re-register with MeshRegistry
  MeshRegistry.register('player', {
    mesh: currentFish.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentFish.seed,
      parts: fishParts
    }
  }, true)
  
  console.log(`New fish generated! Seed: ${seedToString(newSeed)}`)
  
  return newSeed
}

/**
 * Set player fish to a specific seed
 * @param {number} seed
 */
export function setPlayerFishSeed(seed) {
  if (!sceneRef || !currentFish) {
    console.warn('Player not initialized')
    return
  }
  
  // Store current position and rotation
  const position = currentFish.mesh.position.clone()
  const rotation = currentFish.mesh.rotation.clone()
  
  // Remove old fish
  sceneRef.remove(currentFish.mesh)
  currentFish.mesh.traverse(child => {
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
  
  // Generate fish from seed
  currentFish = generateFish(seed)
  fishParts = currentFish.parts
  
  // Restore position and rotation
  currentFish.mesh.position.copy(position)
  currentFish.mesh.rotation.copy(rotation)
  
  // Add to scene and register
  sceneRef.add(currentFish.mesh)
  MeshRegistry.register('player', {
    mesh: currentFish.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentFish.seed,
      parts: fishParts
    }
  }, true)
  
  console.log(`Fish set to seed: ${seedToString(seed)}`)
}

/**
 * Get current player mesh
 */
export function getPlayer() {
  return currentFish?.mesh
}

/**
 * Get current fish parts (for animation/visibility)
 */
export function getFishParts() {
  return fishParts
}

/**
 * Get current fish seed
 */
export function getCurrentSeed() {
  return currentFish?.seed
}

// For backwards compatibility - will be set after initPlayer
export let player = null
export { fishParts }

// Update exports after init
export function _updateExports() {
  player = currentFish?.mesh
}