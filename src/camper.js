/**
 * camper.js - Camouflage Ability
 * 
 * Tap Q to scan nearby meshes and blend into the environment.
 * The fish changes color to match surrounding objects.
 * Color stays until the fish moves OR capacity runs out.
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { setCapacityDepleting, hasCapacity } from './hud.js'
import { networkManager } from '../network/NetworkManager.js'

// ============================================================================
// â­ CAPACITY CONFIG - EASY TO EDIT! â­
// ============================================================================

const CAPACITY_CONFIG = {
  max: 500,              // Maximum capacity
  depleteRate: 10,       // Units per second while camouflaged
  regenRate: 10,          // Units per second when regenerating (after camo breaks)
  regenDelay: 1.0,       // Seconds before regen starts after camo breaks
}

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
  
  // Visualization timing (one-tap sequence)
  vizFadeInSpeed: 4.0,      // How fast viz fades in
  vizHoldDuration: 0.8,     // How long to hold at full opacity
  vizFadeOutSpeed: 2.5,     // How fast viz fades out
  
  // Movement detection
  movementThreshold: 5,     // How far fish must move to break camo (allows small adjustments)
  
  // Detector mesh color (matches sprinter trail)
  detectorColor: 0x00ffaa,
  
  // Fish camouflage opacity (1% = nearly invisible)
  fishCamoOpacity: 0.3,
  
  // Disguise mimic settings
  disguiseMimic: {
    enabled: true,           // Whether to create disguise mimic
    type: 'auto',            // 'coral', 'boulder', or 'auto' (detect from nearby)
    pieceCount: 6,           // Number of mimic pieces (more = fuller coverage)
    sizeMultiplier: 1.4,     // How much larger than fish (1.0 = same size)
    pointsPerPiece: 10,      // Convex hull points per piece (more = rounder)
    irregularity: 0.35,      // Shape irregularity (0-1)
    opacity: 0.85,           // Mimic opacity when fully visible
    useOpacity: false,        // Whether final opacity is partial (true) or full (false)
    roughness: 0.85,         // Material roughness
    metalness: 0.05,         // Material metalness
  },
}

// ============================================================================
// STATE
// ============================================================================

let originalColors = new Map()  // Store original material colors for restoration
let targetColor = null          // Color we're blending towards
let currentBlend = 0            // 0 = original, 1 = camouflaged
let lastSampledColors = []      // For debug display

// Visualization state
let sceneRef = null
let vizGroup = null             // Group containing all visualization objects
let lastSampledEntities = []    // Store entities for visualization
let vizOpacity = 0              // Current visualization opacity (0-1)

// One-tap state machine
// States: 'idle' | 'fading_in' | 'holding' | 'fading_out' | 'camouflaged'
let camoState = 'idle'
let holdTimer = 0               // Timer for hold duration
let lastPosition = null         // Track position for movement detection
let isCamouflaged = false       // Whether color is currently applied and should stay

// Disguise mimic state
let disguiseMimicGroup = null   // Group containing mimic pieces
let detectedTerrainType = null  // 'coral', 'boulder', or null
let currentMimicSeed = null     // Seed used for deterministic mimic generation

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
 * Store original colors and opacity of player mesh
 */
function storeOriginalColors(playerMesh) {
  originalColors.clear()
  
  let materialCount = 0
  
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        const key = `${child.uuid}_${i}`
        
        // Store for ANY material, not just ones with color
        originalColors.set(key, {
          child,
          material: mat,
          materialIndex: i,
          color: mat.color ? mat.color.clone() : null,
          opacity: mat.opacity !== undefined ? mat.opacity : 1,
          transparent: mat.transparent || false,
          depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
        })
        
        // Enable transparency for opacity changes
        mat.transparent = true
        mat.depthWrite = false  // Required for proper transparency
        materialCount++
      }
    }
    
    // Also handle child render order for transparency
    if (child.isMesh) {
      child.renderOrder = 1
    }
  })
  
  console.log(`[Camper] Stored ${materialCount} materials from player mesh`)
}

/**
 * Apply a color and opacity to all player materials (with blend factor)
 */
function applyColorToPlayer(playerMesh, newColor, blendFactor) {
  let updatedCount = 0
  
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        const key = `${child.uuid}_${i}`
        const original = originalColors.get(key)
        
        if (original) {
          // Lerp color if material has color
          if (mat.color && original.color) {
            mat.color.copy(original.color).lerp(newColor, blendFactor)
          }
          
          // Lerp opacity towards camouflage opacity (1%)
          const targetOpacity = CAMPER_CONFIG.fishCamoOpacity
          mat.opacity = original.opacity + (targetOpacity - original.opacity) * blendFactor
          mat.transparent = true
          mat.depthWrite = false  // Required for proper transparency
          mat.needsUpdate = true
          updatedCount++
        }
      }
    }
  })
}

/**
 * Restore original colors and opacity to player
 */
function restoreOriginalColors(playerMesh) {
  let restoredCount = 0
  
  playerMesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i]
        const key = `${child.uuid}_${i}`
        const original = originalColors.get(key)
        
        if (original) {
          if (mat.color && original.color) {
            mat.color.copy(original.color)
          }
          mat.opacity = original.opacity
          mat.transparent = original.transparent
          mat.depthWrite = original.depthWrite
          mat.needsUpdate = true
          restoredCount++
        }
      }
    }
    
    // Restore render order
    if (child.isMesh) {
      child.renderOrder = 0
    }
  })
  
  console.log(`[Camper] Restored ${restoredCount} materials to original state`)
}

// ============================================================================
// DISGUISE MIMIC - Convex Hull Generation
// ============================================================================

/**
 * Simple seeded RNG for deterministic mimic generation
 */
function createMimicRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Compute convex hull from 3D points
 * Returns array of triangle faces [Vector3, Vector3, Vector3]
 */
