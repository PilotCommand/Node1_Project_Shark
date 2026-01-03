/**
 * Swimming.js - Hybrid Movement System
 * 
 * Smooth acceleration/deceleration with physics collision.
 * Edit PARAMS below to tune the feel.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import {
  isPhysicsReady,
  applyPlayerMovement,
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
  sprintSpeed: 20,        // Sprint speed (Alt held)
  slowSpeed: 4,           // Slow/precise speed (Ctrl held)
  
  // Acceleration
  acceleration: 30,       // How fast you reach target speed
  deceleration: 20,       // How fast you stop when releasing keys
  
  // Rotation
  turnSpeed: 12,          // How fast fish turns to face movement
  pitchSpeed: 10,         // How fast fish pitches up/down
  
  // Physics
  linearDamping: 0.5,     // Minimal damping (we control velocity)
  gravityScale: 0.1,      // Slight gravity for underwater feel
  
  // Dash
  dashForce: 2000,        // Burst force when pressing Q
  dashCooldown: 0.5,      // Seconds between dashes
}

// ============================================================================
// STATE
// ============================================================================

const input = { forward: 0, right: 0, up: 0 }
let isSprinting = false
let isSlowMode = false
let lastDashTime = 0

const currentVelocity = new THREE.Vector3()

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSwimming() {
  console.log('[Swimming] Hybrid mode initialized')
  
  // Apply physics settings
  if (isPhysicsReady()) {
    setPlayerDamping(PARAMS.linearDamping)
    setPlayerGravityScale(PARAMS.gravityScale)
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
  
  // Apply hybrid movement
  if (isPhysicsReady()) {
    applyHybridMovement(direction, delta)
  } else {
    // Fallback: direct movement if no physics
    applyDirectMovement(player, direction, delta)
  }
}

// ============================================================================
// MOVEMENT
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
  
  const targetYaw = Math.atan2(-direction.x, -direction.z)
  const targetPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)))
  
  // Smooth rotation
  let yawDiff = targetYaw - player.rotation.y
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
  
  player.rotation.y += yawDiff * PARAMS.turnSpeed * delta
  player.rotation.x += (targetPitch - player.rotation.x) * PARAMS.pitchSpeed * delta
}

function applyHybridMovement(direction, delta) {
  // Get target speed
  let speed = PARAMS.speed
  if (isSprinting) speed = PARAMS.sprintSpeed
  if (isSlowMode) speed = PARAMS.slowSpeed
  
  // Target velocity
  const targetVelocity = direction.clone().multiplyScalar(speed)
  
  // Smoothly interpolate current velocity to target
  if (direction.length() > 0) {
    currentVelocity.lerp(targetVelocity, PARAMS.acceleration * delta)
  } else {
    currentVelocity.lerp(new THREE.Vector3(), PARAMS.deceleration * delta)
    if (currentVelocity.length() < 0.1) currentVelocity.set(0, 0, 0)
  }
  
  // Apply to physics body
  setPlayerVelocity(currentVelocity)
}

function applyDirectMovement(player, direction, delta) {
  let speed = PARAMS.speed
  if (isSprinting) speed = PARAMS.sprintSpeed
  if (isSlowMode) speed = PARAMS.slowSpeed
  
  if (direction.length() > 0) {
    player.position.addScaledVector(direction, speed * delta)
  }
}

// ============================================================================
// SPECIAL ACTIONS
// ============================================================================

export function triggerDash() {
  const now = performance.now() / 1000
  if (now - lastDashTime < PARAMS.dashCooldown) return false
  if (!isPhysicsReady()) return false
  
  let direction = getMovementDirection()
  
  // Dash forward if no input
  if (direction.length() === 0) {
    const yaw = getYaw()
    const pitch = getPitch()
    direction.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    )
  }
  
  applyPlayerMovement(direction.normalize(), PARAMS.dashForce)
  lastDashTime = now
  return true
}

export function fullStop() {
  if (isPhysicsReady()) {
    setPlayerVelocity(new THREE.Vector3(0, 0, 0))
  }
  currentVelocity.set(0, 0, 0)
}

// ============================================================================
// DEBUG & CONFIG
// ============================================================================

export function debugSwimming() {
  console.group('[Swimming] Debug')
  console.log('Params:', PARAMS)
  console.log('Input:', input)
  console.log('Sprinting:', isSprinting, '| Slow:', isSlowMode)
  if (isPhysicsReady()) {
    const vel = getPlayerVelocity()
    console.log('Velocity:', vel.length().toFixed(2), 'm/s')
  }
  console.groupEnd()
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

// Called when creature changes
export function autoApplyPreset(creatureType, creatureClass, traits = {}) {
  // Re-apply physics settings
  if (isPhysicsReady()) {
    setPlayerDamping(PARAMS.linearDamping)
    setPlayerGravityScale(PARAMS.gravityScale)
  }
  return 'hybrid'
}