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

// Collision callbacks (for feeding system, etc.)
const collisionCallbacks = []

// Scene reference for debug visualization
let sceneRef = null

// Static collider debug wireframe visibility
let staticWireframeVisible = false

// Debug wireframe config
const DEBUG_WIREFRAME = {
  color: 0x00ff00,      // Green to match terrain wireframe
  opacity: 0.6,
  depthTest: true,
  depthWrite: false,
}

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

/**
 * Set the scene reference for debug visualization
 * @param {THREE.Scene} scene
 */
export function setPhysicsScene(scene) {
  sceneRef = scene
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
// STATIC COLLIDERS (Player-placed structures, decorations)
// ============================================================================

// Storage for static colliders (prisms, camps, etc.)
const staticColliders = new Map()  // id -> { collider, mesh, debugMesh }

/**
 * Create a static convex hull collider from mesh geometry
 * Good for simple shapes like prisms, boxes, etc.
 * 
 * @param {string} id - Unique identifier for this collider
 * @param {THREE.Mesh} mesh - The mesh to create a collider for
 * @param {object} [options] - Optional configuration
 * @param {number} [options.friction=0.5] - Surface friction
 * @param {number} [options.restitution=0.1] - Bounciness
 * @returns {object|null} - { collider } or null if failed
 */
export function createStaticCollider(id, mesh, options = {}) {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized - call initPhysics() first')
    return null
  }
  
  if (staticColliders.has(id)) {
    console.warn(`[Physics] Static collider '${id}' already exists, removing old one`)
    removeStaticCollider(id)
  }
  
  const friction = options.friction ?? 0.5
  const restitution = options.restitution ?? 0.1
  
  try {
    // Extract vertices from the mesh geometry
    const geometry = mesh.geometry
    if (!geometry) {
      console.warn(`[Physics] Mesh has no geometry`)
      return null
    }
    
    // Get position attribute
    const posAttr = geometry.getAttribute('position')
    if (!posAttr) {
      console.warn(`[Physics] Geometry has no position attribute`)
      return null
    }
    
    // Transform vertices to world space
    mesh.updateMatrixWorld(true)
    const vertices = new Float32Array(posAttr.count * 3)
    const vertex = new THREE.Vector3()
    
    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i)
      vertex.applyMatrix4(mesh.matrixWorld)
      vertices[i * 3] = vertex.x
      vertices[i * 3 + 1] = vertex.y
      vertices[i * 3 + 2] = vertex.z
    }
    
    // Create convex hull collider
    const colliderDesc = RAPIER.ColliderDesc.convexHull(vertices)
    if (!colliderDesc) {
      console.warn(`[Physics] Failed to create convex hull for '${id}'`)
      return null
    }
    
    colliderDesc
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(createCollisionGroups(CONFIG.groups.TERRAIN, 0xFFFF))
    
    const collider = world.createCollider(colliderDesc)
    
    // Create debug wireframe mesh
    let debugMesh = null
    if (sceneRef) {
      debugMesh = createDebugWireframe(mesh.geometry, mesh.matrixWorld)
      if (debugMesh) {
        debugMesh.visible = staticWireframeVisible
        debugMesh.name = `physics-debug-${id}`
        sceneRef.add(debugMesh)
      }
    }
    
    // Store reference
    const entry = { 
      collider, 
      mesh,
      debugMesh,
    }
    staticColliders.set(id, entry)
    
    if (CONFIG.debug) {
      console.log(`[Physics] Created static collider: ${id}${debugMesh ? ' (with debug wireframe)' : ''}`)
    }
    
    return { collider }
  } catch (error) {
    console.error(`[Physics] Failed to create static collider '${id}':`, error)
    return null
  }
}

/**
 * Create a debug wireframe mesh from geometry
 * @param {THREE.BufferGeometry} geometry - Source geometry
 * @param {THREE.Matrix4} worldMatrix - Transform matrix
 * @returns {THREE.LineSegments|null}
 */
function createDebugWireframe(geometry, worldMatrix) {
  try {
    // Clone and transform geometry to world space
    const clonedGeometry = geometry.clone()
    clonedGeometry.applyMatrix4(worldMatrix)
    
    // Create wireframe from the geometry
    const wireframeGeometry = new THREE.WireframeGeometry(clonedGeometry)
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: DEBUG_WIREFRAME.color,
      transparent: true,
      opacity: DEBUG_WIREFRAME.opacity,
      depthTest: DEBUG_WIREFRAME.depthTest,
      depthWrite: DEBUG_WIREFRAME.depthWrite,
    })
    
    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial)
    wireframe.renderOrder = 999  // Render on top
    
    // Clean up cloned geometry
    clonedGeometry.dispose()
    
    return wireframe
  } catch (error) {
    console.warn('[Physics] Failed to create debug wireframe:', error)
    return null
  }
}

/**
 * Create a static trimesh collider from mesh geometry
 * Better for complex shapes with concave surfaces
 * 
 * @param {string} id - Unique identifier
 * @param {THREE.Mesh} mesh - The mesh
 * @param {object} [options] - Configuration
 * @returns {object|null}
 */
