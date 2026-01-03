/**
 * Physics.js - Rapier physics integration
 * 
 * Creates physics bodies from visual wireframe data:
 * - Terrain: Static trimesh collider (floor + boulders + coral)
 * - Fish/Creatures: Dynamic capsule colliders
 * 
 * Usage:
 *   import { initPhysics, updatePhysics, createCreatureBody } from './Physics.js'
 *   
 *   // Initialize (async - Rapier is WASM)
 *   await initPhysics()
 *   
 *   // Build terrain collider
 *   buildTerrainCollider()
 *   
 *   // Create player physics body
 *   createPlayerBody()
 *   
 *   // In game loop
 *   updatePhysics(delta)
 */

import * as THREE from 'three'
import { getTerrainTrimeshData } from './TerrainMesher.js'
import { getPlayerCapsuleParams, getPlayer } from './player.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// ============================================================================
// RAPIER IMPORT (Dynamic - WASM module)
// ============================================================================

let RAPIER = null

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  gravity: { x: 0, y: -9.81, z: 0 },  // Underwater could be less, e.g. -2.0
  
  // Collision groups (bitmasks)
  groups: {
    TERRAIN:  0x0001,
    PLAYER:   0x0002,
    NPC:      0x0004,
    PICKUP:   0x0008,
  },
  
  // Player physics
  player: {
    mass: 70,                    // kg
    linearDamping: 2.0,          // Underwater drag
    angularDamping: 2.0,
    friction: 0.5,
    restitution: 0.1,            // Bounciness
    gravityScale: 0.3,           // Reduced gravity underwater
  },
  
  // NPC physics
  npc: {
    mass: 50,
    linearDamping: 3.0,
    angularDamping: 3.0,
    friction: 0.3,
    restitution: 0.1,
    gravityScale: 0.2,
  },
  
  // Terrain physics
  terrain: {
    friction: 0.8,
    restitution: 0.0,
  },
  
  // Debug
  debug: true,
}

// ============================================================================
// STATE
// ============================================================================

let world = null
let eventQueue = null

// Body registries
const terrainBodies = new Map()    // id -> { collider }
const creatureBodies = new Map()   // id -> { rigidBody, collider, mesh }

// Player specific
let playerBody = null
let playerCollider = null

// Physics enabled flag
let physicsEnabled = false
let physicsReady = false

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Rapier physics engine
 * Must be called before any physics operations
 * @returns {Promise<boolean>} Success
 */
export async function initPhysics() {
  if (physicsReady) {
    console.warn('[Physics] Already initialized')
    return true
  }
  
  console.log('[Physics] Initializing Rapier...')
  
  try {
    // Import Rapier - use rapier3d-compat for web browsers
    // Note: rapier3d is for Node.js, rapier3d-compat is for web/Vite
    RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()
    
    // Create physics world
    const gravity = new RAPIER.Vector3(
      CONFIG.gravity.x,
      CONFIG.gravity.y,
      CONFIG.gravity.z
    )
    world = new RAPIER.World(gravity)
    
    // Event queue for collision detection
    eventQueue = new RAPIER.EventQueue(true)
    
    physicsReady = true
    physicsEnabled = true
    
    console.log('[Physics] Rapier initialized successfully')
    console.log(`[Physics] Gravity: (${CONFIG.gravity.x}, ${CONFIG.gravity.y}, ${CONFIG.gravity.z})`)
    
    return true
  } catch (error) {
    console.warn('[Physics] Failed to initialize Rapier:', error.message)
    console.log('[Physics] Running without physics - install Rapier with:')
    console.log('  npm install @dimforge/rapier3d-compat')
    console.log('[Physics] Game will use direct movement (no collisions)')
    return false
  }
}

/**
 * Check if physics is ready
 * @returns {boolean}
 */
export function isPhysicsReady() {
  return physicsReady
}

/**
 * Enable/disable physics simulation
 * @param {boolean} enabled
 */
