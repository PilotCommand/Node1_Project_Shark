import { MeshFactory } from './MeshFactory.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// Create player fish using factory
const { mesh: fishMesh, parts: fishParts } = MeshFactory.createFish({
  bodyColor: 0xff6600,
  finColor: 0xff8833,
  scale: 1
})

// Starting position
fishMesh.position.set(0, 0, 0)

// Register with MeshRegistry
MeshRegistry.register('player', {
  mesh: fishMesh,
  body: null,  // Will add physics body later
  category: Category.PLAYER,
  tags: [Tag.COLLIDABLE, Tag.ANIMATED],
  metadata: {
    health: 100,
    speed: 10,
    parts: fishParts
  }
}, true)

export const player = fishMesh
export { fishParts }