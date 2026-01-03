/**
 * Corals.js - Coral reef generation
 * 
 * Creates coral reef clusters using convex hull meshes with tropical colors.
 * Essentially colorful boulder amalgamations.
 */

import * as THREE from 'three'

// ============================================================================
// SEEDED RANDOM HELPERS
// ============================================================================

function createRNG(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function range(rng, min, max) {
  return min + rng() * (max - min)
}

function pick(rng, array) {
  return array[Math.floor(rng() * array.length)]
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CoralConfig = {
  roughness: 0.85,
  metalness: 0.05,
  
  // Dodecahedron cluster settings
  dodecahedronScale: 0.35,    // How spread out the vertices are (lower = tighter cluster)
  pieceScale: 0.35,           // Size of each coral piece relative to formation size
  skipChance: 0.1,            // Chance for each vertex to not spawn a coral (0-1)
  
  // Tropical coral colors
  colors: [
    0xff6b9d,  // Hot pink
    0xff8c69,  // Salmon/coral
    0xffa500,  // Orange
    0xffdb58,  // Mustard yellow
    0x9370db,  // Medium purple
    0x00cdb7,  // Teal/turquoise
    0xff4757,  // Red-pink
    0xc9a0dc,  // Lavender
    0xf0e68c,  // Khaki/pale yellow
    0x20b2aa,  // Light sea green
    0xff7f50,  // Coral (the color!)
    0xdda0dd,  // Plum
    0xe55b3c,  // Burnt orange
    0x87ceeb,  // Sky blue
    0xffc0cb,  // Pink
  ],
}

// ============================================================================
// CONVEX HULL GEOMETRY (same algorithm as Boulders.js)
// ============================================================================

/**
 * Create a convex hull geometry from random 3D points
 */
function createConvexGeometry(size, pointCount, rng, options = {}) {
  const {
    flatness = 1.0,
    irregularity = 0.3,
  } = options
  
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
  
  const geometry = new THREE.BufferGeometry()
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
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  
  return geometry
}

/**
 * Convex hull computation
 */
function computeConvexHull(points) {
  if (points.length < 4) return []
  
  const eps = 1e-10
  
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

// ============================================================================
// CORAL PIECE CREATION
// ============================================================================

/**
 * Create a single coral piece (convex mesh with tropical color)
 */
function createCoralPiece(rng, size, color = null) {
  const pointCount = 8 + Math.floor(rng() * 8)  // 8-15 points
  
  // Random shape variation
  const flatness = 0.5 + rng() * 1.0  // 0.5 to 1.5
  const irregularity = 0.2 + rng() * 0.4
  
  const geometry = createConvexGeometry(size, pointCount, rng, {
    flatness,
    irregularity,
  })
  
  const coralColor = color || pick(rng, CoralConfig.colors)
  
  // Slight color variation
  const baseColor = new THREE.Color(coralColor)
  const hsl = { h: 0, s: 0, l: 0 }
  baseColor.getHSL(hsl)
  const variedColor = new THREE.Color().setHSL(
    hsl.h + (rng() - 0.5) * 0.05,
    Math.min(1, hsl.s * (0.9 + rng() * 0.2)),
    Math.min(1, hsl.l * (0.9 + rng() * 0.2))
  )
  
  const material = new THREE.MeshStandardMaterial({
    color: variedColor,
    roughness: CoralConfig.roughness,
    metalness: CoralConfig.metalness,
    flatShading: true,
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  
  // Random rotation
  mesh.rotation.set(
    rng() * Math.PI * 2,
    rng() * Math.PI * 2,
    rng() * Math.PI * 2
  )
  
  // Slight scale variation
  const scaleVar = 0.2
  mesh.scale.set(
    1 + (rng() - 0.5) * scaleVar,
    1 + (rng() - 0.5) * scaleVar,
    1 + (rng() - 0.5) * scaleVar
  )
  
  return mesh
}

// ============================================================================
// DODECAHEDRON VERTICES
// ============================================================================

/**
 * Generate all 20 vertices of a regular dodecahedron
 * Uses the golden ratio for vertex positions
 */
function getDodecahedronVertices() {
  const phi = (1 + Math.sqrt(5)) / 2  // Golden ratio ≈ 1.618
  const invPhi = 1 / phi
  
  const vertices = []
  
  // Cube vertices: (±1, ±1, ±1)
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        vertices.push(new THREE.Vector3(x, y, z))
      }
    }
  }
  
  // Rectangle vertices in YZ plane: (0, ±1/φ, ±φ)
  for (const y of [-invPhi, invPhi]) {
    for (const z of [-phi, phi]) {
      vertices.push(new THREE.Vector3(0, y, z))
    }
  }
  
  // Rectangle vertices in XY plane: (±1/φ, ±φ, 0)
  for (const x of [-invPhi, invPhi]) {
    for (const y of [-phi, phi]) {
      vertices.push(new THREE.Vector3(x, y, 0))
    }
  }
  
  // Rectangle vertices in XZ plane: (±φ, 0, ±1/φ)
  for (const x of [-phi, phi]) {
    for (const z of [-invPhi, invPhi]) {
      vertices.push(new THREE.Vector3(x, 0, z))
    }
  }
  
  return vertices
}

/**
 * Get the higher 10 vertices of a dodecahedron (sorted by Y, top half)
 */
function getHigherDodecahedronVertices() {
  const allVertices = getDodecahedronVertices()
  
  // Sort by Y coordinate descending
  allVertices.sort((a, b) => b.y - a.y)
  
  // Return only the top 10 vertices
  return allVertices.slice(0, 10)
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a coral formation (cluster of convex pieces arranged in a dodecahedron bunker)
 * Uses only the higher 10 vertices of a dodecahedron, each with 50% spawn chance
 * @param {object} options
 * @param {number} [options.size=1] - Base size of the formation
 * @param {number} [options.seed] - Random seed
 * @param {boolean} [options.multiColor=true] - Use multiple colors or single color
 * @returns {THREE.Group}
 */
export function createCoral(options = {}) {
  const {
    size = 1,
    seed = null,
    multiColor = true,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  // Get the higher 10 vertices of a dodecahedron
  const vertices = getHigherDodecahedronVertices()
  
  // Pick a base color for single-color mode
  const baseColor = multiColor ? null : pick(rng, CoralConfig.colors)
  
  // Piece size relative to formation size
  const pieceSize = size * CoralConfig.pieceScale
  
  // Place a coral piece at each vertex (with skip chance)
  for (const vertex of vertices) {
    // Skip chance for this vertex
    if (rng() < CoralConfig.skipChance) continue
    
    const piece = createCoralPiece(rng, pieceSize, baseColor)
    
    // Position at the dodecahedron vertex, scaled by formation size
    const scale = CoralConfig.dodecahedronScale
    piece.position.set(
      vertex.x * size * scale,
      vertex.y * size * scale,
      vertex.z * size * scale
    )
    
    group.add(piece)
  }
  
  // Random rotation for the whole formation
  group.rotation.y = rng() * Math.PI * 2
  
  // Mark for identification
  group.userData.terrainType = 'coral'
  group.userData.baseSize = size
  group.userData.pieceCount = group.children.length
  
  return group
}

/**
 * Create a coral reef (multiple coral formations)
 * @param {object} options
 * @param {number} [options.count=10] - Number of coral formations
 * @param {number} [options.spread=5] - Spread radius
 * @param {number} [options.minSize=0.5] - Minimum formation size
 * @param {number} [options.maxSize=2] - Maximum formation size
 * @param {number} [options.seed] - Random seed
 * @returns {THREE.Group}
 */
export function createCoralReef(options = {}) {
  const {
    count = 10,
    spread = 5,
    minSize = 0.5,
    maxSize = 2,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  for (let i = 0; i < count; i++) {
    const size = range(rng, minSize, maxSize)
    
    // Randomly choose multi-color or single-color formations
    const multiColor = rng() > 0.3  // 70% multi-color
    
    const coral = createCoral({
      size,
      seed: seed ? seed + i * 7777 : null,
      multiColor,
    })
    
    // Position within spread (clustered toward center)
    const angle = rng() * Math.PI * 2
    const dist = Math.pow(rng(), 0.7) * spread
    coral.position.set(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    )
    
    group.add(coral)
  }
  
  group.userData.terrainType = 'coralReef'
  
  return group
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  CoralConfig,
  createCoral,
  createCoralReef,
}