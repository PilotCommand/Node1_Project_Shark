/**
 * TerrainMesher.js - Unified terrain collision mesh
 * 
 * Analyzes all terrain elements (floor, boulders, corals) and creates
 * a single merged triangle mesh for physics collisions.
 * 
 * Features:
 * - Collects geometry from floor, boulders, and coral meshes
 * - Merges into single BufferGeometry
 * - Creates green wireframe visualization (toggle with P)
 * - Provides data ready for Rapier trimesh collider
 * 
 * Usage:
 *   import { buildTerrainMesh, toggleTerrainWireframe } from './TerrainMesher.js'
 *   
 *   // After map is created:
 *   const meshData = buildTerrainMesh(scene)
 *   
 *   // Toggle visibility:
 *   toggleTerrainWireframe()
 */

import * as THREE from 'three'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  wireframe: {
    color: 0x00ff00,        // Green to match player capsule
    opacity: 0.5,
    linewidth: 1,           // Note: linewidth > 1 only works on some systems
  },
  
  // Which metadata types to include
  includeTypes: ['floor', 'obstacle'],  // From map.js registry metadata
  
  // Exclude these (intangible, visual-only)
  excludeTypes: ['skybox', 'container'],
  
  // Special handling for lifeRing - extract only coral, not kelp
  lifeRing: {
    enabled: true,
    includeRingTypes: ['coral'],  // userData.ringType values to include
  },
  
  // Simplification (for performance)
  simplify: {
    enabled: false,         // Set true to reduce triangle count
    targetRatio: 0.5,       // Keep 50% of triangles
  },
}

// ============================================================================
// STATE
// ============================================================================

let terrainMesh = null          // The merged geometry (for physics)
let terrainWireframe = null     // The visual wireframe
let wireframeVisible = true
let sceneRef = null

// Cached data for physics
let cachedVertices = null
let cachedIndices = null

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Build the unified terrain mesh from all static collidable objects
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {object} Mesh data { vertices, indices, triangleCount, wireframe }
 */
