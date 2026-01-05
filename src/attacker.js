/**
 * attacker.js - Attacker Ability (Predator Vision)
 * 
 * Hold Q to activate predator vision:
 *   - World fades to navy blue
 *   - Lighting dims
 *   - Creatures glow with threat colors:
 *     - RED: Can eat you (larger)
 *     - GREEN: You can eat (smaller)
 *     - YELLOW: Similar size (risky)
 *   - Smooth fade in/out transitions
 * 
 * PERFORMANCE: Scene is only traversed ONCE on activation.
 * Updates iterate over cached references only.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { Feeding } from './Feeding.js'
import { FishAdder } from './FishAdder.js'
import { MeshRegistry, Category } from './MeshRegistry.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Vision colors (matching radar convention from HUD)
  colors: {
    edible: new THREE.Color(0x00ff64),    // Green - you can eat it
    danger: new THREE.Color(0xff5050),    // Red - it can eat you
    similar: new THREE.Color(0xffff00),   // Yellow - similar size
  },
  
  // Navy blue world tint
  world: {
    targetColor: new THREE.Color(0x0a1628),  // Navy blue
    colorMix: 0.7,                            // 70% navy, 30% original (darkened)
  },
  
  // Volume thresholds (same as HUD radar)
  volumeThresholds: {
    edibleRatio: 0.8,   // NPC volume < player * 0.8 = edible
    dangerRatio: 1.2,   // NPC volume > player * 1.2 = danger
  },
  
  // Lighting in predator mode (multipliers of original)
  lighting: {
    intensityMult: 0.15,  // Dim to 15% of original
  },
  
  // Fog in predator mode
  fog: {
    color: new THREE.Color(0x0a1225),  // Navy fog
    densityMult: 1.5,                   // Slightly thicker
  },
  
  // Creature glow
  creatureEmissive: 0.5,
  
  // Transition timing
  fadeInSpeed: 2.5,
  fadeOutSpeed: 3.5,
  
  // Detection range
  detectionRange: 250,
  
  // NPC lookup refresh interval (seconds)
  npcRefreshInterval: 0.25,
}

// ============================================================================
// STATE
// ============================================================================

let sceneRef = null

// State: 'inactive' | 'fading_in' | 'active' | 'fading_out'
let state = 'inactive'
let blendValue = 0

// Cached mesh data (populated once on activation)
// meshUuid -> { mesh, originalColors: [{color, emissive, emissiveIntensity}], isNPC, npcVolume }
const meshCache = new Map()

// Cached light data
// lightUuid -> { light, originalIntensity, originalColor, originalGroundColor }
const lightCache = new Map()

// Original fog state
let originalFog = null

// NPC root meshes for volume lookup
const npcRoots = new Map()  // meshUuid -> volume

// Timer for NPC refresh
let npcRefreshTimer = 0

// Player reference (cached)
let playerRef = null
let playerVolume = 1

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

function lerpColor(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
  return out
}

function lerp(a, b, t) {
  return a + (b - a) * t
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

function getNavyBlendedColor(originalColor, tempColor) {
  // Darken original first, then blend with navy
  const darkened = tempColor.copy(originalColor).multiplyScalar(0.3)
  // Mix with navy blue
  darkened.r = darkened.r * (1 - CONFIG.world.colorMix) + CONFIG.world.targetColor.r * CONFIG.world.colorMix
  darkened.g = darkened.g * (1 - CONFIG.world.colorMix) + CONFIG.world.targetColor.g * CONFIG.world.colorMix
  darkened.b = darkened.b * (1 - CONFIG.world.colorMix) + CONFIG.world.targetColor.b * CONFIG.world.colorMix
  return darkened
}

function getThreatColor(npcVol) {
  const lowThreshold = playerVolume * CONFIG.volumeThresholds.edibleRatio
  const highThreshold = playerVolume * CONFIG.volumeThresholds.dangerRatio
  
  if (npcVol < lowThreshold) return CONFIG.colors.edible
  if (npcVol > highThreshold) return CONFIG.colors.danger
  return CONFIG.colors.similar
}

// ============================================================================
// NPC LOOKUP (called periodically, not every frame)
// ============================================================================

function refreshNPCLookup() {
  npcRoots.clear()
  
  if (!playerRef) return
  
  const nearbyNPCs = FishAdder.getNearbyNPCs(playerRef.position, CONFIG.detectionRange)
  if (nearbyNPCs) {
    for (let i = 0; i < nearbyNPCs.length; i++) {
      const npc = nearbyNPCs[i]
      if (npc.mesh) {
        npcRoots.set(npc.mesh.uuid, npc.visualVolume || 1)
      }
    }
  }
  
  // Also MeshRegistry NPCs
  const regNPCs = MeshRegistry.getByCategory(Category.NPC)
  for (let i = 0; i < regNPCs.length; i++) {
    const entity = regNPCs[i]
    if (entity.mesh && !npcRoots.has(entity.mesh.uuid)) {
      const vol = entity.metadata?.visualVolume || entity.metadata?.capsuleParams?.volume || 1
      npcRoots.set(entity.mesh.uuid, vol)
    }
  }
}

function getNPCVolume(mesh) {
  // Check if this mesh or any parent is an NPC root
  if (npcRoots.has(mesh.uuid)) return npcRoots.get(mesh.uuid)
  
  let p = mesh.parent
  while (p) {
    if (npcRoots.has(p.uuid)) return npcRoots.get(p.uuid)
    p = p.parent
  }
  return null
}

// ============================================================================
// CACHE BUILDING (called ONCE on activation)
// ============================================================================

function buildCache() {
  meshCache.clear()
  lightCache.clear()
  originalFog = null
  
  playerRef = getPlayer()
  if (!playerRef) return
  
  playerVolume = Feeding.getPlayerVisualVolume()
  
  // Build NPC lookup first
  refreshNPCLookup()
  
  // Store fog
  if (sceneRef.fog) {
    originalFog = {
      color: sceneRef.fog.color.clone(),
      density: sceneRef.fog.density,
    }
  }
  
  // Single scene traversal
  sceneRef.traverse((child) => {
    // Lights
    if (child.isLight) {
      lightCache.set(child.uuid, {
        light: child,
        originalIntensity: child.intensity,
        originalColor: child.color ? child.color.clone() : null,
        originalGroundColor: child.groundColor ? child.groundColor.clone() : null,
      })
      return
    }
    
    // Meshes
    if (!child.isMesh || !child.material) return
    if (isPlayerMesh(child)) return
    
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const originalColors = []
    
    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i]
      if (!mat) {
        originalColors.push(null)
        continue
      }
      originalColors.push({
        color: mat.color ? mat.color.clone() : null,
        emissive: mat.emissive ? mat.emissive.clone() : null,
        emissiveIntensity: mat.emissiveIntensity || 0,
      })
    }
    
    const npcVol = getNPCVolume(child)
    
    meshCache.set(child.uuid, {
      mesh: child,
      originalColors,
      isNPC: npcVol !== null,
      npcVolume: npcVol,
    })
  })
}

// ============================================================================
// APPLY BLEND (iterates cached refs only - fast!)
// ============================================================================

const _tempColor = new THREE.Color()
const _tempColor2 = new THREE.Color()

function applyBlend(t) {
  // Update player volume (cheap)
  playerVolume = Feeding.getPlayerVisualVolume()
  
  // Apply to all cached meshes
  for (const [uuid, data] of meshCache) {
    const { mesh, originalColors, isNPC, npcVolume } = data
    if (!mesh.material) continue
    
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    
    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i]
      const orig = originalColors[i]
      if (!mat || !orig) continue
      
      if (isNPC) {
        // NPC: blend to threat color
        const threatColor = getThreatColor(npcVolume)
        
        if (mat.color && orig.color) {
          lerpColor(mat.color, orig.color, threatColor, t)
        }
        if (mat.emissive !== undefined) {
          const origE = orig.emissive || _tempColor.setRGB(0, 0, 0)
          lerpColor(mat.emissive, origE, threatColor, t)
          mat.emissiveIntensity = lerp(orig.emissiveIntensity, CONFIG.creatureEmissive, t)
        }
      } else {
        // World: blend to navy blue
        if (mat.color && orig.color) {
          getNavyBlendedColor(orig.color, _tempColor2)
          lerpColor(mat.color, orig.color, _tempColor2, t)
        }
        if (mat.emissive !== undefined && orig.emissive) {
          getNavyBlendedColor(orig.emissive, _tempColor2)
          lerpColor(mat.emissive, orig.emissive, _tempColor2, t)
        }
      }
    }
  }
  
  // Apply to lights
  for (const [uuid, data] of lightCache) {
    const { light, originalIntensity, originalColor, originalGroundColor } = data
    
    const targetIntensity = originalIntensity * CONFIG.lighting.intensityMult
    light.intensity = lerp(originalIntensity, targetIntensity, t)
    
    if (originalColor && light.color) {
      getNavyBlendedColor(originalColor, _tempColor)
      lerpColor(light.color, originalColor, _tempColor, t)
    }
    
    if (originalGroundColor && light.groundColor) {
      getNavyBlendedColor(originalGroundColor, _tempColor)
      lerpColor(light.groundColor, originalGroundColor, _tempColor, t)
    }
  }
  
  // Apply to fog
  if (sceneRef.fog && originalFog) {
    lerpColor(sceneRef.fog.color, originalFog.color, CONFIG.fog.color, t)
    sceneRef.fog.density = lerp(originalFog.density, originalFog.density * CONFIG.fog.densityMult, t)
  }
}

// ============================================================================
// RESTORE (called once when fade out completes)
// ============================================================================

function restoreAll() {
  // Restore meshes
  for (const [uuid, data] of meshCache) {
    const { mesh, originalColors } = data
    if (!mesh.material) continue
    
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    
    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i]
      const orig = originalColors[i]
      if (!mat || !orig) continue
      
      if (orig.color && mat.color) mat.color.copy(orig.color)
      if (orig.emissive && mat.emissive) mat.emissive.copy(orig.emissive)
      if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = orig.emissiveIntensity
    }
  }
  
  // Restore lights
  for (const [uuid, data] of lightCache) {
    const { light, originalIntensity, originalColor, originalGroundColor } = data
    light.intensity = originalIntensity
    if (originalColor && light.color) light.color.copy(originalColor)
    if (originalGroundColor && light.groundColor) light.groundColor.copy(originalGroundColor)
  }
  
  // Restore fog
  if (sceneRef.fog && originalFog) {
    sceneRef.fog.color.copy(originalFog.color)
    sceneRef.fog.density = originalFog.density
  }
  
  // Clear caches
  meshCache.clear()
  lightCache.clear()
  npcRoots.clear()
  originalFog = null
  
  console.log('[Attacker] Vision restored')
}

// ============================================================================
// STATE CONTROL
// ============================================================================

function startActivation() {
  if (!sceneRef) return
  if (state === 'active' || state === 'fading_in') return
  
  state = 'fading_in'
  npcRefreshTimer = 0
  
  // Build cache once
  buildCache()
  
  console.log('[Attacker] Fading in... (' + meshCache.size + ' meshes cached)')
}

function startDeactivation() {
  if (state === 'inactive' || state === 'fading_out') return
  state = 'fading_out'
  console.log('[Attacker] Fading out...')
}

function updateVision(delta) {
  if (state === 'inactive') return
  
  // Update blend
  if (state === 'fading_in') {
    blendValue += delta * CONFIG.fadeInSpeed
    if (blendValue >= 1) {
      blendValue = 1
      state = 'active'
      console.log('[Attacker] Active')
    }
  } else if (state === 'fading_out') {
    blendValue -= delta * CONFIG.fadeOutSpeed
    if (blendValue <= 0) {
      blendValue = 0
      state = 'inactive'
      restoreAll()
      return
    }
  }
  
  // Periodically refresh NPC lookup (not every frame)
  npcRefreshTimer += delta
  if (npcRefreshTimer >= CONFIG.npcRefreshInterval) {
    npcRefreshTimer = 0
    refreshNPCLookup()
    
    // Update NPC flags in mesh cache
    for (const [uuid, data] of meshCache) {
      const vol = getNPCVolume(data.mesh)
      data.isNPC = vol !== null
      data.npcVolume = vol
    }
  }
  
  // Apply blend (fast - no traversal)
  applyBlend(blendValue)
}

// ============================================================================
// DEBUG
// ============================================================================

export function debugAttacker() {
  console.group('[Attacker] Debug')
  console.log('State:', state)
  console.log('Blend:', (blendValue * 100).toFixed(1) + '%')
  console.log('Cached Meshes:', meshCache.size)
  console.log('Cached Lights:', lightCache.size)
  console.log('NPC Roots:', npcRoots.size)
  console.log('Player Volume:', playerVolume.toFixed(2))
  console.groupEnd()
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Attacker',
  description: 'Hold Q for predator vision',
  
  onActivate: () => startActivation(),
  onDeactivate: () => startDeactivation(),
  onUpdate: (delta) => updateVision(delta),
  onPassiveUpdate: (delta) => {
    if (state === 'fading_out') updateVision(delta)
  },
}

// ============================================================================
// CONSOLE ACCESS
// ============================================================================

if (typeof window !== 'undefined') {
  window.Attacker = { CONFIG, debugAttacker, getState: () => state, getBlend: () => blendValue }
}