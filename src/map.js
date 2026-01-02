import * as THREE from 'three'
import { 
  createSkyDome,
  createSandFloor,
  createBoulder,
  createWaterSurface,
} from './TerrainMaker.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

export function createMap(seed = null) {
  const group = new THREE.Group()

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

  // Ocean floor (sand)
  const floor = createSandFloor({
    size: 1000,
    segments: 100,
    bumpiness: 2,
    seed: seed,
  })
  floor.position.y = -50
  group.add(floor)

  MeshRegistry.register('floor', {
    mesh: floor,
    category: Category.MAP,
    tags: [Tag.STATIC, Tag.COLLIDABLE],
    metadata: {
      type: 'boundary',
      boundaryType: 'floor',
      yLevel: -50
    }
  }, true)

  // Rocks/Boulders
  for (let i = 0; i < 15; i++) {
    const rock = createBoulder({
      size: Math.random() * 3 + 1,
      seed: seed ? seed + i * 3000 : null,
    })
    rock.position.set(
      Math.random() * 400 - 200,
      -50 + Math.random() * 2,
      Math.random() * 400 - 200
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
    size: 1000,
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
      bounds: {
        minX: -500, maxX: 500,
        minY: -50, maxY: 30,
        minZ: -500, maxZ: 500
      }
    }
  }, true)

  return group
}