export function buildTerrainMesh(scene) {
  sceneRef = scene
  
  console.log('[TerrainMesher] Building unified terrain mesh...')
  
  // Clean up old mesh if exists
  if (terrainWireframe) {
    scene.remove(terrainWireframe)
    disposeWireframe(terrainWireframe)
    terrainWireframe = null
  }
  
  if (terrainMesh) {
    terrainMesh.geometry.dispose()
    terrainMesh = null
  }
  
  // Collect all vertices and indices from terrain meshes
  const allPositions = []
  const allIndices = []
  let vertexOffset = 0
  let meshCount = 0
  
  // Get floor mesh
  const floorEntity = MeshRegistry.get('floor')
  if (floorEntity) {
    const result = extractMeshData(floorEntity.mesh)
    if (result) {
      appendMeshData(result, allPositions, allIndices, vertexOffset)
      vertexOffset += result.vertexCount
      meshCount++
      console.log(`[TerrainMesher] Added floor: ${result.vertexCount} vertices, ${result.indexCount / 3} triangles`)
    }
  }
  
  // Get all MAP category entities
  const mapEntities = MeshRegistry.getByCategory(Category.MAP)
  
  for (const entity of mapEntities) {
    // Skip based on metadata type
    const metaType = entity.metadata?.type
    
    if (CONFIG.excludeTypes.includes(metaType)) continue
    if (entity.id === 'floor') continue  // Already added
    
    // Special handling for lifeRing - extract only coral
    if (metaType === 'lifeRing' && CONFIG.lifeRing.enabled) {
      const coralResult = extractCoralFromLifeRing(entity.mesh)
      if (coralResult) {
        appendMeshData(coralResult, allPositions, allIndices, vertexOffset)
        vertexOffset += coralResult.vertexCount
        meshCount += coralResult.coralCount
        console.log(`[TerrainMesher] Added coral: ${coralResult.vertexCount} vertices, ${coralResult.indexCount / 3} triangles from ${coralResult.coralCount} corals`)
      }
      continue
    }
    
    // Standard obstacle handling
    if (!CONFIG.includeTypes.includes(metaType)) continue
    
    // Must be collidable
    if (!entity.tags.has(Tag.COLLIDABLE)) continue
    
    const result = extractMeshData(entity.mesh)
    if (result) {
      appendMeshData(result, allPositions, allIndices, vertexOffset)
      vertexOffset += result.vertexCount
      meshCount++
    }
  }
  
  if (allPositions.length === 0) {
    console.warn('[TerrainMesher] No terrain geometry found!')
    return null
  }
  
  // Create merged geometry
  const mergedGeometry = new THREE.BufferGeometry()
  const positionArray = new Float32Array(allPositions)
  
  // Flip triangle winding order for correct collision normals
  // Rapier trimeshes are one-sided, so normals must point "outward" (up for floor)
  const flippedIndices = []
  for (let i = 0; i < allIndices.length; i += 3) {
    // Reverse winding: ABC -> ACB
    flippedIndices.push(allIndices[i], allIndices[i + 2], allIndices[i + 1])
  }
  
  const indexArray = flippedIndices.length > 65535 
    ? new Uint32Array(flippedIndices) 
    : new Uint16Array(flippedIndices)
  
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3))
  mergedGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1))
  mergedGeometry.computeVertexNormals()
  mergedGeometry.computeBoundingBox()
  mergedGeometry.computeBoundingSphere()
  
  // Store for physics - use flipped indices
  cachedVertices = positionArray
  cachedIndices = new Uint32Array(flippedIndices)  // Always use Uint32 for physics
  
  // Create wireframe visualization
  const wireframeGeometry = new THREE.WireframeGeometry(mergedGeometry)
  const wireframeMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.wireframe.color,
    transparent: true,
    opacity: CONFIG.wireframe.opacity,
    depthTest: true,
    depthWrite: false,
  })
  
  terrainWireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial)
  terrainWireframe.name = 'terrain-collision-wireframe'
  terrainWireframe.visible = wireframeVisible
  terrainWireframe.renderOrder = 999  // Render on top
  
  scene.add(terrainWireframe)
  
  // Create invisible mesh for raycasting/debugging
  const invisibleMaterial = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  })
  terrainMesh = new THREE.Mesh(mergedGeometry, invisibleMaterial)
  terrainMesh.name = 'terrain-collision-mesh'
  // Don't add to scene - just for raycasting
  
  // Stats
  const triangleCount = allIndices.length / 3
  const vertexCount = allPositions.length / 3
  
  console.log(`[TerrainMesher] Built unified mesh:`)
  console.log(`  - Meshes processed: ${meshCount}`)
  console.log(`  - Vertices: ${vertexCount.toLocaleString()}`)
  console.log(`  - Triangles: ${triangleCount.toLocaleString()}`)
  console.log(`  - Bounding box:`, mergedGeometry.boundingBox)
  
  // Register with MeshRegistry
  MeshRegistry.register('terrainCollider', {
    mesh: terrainWireframe,
    category: Category.MAP,
    tags: [Tag.STATIC, Tag.INTANGIBLE],
    metadata: {
      type: 'collisionMesh',
      vertexCount,
      triangleCount,
      meshCount,
    }
  }, true)
  
  return {
    vertices: cachedVertices,
    indices: cachedIndices,
    triangleCount,
    vertexCount,
    wireframe: terrainWireframe,
    geometry: mergedGeometry,
  }
}

// ============================================================================
// GEOMETRY EXTRACTION
// ============================================================================

/**
 * Extract world-space vertices and indices from a mesh or group
 * @param {THREE.Object3D} object 
 * @returns {{ positions: number[], indices: number[], vertexCount: number, indexCount: number } | null}
 */
function extractMeshData(object) {
  const positions = []
  const indices = []
  let localVertexOffset = 0
  
  object.traverse((child) => {
    if (!child.isMesh) return
    if (!child.geometry) return
    
    const geo = child.geometry
    const posAttr = geo.attributes.position
    if (!posAttr) return
    
    // Get world matrix for this mesh
    child.updateWorldMatrix(true, false)
    const worldMatrix = child.matrixWorld
    
    // Extract vertices in world space
    const tempVec = new THREE.Vector3()
    const startVertex = positions.length / 3
    
    for (let i = 0; i < posAttr.count; i++) {
      tempVec.set(
        posAttr.getX(i),
        posAttr.getY(i),
        posAttr.getZ(i)
      )
      tempVec.applyMatrix4(worldMatrix)
      positions.push(tempVec.x, tempVec.y, tempVec.z)
    }
    
    // Extract indices
    if (geo.index) {
      // Indexed geometry
      for (let i = 0; i < geo.index.count; i++) {
        indices.push(geo.index.getX(i) + localVertexOffset)
      }
    } else {
      // Non-indexed: every 3 vertices is a triangle
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i + localVertexOffset)
      }
    }
    
    localVertexOffset = positions.length / 3
  })
  
  if (positions.length === 0) return null
  
  return {
    positions,
    indices,
    vertexCount: positions.length / 3,
    indexCount: indices.length,
  }
}