function computeConvexHull(points) {
  if (points.length < 4) return []
  
  const eps = 1e-10
  
  // Find initial tetrahedron
  let minX = 0, maxX = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[minX].x) minX = i
    if (points[i].x > points[maxX].x) maxX = i
  }
  if (minX === maxX) maxX = minX === 0 ? 1 : 0
  
  let maxDist = -1, furthest = -1
  const lineDir = new THREE.Vector3().subVectors(points[maxX], points[minX]).normalize()
  
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX) continue
    const toPoint = new THREE.Vector3().subVectors(points[i], points[minX])
    const proj = toPoint.dot(lineDir)
    const projVec = lineDir.clone().multiplyScalar(proj)
    const dist = toPoint.sub(projVec).length()
    if (dist > maxDist) { maxDist = dist; furthest = i }
  }
  if (furthest === -1) furthest = (minX + 1) % points.length
  
  const p0 = points[minX], p1 = points[maxX], p2 = points[furthest]
  const v01 = new THREE.Vector3().subVectors(p1, p0)
  const v02 = new THREE.Vector3().subVectors(p2, p0)
  const planeNormal = new THREE.Vector3().crossVectors(v01, v02).normalize()
  
  maxDist = -1
  let fourth = -1
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX || i === furthest) continue
    const dist = Math.abs(new THREE.Vector3().subVectors(points[i], p0).dot(planeNormal))
    if (dist > maxDist) { maxDist = dist; fourth = i }
  }
  if (fourth === -1) return [[p0.clone(), p1.clone(), p2.clone()]]
  
  const p3 = points[fourth]
  const center = new THREE.Vector3().add(p0).add(p1).add(p2).add(p3).multiplyScalar(0.25)
  
  const makeFace = (a, b, c) => {
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const normal = new THREE.Vector3().crossVectors(ab, ac)
    const toCenter = new THREE.Vector3().subVectors(center, a)
    if (normal.dot(toCenter) > 0) return [a.clone(), c.clone(), b.clone()]
    return [a.clone(), b.clone(), c.clone()]
  }
  
  let hullFaces = [makeFace(p0, p1, p2), makeFace(p0, p1, p3), makeFace(p0, p2, p3), makeFace(p1, p2, p3)]
  
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX || i === furthest || i === fourth) continue
    
    const pt = points[i]
    const visibleFaces = []
    
    for (let f = 0; f < hullFaces.length; f++) {
      const [a, b, c] = hullFaces[f]
      const ab = new THREE.Vector3().subVectors(b, a)
      const ac = new THREE.Vector3().subVectors(c, a)
      const normal = new THREE.Vector3().crossVectors(ab, ac)
      const toPoint = new THREE.Vector3().subVectors(pt, a)
      if (toPoint.dot(normal) > eps) visibleFaces.push(f)
    }
    
    if (visibleFaces.length === 0) continue
    
    const edgeCount = new Map()
    const edgeKey = (a, b) => {
      const k1 = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}-${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}`
      const k2 = `${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}-${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}`
      return [k1, k2]
    }
    
    for (const f of visibleFaces) {
      const [a, b, c] = hullFaces[f]
      for (const [ea, eb] of [[a,b],[b,c],[c,a]]) {
        const [k1, k2] = edgeKey(ea, eb)
        edgeCount.set(k1, (edgeCount.get(k1) || 0) + 1)
        edgeCount.set(k2, (edgeCount.get(k2) || 0) + 1)
      }
    }
    
    const boundaryEdges = []
    for (const f of visibleFaces) {
      const [a, b, c] = hullFaces[f]
      for (const [ea, eb] of [[a,b],[b,c],[c,a]]) {
        const [k1] = edgeKey(ea, eb)
        if (edgeCount.get(k1) === 1) boundaryEdges.push([ea, eb])
      }
    }
    
    visibleFaces.sort((a, b) => b - a)
    for (const f of visibleFaces) hullFaces.splice(f, 1)
    for (const [ea, eb] of boundaryEdges) hullFaces.push(makeFace(ea, eb, pt))
  }
  
  return hullFaces
}

/**
 * Create a convex hull geometry for a mimic piece
 */
function createMimicPieceGeometry(size, pointCount, rng, options = {}) {
  const { flatness = 1.0, irregularity = 0.3 } = options
  
  const points = []
  for (let i = 0; i < pointCount; i++) {
    const theta = rng() * Math.PI * 2
    const phi = Math.acos(2 * rng() - 1)
    
    const baseRadius = size * (0.7 + rng() * 0.6)
    const bumpFreq = 2 + Math.floor(rng() * 4)
    const bump = 1 + Math.sin(theta * bumpFreq) * Math.cos(phi * bumpFreq) * irregularity
    const r = baseRadius * bump
    
    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi) * flatness
    const z = r * Math.sin(phi) * Math.sin(theta)
    
    points.push(new THREE.Vector3(x, y, z))
  }
  
  const hullFaces = computeConvexHull(points)
  
  const vertices = []
  const normals = []
  
  for (const face of hullFaces) {
    const [a, b, c] = face
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize()
    
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z)
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  
  return geometry
}

/**
 * Detect terrain type from sampled entities
 */
function detectTerrainType(entities) {
  let coralCount = 0
  let boulderCount = 0
  
  for (const entity of entities) {
    const mesh = entity.mesh
    // Check the mesh and its parents for terrain type markers
    let current = mesh
    while (current) {
      if (current.userData?.terrainType === 'coral') {
        coralCount++
        break
      } else if (current.userData?.terrainType === 'boulder' || 
                 current.userData?.terrainType === 'boulderCluster') {
        boulderCount++
        break
      }
      current = current.parent
    }
  }
  
  if (coralCount > boulderCount) return 'coral'
  if (boulderCount > coralCount) return 'boulder'
  return 'boulder' // Default to boulder
}

/**
 * Get icosahedron vertices for mimic piece placement
 * Returns vertices distributed around a sphere
 */
function getMimicPositions(count) {
  const positions = []
  
  // Use fibonacci sphere for even distribution
  const goldenRatio = (1 + Math.sqrt(5)) / 2
  
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * i / goldenRatio
    const phi = Math.acos(1 - 2 * (i + 0.5) / count)
    
    positions.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ))
  }
  
  return positions
}

/**
 * Create the disguise mimic around the player
 * @param {THREE.Object3D} player - Player mesh
 * @param {THREE.Color} color - Sampled color from environment
 * @param {string} terrainType - 'coral' or 'boulder'
 */
function createDisguiseMimic(player, color, terrainType) {
  if (!CAMPER_CONFIG.disguiseMimic.enabled) return
  if (!sceneRef) return
  
  // Clean up existing mimic
  clearDisguiseMimic()
  
  const config = CAMPER_CONFIG.disguiseMimic
  
  // Get player bounding box for sizing
  const bbox = new THREE.Box3().setFromObject(player)
  const size = new THREE.Vector3()
  bbox.getSize(size)
  const baseSize = Math.max(size.x, size.y, size.z) * 0.5 * config.sizeMultiplier
  
  // Create mimic group
  disguiseMimicGroup = new THREE.Group()
  disguiseMimicGroup.name = 'disguise-mimic'
  
  // Get positions for mimic pieces
  const positions = getMimicPositions(config.pieceCount)
  
  // Generate and store seed for deterministic mimic (same seed sent to other players)
  currentMimicSeed = Math.floor(Math.random() * 0xFFFFFFFF)
  const rng = createMimicRNG(currentMimicSeed)
  
  // Vary color slightly for each piece (like coral does)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    
    // Piece size with variation
    const pieceSize = baseSize * (0.4 + rng() * 0.4)
    
    // Shape parameters based on terrain type
    let flatness, irregularity
    if (terrainType === 'coral') {
      flatness = 0.6 + rng() * 0.8
      irregularity = 0.25 + rng() * 0.3
    } else {
      flatness = 0.7 + rng() * 0.6
      irregularity = 0.35 + rng() * 0.25
    }
    
    // Create geometry
    const geometry = createMimicPieceGeometry(
      pieceSize,
      config.pointsPerPiece + Math.floor(rng() * 4),
      rng,
      { flatness, irregularity }
    )
    
    // Color variation
    const pieceColor = new THREE.Color().setHSL(
      hsl.h + (rng() - 0.5) * 0.08,
      Math.min(1, hsl.s * (0.85 + rng() * 0.3)),
      Math.min(1, hsl.l * (0.85 + rng() * 0.3))
    )
    
    // Create material - always enable transparency for fade in/out effects
    const material = new THREE.MeshStandardMaterial({
      color: pieceColor,
      roughness: config.roughness,
      metalness: config.metalness,
      flatShading: true,
      transparent: true,
      opacity: 0, // Start invisible, will fade in
      depthWrite: false,
    })
    // Target opacity: partial if useOpacity enabled, full otherwise
    material.userData.targetOpacity = config.useOpacity ? config.opacity : 1.0
    
    const mesh = new THREE.Mesh(geometry, material)
    
    // Position around player
    mesh.position.copy(pos).multiplyScalar(baseSize * 0.7)
    
    // Random rotation
    mesh.rotation.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2
    )
    
    mesh.userData.isDisguiseMimic = true
    disguiseMimicGroup.add(mesh)
  }
  
  // Attach to player so it moves with them
  player.add(disguiseMimicGroup)
  
  console.log(`[Camper] Created ${terrainType} disguise mimic with ${config.pieceCount} pieces`)
}

/**
 * Update disguise mimic opacity (always fades in/out regardless of useOpacity setting)
 */
function updateDisguiseMimicOpacity(opacity) {
  if (!disguiseMimicGroup) return
  
  disguiseMimicGroup.traverse((child) => {
    if (child.material && child.userData.isDisguiseMimic) {
      // Always update opacity for fade in/out effect
      const targetOpacity = child.material.userData.targetOpacity || 1.0
      child.material.opacity = targetOpacity * opacity
    }
  })
}

/**
 * Convert disguise mimic to opaque mode (after fade in completes)
 * This fixes z-sorting issues with transparent objects
 */
function makeDisguiseMimicOpaque() {
  if (!disguiseMimicGroup) return
  
  disguiseMimicGroup.traverse((child) => {
    if (child.material && child.userData.isDisguiseMimic) {
      const targetOpacity = child.material.userData.targetOpacity || 1.0
      child.material.transparent = false
      child.material.opacity = targetOpacity
      child.material.depthWrite = true
      child.material.needsUpdate = true
    }
  })
  console.log('[Camper] Mimic switched to opaque mode')
}

/**
 * Convert disguise mimic to transparent mode (for fade out)
 */
function makeDisguiseMimicTransparent() {
  if (!disguiseMimicGroup) return
  
  disguiseMimicGroup.traverse((child) => {
    if (child.material && child.userData.isDisguiseMimic) {
      child.material.transparent = true
      child.material.depthWrite = false
      child.material.needsUpdate = true
    }
  })
  console.log('[Camper] Mimic switched to transparent mode')
}

/**
 * Clear disguise mimic
 */
function clearDisguiseMimic() {
  if (disguiseMimicGroup) {
    // Dispose all geometries and materials
    disguiseMimicGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
    
    // Remove from parent (player)
    if (disguiseMimicGroup.parent) {
      disguiseMimicGroup.parent.remove(disguiseMimicGroup)
    }
    
    disguiseMimicGroup = null
  }
  detectedTerrainType = null
  currentMimicSeed = null
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
    // Use the stored nearest point position
    const entityPos = entity.worldPos || new THREE.Vector3()
    
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
  
  // Use the same color as sprinter trail
  const material = new THREE.LineBasicMaterial({
    color: CAMPER_CONFIG.detectorColor,
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
// NEAREST POINT ON MESH UTILITIES
// ============================================================================

/**
 * Find the closest point on a triangle to a given point
 */
function closestPointOnTriangle(point, a, b, c, target) {
  // Check if point is in vertex region outside A
  const ab = new THREE.Vector3().subVectors(b, a)
  const ac = new THREE.Vector3().subVectors(c, a)
  const ap = new THREE.Vector3().subVectors(point, a)
  
  const d1 = ab.dot(ap)
  const d2 = ac.dot(ap)
  if (d1 <= 0 && d2 <= 0) {
    return target.copy(a)
  }
  
  // Check if point is in vertex region outside B
  const bp = new THREE.Vector3().subVectors(point, b)
  const d3 = ab.dot(bp)
  const d4 = ac.dot(bp)
  if (d3 >= 0 && d4 <= d3) {
    return target.copy(b)
  }
  
  // Check if point is in edge region of AB
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return target.copy(a).addScaledVector(ab, v)
  }
  
  // Check if point is in vertex region outside C
  const cp = new THREE.Vector3().subVectors(point, c)
  const d5 = ab.dot(cp)
  const d6 = ac.dot(cp)
  if (d6 >= 0 && d5 <= d6) {
    return target.copy(c)
  }
  
  // Check if point is in edge region of AC
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return target.copy(a).addScaledVector(ac, w)
  }
  
  // Check if point is in edge region of BC
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    return target.copy(b).addScaledVector(new THREE.Vector3().subVectors(c, b), w)
  }
  
  // Point is inside face region
  const denom = 1 / (va + vb + vc)
  const vFace = vb * denom
  const wFace = vc * denom
  return target.copy(a).addScaledVector(ab, vFace).addScaledVector(ac, wFace)
}

/**
 * Find the nearest point on a mesh's surface to a given world point
 */
function findNearestPointOnMesh(mesh, worldPoint) {
  if (!mesh.geometry) return null
  
  const geometry = mesh.geometry
  const position = geometry.attributes.position
  if (!position) return null
  
  // Transform world point to local space
  const inverseMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert()
  const localPoint = worldPoint.clone().applyMatrix4(inverseMatrix)
  
  let nearestDistSq = Infinity
  const nearestPoint = new THREE.Vector3()
  const closestOnTri = new THREE.Vector3()
  
  const index = geometry.index
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  
  if (index) {
    // Indexed geometry
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i))
      b.fromBufferAttribute(position, index.getX(i + 1))
      c.fromBufferAttribute(position, index.getX(i + 2))
      
      closestPointOnTriangle(localPoint, a, b, c, closestOnTri)
      
      const distSq = localPoint.distanceToSquared(closestOnTri)
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestPoint.copy(closestOnTri)
      }
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i)
      b.fromBufferAttribute(position, i + 1)
      c.fromBufferAttribute(position, i + 2)
      
      closestPointOnTriangle(localPoint, a, b, c, closestOnTri)
      
      const distSq = localPoint.distanceToSquared(closestOnTri)
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestPoint.copy(closestOnTri)
      }
    }
  }
  
  // Transform nearest point back to world space
  mesh.localToWorld(nearestPoint)
  
  // Calculate world-space distance
  const worldDistance = worldPoint.distanceTo(nearestPoint)
  
  return {
    point: nearestPoint,
    distance: worldDistance
  }
}

// ============================================================================
// SCANNING
// ============================================================================

/**
 * Scan nearby meshes and compute camouflage color
 * Scans the actual scene graph for meshes with materials
 */
function scanEnvironment(playerPosition) {
  const scanRadius = getScanRadius()
  
  if (!sceneRef) {
    console.warn('[Camper] No scene reference')
    return new THREE.Color(0x808080)
  }
  
  // Collect all meshes with colors in range
  const nearby = []
  const tempPos = new THREE.Vector3()
  const tempScale = new THREE.Vector3()
  
  sceneRef.traverse((child) => {
    // Skip non-meshes
    if (!child.isMesh) return
    
    // Skip player mesh
    if (child.userData.registryId === 'player') return
    if (child.parent?.userData?.registryId === 'player') return
    
    // Skip visualization elements
    if (child.userData.isVizElement) return
    if (child.parent?.name === 'camper-viz') return
    
    // Skip disguise mimic elements
    if (child.userData.isDisguiseMimic) return
    if (child.parent?.name === 'disguise-mimic') return
    
    // Check if it has a material with color
    if (!child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const hasColor = materials.some(m => m.color instanceof THREE.Color)
    if (!hasColor) return
    
    // Quick bounding sphere rejection first (for performance)
    if (!child.geometry.boundingSphere) {
      child.geometry.computeBoundingSphere()
    }
    const boundingSphere = child.geometry.boundingSphere
    if (boundingSphere) {
      tempPos.copy(boundingSphere.center)
      child.localToWorld(tempPos)
      child.getWorldScale(tempScale)
      const meshRadius = boundingSphere.radius * Math.max(tempScale.x, tempScale.y, tempScale.z)
      
      const dx = tempPos.x - playerPosition.x
      const dy = tempPos.y - playerPosition.y
      const dz = tempPos.z - playerPosition.z
      const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz)
      
      // Quick reject: if bounding sphere doesn't even touch detector, skip
      if (distToCenter - meshRadius > scanRadius) return
    }
    
    // Find actual nearest point on mesh geometry
    const nearest = findNearestPointOnMesh(child, playerPosition)
    if (!nearest) return
    
    // Check if nearest point is within detector
    const distToNearest = playerPosition.distanceTo(nearest.point)
    
    if (distToNearest <= scanRadius) {
      nearby.push({
        mesh: child,
        distance: distToNearest,
        worldPos: nearest.point.clone(), // Use the actual nearest point
      })
    }
  })
  
  // Sort by distance
  nearby.sort((a, b) => a.distance - b.distance)
  
  // Limit samples
  const toSample = nearby.slice(0, CAMPER_CONFIG.maxSamples)
  
  // Store for visualization (include mesh and nearest point)
  lastSampledEntities = toSample.map(n => ({ mesh: n.mesh, worldPos: n.worldPos }))
  
  // Extract colors with distances
  const colorData = []
  
  for (const { mesh, distance } of toSample) {
    const colors = extractColorsFromMesh(mesh)
    
    for (const color of colors) {
      colorData.push({ color, distance })
    }
  }
  
  // Store for debug
  lastSampledColors = colorData.map(d => d.color.getHexString())
  
  console.log(`[Camper] Scan radius: ${scanRadius.toFixed(1)}, found ${nearby.length} meshes in range`)
  
  // Blend all colors
  return blendColors(colorData)
}

// ============================================================================
// MOVEMENT DETECTION
// ============================================================================

/**
 * Check if player has moved significantly
 */
function hasPlayerMoved(player) {
  if (!lastPosition) return false
  
  const distance = player.position.distanceTo(lastPosition)
  return distance > CAMPER_CONFIG.movementThreshold
}

/**
 * Store current position for movement tracking
 */
function storePosition(player) {
  if (!lastPosition) {
    lastPosition = new THREE.Vector3()
  }
  lastPosition.copy(player.position)
}

/**
 * Break camouflage and start fading back to original
 */
function breakCamouflage() {
  console.log('[Camper] Breaking camouflage')
  setCapacityDepleting(false)  // Stop capacity drain
  makeDisguiseMimicTransparent()  // Switch to transparent for fade out
  camoState = 'idle'
  isCamouflaged = false
  
  // Notify network that camouflage has ended
  networkManager.sendAbilityStop('camper')
  
  // Color will fade out in onPassiveUpdate
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Camper',
  description: 'Tap to blend into surroundings (stay still to keep camo)',
  capacityMode: 'toggle',  // Ability manages its own capacity drain
  capacityConfig: CAPACITY_CONFIG,  // Per-ability capacity settings
  
  // One-tap activation
  onActivate: () => {
    const player = getPlayer()
    if (!player) return
    
    // If already in a camo sequence, ignore
    if (camoState !== 'idle' && camoState !== 'camouflaged') {
      return
    }
    
    // If already camouflaged, re-scan (and recreate mimic)
    if (camoState === 'camouflaged') {
      console.log('[Camper] Re-scanning while camouflaged')
      clearDisguiseMimic()
    }
    
    // Start the sequence
    camoState = 'fading_in'
    vizOpacity = 0
    holdTimer = 0
    
    // Store original colors on first activation
    if (originalColors.size === 0) {
      storeOriginalColors(player)
    }
    
    // Scan environment and set target color
    targetColor = scanEnvironment(player.position)
    
    // Detect terrain type from sampled entities
    const configType = CAMPER_CONFIG.disguiseMimic.type
    if (configType === 'auto') {
      detectedTerrainType = detectTerrainType(lastSampledEntities)
    } else {
      detectedTerrainType = configType
    }
    
    // Create disguise mimic with sampled color
    createDisguiseMimic(player, targetColor, detectedTerrainType)
    
    // Store position for movement tracking
    storePosition(player)
    
    // Show visualization (starts invisible, fades in)
    updateVisualization(player.position, lastSampledEntities, targetColor)
    
    console.log(`[Camper] Tap activated - starting camo sequence`)
    console.log(`[Camper] Found ${lastSampledEntities.length} meshes, ${lastSampledColors.length} colors`)
    console.log(`[Camper] Target color: #${targetColor.getHexString()}`)
    console.log(`[Camper] Terrain type: ${detectedTerrainType}`)
  },
  
  // For one-tap, we don't use onDeactivate for the main logic
  // The key release is ignored - state machine handles everything
  onDeactivate: () => {
    // Do nothing - one-tap mode
  },
  
  // Called while ability key is held (not used in one-tap mode, but still called)
  onUpdate: (delta) => {
    // State machine handles updates in onPassiveUpdate
  },
  
  // Called every frame regardless of key state
  onPassiveUpdate: (delta) => {
    const player = getPlayer()
    if (!player) return
    
    // State machine for one-tap camo sequence
    switch (camoState) {
      case 'fading_in':
        // Fade in visualization
        vizOpacity = Math.min(1, vizOpacity + delta * CAMPER_CONFIG.vizFadeInSpeed)
        updateVizOpacity()
        
        // Fade in disguise mimic
        updateDisguiseMimicOpacity(vizOpacity)
        
        // Transition color towards camo
        if (targetColor && currentBlend < 1) {
          currentBlend = Math.min(1, currentBlend + delta * CAMPER_CONFIG.transitionSpeed)
          applyColorToPlayer(player, targetColor, currentBlend)
        }
        
        // When fully faded in, start hold timer
        if (vizOpacity >= 1) {
          camoState = 'holding'
          holdTimer = 0
          makeDisguiseMimicOpaque()  // Switch to opaque for proper rendering
          console.log('[Camper] Visualization at full - holding')
        }
        break
        
      case 'holding':
        // Keep updating color if not fully blended
        if (targetColor && currentBlend < 1) {
          currentBlend = Math.min(1, currentBlend + delta * CAMPER_CONFIG.transitionSpeed)
          applyColorToPlayer(player, targetColor, currentBlend)
        }
        
        // Wait for hold duration
        holdTimer += delta
        if (holdTimer >= CAMPER_CONFIG.vizHoldDuration) {
          camoState = 'fading_out'
          console.log('[Camper] Hold complete - fading out viz')
        }
        break
        
      case 'fading_out':
        // Fade out visualization only (color stays!)
        vizOpacity = Math.max(0, vizOpacity - delta * CAMPER_CONFIG.vizFadeOutSpeed)
        updateVizOpacity()
        
        // Ensure color is fully blended
        if (targetColor && currentBlend < 1) {
          currentBlend = Math.min(1, currentBlend + delta * CAMPER_CONFIG.transitionSpeed)
          applyColorToPlayer(player, targetColor, currentBlend)
        }
        
        // When viz fully faded, enter camouflaged state
        if (vizOpacity <= 0) {
          clearVisualization()
          camoState = 'camouflaged'
          isCamouflaged = true
          storePosition(player)  // Store position to track movement
          setCapacityDepleting(true)  // Start depleting capacity while camo
          console.log('[Camper] Camouflaged! Stay still to maintain (capacity draining)')
        }
        break
        
      case 'camouflaged':
        // Check for movement OR capacity depletion
        if (hasPlayerMoved(player)) {
          breakCamouflage()
        } else if (!hasCapacity()) {
          // Out of capacity - break camouflage
          console.log('[Camper] Capacity depleted - breaking camouflage')
          breakCamouflage()
        }
        break
        
      case 'idle':
      default:
        // Fade out any remaining visualization
        if (vizOpacity > 0) {
          vizOpacity = Math.max(0, vizOpacity - delta * CAMPER_CONFIG.vizFadeOutSpeed)
          updateVizOpacity()
          
          if (vizOpacity <= 0) {
            clearVisualization()
          }
        }
        
        // Fade out camouflage color and mimic if not camouflaged
        if (!isCamouflaged && currentBlend > 0) {
          currentBlend = Math.max(0, currentBlend - delta * CAMPER_CONFIG.transitionSpeed)
          
          // Fade out mimic with color
          updateDisguiseMimicOpacity(currentBlend)
          
          if (targetColor) {
            applyColorToPlayer(player, targetColor, currentBlend)
          }
          
          if (currentBlend <= 0) {
            restoreOriginalColors(player)
            clearDisguiseMimic()
            targetColor = null
            lastSampledEntities = []
          }
        }
        break
    }
  },
}

