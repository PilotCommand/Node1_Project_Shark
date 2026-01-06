/**
 * stacker.js - Stacker Ability
 * 
 * Build pentagonal prisms by:
 * 1. Press Q ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Activate aiming mode (shows ray pointer with pentagon)
 * 2. Press Q ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Select start point on a surface
 * 3. Press Q ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Finalize and place the prism
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { camera } from './camera.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'
import { createStaticCollider, removeStaticCollider, isPhysicsReady } from './Physics.js'
import { consumeCapacity, getCapacityConfig, restoreCapacity } from './hud.js'

// ============================================================================
// ⭐ CAPACITY CONFIG - EASY TO EDIT! ⭐
// ============================================================================

const CAPACITY_CONFIG = {
  max: 100,              // Maximum capacity (100 = can place maxPrisms prisms)
  depleteRate: 0,        // Not used for perUse mode
  regenRate: 0,          // NO time-based regen! Capacity only restores when prisms despawn
  regenDelay: 0,         // Not used since regenRate is 0
}
// NOTE: Capacity restores by (max / maxPrisms) when a prism despawns after its timer

// ============================================================================
// CONFIG - Edit these values to customize the stacker!
// ============================================================================

export const CONFIG = {
  // === PENTAGON INDICATOR ===
  basePentagonRadius: 0.5,          // Base size of the pentagon cursor (scales with fish)
  pentagonColor: 0x00ffaa,          // Default color (cyan)
  pentagonOpacity: 0.6,             // Fill transparency
  pentagonBorderColor: 0xffffff,    // Border color (white)
  pentagonBorderWidth: 2,           // Border thickness
  pentagonSurfaceOffset: 0.15,      // How far pentagon floats above surface
  
  // === RAY POINTER ===
  rayColor: 0x00ffaa,               // Color of the ray line
  rayOpacity: 0.6,                  // Ray transparency
  baseRayMaxDistance: 50,           // Base maximum range for detecting surfaces (scales with fish)
  
  // === PRISM ===
  basePrismRadius: 0.5,             // Base cross-section size of placed prisms (scales with fish)
  prismColor: 0x44aaff,             // Preview prism color (blue)
  prismOpacity: 0.7,                // Preview prism transparency
  prismFinalColor: 0x2288dd,        // Placed prism color (fallback)
  prismFinalOpacity: 1.0,           // Placed prism transparency
  maxPrisms: 5,                     // Maximum number of prisms (oldest removed when exceeded)
  baseMaxPrismLength: 20,           // Base maximum length a prism can extend (scales with fish)
  colorBlendRatio: 0.5,             // How much to blend end color (0 = start only, 1 = end only, 0.5 = 50/50)
  flatShading: true,                // Use flat shading (hard edges) vs smooth shading
  
  // === DESPAWN ===
  prismDespawnTime: 300,            // Seconds before prisms despawn (300 = 5 minutes)
}

// ============================================================================
// FISH SCALE HELPER
// ============================================================================

/**
 * Get current fish scale factor
 */
function getFishScale() {
  const player = getPlayer()
  if (!player) return 1.0
  return player.scale.x  // Uniform scale
}

/**
 * Get scaled pentagon radius
 */
function getPentagonRadius() {
  return CONFIG.basePentagonRadius * getFishScale()
}

/**
 * Get scaled prism radius
 */
function getPrismRadius() {
  return CONFIG.basePrismRadius * getFishScale()
}

/**
 * Get scaled ray max distance
 */
function getRayMaxDistance() {
  return CONFIG.baseRayMaxDistance * getFishScale()
}

/**
 * Get scaled max prism length
 */
function getMaxPrismLength() {
  return CONFIG.baseMaxPrismLength * getFishScale()
}

/**
 * Get scaled pentagon surface offset
 */
function getPentagonOffset() {
  return CONFIG.pentagonSurfaceOffset * getFishScale()
}

// ============================================================================
// CONFIG HELPERS - Use these to change settings at runtime
// ============================================================================

export function setRange(distance) {
  CONFIG.baseRayMaxDistance = distance
  console.log(`[Stacker] Base range set to ${distance} (scales with fish)`)
}

export function setPrismRadius(radius) {
  CONFIG.basePrismRadius = radius
  CONFIG.basePentagonRadius = radius
  console.log(`[Stacker] Base prism radius set to ${radius} (scales with fish)`)
}