export function setPhysicsEnabled(enabled) {
  physicsEnabled = enabled
  console.log(`[Physics] ${enabled ? 'Enabled' : 'Disabled'}`)
}

// ============================================================================
// TERRAIN PHYSICS
// ============================================================================

/**
 * Build static terrain collider from TerrainMesher data
 * @returns {boolean} Success
 */
export function buildTerrainCollider() {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized - call initPhysics() first')
    return false
  }
  
  // Get mesh data from TerrainMesher
  const meshData = getTerrainTrimeshData()
  if (!meshData) {
    console.warn('[Physics] No terrain mesh data available')
    return false
  }
  
  const { vertices, indices } = meshData
  
  console.log(`[Physics] Building terrain collider...`)
  console.log(`  - Vertices: ${vertices.length / 3}`)
  console.log(`  - Triangles: ${indices.length / 3}`)
  
  try {
    // Create trimesh collider description
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(CONFIG.terrain.friction)
      .setRestitution(CONFIG.terrain.restitution)
      .setCollisionGroups(createCollisionGroups(CONFIG.groups.TERRAIN, 0xFFFF))
      // Enable collision events for debugging
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    
    // Create collider (no rigid body needed for static geometry)
    const collider = world.createCollider(colliderDesc)
    
    // Store reference
    terrainBodies.set('terrain', { collider })
    
    console.log('[Physics] Terrain collider created successfully')
    
    if (CONFIG.debug) {
      debugColliderInfo('terrain', collider)
    }
    
    return true
  } catch (error) {
    console.error('[Physics] Failed to create terrain collider:', error)
    return false
  }
}

/**
 * Remove terrain collider (for map regeneration)
 */
export function removeTerrainCollider() {
  const terrain = terrainBodies.get('terrain')
  if (terrain && terrain.collider) {
    world.removeCollider(terrain.collider, true)
    terrainBodies.delete('terrain')
    console.log('[Physics] Terrain collider removed')
  }
}

// ============================================================================
// CREATURE PHYSICS (Player + NPCs)
// ============================================================================

/**
 * Create player physics body from capsule params
 * @returns {boolean} Success
 */
export function createPlayerBody() {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized')
    return false
  }
  
  // Get capsule params from player module
  const capsuleParams = getPlayerCapsuleParams()
  if (!capsuleParams) {
    console.warn('[Physics] No player capsule params available')
    return false
  }
  
  const playerMesh = getPlayer()
  if (!playerMesh) {
    console.warn('[Physics] No player mesh available')
    return false
  }
  
  // Remove existing player body if any
  removePlayerBody()
  
  const { radius, halfHeight } = capsuleParams
  const position = playerMesh.position
  
  console.log(`[Physics] Creating player body...`)
  console.log(`  - Capsule: radius=${radius.toFixed(2)}, halfHeight=${halfHeight.toFixed(2)}`)
  console.log(`  - Position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`)
  
  try {
    // Create dynamic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(CONFIG.player.linearDamping)
      .setAngularDamping(CONFIG.player.angularDamping)
      .setGravityScale(CONFIG.player.gravityScale)
      // Lock rotation - fish rotates via controls, not physics
      .lockRotations()
    
    playerBody = world.createRigidBody(bodyDesc)
    
    // Create capsule collider
    // Rapier capsule is along Y axis, so we need to rotate it to align with Z (fish forward)
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setFriction(CONFIG.player.friction)
      .setRestitution(CONFIG.player.restitution)
      .setMass(CONFIG.player.mass)
      .setCollisionGroups(createCollisionGroups(CONFIG.groups.PLAYER, CONFIG.groups.TERRAIN | CONFIG.groups.NPC))
      // Rotate capsule to align with Z axis (fish forward direction)
      .setRotation({ x: 0.7071068, y: 0, z: 0, w: 0.7071068 })  // 90° around X
      // Enable collision events for debugging
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    
    playerCollider = world.createCollider(colliderDesc, playerBody)
    
    // Store reference
    creatureBodies.set('player', {
      rigidBody: playerBody,
      collider: playerCollider,
      mesh: playerMesh,
      isPlayer: true,
    })
    
    console.log('[Physics] Player body created successfully')
    
    if (CONFIG.debug) {
      debugBodyInfo('player', playerBody, playerCollider)
    }
    
    return true
  } catch (error) {
    console.error('[Physics] Failed to create player body:', error)
    return false
  }
}

