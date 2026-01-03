import * as THREE from 'three'
import { 
  createSkyDome,
  createSandFloor,
  createWaterSurface,
} from './TerrainMaker.js'
import { createBoulder, BoulderType } from './Boulders.js'
import { createCoral } from './Corals.js'
import { createKelpCluster, previewScale } from './Kelp.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// Default map seed (can be overridden for multiplayer sync)
const DEFAULT_SEED = 12345

let currentMapGroup = null
let currentScene = null
let currentSeed = DEFAULT_SEED

// =============================================================================
// POLAR COORDINATE MAP LAYOUT
// =============================================================================
// The map uses concentric rings emanating from center (0,0)
// 
// Player = 2 units tall
//
// SIZE GUIDE:    1 = basketball    |  5 = car        |  70 = skyscraper
//                2 = person        |  15 = house     |  100 = mountain
//                4 = large rock    |  35 = building  |
//
// RING LAYOUT:
//   CENTER (r < 150)      â†’ Titan & Colossal boulders (rocky core)
//   MIDDLE (150 < r < 350) â†’ Large & Medium boulders (transition)
//   OUTER  (r > 350)       â†’ Small boulders + Kelp + Coral (living reef)
// =============================================================================

const BOULDER_RINGS = [
  // Inner ring - massive boulders dominate the center
  {
    name: 'titan',
    innerRadius: 0,
    outerRadius: 120,
    count: 3,
    minSize: 70,
    maxSize: 100,
    buriedFactor: 0.50,
    scaleVariation: 0.5,
  },
  {
    name: 'colossal',
    innerRadius: 50,
    outerRadius: 180,
    count: 6,
    minSize: 35,
    maxSize: 60,
    buriedFactor: 0.45,
    scaleVariation: 0.4,
  },
  // Middle ring - transitional rocky area
  {
    name: 'large',
    innerRadius: 120,
    outerRadius: 320,
    count: 15,
    minSize: 15,
    maxSize: 30,
    buriedFactor: 0.40,
    scaleVariation: 0.35,
  },
  {
    name: 'medium',
    innerRadius: 200,
    outerRadius: 400,
    count: 35,
    minSize: 5,
    maxSize: 12,
    buriedFactor: 0.35,
    scaleVariation: 0.3,
  },
  // Outer ring - scattered small rocks among life
  {
    name: 'small',
    innerRadius: 320,
    outerRadius: 480,
    count: 50,
    minSize: 1.5,
    maxSize: 4,
    buriedFactor: 0.30,
    scaleVariation: 0.25,
  },
]

// =============================================================================
// OUTER RING LIFE CONFIG - Kelp & Coral in the outer zone
// =============================================================================

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  EASY KELP SETTINGS - EDIT THESE TO TUNE PERFORMANCE/DENSITY              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const KELP_SETTINGS = {
  // Total number of kelp clusters to spawn (lower = less lag)
  clusterCount: 20,
  
  // Zone boundaries (distance from center)
  innerRadius: 150,
  outerRadius: 480,
  
  // Minimum distance between clusters
  minSpacing: 15,
  
  // Scale weights - higher weight = more common
  // Comment out or set weight to 0 to disable a size tier
  // WARNING: High scales (12+) spawn MANY plants and may cause lag!
  scales: {
    SEAGRASS_TINY:    { scale: 0.3,  weight: 2 },
    SEAGRASS_SMALL:   { scale: 0.5,  weight: 2 },
    SEAGRASS_MEDIUM:  { scale: 0.8,  weight: 2 },
    KELP_SMALL:       { scale: 1.0,  weight: 3 },
    KELP_MEDIUM:      { scale: 2.0,  weight: 3 },
    KELP_LARGE:       { scale: 4.0,  weight: 2 },
    KELP_HUGE:        { scale: 7.0,  weight: 1 },
    KELP_COLOSSAL:    { scale: 12.0, weight: 0 },  // 0 = disabled
    KELP_MEGA:        { scale: 18.0, weight: 0 },  // 0 = disabled
    KELP_TITAN:       { scale: 25.0, weight: 0 },  // 0 = disabled
    KELP_LEVIATHAN:   { scale: 35.0, weight: 0 },  // 0 = disabled
  },
}

