/**
 * camper.js - Camouflage Ability
 * 
 * Press Q to scan nearby meshes and blend into the environment.
 * The fish changes color to match surrounding objects.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { MeshRegistry, Category } from './MeshRegistry.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CAMPER_CONFIG = {
  // Detection
  baseScanRadius: 4.2,      // Base radius (will scale with fish)
  maxSamples: 10,           // Max meshes to sample colors from
  
  // Color blending
  blendByDistance: true,    // Weight colors by distance (closer = stronger)
  minWeight: 0.1,           // Minimum weight for distant objects
  
  // Visual feedback
  transitionSpeed: 3.0,     // How fast to transition to new color (per second)
  
  // Categories to sample from (what counts as "environment")
  sampleCategories: [Category.MAP, Category.NPC],
  
  // Exclude these from sampling
  excludeCategories: [Category.PLAYER, Category.PROJECTILE, Category.EFFECT],
}

// ============================================================================
// STATE
// ============================================================================

let originalColors = new Map()  // Store original material colors for restoration
let targetColor = null          // Color we're blending towards
let currentBlend = 0            // 0 = original, 1 = camouflaged
let isActive = false
let lastSampledColors = []      // For debug display

// Visualization state
let sceneRef = null
let vizGroup = null             // Group containing all visualization objects
let lastSampledEntities = []    // Store entities for visualization
let vizOpacity = 0              // Current visualization opacity (0-1)
const VIZ_FADE_SPEED = 4.0      // How fast viz fades in/out per second

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Extract colors from a mesh (traverses all children)
 * @param {THREE.Object3D} mesh 
 * @returns {THREE.Color[]} Array of colors found
 */
function extractColorsFromMesh(mesh) {
  const colors = []
  
  mesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (const mat of materials) {
        if (mat.color && mat.color instanceof THREE.Color) {
          colors.push(mat.color.clone())
        }
      }
    }
  })
  
  return colors
}

/**
 * Blend multiple colors with optional distance weighting
 * @param {Array<{color: THREE.Color, distance: number}>} colorData 
 * @returns {THREE.Color}
 */
function blendColors(colorData) {
  if (colorData.length === 0) return new THREE.Color(0x808080) // Default gray
  if (colorData.length === 1) return colorData[0].color.clone()
  
  let totalWeight = 0
  let r = 0, g = 0, b = 0
  
  // Find max distance for normalization
  const maxDist = Math.max(...colorData.map(d => d.distance), 1)
  
  for (const { color, distance } of colorData) {
    // Weight by inverse distance (closer = heavier weight)
    let weight = 1
    if (CAMPER_CONFIG.blendByDistance) {
      weight = 1 - (distance / maxDist) * (1 - CAMPER_CONFIG.minWeight)
    }
    
    r += color.r * weight
    g += color.g * weight
    b += color.b * weight
    totalWeight += weight
  }
  
  return new THREE.Color(
    r / totalWeight,
    g / totalWeight,
    b / totalWeight
  )
}

/**
 * Store original colors of player mesh
 */
function storeOriginalColors(playerMesh) {
  originalColors.clear()
  
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        if (mat.color && mat.color instanceof THREE.Color) {
          const key = `${child.uuid}_${i}`
          originalColors.set(key, {
            child,
            materialIndex: i,
            color: mat.color.clone(),
          })
        }
      }
    }
  })
}

/**
 * Apply a color to all player materials (with blend factor)
 */
function applyColorToPlayer(playerMesh, newColor, blendFactor) {
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        if (mat.color && mat.color instanceof THREE.Color) {
          const key = `${child.uuid}_${i}`
          const original = originalColors.get(key)
          
          if (original) {
            // Lerp between original and target color
            mat.color.copy(original.color).lerp(newColor, blendFactor)
          }
        }
      }
    }
  })
}

/**
 * Restore original colors to player
 */
function restoreOriginalColors(playerMesh) {
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        if (mat.color) {
          const key = `${child.uuid}_${i}`
          const original = originalColors.get(key)
          
          if (original) {
            mat.color.copy(original.color)
          }
        }
      }
    }
  })
}

// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Initialize camper with scene reference (for visualization)
 */
export function init(scene) {
  sceneRef = scene
}

/**
 * Get current scan radius (scales with fish size)
 */
function getScanRadius() {
  const player = getPlayer()
  if (!player) return CAMPER_CONFIG.baseScanRadius
  
  // Scale radius with fish scale
  const fishScale = player.scale.x // Uniform scale
  return CAMPER_CONFIG.baseScanRadius * fishScale
}

/**
 * Create or update visualization
 */
