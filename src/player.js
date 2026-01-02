import * as THREE from 'three'
import { generateFish, generateStarterFish, randomSeed, seedToString, FishClass } from './Fishes.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

let currentFish = null
let fishParts = null
let currentClass = FishClass.STARTER

// Class cycle order - biologically organized
const CLASS_ORDER = [
  FishClass.STARTER,
  // Cartilaginous
  FishClass.SHARK,
  FishClass.RAY,
  // Elongated
  FishClass.EEL,
  FishClass.BARRACUDA,
  // Pelagic
  FishClass.TUNA,
  FishClass.MARLIN,
  // Reef - large
  FishClass.GROUPER,
  // Reef - small
  FishClass.TANG,
  FishClass.ANGELFISH,
  FishClass.PUFFER,
  // Benthic
  FishClass.FLOUNDER,
]

let sceneRef = null

export function initPlayer(scene) {
  sceneRef = scene
  
  currentFish = generateStarterFish()
  currentClass = FishClass.STARTER
  fishParts = currentFish.parts
  
  currentFish.mesh.position.set(0, 0, 0)
  scene.add(currentFish.mesh)
  
  MeshRegistry.register('player', {
    mesh: currentFish.mesh,
    body: null,
    category: Category.PLAYER,
    tags: [Tag.COLLIDABLE, Tag.ANIMATED],
    metadata: {
      health: 100,
      speed: 10,
      seed: currentFish.seed,
      fishClass: currentFish.fishClass,
      traits: currentFish.traits,
      parts: fishParts
    }
  }, true)
  
  const size = currentFish.traits.length?.toFixed(1) || '1.5'
  console.log(`Player: ${currentFish.fishClass} | ${size}m | Seed: ${seedToString(currentFish.seed)}`)
  
  return currentFish.mesh
}

function swapFish(newFishData) {
  if (!sceneRef || !currentFish) {
    console.warn('Player not initialized')
    return null
  }
  
  const position = currentFish.mesh.position.clone()
  const rotation = currentFish.mesh.rotation.clone()
  
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
  
  currentFish = newFishData
  currentClass = newFishData.fishClass
  fishParts = newFishData.parts
  
  currentFish.mesh.position.copy(position)
  currentFish.mesh.rotation.copy(rotation)
  
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
      fishClass: currentFish.fishClass,
      traits: currentFish.traits,
      parts: fishParts
    }
  }, true)
  
  return {
    seed: currentFish.seed,
    fishClass: currentFish.fishClass,
    traits: currentFish.traits
  }
}

export function regeneratePlayerFish() {
  const newSeed = randomSeed()
  
  let newFishData
  if (currentClass === FishClass.STARTER) {
    newFishData = generateFish(newSeed, FishClass.TANG)
    currentClass = FishClass.TANG
  } else {
    newFishData = generateFish(newSeed, currentClass)
  }
  
  const result = swapFish(newFishData)
  
  if (result) {
    const size = result.traits?.length?.toFixed(1) || '?'
    console.log(`New ${result.fishClass}: ${size}m | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

export function cyclePlayerClass() {
  const currentIndex = CLASS_ORDER.indexOf(currentClass)
  const nextIndex = (currentIndex + 1) % CLASS_ORDER.length
  const nextClass = CLASS_ORDER[nextIndex]
  
  const newSeed = randomSeed()
  
  let newFishData
  if (nextClass === FishClass.STARTER) {
    newFishData = generateStarterFish()
  } else {
    newFishData = generateFish(newSeed, nextClass)
  }
  
  const result = swapFish(newFishData)
  
  if (result) {
    const size = result.traits?.length?.toFixed(1) || '?'
    console.log(`Switched to ${result.fishClass}: ${size}m | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

export function setPlayerFish(seed, fishClass = null) {
  const targetClass = fishClass || currentClass
  
  let newFishData
  if (targetClass === FishClass.STARTER) {
    newFishData = generateStarterFish()
  } else {
    newFishData = generateFish(seed, targetClass)
  }
  
  const result = swapFish(newFishData)
  
  if (result) {
    console.log(`Fish set: ${result.fishClass} | Seed: ${seedToString(result.seed)}`)
  }
  
  return result
}

export function getPlayer() {
  return currentFish?.mesh
}

export function getFishParts() {
  return fishParts
}

export function getCurrentSeed() {
  return currentFish?.seed
}

export function getCurrentClass() {
  return currentClass
}

export function getCurrentFish() {
  return currentFish
}

export let player = null
export { fishParts }

export function _updateExports() {
  player = currentFish?.mesh
}