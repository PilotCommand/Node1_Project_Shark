import * as THREE from 'three'
import { getPlayer, getFishParts } from './player.js'

// Create camera
export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

// Mouse sensitivity
const sensitivity = 0.002

// Rotation values
let yaw = 0
let pitch = 0

let isLocked = false

// Camera mode: 'first-person' or 'orbit'
let cameraMode = 'first-person'
let orbitDistance = 0
const minOrbitDistance = 3
const maxOrbitDistance = 50

export function initCameraControls(domElement) {
  // Click to lock pointer
  domElement.addEventListener('click', () => {
    domElement.requestPointerLock()
  })
  
  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement !== null
    console.log(isLocked ? 'Pointer locked' : 'Pointer unlocked')
  })
  
  // Mouse movement - always track pitch consistently
  document.addEventListener('mousemove', (e) => {
    if (!isLocked) return
    
    yaw -= e.movementX * sensitivity
    pitch -= e.movementY * sensitivity
    
    // Clamp pitch to avoid flipping
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
  })
  
  // Scroll to zoom - works in both modes
  document.addEventListener('wheel', (e) => {
    orbitDistance += e.deltaY * 0.05
    orbitDistance = Math.max(0, Math.min(maxOrbitDistance, orbitDistance))
    
    // Switch modes based on orbit distance
    if (orbitDistance <= minOrbitDistance) {
      cameraMode = 'first-person'
    } else {
      cameraMode = 'orbit'
    }
  })
}

export function updateCamera() {
  const player = getPlayer()
  if (!player) return
  
  const fishParts = getFishParts()
  
  // Toggle fish visibility based on camera mode
  const showFish = cameraMode === 'orbit'
  if (fishParts) {
    Object.values(fishParts).forEach(part => {
      part.visible = showFish
    })
  }
  
  if (cameraMode === 'first-person') {
    // First person: camera at player position
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch
    camera.position.copy(player.position)
    
    // Rotate player mesh to match camera yaw and pitch
    player.rotation.y = yaw
    player.rotation.x = pitch
  } else {
    // Orbit mode: camera orbits around player
    // Use -pitch to invert vertical orbit direction while keeping pitch value consistent
    const offsetX = Math.sin(yaw) * Math.cos(-pitch) * orbitDistance
    const offsetY = Math.sin(-pitch) * orbitDistance
    const offsetZ = Math.cos(yaw) * Math.cos(-pitch) * orbitDistance
    
    camera.position.set(
      player.position.x + offsetX,
      player.position.y + offsetY,
      player.position.z + offsetZ
    )
    
    // Look at player
    camera.lookAt(player.position)
  }
}

export function getYaw() {
  return yaw
}

export function getPitch() {
  return pitch
}

export function isPointerLocked() {
  return isLocked
}

export function getCameraMode() {
  return cameraMode
}