function updateVisualization(playerPosition, sampledEntities, blendedColor) {
  if (!sceneRef) return
  
  // Clear old visualization
  clearVisualization()
  
  // Create new group
  vizGroup = new THREE.Group()
  vizGroup.name = 'camper-viz'
  
  const scanRadius = getScanRadius()
  
  // 1. Detection sphere - diagonal lines only (no latitude/longitude)
  const diagLines = createDiagonalSphereWireframe(scanRadius, 32, 24)
  diagLines.position.copy(playerPosition)
  diagLines.userData.isVizElement = true
  vizGroup.add(diagLines)
  
  // 2. Lines to each sampled entity with color markers
  for (const entity of sampledEntities) {
    // Get world position of entity
    const entityPos = new THREE.Vector3()
    entity.mesh.getWorldPosition(entityPos)
    
    // Get dominant color from this entity
    const colors = extractColorsFromMesh(entity.mesh)
    const entityColor = colors.length > 0 ? colors[0] : new THREE.Color(0xffffff)
    
    // Line from player to entity
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      playerPosition,
      entityPos
    ])
    const lineMat = new THREE.LineBasicMaterial({ 
      color: entityColor,
      transparent: true,
      opacity: 0.6 * vizOpacity,
      depthWrite: false,
    })
    lineMat.userData.baseOpacity = 0.6
    const line = new THREE.Line(lineGeom, lineMat)
    line.userData.isVizElement = true
    vizGroup.add(line)
    
    // Small glowing sphere at entity position showing its sampled color
    const markerGeom = new THREE.SphereGeometry(0.35, 8, 8)
    const markerMat = new THREE.MeshBasicMaterial({ 
      color: entityColor,
      transparent: true,
      opacity: 0.9 * vizOpacity,
    })
    markerMat.userData.baseOpacity = 0.9
    const marker = new THREE.Mesh(markerGeom, markerMat)
    marker.position.copy(entityPos)
    marker.userData.isVizElement = true
    vizGroup.add(marker)
  }
  
  // 3. Result color indicator (simple sphere above player)
  if (blendedColor) {
    const resultGeom = new THREE.SphereGeometry(1.2, 12, 12)
    const resultMat = new THREE.MeshBasicMaterial({ 
      color: blendedColor,
      transparent: true,
      opacity: 0.85 * vizOpacity,
    })
    resultMat.userData.baseOpacity = 0.85
    const resultSphere = new THREE.Mesh(resultGeom, resultMat)
    resultSphere.position.copy(playerPosition)
    resultSphere.position.y += 3
    resultSphere.userData.isVizElement = true
    vizGroup.add(resultSphere)
  }
  
  // Apply current opacity to all elements
  updateVizOpacity()
  
  sceneRef.add(vizGroup)
}

/**
 * Update opacity of all visualization elements
 */
function updateVizOpacity() {
  if (!vizGroup) return
  
  vizGroup.traverse((child) => {
    if (child.material) {
      const baseOpacity = child.material.userData.baseOpacity || 0.25
      child.material.opacity = baseOpacity * vizOpacity
    }
  })
}

/**
 * Create a sphere wireframe with only diagonal lines (no lat/long grid)
 * Uses only one diagonal direction per quad for a cleaner look
 */
function createDiagonalSphereWireframe(radius, widthSegments, heightSegments) {
  const vertices = []
  
  // Generate sphere vertices in a grid
  const grid = []
  
  for (let y = 0; y <= heightSegments; y++) {
    const row = []
    const v = y / heightSegments
    const phi = v * Math.PI // 0 to PI (top to bottom)
    
    for (let x = 0; x <= widthSegments; x++) {
      const u = x / widthSegments
      const theta = u * Math.PI * 2 // 0 to 2PI (around)
      
      const px = -radius * Math.sin(phi) * Math.cos(theta)
      const py = radius * Math.cos(phi)
      const pz = radius * Math.sin(phi) * Math.sin(theta)
      
      row.push(new THREE.Vector3(px, py, pz))
    }
    grid.push(row)
  }
  
  // Create diagonal lines - only one direction
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < widthSegments; x++) {
      const topLeft = grid[y][x]
      const bottomRight = grid[y + 1][x + 1]
      
      // Diagonal: top-left to bottom-right only
      vertices.push(topLeft.x, topLeft.y, topLeft.z)
      vertices.push(bottomRight.x, bottomRight.y, bottomRight.z)
    }
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  
  const material = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.25 * vizOpacity,
    depthWrite: false,
  })
  material.userData.baseOpacity = 0.25
  
  return new THREE.LineSegments(geometry, material)
}

/**
 * Clear visualization objects
 */
function clearVisualization() {
  if (vizGroup && sceneRef) {
    // Dispose all geometries and materials
    vizGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
    sceneRef.remove(vizGroup)
    vizGroup = null
  }
}

// ============================================================================
// SCANNING
// ============================================================================

/**
 * Scan nearby meshes and compute camouflage color
 */