export function createStaticTrimeshCollider(id, mesh, options = {}) {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized')
    return null
  }
  
  if (staticColliders.has(id)) {
    removeStaticCollider(id)
  }
  
  const friction = options.friction ?? 0.5
  const restitution = options.restitution ?? 0.1
  
  try {
    const geometry = mesh.geometry
    const posAttr = geometry.getAttribute('position')
    const indexAttr = geometry.getIndex()
    
    if (!posAttr) {
      console.warn(`[Physics] Geometry has no position attribute`)
      return null
    }
    
    // Transform vertices to world space
    mesh.updateMatrixWorld(true)
    const vertices = new Float32Array(posAttr.count * 3)
    const vertex = new THREE.Vector3()
    
    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i)
      vertex.applyMatrix4(mesh.matrixWorld)
      vertices[i * 3] = vertex.x
      vertices[i * 3 + 1] = vertex.y
      vertices[i * 3 + 2] = vertex.z
    }
    
    // Get or generate indices
    let indices
    if (indexAttr) {
      indices = new Uint32Array(indexAttr.array)
    } else {
      // Generate indices for non-indexed geometry
      indices = new Uint32Array(posAttr.count)
      for (let i = 0; i < posAttr.count; i++) {
        indices[i] = i
      }
    }
    
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(createCollisionGroups(CONFIG.groups.TERRAIN, 0xFFFF))
    
    const collider = world.createCollider(colliderDesc)
    
    staticColliders.set(id, { collider, mesh, debugMesh: null })
    
    if (CONFIG.debug) {
      console.log(`[Physics] Created static trimesh collider: ${id}`)
    }
    
    return { collider }
  } catch (error) {
    console.error(`[Physics] Failed to create trimesh collider '${id}':`, error)
    return null
  }
}

/**
 * Remove a static collider
 * @param {string} id
 * @returns {boolean} Success
 */
export function removeStaticCollider(id) {
  const entry = staticColliders.get(id)
  if (!entry) {
    return false
  }
  
  if (entry.collider) {
    world.removeCollider(entry.collider, true)
  }
  
  // Remove debug mesh if exists
  if (entry.debugMesh && entry.debugMesh.parent) {
    entry.debugMesh.parent.remove(entry.debugMesh)
    entry.debugMesh.geometry?.dispose()
    entry.debugMesh.material?.dispose()
  }
  
  staticColliders.delete(id)
  
  if (CONFIG.debug) {
    console.log(`[Physics] Removed static collider: ${id}`)
  }
  
  return true
}

/**
 * Get a static collider by ID
 * @param {string} id
 * @returns {object|null}
 */
export function getStaticCollider(id) {
  return staticColliders.get(id) || null
}

/**
 * Get all static collider IDs
 * @returns {string[]}
 */
export function getStaticColliderIds() {
  return Array.from(staticColliders.keys())
}

/**
 * Get count of static colliders
 * @returns {number}
 */
export function getStaticColliderCount() {
  return staticColliders.size
}

/**
 * Toggle static collider debug wireframe visibility
 * @returns {boolean} New visibility state
 */
export function toggleStaticColliderWireframe() {
  staticWireframeVisible = !staticWireframeVisible
  
  for (const [id, entry] of staticColliders) {
    if (entry.debugMesh) {
      entry.debugMesh.visible = staticWireframeVisible
    }
  }
  
  console.log(`[Physics] Static collider wireframes: ${staticWireframeVisible ? 'ON' : 'OFF'} (${staticColliders.size} colliders)`)
  return staticWireframeVisible
}

/**
 * Set static collider debug wireframe visibility explicitly
 * @param {boolean} visible
 */
export function setStaticColliderWireframeVisible(visible) {
  staticWireframeVisible = visible
  
  for (const [id, entry] of staticColliders) {
    if (entry.debugMesh) {
      entry.debugMesh.visible = staticWireframeVisible
    }
  }
}

/**
 * Check if static collider wireframes are currently visible
 * @returns {boolean}
 */
export function isStaticColliderWireframeVisible() {
  return staticWireframeVisible
}

// ============================================================================
// CREATURE PHYSICS (Player + NPCs)
// ============================================================================

/**
 * Create player physics body from capsule params
 * @param {object} [overrideCapsuleParams] - Optional override capsule params (for scale changes)
 * @returns {boolean} Success
 */
export function createPlayerBody(overrideCapsuleParams = null) {
  if (!physicsReady) {
    console.warn('[Physics] Not initialized')
    return false
  }
  
  // Get capsule params - use override if provided, otherwise get from player
  const capsuleParams = overrideCapsuleParams || getPlayerCapsuleParams()
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
      .setRotation({ x: 0.7071068, y: 0, z: 0, w: 0.7071068 })  // 90Ã‚Â° around X
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
    
    // Update mesh position from physics
    mesh.position.set(position.x, position.y, position.z)
    
    // Sync physics rotation FROM mesh
    // The mesh is rotated by Swimming.js, we need physics to match
    syncBodyRotation(body, mesh, creature.isPlayer)
  }
  
  // Process collision events
  processCollisionEvents()
}

