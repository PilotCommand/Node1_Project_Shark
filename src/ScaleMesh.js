/**
 * ScaleMesh.js - Unified collision capsule system
 * 
 * Creates a single capsule collider for any fish mesh.
 * Designed for multiplayer: simple, fast, consistent.
 * 
 * Capsule anatomy:
 *   ╭─────╮
 *   │     │  ← Hemisphere (radius)
 *   │     │
 *   │     │  ← Cylinder (halfHeight * 2)
 *   │     │
 *   │     │  ← Hemisphere (radius)
 *   ╰─────╯
 * 
 * Total length = halfHeight * 2 + radius * 2
 * 
 * Fish orientation: -Z = head, +Z = tail
 * Capsule orientation: along Z axis (matching fish)
 */

import * as THREE from 'three'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Scale factor: 1.0 = exact fit, 0.9 = slightly smaller (feels "fair")
  scaleFactor: 0.95,
  
  // Wireframe appearance
  wireframe: {
    color: 0x00ff00,
    opacity: 0.8,
    segments: 16,        // Circular segments
    rings: 8,            // Hemisphere rings
  },
  
  // Minimum dimensions (prevent degenerate capsules)
  minRadius: 0.05,
  minHalfHeight: 0.05,
}

// ============================================================================
// CAPSULE PARAMETER COMPUTATION
// ============================================================================

/**
 * Compute capsule parameters from a fish mesh
 * @param {THREE.Object3D} mesh - Fish mesh (Group with children)
 * @param {object} [traitsOrCreature] - Either traits object { length, height, width } or full creature object
 * @returns {{ radius: number, halfHeight: number, center: THREE.Vector3 }}
 */
export function computeCapsuleParams(mesh, traitsOrCreature = null) {
  // Method 1: Use traits/dimensions if available (faster, more accurate)
  if (traitsOrCreature) {
    // Handle both { traits: { length, height, width } } and { length, height, width }
    const dims = traitsOrCreature.traits || traitsOrCreature
    
    if (dims.length && dims.height && dims.width) {
      return computeFromTraits(dims)
    }
  }
  
  // Method 2: Compute from mesh bounding box
  return computeFromBounds(mesh)
}

/**
 * Compute capsule from fish traits (preferred method)
 */
function computeFromTraits(traits) {
  const { length, height, width } = traits
  
  // Radius = half of the larger cross-section dimension
  const radius = Math.max(height, width) / 2 * CONFIG.scaleFactor
  
  // Half height = half of the cylinder portion (total length minus the two hemispheres)
  const cylinderLength = Math.max(0, length - radius * 2)
  const halfHeight = cylinderLength / 2 * CONFIG.scaleFactor
  
  // Center offset (fish might not be centered at origin)
  const center = new THREE.Vector3(0, 0, 0)
  
  return {
    radius: Math.max(radius, CONFIG.minRadius),
    halfHeight: Math.max(halfHeight, CONFIG.minHalfHeight),
    center,
    // Metadata for debugging
    _source: 'traits',
    _totalLength: halfHeight * 2 + radius * 2,
  }
}

/**
 * Compute capsule from mesh bounding box (fallback method)
 */
function computeFromBounds(mesh) {
  const box = new THREE.Box3().setFromObject(mesh)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Fish is oriented along Z axis
  const length = size.z
  const height = size.y
  const width = size.x
  
  // Radius = half of the larger cross-section dimension
  const radius = Math.max(height, width) / 2 * CONFIG.scaleFactor
  
  // Half height = half of the cylinder portion
  const cylinderLength = Math.max(0, length - radius * 2)
  const halfHeight = cylinderLength / 2 * CONFIG.scaleFactor
  
  return {
    radius: Math.max(radius, CONFIG.minRadius),
    halfHeight: Math.max(halfHeight, CONFIG.minHalfHeight),
    center,
    _source: 'bounds',
    _totalLength: halfHeight * 2 + radius * 2,
    _boundingSize: size.clone(),
  }
}

// ============================================================================
// WIREFRAME CREATION
// ============================================================================

/**
 * Create a wireframe capsule mesh for visualization
 * @param {{ radius: number, halfHeight: number, center: THREE.Vector3 }} params
 * @param {object} [options]
 * @param {number} [options.color] - Wireframe color
 * @param {number} [options.opacity] - Wireframe opacity
 * @returns {THREE.Object3D} - Wireframe mesh group
 */
export function createCapsuleWireframe(params, options = {}) {
  const { radius, halfHeight, center } = params
  const {
    color = CONFIG.wireframe.color,
    opacity = CONFIG.wireframe.opacity,
  } = options
  
  const group = new THREE.Group()
  group.name = 'capsule-wireframe'
  
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: true,
    depthWrite: false,
  })
  
  const segments = CONFIG.wireframe.segments
  const rings = CONFIG.wireframe.rings
  
  // === CYLINDER BODY ===
  // Vertical lines
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    
    const points = [
      new THREE.Vector3(x, y, -halfHeight),
      new THREE.Vector3(x, y, halfHeight),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    group.add(new THREE.Line(geometry, material))
  }
  
  // Horizontal rings on cylinder
  const cylinderRings = 3
  for (let r = 0; r <= cylinderRings; r++) {
    const z = -halfHeight + (r / cylinderRings) * (halfHeight * 2)
    const ringPoints = []
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      ringPoints.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        z
      ))
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(ringPoints)
    group.add(new THREE.Line(geometry, material))
  }
  
  // === HEMISPHERES ===
  // Top hemisphere (positive Z)
  createHemisphereWireframe(group, material, radius, halfHeight, 1, segments, rings)
  
  // Bottom hemisphere (negative Z)
  createHemisphereWireframe(group, material, radius, -halfHeight, -1, segments, rings)
  
  // Position at center offset
  group.position.copy(center)
  
  // Store params for later reference
  group.userData.capsuleParams = params
  
  return group
}

