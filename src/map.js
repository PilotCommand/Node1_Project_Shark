import * as THREE from 'three'
import { 
  createSkyDome,
  createSandFloor,
  createWaterSurface,
} from './TerrainMaker.js'
import { createBoulder, BoulderType } from './Boulders.js'
import { spawnAllRegions } from './Regions.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// Default map seed (can be overridden for multiplayer sync)
const DEFAULT_SEED = 12345

let currentMapGroup = null
let currentScene = null
let currentSeed = DEFAULT_SEED

// =============================================================================
// BOULDER SCALE CONFIG - EDIT HERE
// =============================================================================
// Player = 2 units tall
//
// SIZE GUIDE:    1 = basketball    |  5 = car        |  70 = skyscraper
//                2 = person        |  15 = house     |  100 = mountain
//                4 = large rock    |  35 = building  |
// =============================================================================

const BOULDER_CONFIG = {
//  Category     count   minSize   maxSize   spreadRadius   buriedFactor
    titan:     { count: 2,   minSize: 70,  maxSize: 100, spreadRadius: 350, buriedFactor: 0.50 },
    colossal:  { count: 4,   minSize: 35,  maxSize: 60,  spreadRadius: 400, buriedFactor: 0.45 },
    large:     { count: 12,  minSize: 15,  maxSize: 30,  spreadRadius: 420, buriedFactor: 0.40 },
    medium:    { count: 30,  minSize: 5,   maxSize: 12,  spreadRadius: 450, buriedFactor: 0.35 },
    small:     { count: 50,  minSize: 1.5, maxSize: 4,   spreadRadius: 480, buriedFactor: 0.30 },
}

// =============================================================================

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

  // Spawn boulders of all sizes
  const rng = createSeededRNG(seed + 9999)
  const terrainData = floor.userData.terrainData
  let boulderIndex = 0
  
  // Store all boulders for containment check
  const allBoulders = []
  
  // Helper to spawn a category of boulders
  const spawnBoulderCategory = (config, categoryName) => {
    for (let i = 0; i < config.count; i++) {
      // Weighted size - bias toward smaller within range
      const sizeT = Math.pow(rng(), 1.5)  // Skew toward smaller
      const size = config.minSize + sizeT * (config.maxSize - config.minSize)
      
      const rock = createBoulder({
        size: size,
        type: BoulderType.RANDOM,
        seed: seed + boulderIndex * 3000,
        scaleVariation: categoryName === 'titan' ? 0.5 : 
                        categoryName === 'colossal' ? 0.4 : 0.3,
      })
      
      // Random XZ position within spread radius
      const angle = rng() * Math.PI * 2
      const distance = rng() * config.spreadRadius
      const x = Math.cos(angle) * distance
      const z = Math.sin(angle) * distance
      
      // Get terrain height at this position from stored mesh data
      const terrainY = terrainData.getHeightAtWorld(x, z) ?? 0
      
      rock.position.set(
        x,
        floorY + terrainY + size * (1 - config.buriedFactor),
        z
      )
      
      const registryId = `rock_${categoryName}_${i}`
      
      // Store for containment check
      allBoulders.push({
        mesh: rock,
        size: size,
        registryId: registryId,
        category: categoryName,
      })
      
      boulderIndex++
    }
  }
  
  // Spawn all boulder categories
  spawnBoulderCategory(BOULDER_CONFIG.titan, 'titan')
  spawnBoulderCategory(BOULDER_CONFIG.colossal, 'colossal')
  spawnBoulderCategory(BOULDER_CONFIG.large, 'large')
  spawnBoulderCategory(BOULDER_CONFIG.medium, 'medium')
  spawnBoulderCategory(BOULDER_CONFIG.small, 'small')
  
  // Cull boulders completely contained by other boulders
  const cullContainedBoulders = (boulders) => {
    const toRemove = new Set()
    
    for (let i = 0; i < boulders.length; i++) {
      if (toRemove.has(i)) continue
      
      const a = boulders[i]
      
      for (let j = 0; j < boulders.length; j++) {
        if (i === j || toRemove.has(j)) continue
        
        const b = boulders[j]
        
        // Check if smaller boulder is contained by larger
        // Boulder is contained if: distance + smallerRadius < largerRadius
        const dist = a.mesh.position.distanceTo(b.mesh.position)
        
        if (a.size < b.size) {
          // Check if A is inside B
          if (dist + a.size < b.size) {
            toRemove.add(i)
            break
          }
        } else if (b.size < a.size) {
          // Check if B is inside A
          if (dist + b.size < a.size) {
            toRemove.add(j)
          }
        }
      }
    }
    
    return toRemove
  }
  
  const containedIndices = cullContainedBoulders(allBoulders)
  let culledCount = 0
  
  // Add surviving boulders to scene and registry
  for (let i = 0; i < allBoulders.length; i++) {
    const boulder = allBoulders[i]
    
    if (containedIndices.has(i)) {
      // Dispose of contained boulder
      boulder.mesh.geometry.dispose()
      boulder.mesh.material.dispose()
      culledCount++
      continue
    }
    
    // Add to scene
    group.add(boulder.mesh)
    
    // Register
    MeshRegistry.register(boulder.registryId, {
      mesh: boulder.mesh,
      category: Category.MAP,
      tags: [Tag.STATIC, Tag.COLLIDABLE],
      metadata: { 
        type: 'obstacle',
        boulderCategory: boulder.category,
        size: boulder.size,
      }
    })
  }
  
  if (culledCount > 0) {
    console.log(`Culled ${culledCount} contained boulders`)
  }
  
  // Collect surviving boulders for region coral culling
  const survivingBoulders = allBoulders
    .filter((_, i) => !containedIndices.has(i))
    .map(b => ({
      mesh: b.mesh,
      size: b.size,
      x: b.mesh.position.x,
      y: b.mesh.position.y,
      z: b.mesh.position.z,
    }))

  // Spawn region content (coral reefs, boulder fields, etc.)
  const regions = spawnAllRegions({
    getTerrainHeight: (x, z) => terrainData.getHeightAtWorld(x, z) ?? 0,
    floorY: floorY,
    seed: seed,
    globalBoulders: survivingBoulders,
  })
  group.add(regions)
  
  MeshRegistry.register('regions', {
    mesh: regions,
    category: Category.MAP,
    tags: [Tag.STATIC],
    metadata: {
      type: 'regions',
    }
  }, true)

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
  MeshRegistry.unregister('regions')
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