// ============================================================================
// DEBUG / UTILITY EXPORTS
// ============================================================================

export function debugCamper() {
  const scanRadius = getScanRadius()
  console.group('[Camper] Debug')
  console.log('Mode: One-tap (stay still to keep camo)')
  console.log('Detection Method: Nearest point on mesh surface')
  console.log('Base Scan Radius:', CAMPER_CONFIG.baseScanRadius, 'units')
  console.log('Current Scan Radius:', scanRadius.toFixed(2), 'units (scales with fish)')
  console.log('Max Samples:', CAMPER_CONFIG.maxSamples, 'meshes')
  console.log('Movement Threshold:', CAMPER_CONFIG.movementThreshold, 'units')
  console.log('')
  console.log('State:', camoState)
  console.log('Is Camouflaged:', isCamouflaged)
  console.log('Blend:', (currentBlend * 100).toFixed(0) + '%')
  console.log('Viz Opacity:', (vizOpacity * 100).toFixed(0) + '%')
  console.log('Hold Timer:', holdTimer.toFixed(2) + 's')
  console.log('Target color:', targetColor ? `#${targetColor.getHexString()}` : 'none')
  console.log('Original colors stored:', originalColors.size)
  console.log('Sampled meshes:', lastSampledEntities.length)
  console.log('Sampled colors:', lastSampledColors.length)
  if (lastSampledColors.length > 0) {
    console.log('Colors:', lastSampledColors.slice(0, 5).map(c => '#' + c).join(', '))
  }
  console.log('')
  console.log('Disguise Mimic:')
  console.log('  Enabled:', CAMPER_CONFIG.disguiseMimic.enabled)
  console.log('  Type:', CAMPER_CONFIG.disguiseMimic.type)
  console.log('  Detected Terrain:', detectedTerrainType || 'none')
  console.log('  Mimic Active:', disguiseMimicGroup !== null)
  console.log('  Piece Count:', disguiseMimicGroup ? disguiseMimicGroup.children.length : 0)
  console.groupEnd()
}