export function setPrismColor(hex) {
  CONFIG.prismFinalColor = hex
  console.log(`[Stacker] Prism color set to 0x${hex.toString(16)}`)
}

export function setPreviewColor(hex) {
  CONFIG.prismColor = hex
  console.log(`[Stacker] Preview color set to 0x${hex.toString(16)}`)
}

export function setMaxPrisms(count) {
  CONFIG.maxPrisms = count
  console.log(`[Stacker] Max prisms set to ${count}`)
  
  // Remove excess prisms if current count exceeds new limit
  while (placedPrisms.length > CONFIG.maxPrisms) {
    removeOldestPrism()
  }
}

export function setColorBlendRatio(ratio) {
  CONFIG.colorBlendRatio = Math.max(0, Math.min(1, ratio))
  console.log(`[Stacker] Color blend ratio set to ${CONFIG.colorBlendRatio} (0=start only, 1=end only)`)
}

export function setMaxPrismLength(length) {
  CONFIG.baseMaxPrismLength = Math.max(0.1, length)
  console.log(`[Stacker] Base max prism length set to ${CONFIG.baseMaxPrismLength} (scales with fish)`)
}

export function setDespawnTime(seconds) {
  CONFIG.prismDespawnTime = Math.max(0, seconds)
  if (seconds === 0) {
    console.log(`[Stacker] Prism despawn DISABLED (prisms persist until maxPrisms exceeded)`)
  } else {
    console.log(`[Stacker] Prism despawn time set to ${seconds}s (${(seconds / 60).toFixed(1)} min)`)
  }
}

// ============================================================================
// STATE
// ============================================================================

// States: 'idle' | 'aiming' | 'placing'
let state = 'idle'

let sceneRef = null
let raycaster = new THREE.Raycaster()

// Visual elements
let rayLine = null
let pentagonIndicator = null
let pentagonBorder = null
let previewPrism = null

// Placement data
let startPoint = null
let startNormal = null
let sampledColor = null       // Color sampled from the surface we're building from
let sampledRoughness = 0.5    // Roughness sampled from surface
let sampledMetalness = 0.0    // Metalness sampled from surface
let sampledEmissive = null    // Emissive color sampled from surface

// All placed prisms (for cleanup/debug)
let placedPrisms = []
let prismIdCounter = 0

// ============================================================================
// COLOR EXTRACTION (borrowed from camper.js)
// ============================================================================

/**
 * Extract the primary color from a mesh (first color found)
 * @param {THREE.Object3D} mesh 
 * @returns {THREE.Color|null}
 */
function extractColorFromMesh(mesh) {
  let foundColor = null
  let foundRoughness = 0.5
  let foundMetalness = 0.0
  
  mesh.traverse((child) => {
    if (foundColor) return // Already found one
    
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (const mat of materials) {
        if (mat.color && mat.color instanceof THREE.Color) {
          foundColor = mat.color.clone()
          foundRoughness = mat.roughness !== undefined ? mat.roughness : 0.5
          foundMetalness = mat.metalness !== undefined ? mat.metalness : 0.0
          break
        }
      }
    }
  })
  
  return { color: foundColor, roughness: foundRoughness, metalness: foundMetalness }
}

/**
 * Extract all colors from a mesh and blend them
 * @param {THREE.Object3D} mesh 
 * @returns {THREE.Color}
 */