/**
 * Extract ONLY coral meshes from the lifeRing group
 * Filters by userData.ringType === 'coral'
 * @param {THREE.Object3D} lifeRingGroup 
 * @returns {{ positions: number[], indices: number[], vertexCount: number, indexCount: number, coralCount: number } | null}
 */
function extractCoralFromLifeRing(lifeRingGroup) {
  const positions = []
  const indices = []
  let localVertexOffset = 0
  let coralCount = 0
  
  const allowedTypes = CONFIG.lifeRing.includeRingTypes
  
  lifeRingGroup.traverse((child) => {
    // Check if this is a coral (or its parent group is marked as coral)
    let isCoral = false
    let node = child
    
    // Walk up to find ringType marker
    while (node) {
      if (node.userData?.ringType && allowedTypes.includes(node.userData.ringType)) {
        isCoral = true
        break
      }
      node = node.parent
      // Stop at the lifeRing group level
      if (node === lifeRingGroup) break
    }
    
    if (!isCoral) return
    if (!child.isMesh) return
    if (!child.geometry) return
    
    const geo = child.geometry
    const posAttr = geo.attributes.position
    if (!posAttr) return
    
    // Get world matrix for this mesh
    child.updateWorldMatrix(true, false)
    const worldMatrix = child.matrixWorld
    
    // Extract vertices in world space
    const tempVec = new THREE.Vector3()
    
    for (let i = 0; i < posAttr.count; i++) {
      tempVec.set(
        posAttr.getX(i),
        posAttr.getY(i),
        posAttr.getZ(i)
      )
      tempVec.applyMatrix4(worldMatrix)
      positions.push(tempVec.x, tempVec.y, tempVec.z)
    }
    
    // Extract indices
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        indices.push(geo.index.getX(i) + localVertexOffset)
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i + localVertexOffset)
      }
    }
    
    localVertexOffset = positions.length / 3
    coralCount++
  })
  
  if (positions.length === 0) return null
  
  return {
    positions,
    indices,
    vertexCount: positions.length / 3,
    indexCount: indices.length,
    coralCount,
  }
}

/**
 * Append mesh data to combined arrays
 */
function appendMeshData(meshData, allPositions, allIndices, globalVertexOffset) {
  // Add positions
  for (const p of meshData.positions) {
    allPositions.push(p)
  }
  
  // Add indices with offset
  for (const idx of meshData.indices) {
    allIndices.push(idx + globalVertexOffset)
  }
}

// ============================================================================
// WIREFRAME CONTROLS
// ============================================================================

/**
 * Toggle terrain wireframe visibility
 * @returns {boolean} New visibility state
 */
export function toggleTerrainWireframe() {
  wireframeVisible = !wireframeVisible
  
  if (terrainWireframe) {
    terrainWireframe.visible = wireframeVisible
  }
  
  console.log(`[TerrainMesher] Wireframe: ${wireframeVisible ? 'ON' : 'OFF'}`)
  return wireframeVisible
}

/**
 * Set terrain wireframe visibility explicitly
 * @param {boolean} visible 
 */
export function setTerrainWireframeVisible(visible) {
  wireframeVisible = visible
  
  if (terrainWireframe) {
    terrainWireframe.visible = wireframeVisible
  }
}

/**
 * Check if terrain wireframe is currently visible
 * @returns {boolean}
 */
export function isTerrainWireframeVisible() {
  return wireframeVisible
}

/**
 * Set wireframe color
 * @param {number} color - Hex color
 */
export function setTerrainWireframeColor(color) {
  if (terrainWireframe && terrainWireframe.material) {
    terrainWireframe.material.color.setHex(color)
  }
}

/**
 * Set wireframe opacity
 * @param {number} opacity - 0 to 1
 */
