/**
 * Swimming.js - Movement System
 * 
 * Simple controls:
 *   WASD / Space / Shift - Move
 *   Q (hold) - Boost (go faster)
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import {
  isPhysicsReady,
  getPlayerVelocity,
  setPlayerVelocity,
  setPlayerDamping,
  setPlayerGravityScale,
} from './Physics.js'

// ============================================================================
// PARAMETERS - Edit these to tune the feel
// ============================================================================

const PARAMS = {
  // Movement speeds
  speed: 12,              // Normal swim speed (units/sec)
  boostSpeed: 28,         // Boost speed when holding Q
  
  // Acceleration
  acceleration: 30,       // How fast you reach target speed
  deceleration: 20,       // How fast you stop when releasing keys
  
  // Rotation
  turnSpeed: 12,          // How fast fish turns to face movement
  pitchSpeed: 10,         // How fast fish pitches up/down
  
  // Physics
  linearDamping: 0.5,     // Minimal damping
  gravityScale: 0.1,      // Slight gravity for underwater feel
}

// ============================================================================
// STATE
// ============================================================================

const input = { forward: 0, right: 0, up: 0 }
let isBoosting = false
const currentVelocity = new THREE.Vector3()

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSwimming() {
  console.log('[Swimming] Initialized')
  console.log('[Swimming] Physics ready:', isPhysicsReady())
  
  if (isPhysicsReady()) {
    setPlayerDamping(PARAMS.linearDamping)
    setPlayerGravityScale(PARAMS.gravityScale)
    console.log('[Swimming] Applied damping and gravity scale')
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

export function setBoosting(boosting) { isBoosting = boosting }

export function isMoving() {
  return input.forward !== 0 || input.right !== 0 || input.up !== 0
}

// ============================================================================
// MAIN UPDATE
// ============================================================================

export function updateSwimming(delta) {
  const player = getPlayer()
  if (!player) return
  
  const direction = getMovementDirection()
  
  // Rotate fish to face movement
  if (direction.length() > 0) {
    rotateToFaceMovement(player, direction, delta)
  }
  
  // Apply movement
  if (isPhysicsReady()) {
    applyHybridMovement(direction, delta)
  } else {
    applyDirectMovement(player, direction, delta)
  }
}

// ============================================================================
// MOVEMENT
// ============================================================================

function getMovementDirection() {
  const yaw = getYaw()
  const pitch = getPitch()
  
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  )
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const up = new THREE.Vector3(0, 1, 0)
  
  const direction = new THREE.Vector3()
  direction.addScaledVector(forward, input.forward)
  direction.addScaledVector(right, input.right)
  direction.addScaledVector(up, input.up)
  
  if (direction.length() > 0) direction.normalize()
  return direction
}

function rotateToFaceMovement(player, direction, delta) {
  if (getCameraMode() !== 'orbit') return
  
  const targetYaw = Math.atan2(-direction.x, -direction.z)
  const targetPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)))
  
  let yawDiff = targetYaw - player.rotation.y
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
  
  player.rotation.y += yawDiff * PARAMS.turnSpeed * delta
  player.rotation.x += (targetPitch - player.rotation.x) * PARAMS.pitchSpeed * delta
}

function applyHybridMovement(direction, delta) {
  // Get target speed
  const speed = isBoosting ? PARAMS.boostSpeed : PARAMS.speed
  
  // Target velocity
  const targetVelocity = direction.clone().multiplyScalar(speed)
  
  // Smoothly interpolate
  if (direction.length() > 0) {
    currentVelocity.lerp(targetVelocity, PARAMS.acceleration * delta)
  } else {
    currentVelocity.lerp(new THREE.Vector3(), PARAMS.deceleration * delta)
    if (currentVelocity.length() < 0.1) currentVelocity.set(0, 0, 0)
  }
  
  setPlayerVelocity(currentVelocity)
}

function applyDirectMovement(player, direction, delta) {
  const speed = isBoosting ? PARAMS.boostSpeed : PARAMS.speed
  
  if (direction.length() > 0) {
    player.position.addScaledVector(direction, speed * delta)
  }
}

// ============================================================================
// UTILITY
// ============================================================================

export function fullStop() {
  if (isPhysicsReady()) {
    setPlayerVelocity(new THREE.Vector3(0, 0, 0))
  }
  currentVelocity.set(0, 0, 0)
}

export function debugSwimming() {
  const player = getPlayer()
  const vel = isPhysicsReady() ? getPlayerVelocity() : null
  
  console.log('[Swimming] Debug:', {
    physicsReady: isPhysicsReady(),
    input: { ...input },
    boosting: isBoosting,
    velocity: vel ? `${vel.length().toFixed(2)} m/s` : 'N/A',
    position: player ? player.position.toArray().map(v => v.toFixed(1)) : 'N/A',
  })
}

export function setSwimConfig(config) {
  Object.assign(PARAMS, config)
  if (isPhysicsReady()) {
    if (config.linearDamping !== undefined) setPlayerDamping(config.linearDamping)
    if (config.gravityScale !== undefined) setPlayerGravityScale(config.gravityScale)
  }
}

export function getSwimConfig() {
  return { ...PARAMS }
}

export function autoApplyPreset() {
  if (isPhysicsReady()) {
    setPlayerDamping(PARAMS.linearDamping)
    setPlayerGravityScale(PARAMS.gravityScale)
  }
  return 'default'
}