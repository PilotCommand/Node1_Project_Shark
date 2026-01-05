/**
 * stacker.js - Stacker Ability
 * 
 * Build pentagonal prisms by:
 * 1. Press Q → Activate aiming mode (shows ray pointer with pentagon)
 * 2. Press Q → Select start point on a surface
 * 3. Press Q → Finalize and place the prism
 */

import * as THREE from 'three'
import { getPlayer } from './player.js'
import { camera } from './camera.js'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  // Pentagon indicator
  pentagonRadius: 0.5,
  pentagonColor: 0x00ffaa,
  pentagonOpacity: 0.6,
  pentagonBorderColor: 0xffffff,
  pentagonBorderWidth: 2,
  pentagonSurfaceOffset: 0.15,  // Offset from surface to prevent z-fighting
  
  // Ray pointer
  rayColor: 0x00ffaa,
  rayOpacity: 0.6,
  rayMaxDistance: 50,  // Max range for raycast
  
  // Prism
  prismRadius: 0.5,
  prismColor: 0x44aaff,
  prismOpacity: 0.7,
  prismFinalColor: 0x2288dd,
  prismFinalOpacity: 1.0,
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

// All placed prisms (for cleanup/debug)
let placedPrisms = []

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
  
  // Pentagon indicator at ray end (filled)
  const pentGeometry = createPentagonGeometry(CONFIG.pentagonRadius)
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
  
  // Pentagon border (outline)
  const borderGeometry = createPentagonBorderGeometry(CONFIG.pentagonRadius)
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
  
  // Check if within range
  const inRange = result.distance <= CONFIG.rayMaxDistance
  
  // Update ray line
  const positions = rayLine.geometry.attributes.position.array
  positions[0] = origin.x
  positions[1] = origin.y
  positions[2] = origin.z
  positions[3] = endPoint.x
  positions[4] = endPoint.y
  positions[5] = endPoint.z
  rayLine.geometry.attributes.position.needsUpdate = true
  
  // Calculate pentagon position with offset from surface
  let pentagonPosition = endPoint.clone()
  
  // Orient pentagon to lie FLAT on the surface (parallel to surface)
  if (result.hit && result.normal) {
    const surfaceNormal = result.normal.clone()
    
    // Offset the pentagon slightly above the surface to prevent z-fighting
    pentagonPosition.addScaledVector(surfaceNormal, CONFIG.pentagonSurfaceOffset)
    
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
  
  if (result.hit && inRange) {
    // Valid hit within range - green
    pentagonIndicator.material.color.setHex(0x00ff00)
    pentagonBorder.material.color.setHex(0x00ff00)
  } else if (result.hit && !inRange) {
    // Hit but out of range - orange/yellow
    pentagonIndicator.material.color.setHex(0xffaa00)
    pentagonBorder.material.color.setHex(0xffaa00)
  } else {
    // No hit - default color
    pentagonIndicator.material.color.setHex(CONFIG.pentagonColor)
    pentagonBorder.material.color.setHex(CONFIG.pentagonBorderColor)
  }
}

// ============================================================================
// PREVIEW PRISM
// ============================================================================