export function getSampledColors() {
  return lastSampledColors
}

export function getCamperState() {
  return {
    camoState,
    isCamouflaged,
    currentBlend,
    vizOpacity,
    holdTimer,
    targetColor: targetColor ? `#${targetColor.getHexString()}` : null,
    sampledMeshCount: lastSampledEntities.length,
    sampledColorCount: lastSampledColors.length,
    disguiseMimic: {
      enabled: CAMPER_CONFIG.disguiseMimic.enabled,
      active: disguiseMimicGroup !== null,
      terrainType: detectedTerrainType,
      pieceCount: disguiseMimicGroup ? disguiseMimicGroup.children.length : 0,
    },
  }
}

// Manual break for testing
export function manualBreakCamo() {
  if (isCamouflaged) {
    breakCamouflage()
  }
}

/**
 * Get the current target color hex string for network sync
 * @returns {string|null} Hex color string like "ff8844" or null if not camouflaged
 */
export function getTargetColorHex() {
  return targetColor ? targetColor.getHexString() : null
}

/**
 * Get the detected terrain type for network sync
 * @returns {string|null} 'coral', 'boulder', or null
 */
export function getDetectedTerrainType() {
  return detectedTerrainType
}

/**
 * Get the current mimic seed for network sync
 * This is the seed used to generate the local player's mimic
 * @returns {number|null} Seed value or null if no mimic active
 */