/**
 * Remove player physics body
 */
export function removePlayerBody() {
  if (playerBody) {
    world.removeRigidBody(playerBody)
    playerBody = null
    playerCollider = null
    creatureBodies.delete('player')
    console.log('[Physics] Player body removed')
  }
}

/**
 * Create NPC creature physics body
 * @param {string} id - Unique identifier
 * @param {THREE.Object3D} mesh - Creature mesh
 * @param {{ radius: number, halfHeight: number }} capsuleParams
 * @returns {boolean} Success
 */
export function createCreatureBody(id, mesh, capsuleParams) {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized')
    return false
  }
  
  if (creatureBodies.has(id)) {
    console.warn(`[Physics] Creature body '${id}' already exists`)
    return false
  }
  
  const { radius, halfHeight } = capsuleParams
  const position = mesh.position
  
  try {
    // Create dynamic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(CONFIG.npc.linearDamping)
      .setAngularDamping(CONFIG.npc.angularDamping)
      .setGravityScale(CONFIG.npc.gravityScale)
      .lockRotations()
    
    const rigidBody = world.createRigidBody(bodyDesc)
    
    // Create capsule collider (rotated to Z axis)
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setFriction(CONFIG.npc.friction)
      .setRestitution(CONFIG.npc.restitution)
      .setMass(CONFIG.npc.mass)
      .setCollisionGroups(createCollisionGroups(CONFIG.groups.NPC, CONFIG.groups.TERRAIN | CONFIG.groups.PLAYER | CONFIG.groups.NPC))
      .setRotation({ x: 0.7071068, y: 0, z: 0, w: 0.7071068 })
    
    const collider = world.createCollider(colliderDesc, rigidBody)
    
    // Store reference
    creatureBodies.set(id, {
      rigidBody,
      collider,
      mesh,
      isPlayer: false,
    })
    
    if (CONFIG.debug) {
      console.log(`[Physics] Created NPC body: ${id}`)
    }
    
    return true
  } catch (error) {
    console.error(`[Physics] Failed to create creature body '${id}':`, error)
    return false
  }
}

/**
 * Remove creature physics body
 * @param {string} id
 */
export function removeCreatureBody(id) {
  const creature = creatureBodies.get(id)
  if (creature) {
    world.removeRigidBody(creature.rigidBody)
    creatureBodies.delete(id)
    if (CONFIG.debug) {
      console.log(`[Physics] Removed creature body: ${id}`)
    }
  }
}

// ============================================================================
// PHYSICS UPDATE LOOP
// ============================================================================

/**
 * Step physics simulation and sync with Three.js
 * Call this in your game loop
 * @param {number} delta - Time since last frame in seconds
 */
export function updatePhysics(delta) {
  if (!physicsReady || !physicsEnabled) return
  
  // Step the physics world
  world.step(eventQueue)
  
  // Sync creature meshes with physics bodies
  for (const [id, creature] of creatureBodies) {
    const body = creature.rigidBody
    const mesh = creature.mesh
    
    if (!body || !mesh) continue
    
    // Get physics position
    const position = body.translation()
    
    // Update mesh position
    mesh.position.set(position.x, position.y, position.z)
    
    // Note: Rotation is locked, so mesh rotation is controlled by game logic
  }
  
  // Process collision events
  processCollisionEvents()
}

/**
 * Process collision events from the event queue
 */
