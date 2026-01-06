/**
 * attacker.js - Attacker Ability (Predator Vision)
 * 
 * Hold Q to activate predator vision:
 *   - World fades to navy blue
 *   - Fish become SOLID GLOWING colors visible at any distance:
 *     - RED: Can eat you (larger)
 *     - GREEN: You can eat (smaller)  
 *     - YELLOW: Similar size (risky)
 * 
 * Fish are made fully emissive with fog disabled so they glow
 * through any distance/fog/darkness.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { Feeding } from './Feeding.js'
import { FishAdder } from './FishAdder.js'
import { MeshRegistry, Category } from './MeshRegistry.js'

// ============================================================================
// ⭐ CAPACITY CONFIG - EASY TO EDIT! ⭐
// ============================================================================

const CAPACITY_CONFIG = {
  max: 100,              // Maximum capacity
  depleteRate: 35,       // Units per second when active (holding Q)
  regenRate: 7,          // Units per second when inactive (5x slower than depletion)
  regenDelay: 1.0,       // Seconds before regen starts after releasing Q
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Threat colors - BRIGHT and SOLID
  colors: {
    edible: new THREE.Color(0x00ff00),    // Pure bright green
    danger: new THREE.Color(0xff0000),    // Pure bright red  
    similar: new THREE.Color(0xffff00),   // Pure bright yellow
  },
  
  // Navy blue world
  world: {
    targetColor: new THREE.Color(0x0a1628),
    colorMix: 0.7,
  },
  
  // Volume thresholds
  volumeThresholds: {
    edibleRatio: 0.8,
    dangerRatio: 1.2,
  },
  
  // Lighting
  lighting: {
    intensityMult: 0.15,
  },
  
  // Fog
  fog: {
    color: new THREE.Color(0x0a1225),
    densityMult: 1.5,
  },
  
  // NPC glow settings - make them REALLY visible through any fog
  npc: {
    emissiveIntensity: 5.0,  // Extremely strong glow to cut through fog
    fogDisableThreshold: 0.3,  // Disable fog when blend passes this point (0-1)
  },
  
  // Transition
  fadeInSpeed: 2.5,
  fadeOutSpeed: 3.5,
  
  detectionRange: 500,  // Large range to catch all fish
  npcRefreshInterval: 0.2,  // Check for new fish frequently
}

// ============================================================================
// STATE
// ============================================================================

let sceneRef = null
let state = 'inactive'
let blendValue = 0

// Cached world meshes: uuid -> { mesh, origColors: [{color, emissive, emissiveIntensity}] }
const worldCache = new Map()

// Cached NPC meshes: uuid -> { mesh, origColors: [{color, emissive, emissiveIntensity, fog}], volume }
const npcCache = new Map()

// Cached lights: uuid -> { light, origIntensity, origColor, origGroundColor }
const lightCache = new Map()

let originalFog = null
let playerRef = null
let playerVolume = 1
let npcRefreshTimer = 0

// NPC root mesh -> volume lookup
const npcRoots = new Map()

// ============================================================================
// INITIALIZATION
// ============================================================================

export function init(scene) {
  sceneRef = scene
  console.log('[Attacker] Initialized')
}

// ============================================================================
// HELPERS
// ============================================================================

const _tempColor = new THREE.Color()

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpColor(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
}

function isPlayerMesh(mesh) {
  if (!playerRef) return false
  if (mesh === playerRef) return true
  let p = mesh.parent
  while (p) {
    if (p === playerRef) return true
    p = p.parent
  }
  return false
}

function getThreatColor(npcVol) {
  const low = playerVolume * CONFIG.volumeThresholds.edibleRatio
  const high = playerVolume * CONFIG.volumeThresholds.dangerRatio
  
  if (npcVol < low) return CONFIG.colors.edible
  if (npcVol > high) return CONFIG.colors.danger
  return CONFIG.colors.similar
}

function getNavyColor(original) {
  const darkened = _tempColor.copy(original).multiplyScalar(0.3)
  darkened.lerp(CONFIG.world.targetColor, CONFIG.world.colorMix)
  return darkened
}

// ============================================================================
// NPC LOOKUP
// ============================================================================

function refreshNPCRoots() {
  npcRoots.clear()
  
  if (!playerRef) return
  
  const nearby = FishAdder.getNearbyNPCs(playerRef.position, CONFIG.detectionRange)
  if (nearby) {
    for (let i = 0; i < nearby.length; i++) {
      const npc = nearby[i]
      if (npc.mesh) {
        npcRoots.set(npc.mesh.uuid, npc.visualVolume || 1)
      }
    }
  }
  
  const regNPCs = MeshRegistry.getByCategory(Category.NPC)
  for (let i = 0; i < regNPCs.length; i++) {
    const e = regNPCs[i]
    if (e.mesh && !npcRoots.has(e.mesh.uuid)) {
      npcRoots.set(e.mesh.uuid, e.metadata?.visualVolume || 1)
    }
  }
}

function getNPCVolume(mesh) {
  if (npcRoots.has(mesh.uuid)) return npcRoots.get(mesh.uuid)
  let p = mesh.parent
  while (p) {
    if (npcRoots.has(p.uuid)) return npcRoots.get(p.uuid)
    p = p.parent
  }
  return null
}

// ============================================================================
// CACHE BUILDING (once on activation)
// ============================================================================

function buildCache() {
  worldCache.clear()
  npcCache.clear()
  lightCache.clear()
  originalFog = null
  
  playerRef = getPlayer()
  if (!playerRef) return
  
  playerVolume = Feeding.getPlayerVisualVolume()
  refreshNPCRoots()
  
  // Store fog
  if (sceneRef.fog) {
    originalFog = {
      color: sceneRef.fog.color.clone(),
      density: sceneRef.fog.density,
    }
  }
  
  // Single traversal
  sceneRef.traverse((child) => {
    // Lights
    if (child.isLight) {
      lightCache.set(child.uuid, {
        light: child,
        origIntensity: child.intensity,
        origColor: child.color?.clone() || null,
        origGroundColor: child.groundColor?.clone() || null,
      })
      return
    }
    
    // Meshes
    if (!child.isMesh || !child.material) return
    if (isPlayerMesh(child)) return
    
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    const origColors = []
    
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]
      if (!m) { origColors.push(null); continue }
      
      origColors.push({
        color: m.color?.clone() || null,
        emissive: m.emissive?.clone() || null,
        emissiveIntensity: m.emissiveIntensity || 0,
        fog: m.fog !== undefined ? m.fog : true,
      })
    }
    
    const npcVol = getNPCVolume(child)
    
    if (npcVol !== null) {
      // It's an NPC - store in npcCache (fog will be disabled gradually in applyToNPCs)
      npcCache.set(child.uuid, {
        mesh: child,
        origColors,
        volume: npcVol,
        fogDisabled: false,  // Track fog state
      })
    } else {
      // World geometry
      worldCache.set(child.uuid, {
        mesh: child,
        origColors,
      })
    }
  })
  
  console.log(`[Attacker] Cached ${worldCache.size} world, ${npcCache.size} NPCs, ${lightCache.size} lights`)
  
  // Debug: log some NPC info
  if (npcCache.size > 0) {
    let sample = 0
    for (const [uuid, data] of npcCache) {
      if (sample++ < 3) {
        console.log(`  NPC sample: vol=${data.volume.toFixed(2)}`)
      }
    }
  } else {
    console.warn('[Attacker] WARNING: No NPCs detected! Check getNPCVolume logic')
  }
}

// ============================================================================
// APPLY EFFECTS
// ============================================================================

function applyToWorld(t) {
  for (const [uuid, data] of worldCache) {
    const { mesh, origColors } = data
    // Defensive checks
    if (!mesh || !mesh.material || !mesh.parent) continue
    
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]
      const o = origColors[i]
      if (!m || !o) continue
      
      if (m.color && o.color) {
        const navy = getNavyColor(o.color)
        lerpColor(m.color, o.color, navy, t)
      }
      if (m.emissive && o.emissive) {
        const navy = getNavyColor(o.emissive)
        lerpColor(m.emissive, o.emissive, navy, t)
      }
    }
  }
}

function applyToNPCs(t) {
  playerVolume = Feeding.getPlayerVisualVolume()
  
  for (const [uuid, data] of npcCache) {
    const { mesh, origColors, volume } = data
    // Defensive checks
    if (!mesh || !mesh.material || !mesh.parent) continue
    
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const threatColor = getThreatColor(volume)
    
    // Handle fog toggle (once per NPC, affects all materials)
    const shouldDisableFog = t > CONFIG.npc.fogDisableThreshold
    if (shouldDisableFog && !data.fogDisabled) {
      // Disable fog on all materials
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i]
        if (m && m.fog !== undefined) {
          m.fog = false
          m.needsUpdate = true
          if (m.version !== undefined) m.version++
        }
      }
      data.fogDisabled = true
    } else if (!shouldDisableFog && data.fogDisabled) {
      // Re-enable fog on all materials
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i]
        if (m && m.fog !== undefined) {
          m.fog = true
          m.needsUpdate = true
          if (m.version !== undefined) m.version++
        }
      }
      data.fogDisabled = false
    }
    
    // Apply colors to all materials
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]
      const o = origColors[i]
      if (!m || !o) continue
      
      // Lerp color toward threat color
      if (m.color && o.color) {
        lerpColor(m.color, o.color, threatColor, t)
      }
      
      // Set emissive to threat color with strong intensity - makes them GLOW
      if (m.emissive !== undefined) {
        const origE = o.emissive || _tempColor.setRGB(0, 0, 0)
        lerpColor(m.emissive, origE, threatColor, t)
        m.emissiveIntensity = lerp(o.emissiveIntensity, CONFIG.npc.emissiveIntensity, t)
      }
    }
  }
}

function applyToLights(t) {
  for (const [uuid, data] of lightCache) {
    const { light, origIntensity, origColor, origGroundColor } = data
    // Defensive check
    if (!light || !light.parent) continue
    
    light.intensity = lerp(origIntensity, origIntensity * CONFIG.lighting.intensityMult, t)
    
    if (origColor && light.color) {
      const navy = getNavyColor(origColor)
      lerpColor(light.color, origColor, navy, t)
    }
    if (origGroundColor && light.groundColor) {
      const navy = getNavyColor(origGroundColor)
      lerpColor(light.groundColor, origGroundColor, navy, t)
    }
  }
}

function applyToFog(t) {
  if (!sceneRef.fog || !originalFog) return
  lerpColor(sceneRef.fog.color, originalFog.color, CONFIG.fog.color, t)
  sceneRef.fog.density = lerp(originalFog.density, originalFog.density * CONFIG.fog.densityMult, t)
}

// ============================================================================
// RESTORE
// ============================================================================

function restoreAll() {
  console.log('[Attacker] Restoring all materials...')
  
  // Restore world
  for (const [uuid, data] of worldCache) {
    const { mesh, origColors } = data
    if (!mesh || !mesh.material) continue
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i], o = origColors[i]
      if (!m || !o) continue
      if (o.color && m.color) m.color.copy(o.color)
      if (o.emissive && m.emissive) m.emissive.copy(o.emissive)
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = o.emissiveIntensity
    }
  }
  
  // Restore NPCs
  let fogRestoredCount = 0
  for (const [uuid, data] of npcCache) {
    const { mesh, origColors } = data
    if (!mesh || !mesh.material) continue
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i], o = origColors[i]
      if (!m || !o) continue
      if (o.color && m.color) m.color.copy(o.color)
      if (o.emissive && m.emissive) m.emissive.copy(o.emissive)
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = o.emissiveIntensity
      // Force fog back to true (original default)
      m.fog = true
      m.needsUpdate = true
      if (m.version !== undefined) m.version++
      fogRestoredCount++
    }
  }
  console.log(`[Attacker] Restored fog on ${fogRestoredCount} NPC materials`)
  
  // Restore lights
  for (const [uuid, data] of lightCache) {
    const { light, origIntensity, origColor, origGroundColor } = data
    if (!light) continue
    light.intensity = origIntensity
    if (origColor && light.color) light.color.copy(origColor)
    if (origGroundColor && light.groundColor) light.groundColor.copy(origGroundColor)
  }
  
  // Restore fog
  if (sceneRef && sceneRef.fog && originalFog) {
    sceneRef.fog.color.copy(originalFog.color)
    sceneRef.fog.density = originalFog.density
  }
  
  // Clear caches
  worldCache.clear()
  npcCache.clear()
  lightCache.clear()
  npcRoots.clear()
  originalFog = null
  
  // Reset state
  state = 'inactive'
  blendValue = 0
  
  console.log('[Attacker] Restored')
}

// ============================================================================
// UPDATE
// ============================================================================

function updateVision(delta) {
  if (state === 'inactive') return
  
  // Safety check - if caches are empty but we're not inactive, something went wrong
  if (worldCache.size === 0 && npcCache.size === 0 && state !== 'inactive') {
    console.warn('[Attacker] Caches empty but state is', state, '- forcing restore')
    restoreAll()
    return
  }
  
  // Update blend
  if (state === 'fading_in') {
    blendValue += delta * CONFIG.fadeInSpeed
    if (blendValue >= 1) {
      blendValue = 1
      state = 'active'
    }
  } else if (state === 'fading_out') {
    blendValue -= delta * CONFIG.fadeOutSpeed
    if (blendValue <= 0) {
      console.log('[Attacker] Fade out complete, calling restoreAll')
      restoreAll()  // This sets state='inactive' and blendValue=0
      return
    }
  }
  
  // Refresh NPC volumes periodically
  npcRefreshTimer += delta
  if (npcRefreshTimer >= CONFIG.npcRefreshInterval) {
    npcRefreshTimer = 0
    refreshNPCRoots()
    
    // Update volumes in cache
    for (const [uuid, data] of npcCache) {
      const vol = getNPCVolume(data.mesh)
      if (vol !== null) data.volume = vol
    }
  }
  
  // Apply all effects
  applyToWorld(blendValue)
  applyToNPCs(blendValue)
  applyToLights(blendValue)
  applyToFog(blendValue)
}

// Cooldown to prevent rapid re-activation after releasing Q
// Key release (deactivation) is always honored immediately
let lastStateChangeTime = 0
const STATE_CHANGE_COOLDOWN = 0.15  // 150ms minimum between activations

// ============================================================================
// STATE CONTROL
// ============================================================================

function startActivation() {
  if (!sceneRef) return
  
  const now = performance.now() / 1000
  
  // Cooldown check
  if (now - lastStateChangeTime < STATE_CHANGE_COOLDOWN) {
    return
  }
  
  // Already active or fading in - ignore
  if (state === 'active' || state === 'fading_in') return
  
  // If fading out, immediately restore first then start fresh
  if (state === 'fading_out') {
    console.log('[Attacker] Interrupted fade out - restoring first')
    restoreAll()
    // State is now 'inactive', blendValue is 0
  }
  
  lastStateChangeTime = now
  state = 'fading_in'
  blendValue = 0  // Always start from 0
  npcRefreshTimer = 0
  buildCache()
}

function startDeactivation() {
  // Always honor key release - no cooldown check here
  
  // Already inactive or fading out - ignore
  if (state === 'inactive' || state === 'fading_out') return
  
  // Update cooldown timer so rapid re-activation is prevented
  lastStateChangeTime = performance.now() / 1000
  
  // If fading in, just reverse direction (keep the cache)
  if (state === 'fading_in') {
    console.log('[Attacker] Reversing fade - now fading out from blend:', blendValue.toFixed(2))
    state = 'fading_out'
    return
  }
  
  // Was active, start fading out
  state = 'fading_out'
  console.log('[Attacker] Starting fade out, blendValue:', blendValue.toFixed(2))
}

// ============================================================================
// DEBUG
// ============================================================================

export function debugAttacker() {
  console.group('[Attacker] Debug')
  console.log('State:', state, '| Blend:', (blendValue * 100).toFixed(0) + '%')
  console.log('World meshes:', worldCache.size)
  console.log('NPC meshes:', npcCache.size)
  console.log('Player volume:', playerVolume.toFixed(2))
  console.groupEnd()
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  name: 'Attacker',
  description: 'Hold Q for predator vision',
  capacityMode: 'hold',  // Continuous drain while Q held
  capacityConfig: CAPACITY_CONFIG,  // Per-ability capacity settings
  onActivate: startActivation,
  onDeactivate: startDeactivation,
  onUpdate: updateVision,
  onPassiveUpdate: (delta) => { if (state === 'fading_out') updateVision(delta) },
}

if (typeof window !== 'undefined') {
  window.Attacker = { CONFIG, debugAttacker, getState: () => state, getBlend: () => blendValue }
}