function extractBlendedColorFromMesh(mesh) {
  const colors = []
  let totalRoughness = 0
  let totalMetalness = 0
  let totalEmissiveR = 0, totalEmissiveG = 0, totalEmissiveB = 0
  let hasEmissive = false
  let count = 0
  
  mesh.traverse((child) => {
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      for (const mat of materials) {
        if (mat.color && mat.color instanceof THREE.Color) {
          colors.push(mat.color.clone())
          totalRoughness += mat.roughness !== undefined ? mat.roughness : 0.5
          totalMetalness += mat.metalness !== undefined ? mat.metalness : 0.0
          
          // Sample emissive if present
          if (mat.emissive && mat.emissive instanceof THREE.Color) {
            totalEmissiveR += mat.emissive.r
            totalEmissiveG += mat.emissive.g
            totalEmissiveB += mat.emissive.b
            if (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0) {
              hasEmissive = true
            }
          }
          
          count++
        }
      }
    }
  })
  
  if (colors.length === 0) {
    return { 
      color: new THREE.Color(CONFIG.prismFinalColor), 
      roughness: 0.5, 
      metalness: 0.0,
      emissive: null,
    }
  }
  
  // Blend all colors together
  let r = 0, g = 0, b = 0
  for (const color of colors) {
    r += color.r
    g += color.g
    b += color.b
  }
  
  return {
    color: new THREE.Color(r / colors.length, g / colors.length, b / colors.length),
    roughness: totalRoughness / count,
    metalness: totalMetalness / count,
    emissive: hasEmissive ? new THREE.Color(totalEmissiveR / count, totalEmissiveG / count, totalEmissiveB / count) : null,
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function init(scene) {
  sceneRef = scene
  createRayVisuals()
}

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

/**
 * Create a flat pentagon shape (for indicator)
 */
function createPentagonGeometry(radius) {
  const shape = new THREE.Shape()
  const sides = 5
  
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 // Start at top
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    
    if (i === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  }
  
  return new THREE.ShapeGeometry(shape)
}

/**
 * Create a pentagonal prism geometry
 * @param {number} radius - Radius of pentagon cross-section
 * @param {number} height - Height/length of prism
 */
function createPentagonalPrismGeometry(radius, height) {
  const sides = 5
  const vertices = []
  const indices = []
  
  // Generate pentagon vertices for both caps
  const bottomY = 0
  const topY = height
  
  // Bottom cap vertices (0-4)
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
    vertices.push(
      Math.cos(angle) * radius,
      bottomY,
      Math.sin(angle) * radius
    )
  }
  
  // Top cap vertices (5-9)
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
    vertices.push(
      Math.cos(angle) * radius,
      topY,
      Math.sin(angle) * radius
    )
  }
  
  // Center vertices for caps (10 = bottom center, 11 = top center)
  vertices.push(0, bottomY, 0) // index 10
  vertices.push(0, topY, 0)    // index 11
  
  // Bottom cap faces (facing -Y)
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides
    indices.push(10, next, i) // Reversed winding for bottom
  }
  
  // Top cap faces (facing +Y)
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides
    indices.push(11, sides + i, sides + next)
  }
  
  // Side faces
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides
    const bl = i
    const br = next
    const tl = sides + i
    const tr = sides + next
    
    // Two triangles per side
    indices.push(bl, br, tr)
    indices.push(bl, tr, tl)
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  return geometry
}

// ============================================================================
// VISUAL CREATION
// ============================================================================

function createRayVisuals() {
  // Ray line (from camera to target)
  const rayGeometry = new THREE.BufferGeometry()
  rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3))
  
  const rayMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.rayColor,
    transparent: true,
    opacity: CONFIG.rayOpacity,
  })
  
  rayLine = new THREE.Line(rayGeometry, rayMaterial)
  rayLine.frustumCulled = false
  rayLine.visible = false
  
  // Pentagon indicator at ray end (filled) - created at size 1.0, scaled dynamically
  const pentGeometry = createPentagonGeometry(1.0)
  const pentMaterial = new THREE.MeshBasicMaterial({
    color: CONFIG.pentagonColor,
    transparent: true,
    opacity: CONFIG.pentagonOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  
  pentagonIndicator = new THREE.Mesh(pentGeometry, pentMaterial)
  pentagonIndicator.frustumCulled = false
  pentagonIndicator.visible = false
  
  // Pentagon border (outline) - created at size 1.0, scaled dynamically
  const borderGeometry = createPentagonBorderGeometry(1.0)
  const borderMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.pentagonBorderColor,
    linewidth: CONFIG.pentagonBorderWidth,
    transparent: true,
    opacity: 1.0,
  })
  
  pentagonBorder = new THREE.LineLoop(borderGeometry, borderMaterial)
  pentagonBorder.frustumCulled = false
  pentagonBorder.visible = false
}

/**
 * Create pentagon border geometry (just the outline points)
 */
function createPentagonBorderGeometry(radius) {
  const points = []
  const sides = 5
  
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0
    ))
  }
  
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  return geometry
}

function showRayVisuals() {
  if (!sceneRef) return
  
  if (rayLine && !rayLine.parent) {
    sceneRef.add(rayLine)
  }
  if (pentagonIndicator && !pentagonIndicator.parent) {
    sceneRef.add(pentagonIndicator)
  }
  if (pentagonBorder && !pentagonBorder.parent) {
    sceneRef.add(pentagonBorder)
  }
  
  rayLine.visible = true
  pentagonIndicator.visible = true
  pentagonBorder.visible = true
}

