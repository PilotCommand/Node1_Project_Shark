/**
 * Swimming.js - Movement System
 * 
 * ============================================================================
 * MOVEMENT MODES - Choose how the fish moves
 * ============================================================================
 * 
 * Change MOVEMENT_MODE below to switch between fundamentally different
 * movement systems. Each one feels completely different.
 * 
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import {
  isPhysicsReady,
  applyPlayerSwimForce,
  applyPlayerMovement,
  getPlayerVelocity,
  setPlayerVelocity,
  setPlayerDamping,
  setPlayerGravityScale,
} from './Physics.js'

// ============================================================================
// 
//  ███╗   ███╗ ██████╗ ██████╗ ███████╗    ███████╗███████╗██╗     ███████╗ ██████╗████████╗
//  ████╗ ████║██╔═══██╗██╔══██╗██╔════╝    ██╔════╝██╔════╝██║     ██╔════╝██╔════╝╚══██╔══╝
//  ██╔████╔██║██║   ██║██║  ██║█████╗      ███████╗█████╗  ██║     █████╗  ██║        ██║   
//  ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝      ╚════██║██╔══╝  ██║     ██╔══╝  ██║        ██║   
//  ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗    ███████║███████╗███████╗███████╗╚██████╗   ██║   
//  ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝    ╚══════╝╚══════╝╚══════╝╚══════╝ ╚═════╝   ╚═╝   
//
// ============================================================================

/**
 * ⭐ CHANGE THIS TO SWITCH MOVEMENT MODE ⭐
 * 
 * 'direct'   - Original instant movement. No physics. Position updates directly.
 *              Fish goes exactly where you point, stops instantly.
 * 
 * 'velocity' - We set velocity directly, Rapier handles collision.
 *              Responsive but still collides with terrain.
 * 
 * 'force'    - Full physics. We apply forces, Rapier simulates momentum/drag.
 *              Most realistic but can feel floaty/unresponsive.
 * 
 * 'hybrid'   - Mix: Direct-feeling control but with collision.
 *              We set velocity each frame based on input.
 */
const MOVEMENT_MODE = 'velocity'


// ============================================================================
// 
//  ██████╗  █████╗ ██████╗  █████╗ ███╗   ███╗███████╗████████╗███████╗██████╗ ███████╗
//  ██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗ ████║██╔════╝╚══██╔══╝██╔════╝██╔══██╗██╔════╝
//  ██████╔╝███████║██████╔╝███████║██╔████╔██║█████╗     ██║   █████╗  ██████╔╝███████╗
//  ██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║╚██╔╝██║██╔══╝     ██║   ██╔══╝  ██╔══██╗╚════██║
//  ██║     ██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║███████╗   ██║   ███████╗██║  ██║███████║
//  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝
//
// Edit these to tune each mode
// ============================================================================

const PARAMS = {
  
  // === DIRECT MODE ===
  // No physics, instant response
  direct: {
    speed: 15,              // Units per second
    sprintSpeed: 25,        // Sprint speed
    slowSpeed: 5,           // Slow mode speed
    turnSpeed: 10,          // How fast fish rotates
    pitchSpeed: 8,
  },
  
  // === VELOCITY MODE ===
  // We set velocity, Rapier handles collision only
  velocity: {
    speed: 12,              // Units per second  
    sprintSpeed: 22,
    slowSpeed: 4,
    turnSpeed: 10,
    pitchSpeed: 8,
    // Physics settings (for collision response)
    linearDamping: 0,       // We control velocity, no damping needed
    gravityScale: 0,        // No gravity, we control everything
  },
  
  // === FORCE MODE ===
  // Full physics simulation
  force: {
    swimForce: 800,         // Newtons of push force
    sprintMultiplier: 1.8,
    slowMultiplier: 0.4,
    turnSpeed: 8,
    pitchSpeed: 6,
    // Physics settings
    linearDamping: 5.0,     // How fast you slow down (higher = faster stop)
    gravityScale: 0.15,     // How much gravity affects you
  },
  
  // === HYBRID MODE ===
  // Direct control feel with collision
  hybrid: {
    speed: 12,
    sprintSpeed: 20,
    slowSpeed: 4,
    acceleration: 30,       // How fast we reach target speed
    deceleration: 20,       // How fast we stop
    turnSpeed: 12,
    pitchSpeed: 10,
    // Physics settings
    linearDamping: 0.5,     // Minimal damping
    gravityScale: 0.1,
  },
}


