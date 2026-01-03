/**
 * controls.js - Input handling
 * 
 * Controls:
 *   WASD        - Swim
 *   Space       - Up
 *   Shift       - Down
 *   Q (hold)    - Extra ability (see ExtraControls.js)
 *   
 *   R           - Mutate creature
 *   N / B       - Next / Previous species
 *   M           - New map
 *   P           - Toggle wireframes
 *   F           - Debug
 */

import { getPlayer } from './player.js'
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
  rebuildTerrainMesh,
  disposeTerrainMesh,
} from './TerrainMesher.js'
import {
  isPhysicsReady,
  debugPhysics,
  removePlayerBody,
  createPlayerBody,
  removeTerrainCollider,
  buildTerrainCollider,
} from './Physics.js'
import {
  initSwimming,
  setSwimInput,
  setBoosting,
  updateSwimming,
  autoApplyPreset,
  debugSwimming,
} from './Swimming.js'
import {
  activateExtra,
  deactivateExtra,
  updateExtra,
  getActiveExtra,
  debugExtra,
} from './ExtraControls.js'

// ============================================================================
// STATE
// ============================================================================

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
  q: false,
}

// ============================================================================
// HELPERS
// ============================================================================

function rebuildPlayerPhysics() {
  const player = getPlayer()
  if (!player) return
  
  autoApplyPreset()
  
  if (isPhysicsReady()) {
    removePlayerBody()
    createPlayerBody()
    console.log('[Controls] Rebuilt player physics body')
  }
}

function rebuildTerrainPhysics() {
  disposeTerrainMesh()
  
  if (isPhysicsReady()) {
    removeTerrainCollider()
  }
  
  const meshData = rebuildTerrainMesh()
  
  if (meshData) {
    console.log(`[Controls] Rebuilt terrain mesh: ${meshData.triangleCount} triangles`)
    
    if (isPhysicsReady()) {
      buildTerrainCollider()
      console.log('[Controls] Rebuilt terrain physics collider')
    }
  }
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

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initControls() {
  initSwimming()
  
  window.addEventListener('keydown', (e) => {
    switch(e.code) {
      // Movement
      case 'KeyW': keys.w = true; break
      case 'KeyA': keys.a = true; break
      case 'KeyS': keys.s = true; break
      case 'KeyD': keys.d = true; break
      case 'Space': 
        keys.space = true
        e.preventDefault()
        break
      case 'ShiftLeft': 
      case 'ShiftRight': 
        keys.shift = true
        break
      
      // Q = Extra ability (hold)
      case 'KeyQ':
        if (!keys.q) {
          keys.q = true
          activateExtra()
          setBoosting(true)  // For boost extra
        }
        break
      
      // M = New Map
      case 'KeyM':
        const newSeed = regenerateMap()
        if (newSeed !== null) {
          rebuildTerrainPhysics()
          showNotification(
            `New terrain | Seed: ${newSeed.toString(16).toUpperCase().padStart(8, '0')}`,
            '#00ffff'
          )
        }
        break
      
      // R = Mutate creature
      case 'KeyR':
        const result = regeneratePlayerCreature()
        if (result) {
          rebuildPlayerPhysics()
          const size = result.traits?.length?.toFixed(1) || '?'
          const shortName = getCreatureShortName(result.creatureType, result.creatureClass)
          showNotification(
            `${shortName} | ${size}m | ${seedToString(result.seed)}`,
            '#00ff88'
          )
        }
        break
      
      // N = Next species
      case 'KeyN':
        const next = cyclePlayerClass()
        if (next) {
          rebuildPlayerPhysics()
          const displayName = getCreatureDisplayName(next.creatureType, next.creatureClass)
          const index = getCurrentIndex()
          const total = getCreatureCatalog().length
          showNotification(`${displayName} [${index + 1}/${total}]`, '#ffaa00')
        }
        break
      
      // B = Previous species
      case 'KeyB':
        const prev = cyclePreviousClass()
        if (prev) {
          rebuildPlayerPhysics()
          const displayName = getCreatureDisplayName(prev.creatureType, prev.creatureClass)
          const index = getCurrentIndex()
          const total = getCreatureCatalog().length
          showNotification(`${displayName} [${index + 1}/${total}]`, '#ffaa00')
        }
        break
      
      // P = Toggle wireframes
      case 'KeyP':
        const wireframeOn = toggleWireframe()
        toggleTerrainWireframe()
        showNotification(
          `Collision wireframes: ${wireframeOn ? 'ON' : 'OFF'}`,
          wireframeOn ? '#00ff00' : '#ff6600'
        )
        break
      
      // F = Debug
      case 'KeyF':
        debugPhysics()
        debugSwimming()
        debugExtra()
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
      case 'ShiftRight': 
        keys.shift = false
        break
      case 'KeyQ':
        keys.q = false
        deactivateExtra()
        setBoosting(false)  // For boost extra
        break
    }
  })
}

// ============================================================================
// UPDATE
// ============================================================================

export function updateMovement(delta) {
  const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0)
  const right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0)
  const up = (keys.space ? 1 : 0) - (keys.shift ? 1 : 0)
  
  setSwimInput(forward, right, up)
  updateSwimming(delta)
  updateExtra(delta)
}