function hideRayVisuals() {
  if (rayLine) rayLine.visible = false
  if (pentagonIndicator) pentagonIndicator.visible = false
  if (pentagonBorder) pentagonBorder.visible = false
}

function updateRayVisuals() {
  if (!rayLine || !pentagonIndicator || !pentagonBorder) return
  
  const result = doRaycast()
  const origin = camera.position.clone()
  const endPoint = result.hit ? result.point : result.farPoint
  
  // Update ray line
  const positions = rayLine.geometry.attributes.position.array
  positions[0] = origin.x
  positions[1] = origin.y
  positions[2] = origin.z
  positions[3] = endPoint.x
  positions[4] = endPoint.y
  positions[5] = endPoint.z
  rayLine.geometry.attributes.position.needsUpdate = true
  
  // Scale pentagon based on fish size
  const pentScale = getPentagonRadius()
  pentagonIndicator.scale.setScalar(pentScale)
  pentagonBorder.scale.setScalar(pentScale)
  
  // Calculate pentagon position with offset from surface
  let pentagonPosition = endPoint.clone()
  
  // Orient pentagon to lie FLAT on the surface (parallel to surface)
  if (result.hit && result.normal) {
    const surfaceNormal = result.normal.clone()
    
    // Offset the pentagon slightly above the surface to prevent z-fighting (scales with fish)
    pentagonPosition.addScaledVector(surfaceNormal, getPentagonOffset())
    
    // Update position first
    pentagonIndicator.position.copy(pentagonPosition)
    pentagonBorder.position.copy(pentagonPosition)
    
    // Use lookAt to orient - lookAt makes -Z point at target
    // We want the face (XY plane) to be parallel to surface
    // So we look at a point BEHIND the surface (opposite to normal)
    const lookTarget = pentagonPosition.clone().sub(surfaceNormal)
    
    // Set up vector to prevent roll issues
    // Use world up, but if surface is too vertical, use a different up
    let upVec = new THREE.Vector3(0, 1, 0)
    if (Math.abs(surfaceNormal.y) > 0.99) {
      // Surface is nearly horizontal (floor/ceiling), use Z as up
      upVec.set(0, 0, 1)
    }
    
    pentagonIndicator.up.copy(upVec)
    pentagonBorder.up.copy(upVec)
    
    pentagonIndicator.lookAt(lookTarget)
    pentagonBorder.lookAt(lookTarget)
  } else {
    // No hit - face toward camera as fallback
    pentagonIndicator.position.copy(pentagonPosition)
    pentagonBorder.position.copy(pentagonPosition)
    pentagonIndicator.lookAt(camera.position)
    pentagonBorder.lookAt(camera.position)
  }
  
  if (result.hit) {
    // Surface detected within range - green
    pentagonIndicator.material.color.setHex(0x00ff00)
    pentagonBorder.material.color.setHex(0x00ff00)
  } else {
    // No surface detected - orange
    pentagonIndicator.material.color.setHex(0xffaa00)
    pentagonBorder.material.color.setHex(0xffaa00)
  }
}

// ============================================================================
// PREVIEW PRISM
// ============================================================================

function createPreviewPrism() {
  if (previewPrism) {
    disposePreviewPrism()
  }
  
  // Use sampled color if available, otherwise fall back to config
  const prismColor = sampledColor ? sampledColor.clone() : new THREE.Color(CONFIG.prismColor)
  
  const geometry = createPentagonalPrismGeometry(getPrismRadius(), 1)
  const materialProps = {
    color: prismColor,
    transparent: true,
    opacity: CONFIG.prismOpacity,
    side: THREE.DoubleSide,
    roughness: sampledRoughness,
    metalness: sampledMetalness,
    flatShading: CONFIG.flatShading,
  }
  
  // Add emissive if sampled
  if (sampledEmissive) {
    materialProps.emissive = sampledEmissive
  }
  
  const material = new THREE.MeshStandardMaterial(materialProps)
  
  previewPrism = new THREE.Mesh(geometry, material)
  previewPrism.frustumCulled = false
  
  if (sceneRef) {
    sceneRef.add(previewPrism)
  }
}