function scanEnvironment(playerPosition) {
  const scanRadius = getScanRadius()
  const radiusSq = scanRadius * scanRadius
  
  // Get all entities and filter manually with world positions
  // (MeshRegistry.getNearby uses local positions which may be wrong)
  const allEntities = [
    ...MeshRegistry.getByCategory(Category.MAP),
    ...MeshRegistry.getByCategory(Category.NPC),
  ]
  
  // Filter by distance using world positions
  const nearby = []
  const tempPos = new THREE.Vector3()
  
  for (const entity of allEntities) {
    if (entity.id === 'player') continue
    
    // Get world position
    entity.mesh.getWorldPosition(tempPos)
    
    const dx = tempPos.x - playerPosition.x
    const dy = tempPos.y - playerPosition.y
    const dz = tempPos.z - playerPosition.z
    const distSq = dx * dx + dy * dy + dz * dz
    
    if (distSq <= radiusSq) {
      nearby.push({
        entity,
        distance: Math.sqrt(distSq),
        worldPos: tempPos.clone(),
      })
    }
  }
  
  // Sort by distance
  nearby.sort((a, b) => a.distance - b.distance)
  
  // Limit samples
  const toSample = nearby.slice(0, CAMPER_CONFIG.maxSamples)
  
  // Store for visualization (store entities with world positions)
  lastSampledEntities = toSample.map(n => n.entity)
  
  // Extract colors with distances
  const colorData = []
  
  for (const { entity, distance } of toSample) {
    const colors = extractColorsFromMesh(entity.mesh)
    
    for (const color of colors) {
      colorData.push({ color, distance })
    }
  }
  
  // Store for debug
  lastSampledColors = colorData.map(d => d.color.getHexString())
  
  console.log(`[Camper] Scan radius: ${scanRadius.toFixed(1)}, found ${allEntities.length} total entities, ${nearby.length} in range`)
  
  // Blend all colors
  return blendColors(colorData)
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Camper',
  description: 'Blend into your surroundings',
  
  onActivate: () => {
    const player = getPlayer()
    if (!player) return
    
    isActive = true
    vizOpacity = 0  // Start faded out, will fade in
    
    // Store original colors on first activation
    if (originalColors.size === 0) {
      storeOriginalColors(player)
    }
    
    // Scan environment and set target color
    targetColor = scanEnvironment(player.position)
    
    // Show visualization (starts invisible, fades in)
    updateVisualization(player.position, lastSampledEntities, targetColor)
    
    console.log(`[Camper] Found ${lastSampledEntities.length} meshes, ${lastSampledColors.length} colors`)
    console.log(`[Camper] Target color: #${targetColor.getHexString()}`)
  },
  
  onDeactivate: () => {
    isActive = false
    // Don't clear visualization - let it fade out in onPassiveUpdate
    console.log('[Camper] Deactivated - fading out...')
  },
  
  onUpdate: (delta) => {
    const player = getPlayer()
    if (!player || !targetColor) return
    
    // Fade in visualization
    if (vizOpacity < 1) {
      vizOpacity = Math.min(1, vizOpacity + delta * VIZ_FADE_SPEED)
      updateVizOpacity()
    }
    
    // Smoothly transition towards camouflage color
    if (currentBlend < 1) {
      currentBlend = Math.min(1, currentBlend + delta * CAMPER_CONFIG.transitionSpeed)
      applyColorToPlayer(player, targetColor, currentBlend)
    }
  },
  
  onPassiveUpdate: (delta) => {
    const player = getPlayer()
    if (!player) return
    
    // When not active, fade out visualization and restore colors
    if (!isActive) {
      // Fade out visualization
      if (vizOpacity > 0) {
        vizOpacity = Math.max(0, vizOpacity - delta * VIZ_FADE_SPEED)
        updateVizOpacity()
        
        // Clear visualization when fully faded
        if (vizOpacity <= 0) {
          clearVisualization()
        }
      }
      
      // Fade out camouflage color
      if (currentBlend > 0) {
        currentBlend = Math.max(0, currentBlend - delta * CAMPER_CONFIG.transitionSpeed)
        
        if (targetColor) {
          applyColorToPlayer(player, targetColor, currentBlend)
        }
        
        if (currentBlend <= 0) {
          restoreOriginalColors(player)
          targetColor = null
          lastSampledEntities = []
        }
      }
    }
  },
}

// ============================================================================
// DEBUG / UTILITY EXPORTS
// ============================================================================

export function debugCamper() {
  const scanRadius = getScanRadius()
  console.group('[Camper] Debug')
  console.log('Detection Method: Sphere (world position check)')
  console.log('Base Scan Radius:', CAMPER_CONFIG.baseScanRadius, 'units')
  console.log('Current Scan Radius:', scanRadius.toFixed(2), 'units (scales with fish)')
  console.log('Max Samples:', CAMPER_CONFIG.maxSamples, 'meshes')
  console.log('')
  console.log('Active:', isActive)
  console.log('Blend:', (currentBlend * 100).toFixed(0) + '%')
  console.log('Target color:', targetColor ? `#${targetColor.getHexString()}` : 'none')
  console.log('Original colors stored:', originalColors.size)
  console.log('Sampled meshes:', lastSampledEntities.length)
  console.log('Sampled colors:', lastSampledColors.length)
  console.groupEnd()
}

export function getSampledColors() {
  return lastSampledColors
}

export function getCamperState() {
  return {
    isActive,
    currentBlend,
    targetColor: targetColor ? `#${targetColor.getHexString()}` : null,
    sampledMeshCount: lastSampledEntities.length,
    sampledColorCount: lastSampledColors.length,
  }
}