export function getMimicSeed() {
  return currentMimicSeed
}

// ============================================================================
// REMOTE PLAYER CAMOUFLAGE SUPPORT
// ============================================================================

/**
 * Apply camouflage effect to a remote player mesh
 * @param {THREE.Object3D} mesh - The remote player's mesh
 * @param {string} colorHex - Hex color string (without #)
 * @param {string} terrainType - 'coral' or 'boulder'
 * @param {number} mimicSeed - Seed for deterministic mimic generation
 * @returns {Object} Cleanup data for later removal
 */
export function applyRemoteCamouflage(mesh, colorHex, terrainType, mimicSeed) {
  if (!mesh) {
    console.warn('[Camper Remote] No mesh provided')
    return null
  }
  
  console.log(`[Camper Remote] Applying camouflage: color=#${colorHex}, terrain=${terrainType}, seed=${mimicSeed}`)
  
  const color = new THREE.Color(`#${colorHex}`)
  
  // Track unique materials (materials can be shared between meshes)
  const processedMaterials = new Set()
  let materialCount = 0
  
  // Store original colors directly on materials (but don't apply camo yet - will fade in)
  mesh.traverse((child) => {
    // Skip any existing mimic parts
    if (child.userData.isDisguiseMimic || child.userData.isRemoteCamouflaged) {
      return
    }
    
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (const mat of materials) {
        // Skip if we've already processed this material (shared materials)
        if (processedMaterials.has(mat)) {
          continue
        }
        processedMaterials.add(mat)
        
        // Store original state directly on the material if not already stored
        if (!mat.userData._remoteCamoOriginal) {
          mat.userData._remoteCamoOriginal = {
            color: mat.color ? mat.color.clone() : null,
            opacity: mat.opacity !== undefined ? mat.opacity : 1,
            transparent: mat.transparent || false,
            depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
          }
        }
        
        // Set up for transparency (needed for fade)
        mat.transparent = true
        mat.depthWrite = false
        mat.needsUpdate = true
        materialCount++
      }
    }
    
    if (child.isMesh) {
      child.renderOrder = 1
      child.userData.isRemoteCamouflaged = true
    }
  })
  
  console.log(`[Camper Remote] Stored ${materialCount} unique materials for fade-in`)
  
  // Create disguise mimic for remote player using deterministic seed
  // Start mimic transparent for fade-in
  const mimicGroup = createRemoteDisguiseMimic(mesh, color, terrainType || 'boulder', mimicSeed)
  
  // Make mimic start transparent
  if (mimicGroup) {
    mimicGroup.traverse((child) => {
      if (child.material && child.userData.isDisguiseMimic) {
        child.material.transparent = true
        child.material.opacity = 0
        child.material.depthWrite = false
        child.material.needsUpdate = true
      }
    })
  }
  
  console.log(`[Camper Remote] Mimic created: ${mimicGroup ? mimicGroup.children.length + ' pieces' : 'none'}`)
  
  return {
    mimicGroup,
    mesh,
    camoColor: color.clone(),  // Store for fade lerping
    isFadingIn: true,          // Start fading in
    isFadingOut: false,
    fadeBlend: 0,              // Start at 0 for fade-in
  }
}