export function setTerrainWireframeOpacity(opacity) {
  if (terrainWireframe && terrainWireframe.material) {
    terrainWireframe.material.opacity = opacity
    terrainWireframe.material.transparent = opacity < 1
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose of wireframe resources
 */
function disposeWireframe(wireframe) {
  if (wireframe.geometry) wireframe.geometry.dispose()
  if (wireframe.material) wireframe.material.dispose()
}

/**
 * Clean up all terrain mesher resources
 */
export function disposeTerrainMesh() {
  if (terrainWireframe && sceneRef) {
    sceneRef.remove(terrainWireframe)
    disposeWireframe(terrainWireframe)
    terrainWireframe = null
  }
  
  if (terrainMesh) {
    terrainMesh.geometry.dispose()
    terrainMesh.material.dispose()
    terrainMesh = null
  }
  
  cachedVertices = null
  cachedIndices = null
  
  MeshRegistry.unregister('terrainCollider')
}

/**
 * Rebuild terrain mesh using cached scene reference
 * Call this after map regeneration
 * @returns {object | null} Mesh data or null if no scene cached
 */
export function rebuildTerrainMesh() {
  if (!sceneRef) {
    console.warn('[TerrainMesher] No scene reference - call buildTerrainMesh(scene) first')
    return null
  }
  
  return buildTerrainMesh(sceneRef)
}

// ============================================================================
// PHYSICS INTEGRATION (RAPIER)
// ============================================================================

/**
 * Get trimesh data for Rapier physics
 * @returns {{ vertices: Float32Array, indices: Uint32Array } | null}
 * 
 * Usage with Rapier:
 *   const { vertices, indices } = getTerrainTrimeshData()
 *   const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
 *   world.createCollider(colliderDesc)
 */
export function getTerrainTrimeshData() {
  if (!cachedVertices || !cachedIndices) {
    console.warn('[TerrainMesher] No terrain mesh built yet')
    return null
  }
  
  return {
    vertices: cachedVertices,
    indices: cachedIndices,
  }
}

/**
 * Get the invisible collision mesh for raycasting
 * @returns {THREE.Mesh | null}
 */
export function getTerrainCollisionMesh() {
  return terrainMesh
}

/**
 * Get terrain wireframe mesh
 * @returns {THREE.LineSegments | null}
 */
export function getTerrainWireframe() {
  return terrainWireframe
}

// ============================================================================
// RAYCASTING HELPERS
// ============================================================================

/**
 * Raycast against the terrain mesh
 * @param {THREE.Raycaster} raycaster 
 * @returns {THREE.Intersection[]}
 */
export function raycastTerrain(raycaster) {
  if (!terrainMesh) return []
  return raycaster.intersectObject(terrainMesh, false)
}

/**
 * Get terrain height at a world position using raycasting
 * @param {number} x - World X
 * @param {number} z - World Z
 * @param {number} [fromY=100] - Start Y position for ray
 * @returns {number | null} Height at position, or null if no hit
 */
export function getTerrainHeightAt(x, z, fromY = 100) {
  if (!terrainMesh) return null
  
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, fromY, z),
    new THREE.Vector3(0, -1, 0)
  )
  
  const hits = raycaster.intersectObject(terrainMesh, false)
  
  if (hits.length > 0) {
    return hits[0].point.y
  }
  
  return null
}

// ============================================================================
// DEBUG
// ============================================================================

/**
 * Log terrain mesh statistics
 */
export function debugTerrainMesh() {
  if (!cachedVertices || !cachedIndices) {
    console.log('[TerrainMesher] No mesh built')
    return
  }
  
  const vertexCount = cachedVertices.length / 3
  const triangleCount = cachedIndices.length / 3
  
  // Calculate bounds
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  
  for (let i = 0; i < cachedVertices.length; i += 3) {
    minX = Math.min(minX, cachedVertices[i])
    maxX = Math.max(maxX, cachedVertices[i])
    minY = Math.min(minY, cachedVertices[i + 1])
    maxY = Math.max(maxY, cachedVertices[i + 1])
    minZ = Math.min(minZ, cachedVertices[i + 2])
    maxZ = Math.max(maxZ, cachedVertices[i + 2])
  }
  
  console.group('[TerrainMesher] Debug Info')
  console.log(`Vertices: ${vertexCount.toLocaleString()}`)
  console.log(`Triangles: ${triangleCount.toLocaleString()}`)
  console.log(`Memory: ~${((cachedVertices.byteLength + cachedIndices.byteLength) / 1024).toFixed(1)} KB`)
  console.log(`Bounds X: ${minX.toFixed(1)} to ${maxX.toFixed(1)}`)
  console.log(`Bounds Y: ${minY.toFixed(1)} to ${maxY.toFixed(1)}`)
  console.log(`Bounds Z: ${minZ.toFixed(1)} to ${maxZ.toFixed(1)}`)
  console.log(`Wireframe visible: ${wireframeVisible}`)
  console.groupEnd()
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Main functions
  buildTerrainMesh,
  rebuildTerrainMesh,
  disposeTerrainMesh,
  
  // Wireframe controls
  toggleTerrainWireframe,
  setTerrainWireframeVisible,
  isTerrainWireframeVisible,
  setTerrainWireframeColor,
  setTerrainWireframeOpacity,
  
  // Getters
  getTerrainTrimeshData,
  getTerrainCollisionMesh,
  getTerrainWireframe,
  
  // Raycasting
  raycastTerrain,
  getTerrainHeightAt,
  
  // Debug
  debugTerrainMesh,
  
  // Config
  CONFIG,
}