import * as THREE from 'three'
import { 
  createSkyDome,
  createSandFloor,
  createBoulder,
  createWaterSurface,
  getTerrainHeight,
} from './TerrainMaker.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// Default map seed (can be overridden for multiplayer sync)
const DEFAULT_SEED = 12345

let currentMapGroup = null
let currentScene = null
let currentSeed = DEFAULT_SEED

export function createMap(scene, seed = DEFAULT_SEED) {
  currentScene = scene
  currentSeed = seed
  
  const group = new THREE.Group()
  
  const mapSize = 1000
  const floorY = -50  // Base floor level

  // Sky dome
  const sky = createSkyDome({
    radius: 500,
    waterLevel: 30
  })
  group.add(sky)

  MeshRegistry.register('sky', {
    mesh: sky,
    category: Category.MAP,
    tags: [Tag.STATIC, Tag.INTANGIBLE],
    metadata: { type: 'skybox' }
  }, true)

  // Ocean floor (sand) with Perlin terrain
  const floor = createSandFloor({
    size: mapSize,
    segments: 200,  // Higher detail for exaggerated terrain
    seed: seed,
  })
  floor.position.y = floorY
  group.add(floor)

  MeshRegistry.register('floor', {
    mesh: floor,
    category: Category.MAP,
    tags: [Tag.STATIC, Tag.COLLIDABLE],
    metadata: {
      type: 'boundary',
      boundaryType: 'floor',
      yLevel: floorY,
      seed: seed,
    }
  }, true)

  // Rocks/Boulders - placed on terrain
  const rng = createSeededRNG(seed + 9999)  // Offset seed for boulder placement
  
  for (let i = 0; i < 15; i++) {
    const size = rng() * 3 + 1
    const rock = createBoulder({
      size: size,
      seed: seed + i * 3000,
    })
    
    // Random XZ position
    const x = rng() * 400 - 200
    const z = rng() * 400 - 200
    
    // Get terrain height at this position and place boulder on it
    const terrainY = getTerrainHeight(x, z, mapSize, seed)
    
    rock.position.set(
      x,
      floorY + terrainY + size * 0.3,  // Partially buried
      z
    )
    group.add(rock)

    MeshRegistry.register('rock', {
      mesh: rock,
      category: Category.MAP,
      tags: [Tag.STATIC, Tag.COLLIDABLE],
      metadata: { type: 'obstacle' }
    })
  }

  // Water surface
  const surface = createWaterSurface({
    size: mapSize,
    opacity: 0.5
  })
  surface.position.y = 30
  group.add(surface)

  MeshRegistry.register('waterSurface', {
    mesh: surface,
    category: Category.MAP,
    tags: [Tag.STATIC, Tag.COLLIDABLE],
    metadata: {
      type: 'boundary',
      boundaryType: 'ceiling',
      yLevel: 30
    }
  }, true)

  // Register map group
  MeshRegistry.register('mapGroup', {
    mesh: group,
    category: Category.MAP,
    tags: [Tag.STATIC],
    metadata: {
      type: 'container',
      seed: seed,
      bounds: {
        minX: -500, maxX: 500,
        minY: -50, maxY: 30,
        minZ: -500, maxZ: 500
      }
    }
  }, true)

  currentMapGroup = group
  return group
}

/**
 * Regenerate terrain with a new random seed
 * @returns {number} The new seed used
 */
export function regenerateMap() {
  if (!currentScene || !currentMapGroup) {
    console.warn('Map not initialized')
    return null
  }
  
  // Remove old map from scene
  currentScene.remove(currentMapGroup)
  
  // Dispose old geometries and materials
  currentMapGroup.traverse(child => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  
  // Unregister old map meshes
  MeshRegistry.unregister('sky')
  MeshRegistry.unregister('floor')
  MeshRegistry.unregister('waterSurface')
  MeshRegistry.unregister('mapGroup')
  
  // Unregister all rocks
  const rocks = MeshRegistry.getByCategory(Category.MAP)
  rocks.forEach(entity => {
    if (entity.metadata?.type === 'obstacle') {
      MeshRegistry.unregister(entity.id)
    }
  })
  
  // Generate new seed
  const newSeed = Math.floor(Math.random() * 0xFFFFFFFF)
  
  // Create new map
  const newMap = createMap(currentScene, newSeed)
  currentScene.add(newMap)
  
  console.log(`Terrain regenerated | Seed: ${newSeed.toString(16).toUpperCase().padStart(8, '0')}`)
  
  return newSeed
}

/**
 * Get current map seed
 */
export function getCurrentSeed() {
  return currentSeed
}

// Simple seeded RNG for boulder placement
function createSeededRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}