function processCollisionEvents() {
  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    // Get colliders from handles
    const collider1 = world.getCollider(handle1)
    const collider2 = world.getCollider(handle2)
    
    if (!collider1 || !collider2) return
    
    // Find which creatures these belong to
    const creature1 = findCreatureByCollider(collider1)
    const creature2 = findCreatureByCollider(collider2)
    
    if (CONFIG.debug && (creature1 || creature2)) {
      const name1 = creature1 ? creature1.id : 'terrain'
      const name2 = creature2 ? creature2.id : 'terrain'
      console.log(`[Physics] Collision ${started ? 'START' : 'END'}: ${name1} <-> ${name2}`)
    }
    
    // Fire collision events (can be extended for gameplay)
    if (started) {
      onCollisionStart(creature1, creature2, collider1, collider2)
    } else {
      onCollisionEnd(creature1, creature2, collider1, collider2)
    }
  })
}

/**
 * Find creature by its collider
 */
function findCreatureByCollider(collider) {
  for (const [id, creature] of creatureBodies) {
    if (creature.collider === collider) {
      return { id, ...creature }
    }
  }
  return null
}

/**
 * Collision start callback
 */
function onCollisionStart(creature1, creature2, collider1, collider2) {
  // Check if player hit terrain
  if (creature1?.isPlayer || creature2?.isPlayer) {
    const player = creature1?.isPlayer ? creature1 : creature2
    const other = creature1?.isPlayer ? creature2 : creature1
    
    if (!other) {
      // Player hit terrain
      // Could trigger effects, sounds, etc.
    }
  }
}

/**
 * Collision end callback
 */
function onCollisionEnd(creature1, creature2, collider1, collider2) {
  // Collision ended
}

// ============================================================================
// PLAYER MOVEMENT (Physics-based)
// ============================================================================

/**
 * Apply movement impulse to player
 * Call this instead of directly setting position
 * @param {THREE.Vector3} direction - Normalized movement direction
 * @param {number} force - Force magnitude
 */
export function applyPlayerMovement(direction, force) {
  if (!playerBody) return
  
  const impulse = new RAPIER.Vector3(
    direction.x * force,
    direction.y * force,
    direction.z * force
  )
  
  playerBody.applyImpulse(impulse, true)
}

/**
 * Apply swim force to player (continuous movement)
 * @param {THREE.Vector3} direction - Normalized movement direction
 * @param {number} force - Force per second
 * @param {number} delta - Time delta
 */
export function applyPlayerSwimForce(direction, force, delta) {
  if (!playerBody) return
  
  const forceVec = new RAPIER.Vector3(
    direction.x * force * delta,
    direction.y * force * delta,
    direction.z * force * delta
  )
  
  playerBody.addForce(forceVec, true)
}

/**
 * Set player velocity directly (for teleporting, respawn, etc.)
 * @param {THREE.Vector3} velocity
 */
export function setPlayerVelocity(velocity) {
  if (!playerBody) return
  
  playerBody.setLinvel(
    new RAPIER.Vector3(velocity.x, velocity.y, velocity.z),
    true
  )
}

/**
 * Get player velocity
 * @returns {THREE.Vector3}
 */
export function getPlayerVelocity() {
  if (!playerBody) return new THREE.Vector3()
  
  const vel = playerBody.linvel()
  return new THREE.Vector3(vel.x, vel.y, vel.z)
}

/**
 * Teleport player to position
 * @param {THREE.Vector3} position
 */