function updatePreviewPrism() {
  if (!previewPrism || !startPoint) return
  
  // Get current cursor position (raycast result)
  const result = doRaycast()
  const endPoint = result.hit ? result.point : result.farPoint
  
  // Calculate prism orientation and length
  const direction = new THREE.Vector3().subVectors(endPoint, startPoint)
  let length = direction.length()
  
  if (length < 0.1) return // Too short
  
  // Clamp to maximum length (scaled with fish)
  length = Math.min(length, getMaxPrismLength())
  
  direction.normalize()
  
  // Recreate geometry with correct length (radius scaled with fish)
  previewPrism.geometry.dispose()
  previewPrism.geometry = createPentagonalPrismGeometry(getPrismRadius(), length)
  
  // Position at start point
  previewPrism.position.copy(startPoint)
  
  // Orient along direction (prism extends along Y, so we need to rotate Y to direction)
  const up = new THREE.Vector3(0, 1, 0)
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(up, direction)
  previewPrism.setRotationFromQuaternion(quaternion)
}

function disposePreviewPrism() {
  if (previewPrism) {
    if (previewPrism.parent) {
      previewPrism.parent.remove(previewPrism)
    }
    previewPrism.geometry.dispose()
    previewPrism.material.dispose()
    previewPrism = null
  }
}

// ============================================================================
// FINAL PRISM PLACEMENT
// ============================================================================

function finalizePrism() {
  if (!previewPrism || !startPoint || !sceneRef) return null
  
  // Get final end point
  const result = doRaycast()
  const rawEndPoint = result.hit ? result.point : result.farPoint
  
  const direction = new THREE.Vector3().subVectors(rawEndPoint, startPoint)
  let length = direction.length()
  
  if (length < 0.1) {
    console.log('[Stacker] Prism too short, cancelled')
    return null
  }
  
  // Clamp to maximum length (scaled with fish)
  const maxLen = getMaxPrismLength()
  const wasClamped = length > maxLen
  length = Math.min(length, maxLen)
  
  direction.normalize()
  
  // Calculate actual end point (may be clamped)
  const endPoint = startPoint.clone().addScaledVector(direction, length)
  
  // Remove oldest prism if we've hit the limit
  if (placedPrisms.length >= CONFIG.maxPrisms) {
    removeOldestPrism()
  }
  
  // Determine final color - blend start and end if end hit a mesh (only if not clamped)
  let finalColor, finalRoughness, finalMetalness, finalEmissive
  
  if (result.hit && result.object && !wasClamped) {
    // End point hit a mesh - blend colors from both points
    const endExtracted = extractBlendedColorFromMesh(result.object)
    
    if (sampledColor && endExtracted.color) {
      // Blend the two colors using configured ratio
      const blendRatio = CONFIG.colorBlendRatio
      finalColor = sampledColor.clone().lerp(endExtracted.color, blendRatio)
      finalRoughness = sampledRoughness + (endExtracted.roughness - sampledRoughness) * blendRatio
      finalMetalness = sampledMetalness + (endExtracted.metalness - sampledMetalness) * blendRatio
      
      // Blend emissive if either has it
      if (sampledEmissive || endExtracted.emissive) {
        const startEmissive = sampledEmissive || new THREE.Color(0, 0, 0)
        const endEmissive = endExtracted.emissive || new THREE.Color(0, 0, 0)
        finalEmissive = startEmissive.clone().lerp(endEmissive, blendRatio)
      }
      
      console.log(`[Stacker] Blending colors: #${sampledColor.getHexString()} + #${endExtracted.color.getHexString()} = #${finalColor.getHexString()}`)
    } else {
      // Fallback to sampled color
      finalColor = sampledColor ? sampledColor.clone() : new THREE.Color(CONFIG.prismFinalColor)
      finalRoughness = sampledRoughness
      finalMetalness = sampledMetalness
      finalEmissive = sampledEmissive
    }
  } else {
    // End point didn't hit a mesh - use start point color only
    finalColor = sampledColor ? sampledColor.clone() : new THREE.Color(CONFIG.prismFinalColor)
    finalRoughness = sampledRoughness
    finalMetalness = sampledMetalness
    finalEmissive = sampledEmissive
  }
  
  // Create final prism mesh with blended material properties (radius scaled with fish)
  const geometry = createPentagonalPrismGeometry(getPrismRadius(), length)
  const materialProps = {
    color: finalColor,
    transparent: false,
    opacity: CONFIG.prismFinalOpacity,
    side: THREE.DoubleSide,
    roughness: finalRoughness,
    metalness: finalMetalness,
    flatShading: CONFIG.flatShading,
  }
  
  // Add emissive if present
  if (finalEmissive) {
    materialProps.emissive = finalEmissive
  }
  
  const material = new THREE.MeshStandardMaterial(materialProps)
  
  const finalPrism = new THREE.Mesh(geometry, material)
  finalPrism.position.copy(startPoint)
  
  const up = new THREE.Vector3(0, 1, 0)
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(up, direction)
  finalPrism.setRotationFromQuaternion(quaternion)
  
  sceneRef.add(finalPrism)
  
  // Track with unique ID and spawn time for despawn
  prismIdCounter++
  const prismId = `stacker-prism-${prismIdCounter}`
  finalPrism.userData.prismId = prismId
  finalPrism.userData.spawnTime = performance.now()  // Track when prism was placed
  placedPrisms.push(finalPrism)
  
  // Create physics collider for the prism
  let physicsBody = null
  if (isPhysicsReady()) {
    const colliderResult = createStaticCollider(prismId, finalPrism, {
      friction: 0.6,
      restitution: 0.1,
    })
    if (colliderResult) {
      physicsBody = colliderResult.collider
      console.log(`[Stacker] Created physics collider for prism: ${prismId}`)
    } else {
      console.warn(`[Stacker] Failed to create physics collider for prism: ${prismId}`)
    }
  }
  
  // Register in MeshRegistry
  MeshRegistry.register(prismId, {
    mesh: finalPrism,
    body: physicsBody,
    category: Category.DECOR,
    tags: [Tag.COLLIDABLE, Tag.STATIC],
    metadata: {
      type: 'pentagonal-prism',
      start: startPoint.clone(),
      end: endPoint.clone(),
      length: length,
      color: finalColor.getHex(),
      roughness: finalRoughness,
      metalness: finalMetalness,
      hasPhysics: !!physicsBody,
    }
  })
  
  console.log(`[Stacker] Placed prism: ${length.toFixed(2)} units, color #${finalColor.getHexString()} (${placedPrisms.length}/${CONFIG.maxPrisms})${physicsBody ? ' [SOLID]' : ' [NO PHYSICS]'}`)
  
  return finalPrism
}

