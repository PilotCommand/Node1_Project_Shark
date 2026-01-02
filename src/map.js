import * as THREE from 'three'
import { MeshFactory } from './MeshFactory.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

export function createMap() {
  const group = new THREE.Group()

  // Sky dome
  const sky = MeshFactory.createSkyDome({
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

  // Ocean floor
  const floor = MeshFactory.createFloor({
    size: 1000,
    segments: 100,
    bumpiness: 2
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

  // Coral formations
  for (let i = 0; i < 30; i++) {
    const coral = MeshFactory.createCoral()
    coral.position.set(
      Math.random() * 400 - 200,
      -50 + Math.random() * 4,
      Math.random() * 400 - 200
    )
    group.add(coral)

    MeshRegistry.register('coral', {
      mesh: coral,
      category: Category.MAP,
      tags: [Tag.STATIC, Tag.COLLIDABLE, Tag.DESTRUCTIBLE],
      metadata: {
        type: 'decoration',
        height: coral.geometry.parameters.height
      }
    })
  }

  // Seaweed patches
  for (let i = 0; i < 20; i++) {
    const seaweed = MeshFactory.createSeaweed({
      height: Math.random() * 4 + 3
    })
    seaweed.position.set(
      Math.random() * 400 - 200,
      -50,
      Math.random() * 400 - 200
    )
    group.add(seaweed)

    MeshRegistry.register('seaweed', {
      mesh: seaweed,
      category: Category.MAP,
      tags: [Tag.STATIC, Tag.INTANGIBLE, Tag.ANIMATED],
      metadata: { type: 'decoration' }
    })
  }

  // Rocks
  for (let i = 0; i < 15; i++) {
    const rock = MeshFactory.createRock({
      size: Math.random() * 3 + 1
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
  const surface = MeshFactory.createWaterSurface({
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