export function teleportPlayer(position) {
  if (!playerBody) return
  
  playerBody.setTranslation(
    new RAPIER.Vector3(position.x, position.y, position.z),
    true
  )
  // Reset velocity
  playerBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create collision group bitmask
 * @param {number} membership - Groups this collider belongs to
 * @param {number} filter - Groups this collider can collide with
 * @returns {number} Combined bitmask
 */
function createCollisionGroups(membership, filter) {
  // Rapier uses a 32-bit integer: high 16 bits = membership, low 16 bits = filter
  return (membership << 16) | filter
}

/**
 * Raycast from a point in a direction
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} direction - Normalized
 * @param {number} maxDistance
 * @returns {{ point: THREE.Vector3, normal: THREE.Vector3, distance: number } | null}
 */
export function raycast(origin, direction, maxDistance = 100) {
  if (!physicsReady) return null
  
  const ray = new RAPIER.Ray(
    new RAPIER.Vector3(origin.x, origin.y, origin.z),
    new RAPIER.Vector3(direction.x, direction.y, direction.z)
  )
  
  const hit = world.castRay(ray, maxDistance, true)
  
  if (hit) {
    const hitPoint = ray.pointAt(hit.toi)
    const collider = hit.collider
    const normal = hit.normal
    
    return {
      point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
      normal: new THREE.Vector3(normal.x, normal.y, normal.z),
      distance: hit.toi,
      collider,
    }
  }
  
  return null
}

/**
 * Check if a point is inside any collider
 * @param {THREE.Vector3} point
 * @returns {boolean}
 */
export function isPointInsideCollider(point) {
  if (!physicsReady) return false
  
  const rapierPoint = new RAPIER.Vector3(point.x, point.y, point.z)
  
  // Check against all colliders
  let inside = false
  world.intersectionsWithPoint(rapierPoint, (collider) => {
    inside = true
    return false  // Stop iteration
  })
  
  return inside
}

// ============================================================================
// DEBUG HELPERS
// ============================================================================

function debugColliderInfo(name, collider) {
  console.log(`[Physics Debug] Collider '${name}':`)
  console.log(`  - Type: ${collider.shapeType()}`)
  console.log(`  - Friction: ${collider.friction()}`)
  console.log(`  - Restitution: ${collider.restitution()}`)
}

function debugBodyInfo(name, body, collider) {
  const pos = body.translation()
  console.log(`[Physics Debug] Body '${name}':`)
  console.log(`  - Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
  console.log(`  - Type: ${body.bodyType()}`)
  console.log(`  - Mass: ${collider.mass()}`)
  console.log(`  - Linear Damping: ${body.linearDamping()}`)
  console.log(`  - Gravity Scale: ${body.gravityScale()}`)
}

/**
 * Log physics world stats
 */
export function debugPhysics() {
  if (!physicsReady) {
    console.log('[Physics] Not initialized')
    return
  }
  
  console.group('[Physics] Debug Info')
  console.log(`Enabled: ${physicsEnabled}`)
  console.log(`Terrain colliders: ${terrainBodies.size}`)
  console.log(`Creature bodies: ${creatureBodies.size}`)
  
  if (playerBody) {
    const pos = playerBody.translation()
    const vel = playerBody.linvel()
    console.log(`Player position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
    console.log(`Player velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`)
  }
  
  console.groupEnd()
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up all physics resources
 */
export function disposePhysics() {
  if (!physicsReady) return
  
  // Remove all creature bodies
  for (const [id] of creatureBodies) {
    removeCreatureBody(id)
  }
  
  // Remove terrain
  removeTerrainCollider()
  
  // Free world
  world.free()
  world = null
  eventQueue = null
  
  physicsReady = false
  physicsEnabled = false
  
  console.log('[Physics] Disposed')
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Initialization
  initPhysics,
  isPhysicsReady,
  setPhysicsEnabled,
  disposePhysics,
  
  // Terrain
  buildTerrainCollider,
  removeTerrainCollider,
  
  // Creatures
  createPlayerBody,
  removePlayerBody,
  createCreatureBody,
  removeCreatureBody,
  
  // Update
  updatePhysics,
  
  // Player movement
  applyPlayerMovement,
  applyPlayerSwimForce,
  setPlayerVelocity,
  getPlayerVelocity,
  teleportPlayer,
  
  // Queries
  raycast,
  isPointInsideCollider,
  
  // Debug
  debugPhysics,
  
  // Config
  CONFIG,
}