/**
 * Remove the oldest placed prism
 */
function removeOldestPrism() {
  if (placedPrisms.length === 0) return
  
  const oldest = placedPrisms.shift()
  // NOTE: No capacity restore here - this is called when placing a NEW prism
  // pushes out the oldest. Capacity only restores on natural despawn (timer).
  removePrismMesh(oldest, 'oldest (replaced by new)')
}

/**
 * Remove a specific prism mesh
 */
function removePrismMesh(prism, reason = 'unknown') {
  const prismId = prism.userData.prismId
  
  // Remove physics collider first
  if (prismId) {
    removeStaticCollider(prismId)
  }
  
  // Unregister from MeshRegistry
  if (prismId) {
    MeshRegistry.unregister(prismId)
  }
  
  // Remove from scene and dispose
  if (prism.parent) {
    prism.parent.remove(prism)
  }
  prism.geometry.dispose()
  prism.material.dispose()
  
  console.log(`[Stacker] Removed prism (${reason})`)
}

/**
 * Check for and remove expired prisms
 */
function updateDespawnTimers() {
  if (placedPrisms.length === 0) return
  if (CONFIG.prismDespawnTime <= 0) return  // Despawn disabled
  
  const now = performance.now()
  const despawnMs = CONFIG.prismDespawnTime * 1000
  
  // Check from oldest to newest
  const toRemove = []
  for (const prism of placedPrisms) {
    const age = now - prism.userData.spawnTime
    if (age >= despawnMs) {
      toRemove.push(prism)
    }
  }
  
  // Remove expired prisms and restore capacity for each
  for (const prism of toRemove) {
    const idx = placedPrisms.indexOf(prism)
    if (idx !== -1) {
      placedPrisms.splice(idx, 1)
    }
    removePrismMesh(prism, 'despawned after ' + CONFIG.prismDespawnTime + 's')
    
    // Restore capacity when prism despawns naturally (not when replaced by new one)
    const capacityPerPrism = getCapacityCostPerPrism()
    restoreCapacity(capacityPerPrism)
  }
}

/**
 * Get cost per prism in capacity units (100 / maxPrisms)
 */