// ============================================================================
// STATE (don't edit)
// ============================================================================

const input = { forward: 0, right: 0, up: 0 }
let isSprinting = false
let isSlowMode = false
const smoothedVelocity = new THREE.Vector3()
const currentVelocity = new THREE.Vector3()


// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSwimming() {
  console.log(`[Swimming] Mode: ${MOVEMENT_MODE}`)
  console.log(`[Swimming] Params:`, PARAMS[MOVEMENT_MODE])
  
  // Apply physics settings for this mode
  if (isPhysicsReady() && PARAMS[MOVEMENT_MODE]) {
    const p = PARAMS[MOVEMENT_MODE]
    if (p.linearDamping !== undefined) {
      setPlayerDamping(p.linearDamping)
    }
    if (p.gravityScale !== undefined) {
      setPlayerGravityScale(p.gravityScale)
    }
  }
}

export function disposeSwimming() {}


// ============================================================================
// INPUT
// ============================================================================

export function setSwimInput(forward, right, up) {
  input.forward = Math.max(-1, Math.min(1, forward))
  input.right = Math.max(-1, Math.min(1, right))
  input.up = Math.max(-1, Math.min(1, up))
}

export function setSprinting(sprinting) { isSprinting = sprinting }
export function setSlowMode(slow) { isSlowMode = slow }
export function isMoving() {
  return input.forward !== 0 || input.right !== 0 || input.up !== 0
}


// ============================================================================
// MAIN UPDATE
// ============================================================================

export function updateSwimming(delta) {
  const player = getPlayer()
  if (!player) return
  
  // Get movement direction from input + camera
  const direction = getMovementDirection()
  
  // Rotate fish to face movement
  if (direction.length() > 0) {
    rotateToFaceMovement(player, direction, delta)
  }
  
  // Apply movement based on mode
  switch (MOVEMENT_MODE) {
    case 'direct':
      updateDirectMode(player, direction, delta)
      break
    case 'velocity':
      updateVelocityMode(player, direction, delta)
      break
    case 'force':
      updateForceMode(player, direction, delta)
      break
    case 'hybrid':
      updateHybridMode(player, direction, delta)
      break
    default:
      updateDirectMode(player, direction, delta)
  }
}


// ============================================================================
// MOVEMENT DIRECTION (shared)
// ============================================================================

function getMovementDirection() {
  const yaw = getYaw()
  const pitch = getPitch()
  
  // Camera-relative directions
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  )
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const up = new THREE.Vector3(0, 1, 0)
  
  // Combine based on input
  const direction = new THREE.Vector3()
  direction.addScaledVector(forward, input.forward)
  direction.addScaledVector(right, input.right)
  direction.addScaledVector(up, input.up)
  
  if (direction.length() > 0) direction.normalize()
  return direction
}

function rotateToFaceMovement(player, direction, delta) {
  if (getCameraMode() !== 'orbit') return
  
  const p = PARAMS[MOVEMENT_MODE]
  const targetYaw = Math.atan2(-direction.x, -direction.z)
  const targetPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)))
  
  // Smooth rotation
  let yawDiff = targetYaw - player.rotation.y
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
  
  player.rotation.y += yawDiff * p.turnSpeed * delta
  player.rotation.x += (targetPitch - player.rotation.x) * p.pitchSpeed * delta
}


// ============================================================================
// MODE: DIRECT
// Original movement. No physics. Instant response.
// ============================================================================

function updateDirectMode(player, direction, delta) {
  const p = PARAMS.direct
  
  // Get speed
  let speed = p.speed
  if (isSprinting) speed = p.sprintSpeed
  if (isSlowMode) speed = p.slowSpeed
  
  // Move directly
  if (direction.length() > 0) {
    player.position.addScaledVector(direction, speed * delta)
  }
}


// ============================================================================
// MODE: VELOCITY
// We set velocity each frame. Rapier handles collision only.
// Feels direct but respects terrain.
// ============================================================================