/**
 * Create hemisphere wireframe lines
 */
function createHemisphereWireframe(group, material, radius, zOffset, direction, segments, rings) {
  // Latitude rings
  for (let r = 1; r <= rings; r++) {
    const phi = (r / rings) * (Math.PI / 2)
    const ringRadius = Math.cos(phi) * radius
    const z = zOffset + direction * Math.sin(phi) * radius
    
    const points = []
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2
      points.push(new THREE.Vector3(
        Math.cos(theta) * ringRadius,
        Math.sin(theta) * ringRadius,
        z
      ))
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    group.add(new THREE.Line(geometry, material))
  }
  
  // Longitude lines (meridians)
  const meridians = 4  // Just a few to keep it clean
  for (let i = 0; i < meridians; i++) {
    const theta = (i / meridians) * Math.PI * 2
    const points = []
    
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * (Math.PI / 2)
      const x = Math.cos(theta) * Math.cos(phi) * radius
      const y = Math.sin(theta) * Math.cos(phi) * radius
      const z = zOffset + direction * Math.sin(phi) * radius
      points.push(new THREE.Vector3(x, y, z))
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    group.add(new THREE.Line(geometry, material))
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Attach a capsule wireframe to a fish mesh
 * @param {THREE.Object3D} fishMesh - The fish mesh group
 * @param {object} [traits] - Fish traits from generation
 * @param {object} [options] - Wireframe options
 * @returns {THREE.Object3D} - The wireframe (also added as child)
 */
export function attachCapsuleWireframe(fishMesh, traits = null, options = {}) {
  // Remove existing wireframe if any
  const existing = fishMesh.getObjectByName('capsule-wireframe')
  if (existing) {
    fishMesh.remove(existing)
    disposeWireframe(existing)
  }
  
  // Compute and create
  const params = computeCapsuleParams(fishMesh, traits)
  const wireframe = createCapsuleWireframe(params, options)
  
  fishMesh.add(wireframe)
  
  return wireframe
}

/**
 * Remove and dispose a wireframe
 */
export function disposeWireframe(wireframe) {
  wireframe.traverse(child => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) child.material.dispose()
  })
}

/**
 * Update wireframe visibility
 */
export function setWireframeVisible(fishMesh, visible) {
  const wireframe = fishMesh.getObjectByName('capsule-wireframe')
  if (wireframe) {
    wireframe.visible = visible
  }
}

/**
 * Update wireframe color (useful for state indication)
 */
export function setWireframeColor(fishMesh, color) {
  const wireframe = fishMesh.getObjectByName('capsule-wireframe')
  if (wireframe) {
    wireframe.traverse(child => {
      if (child.material && child.material.color) {
        child.material.color.setHex(color)
      }
    })
  }
}

// ============================================================================
// RAPIER INTEGRATION (Future)
// ============================================================================

/**
 * Create Rapier collider descriptor from capsule params
 * Call this when integrating with Rapier physics
 * 
 * @param {{ radius: number, halfHeight: number }} params
 * @returns {object} - Rapier collider description
 * 
 * Usage with Rapier:
 *   import RAPIER from '@dimforge/rapier3d'
 *   const desc = getRapierColliderDesc(params)
 *   const collider = world.createCollider(
 *     RAPIER.ColliderDesc.capsule(desc.halfHeight, desc.radius),
 *     rigidBody
 *   )
 */
export function getRapierColliderDesc(params) {
  return {
    type: 'capsule',
    halfHeight: params.halfHeight,
    radius: params.radius,
    // Rapier capsule is along Y by default, we need rotation to align with Z
    // Or use the capsuleZ variant if available
    rotation: { axis: [1, 0, 0], angle: Math.PI / 2 },  // Rotate to Z-axis
  }
}

/**
 * Get network-friendly representation of capsule
 * Minimal data for multiplayer sync
 * 
 * @param {{ radius: number, halfHeight: number }} params
 * @returns {Float32Array} - Compact representation (2 floats)
 */
export function serializeCapsule(params) {
  return new Float32Array([params.halfHeight, params.radius])
}

/**
 * Reconstruct params from network data
 * @param {Float32Array} data
 * @returns {{ radius: number, halfHeight: number, center: THREE.Vector3 }}
 */
export function deserializeCapsule(data) {
  return {
    halfHeight: data[0],
    radius: data[1],
    center: new THREE.Vector3(0, 0, 0),
  }
}

// ============================================================================
// DEBUG HELPERS
// ============================================================================

/**
 * Log capsule stats for debugging
 */
export function logCapsuleStats(params, fishClass = 'unknown') {
  const totalLength = params.halfHeight * 2 + params.radius * 2
  const volume = Math.PI * params.radius * params.radius * (params.halfHeight * 2 + (4/3) * params.radius)
  
  console.log(`[ScaleMesh] ${fishClass}:`, {
    radius: params.radius.toFixed(3),
    halfHeight: params.halfHeight.toFixed(3),
    totalLength: totalLength.toFixed(3),
    volume: volume.toFixed(3),
    source: params._source,
  })
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  computeCapsuleParams,
  createCapsuleWireframe,
  attachCapsuleWireframe,
  disposeWireframe,
  setWireframeVisible,
  setWireframeColor,
  getRapierColliderDesc,
  serializeCapsule,
  deserializeCapsule,
  logCapsuleStats,
  CONFIG,
}