function getCapacityCostPerPrism() {
  const config = getCapacityConfig()
  return config.max / CONFIG.maxPrisms
}

// ============================================================================
// RAYCASTING
// ============================================================================

function doRaycast() {
  // Get camera direction
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  
  // Get scaled max range
  const maxRange = getRayMaxDistance()
  
  raycaster.set(camera.position, direction)
  raycaster.far = maxRange  // Only cast within max range (scales with fish)
  
  // Get all meshes to test against (exclude our own visuals)
  const testObjects = []
  if (sceneRef) {
    sceneRef.traverse((obj) => {
      if (obj.isMesh && 
          obj !== rayLine && 
          obj !== pentagonIndicator && 
          obj !== pentagonBorder &&
          obj !== previewPrism &&
          obj.visible) {
        testObjects.push(obj)
      }
    })
  }
  
  const intersects = raycaster.intersectObjects(testObjects, false)
  
  if (intersects.length > 0) {
    const hit = intersects[0]
    return {
      hit: true,
      point: hit.point.clone(),
      normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize() : null,
      object: hit.object,
      distance: hit.distance,
      farPoint: hit.point.clone(),  // Use hit point
    }
  }
  
  // No hit - return far point at max range
  const farPoint = camera.position.clone().addScaledVector(direction, maxRange)
  return {
    hit: false,
    point: null,
    normal: null,
    object: null,
    distance: maxRange,
    farPoint: farPoint,
  }
}

// ============================================================================
// STATE MACHINE
// ============================================================================

function enterAiming() {
  state = 'aiming'
  showRayVisuals()
  console.log('[Stacker] Aiming mode - press Q to set start point')
}

function exitAiming() {
  hideRayVisuals()
  
  // Check if we hit a surface within range
  const result = doRaycast()
  
  if (result.hit) {
    startPoint = result.point.clone()
    startNormal = result.normal ? result.normal.clone() : new THREE.Vector3(0, 1, 0)
    
    enterPlacing()
  } else {
    // No hit - cancel
    state = 'idle'
    console.log('[Stacker] No surface hit, cancelled')
  }
}

function enterPlacing() {
  state = 'placing'
  createPreviewPrism()
  console.log('[Stacker] Placing mode - move to extend prism, press Q to finalize')
}

function exitPlacing() {
  // Calculate capacity cost for placing a prism
  const cost = getCapacityCostPerPrism()
  
  // Check if we have enough capacity
  if (!consumeCapacity(cost)) {
    console.log(`[Stacker] Not enough capacity to place prism (need ${cost.toFixed(1)})`)
    // Cancel placing but don't create the prism
    disposePreviewPrism()
    startPoint = null
    startNormal = null
    sampledColor = null
    sampledRoughness = 0.5
    sampledMetalness = 0.0
    sampledEmissive = null
    state = 'idle'
    return
  }
  
  // Place the prism
  finalizePrism()
  disposePreviewPrism()
  
  console.log(`[Stacker] Consumed ${cost.toFixed(1)} capacity for prism placement`)
  
  startPoint = null
  startNormal = null
  sampledColor = null
  sampledRoughness = 0.5
  sampledMetalness = 0.0
  sampledEmissive = null
  state = 'idle'
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Stacker',
  description: 'Build prisms - Q to aim, Q to start, Q to place (uses capacity)',
  capacityMode: 'perUse',  // One-time cost per placed prism
  capacityConfig: CAPACITY_CONFIG,  // Per-ability capacity settings
  
  onActivate: () => {
    if (state === 'idle') {
      // First Q press - activate aiming mode
      enterAiming()
    } else if (state === 'aiming') {
      // Second Q press - select start point
      const result = doRaycast()
      
      if (result.hit) {
        startPoint = result.point.clone()
        startNormal = result.normal ? result.normal.clone() : new THREE.Vector3(0, 1, 0)
        
        // Sample color from the hit mesh
        const extracted = extractBlendedColorFromMesh(result.object)
        sampledColor = extracted.color
        sampledRoughness = extracted.roughness
        sampledMetalness = extracted.metalness
        sampledEmissive = extracted.emissive
        
        console.log(`[Stacker] Sampled color: #${sampledColor.getHexString()}${sampledEmissive ? ' (with emissive)' : ''}`)
        
        hideRayVisuals()
        enterPlacing()
      } else {
        console.log('[Stacker] No surface hit')
      }
    } else if (state === 'placing') {
      // Third Q press - finalize prism (consumes capacity)
      exitPlacing()
    }
  },
  
  onDeactivate: () => {
    // No longer used for state changes, but kept for interface compatibility
  },
  
  onUpdate: (delta) => {
    // Not used - we use onPassiveUpdate instead for tap-based interaction
  },
  
  onPassiveUpdate: (delta) => {
    // Check for expired prisms and remove them
    updateDespawnTimers()
    
    // Update visuals based on current state
    if (state === 'aiming') {
      updateRayVisuals()
    } else if (state === 'placing') {
      updatePreviewPrism()
    }
  },
}