function updateVelocityMode(player, direction, delta) {
  if (!isPhysicsReady()) {
    updateDirectMode(player, direction, delta)
    return
  }
  
  const p = PARAMS.velocity
  
  // Get speed
  let speed = p.speed
  if (isSprinting) speed = p.sprintSpeed
  if (isSlowMode) speed = p.slowSpeed
  
  // Set velocity directly
  if (direction.length() > 0) {
    const velocity = direction.clone().multiplyScalar(speed)
    setPlayerVelocity(velocity)
  } else {
    // Stop when no input
    setPlayerVelocity(new THREE.Vector3(0, 0, 0))
  }
}


// ============================================================================
// MODE: FORCE
// Full physics. Apply forces, Rapier simulates everything.
// ============================================================================

function updateForceMode(player, direction, delta) {
  if (!isPhysicsReady()) {
    updateDirectMode(player, direction, delta)
    return
  }
  
  const p = PARAMS.force
  
  if (direction.length() === 0) return
  
  // Calculate force
  let force = p.swimForce
  if (isSprinting) force *= p.sprintMultiplier
  if (isSlowMode) force *= p.slowMultiplier
  
  // Apply force to physics body
  applyPlayerSwimForce(direction, force, delta)
}


// ============================================================================
// MODE: HYBRID
// Direct-feeling with smooth acceleration, but with collision.
// ============================================================================

function updateHybridMode(player, direction, delta) {
  if (!isPhysicsReady()) {
    updateDirectMode(player, direction, delta)
    return
  }
  
  const p = PARAMS.hybrid
  
  // Get target speed
  let speed = p.speed
  if (isSprinting) speed = p.sprintSpeed
  if (isSlowMode) speed = p.slowSpeed
  
  // Target velocity
  const targetVelocity = direction.clone().multiplyScalar(speed)
  
  // Smoothly interpolate current velocity to target
  if (direction.length() > 0) {
    currentVelocity.lerp(targetVelocity, p.acceleration * delta)
  } else {
    currentVelocity.lerp(new THREE.Vector3(), p.deceleration * delta)
    if (currentVelocity.length() < 0.1) currentVelocity.set(0, 0, 0)
  }
  
  // Apply to physics
  setPlayerVelocity(currentVelocity)
}


// ============================================================================
// UTILITY
// ============================================================================

export function triggerDash() {
  if (!isPhysicsReady()) return false
  
  const direction = getMovementDirection()
  if (direction.length() === 0) {
    // Dash forward if no input
    const yaw = getYaw()
    const pitch = getPitch()
    direction.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    )
  }
  
  applyPlayerMovement(direction.normalize(), 2000)
  return true
}

export function fullStop() {
  if (isPhysicsReady()) {
    setPlayerVelocity(new THREE.Vector3(0, 0, 0))
  }
  currentVelocity.set(0, 0, 0)
  smoothedVelocity.set(0, 0, 0)
}

export function debugSwimming() {
  console.group('[Swimming] Debug')
  console.log('Mode:', MOVEMENT_MODE)
  console.log('Params:', PARAMS[MOVEMENT_MODE])
  console.log('Input:', input)
  console.log('Sprinting:', isSprinting)
  console.log('Slow:', isSlowMode)
  if (isPhysicsReady()) {
    const vel = getPlayerVelocity()
    console.log('Velocity:', vel.length().toFixed(2), 'm/s')
  }
  console.groupEnd()
}

// For external config changes
export function autoApplyPreset(creatureType, creatureClass, traits = {}) {
  // Re-apply physics settings when creature changes
  if (isPhysicsReady() && PARAMS[MOVEMENT_MODE]) {
    const p = PARAMS[MOVEMENT_MODE]
    if (p.linearDamping !== undefined) setPlayerDamping(p.linearDamping)
    if (p.gravityScale !== undefined) setPlayerGravityScale(p.gravityScale)
  }
  return 'default'
}

export function setSwimConfig(config) {
  Object.assign(PARAMS[MOVEMENT_MODE], config)
}

export function getSwimConfig() {
  return { ...PARAMS[MOVEMENT_MODE] }
}