/**
 * Remove camouflage effect from a remote player
 * @param {Object} cleanupData - Data returned from applyRemoteCamouflage
 */
export function removeRemoteCamouflage(cleanupData) {
  if (!cleanupData) {
    console.warn('[Camper Remote] No cleanup data provided')
    return
  }
  
  const { mimicGroup, mesh } = cleanupData
  
  console.log('[Camper Remote] Removing camouflage')
  
  // Track which materials we've already restored (materials can be shared between meshes)
  const restoredMaterials = new Set()
  
  // Restore original material properties
  if (mesh) {
    let restoredCount = 0
    
    mesh.traverse((child) => {
      // Skip mimic parts
      if (child.userData.isDisguiseMimic) {
        return
      }
      
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        
        for (const mat of materials) {
          // Skip if we've already restored this material (shared materials)
          if (restoredMaterials.has(mat)) {
            continue
          }
          
          const original = mat.userData._remoteCamoOriginal
          
          if (original) {
            if (mat.color && original.color) {
              mat.color.copy(original.color)
            }
            mat.opacity = original.opacity
            mat.transparent = original.transparent
            mat.depthWrite = original.depthWrite
            mat.needsUpdate = true
            
            // Clean up the stored data
            delete mat.userData._remoteCamoOriginal
            restoredMaterials.add(mat)
            restoredCount++
          }
        }
      }
      
      if (child.isMesh && child.userData.isRemoteCamouflaged) {
        child.renderOrder = 0
        delete child.userData.isRemoteCamouflaged
      }
    })
    
    console.log(`[Camper Remote] Restored ${restoredCount} unique materials`)
  }
  
  // Remove mimic group
  if (mimicGroup) {
    console.log(`[Camper Remote] Removing mimic with ${mimicGroup.children.length} pieces`)
    
    mimicGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
    
    if (mimicGroup.parent) {
      mimicGroup.parent.remove(mimicGroup)
    }
  }
  
  console.log('[Camper Remote] Camouflage removed')
}