// Convert settings to internal format
const LIFE_RING = {
  innerRadius: KELP_SETTINGS.innerRadius,
  outerRadius: KELP_SETTINGS.outerRadius,
  
  kelp: {
    clusterCount: KELP_SETTINGS.clusterCount,
    scales: Object.values(KELP_SETTINGS.scales).filter(s => s.weight > 0),
    minSpacing: KELP_SETTINGS.minSpacing,
  },
  
  // Coral reef clusters
  coral: {
    clusterCount: 25,
    minSize: 8,
    maxSize: 40,
    minSpacing: 12,
  },
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
    segments: 200,
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

  // Get terrain data for height lookups
  const terrainData = floor.userData.terrainData
  const getHeight = (x, z) => {
    const terrainY = terrainData.getHeightAtWorld(x, z) ?? 0
    return floorY + terrainY
  }

  // ==========================================================================
  // SPAWN BOULDERS IN POLAR RINGS (center = largest, outer = smallest)
  // ==========================================================================
  const rng = createSeededRNG(seed + 9999)
  let boulderIndex = 0
  const allBoulders = []
  
  for (const ring of BOULDER_RINGS) {
    for (let i = 0; i < ring.count; i++) {
      // Weighted size - bias toward smaller within range
      const sizeT = Math.pow(rng(), 1.5)
      const size = ring.minSize + sizeT * (ring.maxSize - ring.minSize)
      
      const rock = createBoulder({
        size: size,
        type: BoulderType.RANDOM,
        seed: seed + boulderIndex * 3000,
        scaleVariation: ring.scaleVariation,
      })
      
      // POLAR COORDINATES: random angle, random radius within ring
      const angle = rng() * Math.PI * 2
      const radiusRange = ring.outerRadius - ring.innerRadius
      // Use sqrt for uniform distribution in circular area
      const radius = ring.innerRadius + Math.sqrt(rng()) * radiusRange
      
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      
      // Get terrain height at this position
      const terrainY = terrainData.getHeightAtWorld(x, z) ?? 0
      
      rock.position.set(
        x,
        floorY + terrainY + size * (1 - ring.buriedFactor),
        z
      )
      
      const registryId = `rock_${ring.name}_${i}`
      
      allBoulders.push({
        mesh: rock,
        size: size,
        registryId: registryId,
        category: ring.name,
        x: x,
        y: rock.position.y,
        z: z,
      })
      
      boulderIndex++
    }
  }
  
  // Cull boulders completely contained by other boulders
  const containedIndices = cullContainedBoulders(allBoulders)
  let culledCount = 0
  
  // Add surviving boulders to scene and registry
  const survivingBoulders = []
  for (let i = 0; i < allBoulders.length; i++) {
    const boulder = allBoulders[i]
    
    if (containedIndices.has(i)) {
      boulder.mesh.geometry.dispose()
      boulder.mesh.material.dispose()
      culledCount++
      continue
    }
    
    group.add(boulder.mesh)
    
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
    
    survivingBoulders.push(boulder)
  }
  
  if (culledCount > 0) {
    console.log(`Culled ${culledCount} contained boulders`)
  }

  // ==========================================================================
  // SPAWN LIFE RING (Kelp & Coral in outer zone)
  // ==========================================================================
  const lifeGroup = spawnLifeRing({
    rng: createSeededRNG(seed + 7777),
    getHeight,
    survivingBoulders,
    seed,
  })
  group.add(lifeGroup)
  
  MeshRegistry.register('lifeRing', {
    mesh: lifeGroup,
    category: Category.MAP,
    tags: [Tag.STATIC],
    metadata: { type: 'lifeRing' }
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

// =============================================================================
// LIFE RING SPAWNING - Kelp & Coral in outer zone
// =============================================================================

function spawnLifeRing({ rng, getHeight, survivingBoulders, seed }) {
  const group = new THREE.Group()
  const config = LIFE_RING
  
  // Track placed items to avoid overlap
  const placedItems = []
  
  // Helper: check if position conflicts with boulders or other items
  const isValidPosition = (x, z, radius) => {
    // Check against boulders
    for (const boulder of survivingBoulders) {
      const dx = x - boulder.x
      const dz = z - boulder.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < boulder.size + radius + 3) {
        return false
      }
    }
    
    // Check against already placed items
    for (const item of placedItems) {
      const dx = x - item.x
      const dz = z - item.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < item.radius + radius + 2) {
        return false
      }
    }
    
    return true
  }
  
  // Helper: find valid position in ring
  const findPosition = (minSpacing, itemRadius) => {
    const maxAttempts = 30
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng() * Math.PI * 2
      const radiusRange = config.outerRadius - config.innerRadius
      const radius = config.innerRadius + Math.sqrt(rng()) * radiusRange
      
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      
      if (isValidPosition(x, z, itemRadius)) {
        return { x, z }
      }
    }
    
    return null
  }
  
  // -------------------------------------------------------------------------
  // SPAWN KELP CLUSTERS
  // -------------------------------------------------------------------------
  const kelpConfig = config.kelp
  
  // Build weighted scale list
  const weightedScales = []
  for (const { scale, weight } of kelpConfig.scales) {
    for (let w = 0; w < weight; w++) {
      weightedScales.push(scale)
    }
  }
  
  let kelpCount = 0
  for (let i = 0; i < kelpConfig.clusterCount; i++) {
    // Pick random scale
    const scale = weightedScales[Math.floor(rng() * weightedScales.length)]
    const scaled = previewScale(scale)
    const clusterRadius = scaled.radius + 2
    
    const pos = findPosition(kelpConfig.minSpacing, clusterRadius)
    if (!pos) continue
    
    const cluster = createKelpCluster({
      scale,
      seed: seed + i * 5555,
      getTerrainHeight: (lx, lz) => getHeight(pos.x + lx, pos.z + lz),
    })
    
    cluster.position.set(pos.x, 0, pos.z)
    cluster.userData.ringType = 'kelp'
    
    placedItems.push({ x: pos.x, z: pos.z, radius: clusterRadius })
    group.add(cluster)
    kelpCount++
  }
  
  // -------------------------------------------------------------------------
  // SPAWN CORAL CLUSTERS
  // -------------------------------------------------------------------------
  const coralConfig = config.coral
  
  let coralCount = 0
  for (let i = 0; i < coralConfig.clusterCount; i++) {
    const size = coralConfig.minSize + rng() * (coralConfig.maxSize - coralConfig.minSize)
    const coralRadius = size * 0.6
    
    const pos = findPosition(coralConfig.minSpacing, coralRadius)
    if (!pos) continue
    
    const y = getHeight(pos.x, pos.z)
    
    const coral = createCoral({
      size,
      seed: seed + i * 4444,
    })
    
    coral.position.set(pos.x, y, pos.z)
    coral.userData.ringType = 'coral'
    
    placedItems.push({ x: pos.x, z: pos.z, radius: coralRadius })
    group.add(coral)
    coralCount++
  }
  
  console.log(`Life ring: ${kelpCount} kelp clusters, ${coralCount} coral clusters`)
  
  group.userData.terrainType = 'lifeRing'
  return group
}

// =============================================================================
// BOULDER CULLING - Remove boulders fully inside others
// =============================================================================

function cullContainedBoulders(boulders) {
  const toRemove = new Set()
  
  for (let i = 0; i < boulders.length; i++) {
    if (toRemove.has(i)) continue
    
    const a = boulders[i]
    
    for (let j = 0; j < boulders.length; j++) {
      if (i === j || toRemove.has(j)) continue
      
      const b = boulders[j]
      
      const dist = a.mesh.position.distanceTo(b.mesh.position)
      
      if (a.size < b.size) {
        if (dist + a.size < b.size) {
          toRemove.add(i)
          break
        }
      } else if (b.size < a.size) {
        if (dist + b.size < a.size) {
          toRemove.add(j)
        }
      }
    }
  }
  
  return toRemove
}

// =============================================================================
// MAP REGENERATION
// =============================================================================

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
  MeshRegistry.unregister('lifeRing')
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

// Simple seeded RNG for deterministic placement
function createSeededRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}