/**
 * Sync rigid body rotation to match mesh rotation
 * For player: combines mesh rotation with capsule's initial 90Ãƒâ€šÃ‚Â° X offset
 */
function syncBodyRotation(body, mesh, isPlayer) {
  // Get mesh rotation as quaternion
  const meshQuat = new THREE.Quaternion()
  meshQuat.setFromEuler(mesh.rotation)
  
  if (isPlayer) {
    // Player capsule has a 90Ãƒâ€šÃ‚Â° X rotation offset (capsule aligned to Z axis)
    // We need to combine: meshRotation * capsuleOffset
    const capsuleOffset = new THREE.Quaternion()
    capsuleOffset.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    
    // Final rotation = mesh rotation (to face movement) 
    // The capsule offset is baked into the collider, so we just apply mesh rotation to body
    body.setRotation({ 
      x: meshQuat.x, 
      y: meshQuat.y, 
      z: meshQuat.z, 
      w: meshQuat.w 
    }, true)
  } else {
    // Other creatures - direct rotation sync
    body.setRotation({ 
      x: meshQuat.x, 
      y: meshQuat.y, 
      z: meshQuat.z, 
      w: meshQuat.w 
    }, true)
  }
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
  
  // Fire registered collision callbacks (for feeding, etc.)
  for (const callback of collisionCallbacks) {
    callback({
      type: 'start',
      creature1,
      creature2,
      collider1,
      collider2,
    })
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

/**
 * Set player damping (how fast they slow down)
 * @param {number} linearDamping - Linear damping (0 = no drag, 10 = instant stop)
 * @param {number} angularDamping - Angular damping
 */
export function setPlayerDamping(linearDamping, angularDamping = linearDamping) {
  if (!playerBody) return
  
  playerBody.setLinearDamping(linearDamping)
  playerBody.setAngularDamping(angularDamping)
  
  if (CONFIG.debug) {
    console.log(`[Physics] Player damping: linear=${linearDamping}, angular=${angularDamping}`)
  }
}

/**
 * Set player gravity scale (how much gravity affects them)
 * @param {number} scale - 0 = no gravity, 1 = full gravity, 0.3 = underwater feel
 */
export function setPlayerGravityScale(scale) {
  if (!playerBody) return
  
  playerBody.setGravityScale(scale, true)
  
  if (CONFIG.debug) {
    console.log(`[Physics] Player gravity scale: ${scale}`)
  }
}

/**
 * Get current player damping
 * @returns {{ linear: number, angular: number } | null}
 */
export function getPlayerDamping() {
  if (!playerBody) return null
  
  return {
    linear: playerBody.linearDamping(),
    angular: playerBody.angularDamping(),
  }
}

/**
 * Get current player gravity scale
 * @returns {number | null}
 */
export function getPlayerGravityScale() {
  if (!playerBody) return null
  return playerBody.gravityScale()
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
  console.log(`Static colliders: ${staticColliders.size}`)
  console.log(`Creature bodies: ${creatureBodies.size}`)
  
  if (staticColliders.size > 0) {
    console.group('Static Colliders')
    for (const [id, entry] of staticColliders) {
      console.log(`  - ${id}`)
    }
    console.groupEnd()
  }
  
  if (playerBody) {
    const pos = playerBody.translation()
    const vel = playerBody.linvel()
    console.log(`Player position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
    console.log(`Player velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`)
  }
  
  console.groupEnd()
}

// ============================================================================
// COLLISION CALLBACKS
// ============================================================================

/**
 * Register a callback for collision events
 * Used by feeding system, sound effects, etc.
 * 
 * @param {function} callback - Called with { type, creature1, creature2, collider1, collider2 }
 */
export function onCollision(callback) {
  if (typeof callback === 'function') {
    collisionCallbacks.push(callback)
  }
}

/**
 * Unregister a collision callback
 * @param {function} callback
 */
export function offCollision(callback) {
  const index = collisionCallbacks.indexOf(callback)
  if (index > -1) {
    collisionCallbacks.splice(index, 1)
  }
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
  
  // Remove all static colliders
  for (const [id] of staticColliders) {
    removeStaticCollider(id)
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
  setPhysicsScene,
  disposePhysics,
  
  // Terrain
  buildTerrainCollider,
  removeTerrainCollider,
  
  // Static colliders (player-placed structures)
  createStaticCollider,
  createStaticTrimeshCollider,
  removeStaticCollider,
  getStaticCollider,
  getStaticColliderIds,
  getStaticColliderCount,
  toggleStaticColliderWireframe,
  setStaticColliderWireframeVisible,
  isStaticColliderWireframeVisible,
  
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
  
  // Player physics tuning
  setPlayerDamping,
  setPlayerGravityScale,
  getPlayerDamping,
  getPlayerGravityScale,
  
  // Queries
  raycast,
  isPointInsideCollider,
  
  // Collision callbacks
  onCollision,
  offCollision,
  
  // Debug
  debugPhysics,
  
  // Config
  CONFIG,
}