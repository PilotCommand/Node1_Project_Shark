import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import { 
  regeneratePlayerCreature, 
  cyclePlayerClass,
  cyclePreviousClass,
  getCurrentIndex,
  getCreatureCatalog,
  toggleWireframe,
} from './player.js'
import { 
  seedToString, 
  getCreatureDisplayName,
  getCreatureShortName,
} from './Encyclopedia.js'
import { regenerateMap } from './map.js'
import { 
  toggleTerrainWireframe,
  isTerrainWireframeVisible,
} from './TerrainMesher.js'
import {
  isPhysicsReady,
  applyPlayerSwimForce,
  setPhysicsEnabled,
  debugPhysics,
} from './Physics.js'

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false
}

// Movement config
const MOVE_SPEED = 10           // Non-physics fallback speed
const SWIM_FORCE = 500          // Physics swim force (Newtons)
const PHYSICS_ENABLED = true    // Use physics when available

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
      
      // M = regenerate Map/terrain
      case 'KeyM':
        const newSeed = regenerateMap()
        if (newSeed !== null) {
          showNotification(
            `New terrain | Seed: ${newSeed.toString(16).toUpperCase().padStart(8, '0')}`,
            '#00ffff'
          )
        }
        break
      
      // R = Regenerate creature (mutate - new random of same type/class)
      case 'KeyR':
        const result = regeneratePlayerCreature()
        if (result) {
          const size = result.traits?.length?.toFixed(1) || '?'
          const shortName = getCreatureShortName(result.creatureType, result.creatureClass)
          showNotification(
            `${shortName} | ${size}m | ${seedToString(result.seed)}`,
            '#00ff88'
          )
        }
        break
      
      // N = Next class (cycle forward through ALL creatures)
      case 'KeyN':
        const next = cyclePlayerClass()
        if (next) {
          const displayName = getCreatureDisplayName(next.creatureType, next.creatureClass)
          const index = getCurrentIndex()
          const total = getCreatureCatalog().length
          showNotification(`${displayName} [${index + 1}/${total}]`, '#ffaa00')
        }
        break
      
      // B = Back/Previous class (cycle backward)
      case 'KeyB':
        const prev = cyclePreviousClass()
        if (prev) {
          const displayName = getCreatureDisplayName(prev.creatureType, prev.creatureClass)
          const index = getCurrentIndex()
          const total = getCreatureCatalog().length
          showNotification(`${displayName} [${index + 1}/${total}]`, '#ffaa00')
        }
        break
      
      // P = Toggle Physics/Collider wireframes (BOTH player AND terrain)
      case 'KeyP':
        // Toggle player wireframe
        const playerWireframeOn = toggleWireframe()
        
        // Toggle terrain wireframe (sync with player wireframe state)
        toggleTerrainWireframe()
        
        showNotification(
          `Collision wireframes: ${playerWireframeOn ? 'ON' : 'OFF'}`,
          playerWireframeOn ? '#00ff00' : '#ff6600'
        )
        break
      
      // F = Toggle physics on/off (for debugging)
      case 'KeyF':
        if (isPhysicsReady()) {
          // Toggle physics and show notification
          // Note: Would need to track state, simplified here
          debugPhysics()
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

function showNotification(message, color = '#00ff88') {
  const existing = document.getElementById('creature-notification')
  if (existing) existing.remove()
  
  const notification = document.createElement('div')
  notification.id = 'creature-notification'
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: ${color};
    padding: 12px 24px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 14px;
    z-index: 1000;
    transition: opacity 0.3s;
    border: 1px solid ${color}44;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `
  notification.textContent = message
  
  document.body.appendChild(notification)
  
  setTimeout(() => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }, 2500)
}

export function updateMovement(delta) {
  const player = getPlayer()
  if (!player) return
  
  const yaw = getYaw()
  const pitch = getPitch()
  
  // Calculate movement direction vectors
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  )
  
  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  )
  
  const up = new THREE.Vector3(0, 1, 0)
  const velocity = new THREE.Vector3()
  
  // Build movement direction from input
  if (keys.w) velocity.add(forward)
  if (keys.s) velocity.sub(forward)
  if (keys.d) velocity.add(right)
  if (keys.a) velocity.sub(right)
  if (keys.space) velocity.add(up)
  if (keys.shift) velocity.sub(up)
  
  if (velocity.length() > 0) {
    velocity.normalize()
    
    // Update player mesh rotation in orbit mode
    if (getCameraMode() === 'orbit') {
      const targetYaw = Math.atan2(-velocity.x, -velocity.z)
      const targetPitch = Math.asin(velocity.y)
      
      const rotationSpeed = 10 * delta
      
      let yawDiff = targetYaw - player.rotation.y
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
      player.rotation.y += yawDiff * rotationSpeed
      
      player.rotation.x += (targetPitch - player.rotation.x) * rotationSpeed
    }
    
    // Apply movement - physics or direct
    if (PHYSICS_ENABLED && isPhysicsReady()) {
      // Physics-based: apply force (position updated in Physics.js)
      applyPlayerSwimForce(velocity, SWIM_FORCE, delta)
    } else {
      // Direct position update (no physics fallback)
      player.position.add(velocity.multiplyScalar(MOVE_SPEED * delta))
    }
  }
}