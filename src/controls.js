/**
 * controls.js - Input handling
 * 
 * Controls:
 *   WASD        - Swim
 *   Space       - Up
 *   Shift       - Down
 *   Q (hold)    - Extra ability (see ExtraControls.js)
 *   
 *   R           - Decrease scale
 *   T           - Increase scale
 *   G           - Mutate creature (new random of same type)
 *   N / B       - Next / Previous species
 *   Z           - Cycle variant (e.g., Yellowfin ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Bluefin)
 *   M           - New map
 *   P           - Toggle debug overlays (wireframes + volume labels)
 *   V           - Toggle debug viz (spawn grid + fish paths)
 *   F           - Debug
 */

import { getPlayer } from './player.js'
import { 
  regeneratePlayerCreature, 
  cyclePlayerClass,
  cyclePreviousClass,
  cycleVariant,
  getCurrentIndex,
  getCreatureCatalog,
  toggleWireframe,
  decreasePlayerScale,
  increasePlayerScale,
  debugPlayerScale,
  getCurrentVariantCount,
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
  toggleStaticColliderWireframe,
  createWorldBoundaryCollider,
  removeWorldBoundaryCollider,
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
  getActiveAbilityName,
  debugExtra,
} from './ExtraControls.js'
import { SpawnFactory } from './SpawnFactory.js'
import { FishAdder } from './FishAdder.js'

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

// Track shift state for V key combo
let shiftHeld = false

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
    removeWorldBoundaryCollider()
  }
  
  const meshData = rebuildTerrainMesh()
  
  if (meshData) {
    console.log(`[Controls] Rebuilt terrain mesh: ${meshData.triangleCount} triangles`)
    
    if (isPhysicsReady()) {
      buildTerrainCollider()
      createWorldBoundaryCollider({ radius: 500 })
      console.log('[Controls] Rebuilt terrain physics collider + world boundary')
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
        shiftHeld = true
        break
      
      // Q = Extra ability (hold)
      case 'KeyQ':
        if (!keys.q) {
          keys.q = true
          activateExtra()
          // Only boost speed when sprinter ability is active
          if (getActiveAbilityName() === 'sprinter') {
            setBoosting(true)
          }
        }
        break
      
      // M = New Map
      case 'KeyM':
        // Check if visualization was on before map change
        const wasVisualized = SpawnFactory.isVisualized
        
        const newSeed = regenerateMap()
        if (newSeed !== null) {
          rebuildTerrainPhysics()
          
          // Reset SpawnFactory when map changes
          SpawnFactory.reset()
          
          // If visualization was on, re-analyze and re-visualize the new map
          if (wasVisualized) {
            SpawnFactory.analyzePlayableSpace()
            SpawnFactory.visualize()
          }
          
          showNotification(
            `New terrain | Seed: ${newSeed.toString(16).toUpperCase().padStart(8, '0')}`,
            '#00ffff'
          )
        }
        break
      
      // R = Decrease scale
      case 'KeyR':
        const scaleDownResult = decreasePlayerScale()
        if (scaleDownResult) {
          rebuildPlayerPhysics()
          showNotification(
            `Scale: ${scaleDownResult.scalePercent.toFixed(0)}% | Vol: ${scaleDownResult.volume.toFixed(2)} mÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³`,
            '#ff8888'
          )
        }
        break
      
      // T = Increase scale
      case 'KeyT':
        const scaleUpResult = increasePlayerScale()
        if (scaleUpResult) {
          rebuildPlayerPhysics()
          showNotification(
            `Scale: ${scaleUpResult.scalePercent.toFixed(0)}% | Vol: ${scaleUpResult.volume.toFixed(2)} mÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³`,
            '#88ff88'
          )
        }
        break
      
      // G = Mutate creature (Generate new random of same type)
      case 'KeyG':
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
      
      // Z = Cycle variant (e.g., Yellowfin Tuna ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Bluefin Tuna)
      case 'KeyZ':
        const variantResult = cycleVariant()
        if (variantResult.hasVariants) {
          // Variant changes colors, need to rebuild physics
          if (variantResult.regenerated) {
            rebuildPlayerPhysics()
          }
          showNotification(
            `${variantResult.displayName} [${variantResult.variantIndex + 1}/${variantResult.variantCount}]`,
            '#88ddff'
          )
        } else {
          showNotification(
            `${variantResult.variantName} (no variants)`,
            '#888888'
          )
        }
        break
      
      // P = Toggle wireframes + volume labels
      case 'KeyP':
        const wireframeOn = toggleWireframe()
        toggleTerrainWireframe()
        toggleStaticColliderWireframe()
        FishAdder.toggleLabels()
        showNotification(
          `Debug overlays: ${wireframeOn ? 'ON' : 'OFF'}`,
          wireframeOn ? '#00ff00' : '#ff6600'
        )
        break
      
      // V = Toggle spawn visualization + fish path ribbons
      // Shift+V = Show occupied points too (debug mode)
      case 'KeyV':
        const showOccupied = shiftHeld
        const vizOn = SpawnFactory.toggleVisualization({ showOccupied })
        
        // Also toggle path ribbons with spawn viz
        FishAdder.setPathRibbonsVisible(vizOn)
        
        if (vizOn) {
          const stats = SpawnFactory.stats
          if (stats) {
            showNotification(
              `Debug viz ON | ${stats.playable} grid points + fish paths${showOccupied ? ' +occupied' : ''}`,
              '#ff88ff'
            )
          } else {
            showNotification('Debug visualization ON (grid + paths)', '#ff88ff')
          }
        } else {
          showNotification('Debug visualization OFF', '#888888')
        }
        break
      
      // F = Debug
      case 'KeyF':
        debugPhysics()
        debugSwimming()
        debugExtra()
        debugPlayerScale()
        SpawnFactory.debug()
        FishAdder.debugVolumes()
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
        shiftHeld = false
        break
      case 'KeyQ':
        keys.q = false
        deactivateExtra()
        // Only stop boosting if sprinter ability was active
        if (getActiveAbilityName() === 'sprinter') {
          setBoosting(false)
        }
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