/**
 * Start fading out camouflage for a remote player (instead of instant removal)
 * @param {Object} cleanupData - Data returned from applyRemoteCamouflage
 */
export function startRemoteCamouflageFadeOut(cleanupData) {
  if (!cleanupData) return
  
  cleanupData.isFadingIn = false
  cleanupData.isFadingOut = true
  // fadeBlend should already be at 1.0 if fully faded in, or wherever it was
  
  // Switch back to transparent mode for fade-out
  makeRemoteCamouflageTransparent(cleanupData)
  
  console.log('[Camper Remote] Starting camouflage fade out')
}

/**
 * Switch remote camouflage to opaque mode (after fade-in completes)
 * This fixes z-sorting issues with transparent objects
 * @param {Object} cleanupData - Data returned from applyRemoteCamouflage
 */
function makeRemoteCamouflageOpaque(cleanupData) {
  if (!cleanupData) return
  
  const { mesh, mimicGroup } = cleanupData
  const processedMaterials = new Set()
  
  // Switch fish materials to final camo state with proper depth writing
  if (mesh) {
    mesh.traverse((child) => {
      if (child.userData.isDisguiseMimic) return
      
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        
        for (const mat of materials) {
          if (processedMaterials.has(mat)) continue
          processedMaterials.add(mat)
          
          const original = mat.userData._remoteCamoOriginal
          if (!original) continue
          
          // Set final camo color
          if (mat.color && cleanupData.camoColor) {
            mat.color.copy(cleanupData.camoColor)
          }
          
          // Set final camo opacity and restore proper depth writing
          mat.opacity = CAMPER_CONFIG.fishCamoOpacity
          // Keep transparent if camo opacity < 1, otherwise can go opaque
          if (CAMPER_CONFIG.fishCamoOpacity >= 1) {
            mat.transparent = false
            mat.depthWrite = true
          }
          mat.needsUpdate = true
        }
      }
    })
  }
  
  // Switch mimic to opaque mode
  if (mimicGroup) {
    const targetOpacity = CAMPER_CONFIG.disguiseMimic.useOpacity ? CAMPER_CONFIG.disguiseMimic.opacity : 1.0
    mimicGroup.traverse((child) => {
      if (child.material && child.userData.isDisguiseMimic) {
        child.material.transparent = false
        child.material.opacity = targetOpacity
        child.material.depthWrite = true
        child.material.needsUpdate = true
      }
    })
  }
}

/**
 * Switch remote camouflage to transparent mode (for fade-out)
 * @param {Object} cleanupData - Data returned from applyRemoteCamouflage
 */
function makeRemoteCamouflageTransparent(cleanupData) {
  if (!cleanupData) return
  
  const { mesh, mimicGroup } = cleanupData
  const processedMaterials = new Set()
  
  // Switch fish materials back to transparent for fading
  if (mesh) {
    mesh.traverse((child) => {
      if (child.userData.isDisguiseMimic) return
      
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        
        for (const mat of materials) {
          if (processedMaterials.has(mat)) continue
          processedMaterials.add(mat)
          
          if (mat.userData._remoteCamoOriginal) {
            mat.transparent = true
            mat.depthWrite = false
            mat.needsUpdate = true
          }
        }
      }
    })
  }
  
  // Switch mimic to transparent mode
  if (mimicGroup) {
    mimicGroup.traverse((child) => {
      if (child.material && child.userData.isDisguiseMimic) {
        child.material.transparent = true
        child.material.depthWrite = false
        child.material.needsUpdate = true
      }
    })
  }
}

