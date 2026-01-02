import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import { regeneratePlayerFish, getCurrentSeed } from './player.js'
import { seedToString } from './Fishes.js'

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,    // Up
  shift: false     // Down
}

const moveSpeed = 10 // Units per second

export function initControls() {
  window.addEventListener('keydown', (e) => {
    switch(e.code) {
      case 'KeyW': keys.w = true; break
      case 'KeyA': keys.a = true; break
      case 'KeyS': keys.s = true; break
      case 'KeyD': keys.d = true; break
      case 'Space': keys.space = true; e.preventDefault(); break
      case 'ShiftLeft': 
      case 'ShiftRight': keys.shift = true; break
      
      // M = Mutate fish
      case 'KeyM':
        const newSeed = regeneratePlayerFish()
        if (newSeed !== null) {
          showSeedNotification(newSeed)
        }
        break
      
      // P = Print current seed to console
      case 'KeyP':
        const currentSeed = getCurrentSeed()
        if (currentSeed !== null) {
          console.log(`Current fish seed: ${seedToString(currentSeed)} (${currentSeed})`)
        }
        break
    }
  })
  
  window.addEventListener('keyup', (e) => {
    switch(e.code) {
      case 'KeyW': keys.w = false; break
      case 'KeyA': keys.a = false; break
      case 'KeyS': keys.s = false; break
      case 'KeyD': keys.d = false; break
      case 'Space': keys.space = false; break
      case 'ShiftLeft':
      case 'ShiftRight': keys.shift = false; break
    }
  })
}

/**
 * Show temporary notification with new seed
 */
function showSeedNotification(seed) {
  // Remove existing notification if any
  const existing = document.getElementById('seed-notification')
  if (existing) existing.remove()
  
  // Create notification element
  const notification = document.createElement('div')
  notification.id = 'seed-notification'
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: #00ff88;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 16px;
    z-index: 1000;
    transition: opacity 0.3s;
  `
  notification.textContent = `New Fish: ${seedToString(seed)}`
  
  document.body.appendChild(notification)
  
  // Fade out and remove
  setTimeout(() => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }, 2000)
}

export function updateMovement(delta) {
  const player = getPlayer()
  if (!player) return
  
  const yaw = getYaw()
  const pitch = getPitch()
  
  // Calculate forward direction based on camera yaw AND pitch (true 3D movement)
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  )
  
  // Right vector (always horizontal)
  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  )
  
  // Up vector (world up)
  const up = new THREE.Vector3(0, 1, 0)
  
  // Calculate movement
  const velocity = new THREE.Vector3()
  
  if (keys.w) velocity.add(forward)
  if (keys.s) velocity.sub(forward)
  if (keys.d) velocity.add(right)
  if (keys.a) velocity.sub(right)
  if (keys.space) velocity.add(up)
  if (keys.shift) velocity.sub(up)
  
  // Normalize so diagonal movement isn't faster
  if (velocity.length() > 0) {
    velocity.normalize()
    
    // In orbit mode, rotate fish to face movement direction
    if (getCameraMode() === 'orbit') {
      const targetYaw = Math.atan2(-velocity.x, -velocity.z)
      const targetPitch = Math.asin(velocity.y)
      
      // Smooth rotation
      const rotationSpeed = 10 * delta
      
      // Lerp yaw
      let yawDiff = targetYaw - player.rotation.y
      // Handle wrap-around
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
      player.rotation.y += yawDiff * rotationSpeed
      
      // Lerp pitch (rotation on X axis)
      player.rotation.x += (targetPitch - player.rotation.x) * rotationSpeed
    }
  }
  
  // Apply movement scaled by delta time and speed
  player.position.add(velocity.multiplyScalar(moveSpeed * delta))
}