// ============================================================================
// DEBUG / UTILITIES
// ============================================================================

export function clearAllPrisms() {
  for (const prism of placedPrisms) {
    const prismId = prism.userData.prismId
    
    // Remove physics collider
    if (prismId) {
      removeStaticCollider(prismId)
    }
    
    // Unregister from MeshRegistry
    if (prismId) {
      MeshRegistry.unregister(prismId)
    }
    
    if (prism.parent) {
      prism.parent.remove(prism)
    }
    prism.geometry.dispose()
    prism.material.dispose()
  }
  placedPrisms = []
  console.log('[Stacker] Cleared all prisms (including physics)')
}

export function debugStacker() {
  const fishScale = getFishScale()
  
  console.group('[Stacker] Debug')
  console.log('State:', state)
  console.log('Start Point:', startPoint)
  console.log('Placed Prisms:', placedPrisms.length)
  console.log('Physics Ready:', isPhysicsReady())
  console.log('Scene Ref:', !!sceneRef)
  console.log('Fish Scale:', fishScale.toFixed(2))
  console.log('Sampled Color:', sampledColor ? '#' + sampledColor.getHexString() : 'none')
  console.log('Sampled Roughness:', sampledRoughness)
  console.log('Sampled Metalness:', sampledMetalness)
  console.groupEnd()
  
  console.group('[Stacker] Config (base ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ scaled)')
  console.log('Range:', CONFIG.baseRayMaxDistance, 'ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', getRayMaxDistance().toFixed(1))
  console.log('Prism Radius:', CONFIG.basePrismRadius, 'ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', getPrismRadius().toFixed(2))
  console.log('Pentagon Radius:', CONFIG.basePentagonRadius, 'ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', getPentagonRadius().toFixed(2))
  console.log('Max Prism Length:', CONFIG.baseMaxPrismLength, 'ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', getMaxPrismLength().toFixed(1))
  console.log('Max Prisms:', CONFIG.maxPrisms)
  console.log('Capacity Cost Per Prism:', getCapacityCostPerPrism().toFixed(1))
  console.log('Despawn Time:', CONFIG.prismDespawnTime + 's (' + (CONFIG.prismDespawnTime / 60).toFixed(1) + ' min)')
  console.log('Color Blend Ratio:', CONFIG.colorBlendRatio, '(0=start, 1=end)')
  console.log('Pentagon Offset:', CONFIG.pentagonSurfaceOffset, 'ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢', getPentagonOffset().toFixed(2))
  console.log('Default Prism Color:', '0x' + CONFIG.prismFinalColor.toString(16))
  console.groupEnd()
}

// ============================================================================
// CONSOLE ACCESS - Use window.Stacker in browser console
// ============================================================================

if (typeof window !== 'undefined') {
  window.Stacker = {
    CONFIG,
    setRange,
    setPrismRadius,
    setPrismColor,
    setPreviewColor,
    setMaxPrisms,
    setMaxPrismLength,
    setDespawnTime,
    setColorBlendRatio,
    clearAllPrisms,
    debugStacker,
    // Scale helpers
    getFishScale,
    getPrismRadius,
    getPentagonRadius,
    getPentagonOffset,
    getRayMaxDistance,
    getMaxPrismLength,
  }
  
  console.log(`[Stacker] Console access enabled (all dimensions scale with fish). Try:
  - Stacker.setRange(75)           // Base ray range
  - Stacker.setPrismRadius(1.0)    // Base prism radius
  - Stacker.setMaxPrisms(10)       // Max prisms to keep
  - Stacker.setMaxPrismLength(30)  // Base max length
  - Stacker.setDespawnTime(300)    // Despawn after 5 min (0 = disable)
  - Stacker.setColorBlendRatio(0.5)
  - Stacker.clearAllPrisms()
  - Stacker.debugStacker()`)
}