/**
 * Update remote camouflage fade animation (handles both fade-in and fade-out)
 * @param {Object} cleanupData - Data returned from applyRemoteCamouflage
 * @param {number} delta - Time since last frame in seconds
 * @returns {boolean} True if fade-out is complete and cleanup should happen
 */
export function updateRemoteCamouflageFade(cleanupData, delta) {
  if (!cleanupData) return false
  if (!cleanupData.isFadingIn && !cleanupData.isFadingOut) return false
  
  const { mesh, mimicGroup, camoColor } = cleanupData
  
  // Update blend based on fade direction
  if (cleanupData.isFadingIn) {
    cleanupData.fadeBlend = Math.min(1, cleanupData.fadeBlend + delta * CAMPER_CONFIG.transitionSpeed)
    
    // Check if fade-in complete
    if (cleanupData.fadeBlend >= 1) {
      cleanupData.isFadingIn = false
      
      // Switch to opaque mode to fix z-sorting issues
      makeRemoteCamouflageOpaque(cleanupData)
      
      console.log('[Camper Remote] Fade-in complete, switched to opaque mode')
    }
  } else if (cleanupData.isFadingOut) {
    cleanupData.fadeBlend = Math.max(0, cleanupData.fadeBlend - delta * CAMPER_CONFIG.transitionSpeed)
  }
  
  // Only apply blend if still fading (not in stable opaque state)
  if (!cleanupData.isFadingIn && !cleanupData.isFadingOut) {
    // Stable state - don't update materials
    return false
  }
  
  const blend = cleanupData.fadeBlend
  
  // Track processed materials to handle shared materials
  const processedMaterials = new Set()
  
  // Apply blend to materials
  if (mesh) {
    mesh.traverse((child) => {
      if (child.userData.isDisguiseMimic) return
      
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        
        for (const mat of materials) {
          if (processedMaterials.has(mat)) continue
          processedMaterials.add(mat)
          
          const original = mat.userData._remoteCamoOriginal
          if (!original) continue
          
          // Lerp color between original and camo color
          if (mat.color && original.color && camoColor) {
            mat.color.copy(original.color).lerp(camoColor, blend)
          }
          
          // Lerp opacity between original and camo opacity
          const camoOpacity = CAMPER_CONFIG.fishCamoOpacity
          mat.opacity = original.opacity + (camoOpacity - original.opacity) * blend
          mat.needsUpdate = true
        }
      }
    })
  }
  
  // Apply blend to mimic opacity
  if (mimicGroup) {
    const mimicMaxOpacity = CAMPER_CONFIG.disguiseMimic.useOpacity ? CAMPER_CONFIG.disguiseMimic.opacity : 1.0
    mimicGroup.traverse((child) => {
      if (child.material && child.userData.isDisguiseMimic) {
        child.material.opacity = blend * mimicMaxOpacity
        child.material.needsUpdate = true
      }
    })
  }
  
  // Return true only if fade-OUT is complete (fade-in complete returns false)
  return cleanupData.isFadingOut && blend <= 0
}

/**
 * Create disguise mimic for a remote player
 * @param {THREE.Object3D} playerMesh - Remote player's mesh
 * @param {THREE.Color} color - Camouflage color
 * @param {string} terrainType - 'coral' or 'boulder'
 * @param {number} seed - Deterministic seed for consistent mimic across all clients
 * @returns {THREE.Group} Mimic group attached to player
 */
function createRemoteDisguiseMimic(playerMesh, color, terrainType, seed) {
  if (!CAMPER_CONFIG.disguiseMimic.enabled) return null
  
  const config = CAMPER_CONFIG.disguiseMimic
  
  // Get player bounding box for sizing
  const bbox = new THREE.Box3().setFromObject(playerMesh)
  const size = new THREE.Vector3()
  bbox.getSize(size)
  const baseSize = Math.max(size.x, size.y, size.z) * 0.5 * config.sizeMultiplier
  
  // Create mimic group
  const mimicGroup = new THREE.Group()
  mimicGroup.name = 'remote-disguise-mimic'
  
  // Get positions for mimic pieces
  const positions = getMimicPositions(config.pieceCount)
  
  // Create RNG with deterministic seed for consistent mimic across all clients
  const rng = createMimicRNG(seed)
  
  // Vary color slightly for each piece
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    
    // Piece size with variation
    const pieceSize = baseSize * (0.4 + rng() * 0.4)
    
    // Shape parameters based on terrain type
    let flatness, irregularity
    if (terrainType === 'coral') {
      flatness = 0.6 + rng() * 0.8
      irregularity = 0.25 + rng() * 0.3
    } else {
      flatness = 0.7 + rng() * 0.6
      irregularity = 0.35 + rng() * 0.25
    }
    
    // Create geometry
    const geometry = createMimicPieceGeometry(
      pieceSize,
      config.pointsPerPiece + Math.floor(rng() * 4),
      rng,
      { flatness, irregularity }
    )
    
    // Color variation
    const pieceColor = new THREE.Color().setHSL(
      hsl.h + (rng() - 0.5) * 0.08,
      Math.min(1, hsl.s * (0.85 + rng() * 0.3)),
      Math.min(1, hsl.l * (0.85 + rng() * 0.3))
    )
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: pieceColor,
      roughness: config.roughness,
      metalness: config.metalness,
      flatShading: true,
      transparent: false,
      opacity: config.useOpacity ? config.opacity : 1.0,
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    
    // Position around player
    mesh.position.copy(pos).multiplyScalar(baseSize * 0.7)
    
    // Random rotation
    mesh.rotation.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2
    )
    
    mesh.userData.isDisguiseMimic = true
    mimicGroup.add(mesh)
  }
  
  // Attach to player so it moves with them
  playerMesh.add(mimicGroup)
  
  return mimicGroup
}