import * as THREE from 'three'
import { getPlayer } from './player.js'
import { getYaw, getPitch, getCameraMode } from './camera.js'
import { regeneratePlayerFish, getCurrentSeed, getCurrentClass, cyclePlayerClass } from './player.js'
import { seedToString, FishClass } from './Fishes.js'

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false
}

const moveSpeed = 10

// Biological class display names
const CLASS_DISPLAY_NAMES = {
  [FishClass.SHARK]: '🦈 Shark (Selachimorpha)',
  [FishClass.RAY]: '🦅 Ray (Batoidea)',
  [FishClass.EEL]: '🐍 Eel (Anguilliformes)',
  [FishClass.GROUPER]: '🐟 Grouper (Serranidae)',
  [FishClass.TUNA]: '🐟 Tuna (Scombridae)',
  [FishClass.BARRACUDA]: '🐟 Barracuda (Sphyraenidae)',
  [FishClass.TANG]: '🐠 Tang (Acanthuridae)',
  [FishClass.ANGELFISH]: '🐠 Angelfish (Pomacanthidae)',
  [FishClass.PUFFER]: '🐡 Puffer (Tetraodontidae)',
  [FishClass.MARLIN]: '🗡️ Marlin (Istiophoridae)',
  [FishClass.FLOUNDER]: '🫓 Flounder (Pleuronectiformes)',
  [FishClass.STARTER]: '⭐ Starter',
}

// Short names for HUD
const CLASS_SHORT_NAMES = {
  [FishClass.SHARK]: 'Shark',
  [FishClass.RAY]: 'Ray',
  [FishClass.EEL]: 'Eel',
  [FishClass.GROUPER]: 'Grouper',
  [FishClass.TUNA]: 'Tuna',
  [FishClass.BARRACUDA]: 'Barracuda',
  [FishClass.TANG]: 'Tang',
  [FishClass.ANGELFISH]: 'Angelfish',
  [FishClass.PUFFER]: 'Puffer',
  [FishClass.MARLIN]: 'Marlin',
  [FishClass.FLOUNDER]: 'Flounder',
  [FishClass.STARTER]: 'Starter',
}

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
      
      // M = Mutate fish (new random in same class)
      case 'KeyM':
        const result = regeneratePlayerFish()
        if (result) {
          const size = result.traits?.length?.toFixed(1) || '?'
          showNotification(
            `${CLASS_SHORT_NAMES[result.fishClass]} | ${size}m | ${seedToString(result.seed)}`,
            '#00ff88'
          )
        }
        break
      
      // N = Next class
      case 'KeyN':
        const newClass = cyclePlayerClass()
        if (newClass) {
          showNotification(CLASS_DISPLAY_NAMES[newClass.fishClass], '#ffaa00')
        }
        break
      
      // P = Print current info to console
      case 'KeyP':
        const currentSeed = getCurrentSeed()
        const currentClass = getCurrentClass()
        if (currentSeed !== null) {
          const info = `${CLASS_DISPLAY_NAMES[currentClass]} | Seed: ${seedToString(currentSeed)}`
          console.log(info)
          showNotification(info, '#88aaff')
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
  const existing = document.getElementById('fish-notification')
  if (existing) existing.remove()
  
  const notification = document.createElement('div')
  notification.id = 'fish-notification'
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
  
  if (keys.w) velocity.add(forward)
  if (keys.s) velocity.sub(forward)
  if (keys.d) velocity.add(right)
  if (keys.a) velocity.sub(right)
  if (keys.space) velocity.add(up)
  if (keys.shift) velocity.sub(up)
  
  if (velocity.length() > 0) {
    velocity.normalize()
    
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
  }
  
  player.position.add(velocity.multiplyScalar(moveSpeed * delta))
}