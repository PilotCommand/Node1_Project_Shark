/**
 * controls.js - Input handling and game controls
 * 
 * Handles keyboard/mouse input and delegates movement to Swimming.js
 * 
 * Controls:
 *   WASD        - Swim direction
 *   Space       - Swim up
 *   Shift       - Swim down
 *   Alt         - Sprint (hold)
 *   Ctrl        - Slow/precise mode (hold)
 *   Q           - Dash burst
 *   
 *   R           - Mutate creature (same species)
 *   N           - Next species
 *   B           - Previous species
 *   M           - Regenerate map
 *   P           - Toggle collision wireframes
 *   F           - Debug info
 */

import { getPlayer } from './player.js'
import { 
  regeneratePlayerCreature, 
  cyclePlayerClass,
  cyclePreviousClass,
  getCurrentIndex,
  getCreatureCatalog,
  toggleWireframe,
  getCurrentType,
  getCurrentClass,
  getCurrentCreature,
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
  setSprinting,
  setSlowMode,
  updateSwimming,
  triggerDash,
  autoApplyPreset,
  debugSwimming,
} from './Swimming.js'

// ============================================================================
// INPUT STATE
// ============================================================================

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Rebuild player physics body and update swimming preset
 */
function rebuildPlayerPhysics() {
  const player = getPlayer()
  if (!player) return
  
  // Update swimming preset for new creature
  const creatureType = getCurrentType()
  const creatureClass = getCurrentClass()
  const creature = getCurrentCreature()
  const traits = creature?.traits || {}
  
  if (creatureType && creatureClass) {
    const preset = autoApplyPreset(creatureType, creatureClass, traits)
    console.log(`[Controls] Applied swim preset: ${preset}`)
  }
  
  // Rebuild physics body
  if (isPhysicsReady()) {
    removePlayerBody()
    createPlayerBody()
    console.log('[Controls] Rebuilt player physics body')
  }
}

/**
 * Rebuild terrain mesh and physics after map regeneration
 */
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

/**
 * Show on-screen notification
 */
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
  // Initialize swimming system
  initSwimming()
  
  // Keyboard down events
  window.addEventListener('keydown', (e) => {
    switch(e.code) {
      // Movement keys (handled in updateMovement)
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
      
      // Sprint (Alt)
      case 'AltLeft':
        setSprinting(true)
        e.preventDefault()
        break
      
      // Slow mode (Ctrl)
      case 'ControlLeft':
      case 'ControlRight':
        setSlowMode(true)
        break
      
      // Q = Dash
      case 'KeyQ':
        if (triggerDash()) {
          showNotification('Dash!', '#00ffff')
        }
        break
      
      // M = Regenerate Map
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
        break
    }
  })
  
  // Keyboard up events
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
      case 'AltLeft':
        setSprinting(false)
        break
      case 'ControlLeft':
      case 'ControlRight':
        setSlowMode(false)
        break
    }
  })
}

// ============================================================================
// UPDATE (called every frame from main.js)
// ============================================================================

export function updateMovement(delta) {
  // Convert key states to directional input (-1 to 1)
  const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0)
  const right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0)
  const up = (keys.space ? 1 : 0) - (keys.shift ? 1 : 0)
  
  // Pass to swimming system
  setSwimInput(forward, right, up)
  
  // Update swimming (handles physics or direct movement)
  updateSwimming(delta)
}