function createPreviewPrism() {
  if (previewPrism) {
    disposePreviewPrism()
  }
  
  const geometry = createPentagonalPrismGeometry(CONFIG.prismRadius, 1)
  const material = new THREE.MeshStandardMaterial({
    color: CONFIG.prismColor,
    transparent: true,
    opacity: CONFIG.prismOpacity,
    side: THREE.DoubleSide,
  })
  
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
  const length = direction.length()
  
  if (length < 0.1) return // Too short
  
  direction.normalize()
  
  // Recreate geometry with correct length
  previewPrism.geometry.dispose()
  previewPrism.geometry = createPentagonalPrismGeometry(CONFIG.prismRadius, length)
  
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
  const endPoint = result.hit ? result.point : result.farPoint
  
  const direction = new THREE.Vector3().subVectors(endPoint, startPoint)
  const length = direction.length()
  
  if (length < 0.1) {
    console.log('[Stacker] Prism too short, cancelled')
    return null
  }
  
  direction.normalize()
  
  // Create final prism mesh
  const geometry = createPentagonalPrismGeometry(CONFIG.prismRadius, length)
  const material = new THREE.MeshStandardMaterial({
    color: CONFIG.prismFinalColor,
    transparent: false,
    opacity: CONFIG.prismFinalOpacity,
    side: THREE.DoubleSide,
  })
  
  const finalPrism = new THREE.Mesh(geometry, material)
  finalPrism.position.copy(startPoint)
  
  const up = new THREE.Vector3(0, 1, 0)
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(up, direction)
  finalPrism.setRotationFromQuaternion(quaternion)
  
  sceneRef.add(finalPrism)
  placedPrisms.push(finalPrism)
  
  // Register in MeshRegistry
  const prismId = `stacker-prism-${placedPrisms.length}`
  MeshRegistry.register(prismId, {
    mesh: finalPrism,
    body: null,
    category: Category.DECOR,
    tags: [Tag.COLLIDABLE],
    metadata: {
      type: 'pentagonal-prism',
      start: startPoint.clone(),
      end: endPoint.clone(),
      length: length,
    }
  })
  
  console.log(`[Stacker] Placed prism: ${length.toFixed(2)} units long`)
  
  return finalPrism
}

// ============================================================================
// RAYCASTING
// ============================================================================

function doRaycast() {
  // Get camera direction
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  
  raycaster.set(camera.position, direction)
  raycaster.far = CONFIG.rayMaxDistance * 2  // Cast further to detect out-of-range hits
  
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
    }
  }
  
  // No hit - return far point at max range
  const farPoint = camera.position.clone().addScaledVector(direction, CONFIG.rayMaxDistance)
  return {
    hit: false,
    point: null,
    normal: null,
    object: null,
    distance: CONFIG.rayMaxDistance,
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
  
  if (result.hit && result.distance <= CONFIG.rayMaxDistance) {
    startPoint = result.point.clone()
    startNormal = result.normal ? result.normal.clone() : new THREE.Vector3(0, 1, 0)
    
    enterPlacing()
  } else if (result.hit) {
    // Hit but out of range
    state = 'idle'
    console.log('[Stacker] Target out of range, cancelled')
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
  finalizePrism()
  disposePreviewPrism()
  
  startPoint = null
  startNormal = null
  state = 'idle'
}

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Stacker',
  description: 'Build pentagonal prisms - Q to activate, Q to set start, Q to place',
  
  onActivate: () => {
    if (state === 'idle') {
      // First Q press - activate aiming mode
      enterAiming()
    } else if (state === 'aiming') {
      // Second Q press - select start point
      const result = doRaycast()
      const inRange = result.distance <= CONFIG.rayMaxDistance
      
      if (result.hit && inRange) {
        startPoint = result.point.clone()
        startNormal = result.normal ? result.normal.clone() : new THREE.Vector3(0, 1, 0)
        hideRayVisuals()
        enterPlacing()
      } else if (result.hit) {
        console.log('[Stacker] Target out of range')
      } else {
        console.log('[Stacker] No surface hit')
      }
    } else if (state === 'placing') {
      // Third Q press - finalize prism
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
    // Always update visuals based on current state
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
    if (prism.parent) {
      prism.parent.remove(prism)
    }
    prism.geometry.dispose()
    prism.material.dispose()
  }
  placedPrisms = []
  console.log('[Stacker] Cleared all prisms')
}

export function debugStacker() {
  console.group('[Stacker] Debug')
  console.log('State:', state)
  console.log('Start Point:', startPoint)
  console.log('Placed Prisms:', placedPrisms.length)
  console.log('Scene Ref:', !!sceneRef)
  console.groupEnd()
}