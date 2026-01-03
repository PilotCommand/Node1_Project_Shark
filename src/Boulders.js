/**
 * Boulders.js - Boulder and rock generation
 * 
 * Creates boulder meshes using platonic solids and convex hull generation.
 * Separated from TerrainMaker.js for cleaner organization.
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

// ============================================================================
// CONFIGURATION
// ============================================================================

export const BoulderConfig = {
  color: 0x888888,      // Gray base color
  roughness: 0.9,
  metalness: 0.1,
}

// ============================================================================
// BOULDER TYPES
// ============================================================================

/**
 * Boulder geometry types
 */
export const BoulderType = {
  // Platonic solids (5 total - all regular convex polyhedra)
  TETRAHEDRON: 'tetrahedron',     // 4 faces - sharp pyramid
  CUBE: 'cube',                   // 6 faces - blocky
  OCTAHEDRON: 'octahedron',       // 8 faces - diamond shape
  DODECAHEDRON: 'dodecahedron',   // 12 faces - pentagon faces
  ICOSAHEDRON: 'icosahedron',     // 20 faces - triangle faces, rounder
  
  // Subdivided platonic solids (smoother versions)
  SMOOTH_ICOSAHEDRON: 'smooth_icosahedron',  // Subdivided - almost spherical
  SMOOTH_OCTAHEDRON: 'smooth_octahedron',    // Subdivided - rounded diamond
  
  // Convex hull shapes (organic irregular)
  BOULDER: 'boulder',             // Irregular rocky shape
  SLAB: 'slab',                   // Flat irregular plate
  COLUMN: 'column',               // Tall spire
  JAGGED: 'jagged',               // Very irregular, sharp edges
  
  // Special
  RANDOM: 'random',               // Pick randomly
}

// ============================================================================
// CONVEX HULL GEOMETRY
// ============================================================================

/**
 * Create a convex hull geometry from random 3D points
 * This creates natural-looking irregular rock shapes
 * @param {number} size - Base size of the boulder
 * @param {number} pointCount - Number of points to generate (more = smoother)
 * @param {function} rng - Random number generator
 * @param {object} options - Shape options
 * @returns {THREE.BufferGeometry}
 */
function createConvexBoulderGeometry(size, pointCount, rng, options = {}) {
  const {
    flatness = 1.0,      // <1 = flattened (slab), >1 = tall (column)
    irregularity = 0.3,  // How much to vary from spherical (0-1)
  } = options
  
  const points = []
  
  for (let i = 0; i < pointCount; i++) {
    // Generate points on/near a deformed sphere
    // Use spherical coordinates with variation
    const theta = rng() * Math.PI * 2        // Around Y axis
    const phi = Math.acos(2 * rng() - 1)     // From pole to pole
    
    // Base radius with variation
    const baseRadius = size * (0.7 + rng() * 0.6)  // 70-130% of size
    
    // Add irregular bumps based on angle
    const bumpFreq = 2 + Math.floor(rng() * 4)
    const bump = 1 + Math.sin(theta * bumpFreq) * Math.cos(phi * bumpFreq) * irregularity
    const r = baseRadius * bump
    
    // Convert to cartesian, applying flatness
    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi) * flatness
    const z = r * Math.sin(phi) * Math.sin(theta)
    
    points.push(new THREE.Vector3(x, y, z))
  }
  
  // Create convex hull from points
  const geometry = new THREE.BufferGeometry()
  
  // Compute convex hull using gift wrapping / quickhull approach
  const hullPoints = computeConvexHull(points)
  
  // Convert hull to buffer geometry
  const vertices = []
  const normals = []
  
  for (const face of hullPoints) {
    const [a, b, c] = face
    
    // Calculate face normal
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize()
    
    // Add triangle vertices
    vertices.push(a.x, a.y, a.z)
    vertices.push(b.x, b.y, b.z)
    vertices.push(c.x, c.y, c.z)
    
    // Add normals (same for all vertices in face for flat shading)
    normals.push(normal.x, normal.y, normal.z)
    normals.push(normal.x, normal.y, normal.z)
    normals.push(normal.x, normal.y, normal.z)
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  
  return geometry
}

/**
 * Simple convex hull computation (gift wrapping variant)
 * Returns array of triangle faces, each face is [Vector3, Vector3, Vector3]
 * @param {THREE.Vector3[]} points 
 * @returns {Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>}
 */
function computeConvexHull(points) {
  if (points.length < 4) {
    // Not enough points for a 3D hull
    return []
  }
  
  const faces = []
  const eps = 1e-10
  
  // Find initial tetrahedron
  // Find extremes on X axis
  let minX = 0, maxX = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[minX].x) minX = i
    if (points[i].x > points[maxX].x) maxX = i
  }
  
  if (minX === maxX) maxX = minX === 0 ? 1 : 0
  
  // Find point furthest from line minX-maxX
  let maxDist = -1
  let furthest = -1
  const lineDir = new THREE.Vector3().subVectors(points[maxX], points[minX]).normalize()
  
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX) continue
    const toPoint = new THREE.Vector3().subVectors(points[i], points[minX])
    const proj = toPoint.dot(lineDir)
    const projVec = lineDir.clone().multiplyScalar(proj)
    const dist = toPoint.sub(projVec).length()
    if (dist > maxDist) {
      maxDist = dist
      furthest = i
    }
  }
  
  if (furthest === -1) furthest = (minX + 1) % points.length
  
  // Find point furthest from plane
  const p0 = points[minX]
  const p1 = points[maxX]
  const p2 = points[furthest]
  
  const v01 = new THREE.Vector3().subVectors(p1, p0)
  const v02 = new THREE.Vector3().subVectors(p2, p0)
  const planeNormal = new THREE.Vector3().crossVectors(v01, v02).normalize()
  
  maxDist = -1
  let fourth = -1
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX || i === furthest) continue
    const dist = Math.abs(new THREE.Vector3().subVectors(points[i], p0).dot(planeNormal))
    if (dist > maxDist) {
      maxDist = dist
      fourth = i
    }
  }
  
  if (fourth === -1) {
    // Degenerate case - points are coplanar, just make a simple shape
    faces.push([p0.clone(), p1.clone(), p2.clone()])
    return faces
  }
  
  const p3 = points[fourth]
  
  // Create initial tetrahedron with correct winding
  const center = new THREE.Vector3()
    .add(p0).add(p1).add(p2).add(p3).multiplyScalar(0.25)
  
  const makeFace = (a, b, c) => {
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const normal = new THREE.Vector3().crossVectors(ab, ac)
    const toCenter = new THREE.Vector3().subVectors(center, a)
    
    // Normal should point away from center
    if (normal.dot(toCenter) > 0) {
      return [a.clone(), c.clone(), b.clone()]
    }
    return [a.clone(), b.clone(), c.clone()]
  }
  
  // Initial 4 faces of tetrahedron
  let hullFaces = [
    makeFace(p0, p1, p2),
    makeFace(p0, p1, p3),
    makeFace(p0, p2, p3),
    makeFace(p1, p2, p3),
  ]
  
  // Add remaining points incrementally
  for (let i = 0; i < points.length; i++) {
    if (i === minX || i === maxX || i === furthest || i === fourth) continue
    
    const pt = points[i]
    const visibleFaces = []
    const boundaryEdges = []
    
    // Find faces visible from this point
    for (let f = 0; f < hullFaces.length; f++) {
      const face = hullFaces[f]
      const [a, b, c] = face
      const ab = new THREE.Vector3().subVectors(b, a)
      const ac = new THREE.Vector3().subVectors(c, a)
      const normal = new THREE.Vector3().crossVectors(ab, ac)
      const toPoint = new THREE.Vector3().subVectors(pt, a)
      
      if (toPoint.dot(normal) > eps) {
        visibleFaces.push(f)
      }
    }
    
    if (visibleFaces.length === 0) continue  // Point is inside hull
    
    // Find boundary edges of visible region
    const edgeCount = new Map()
    const edgeKey = (a, b) => {
      const key1 = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}-${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}`
      const key2 = `${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}-${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}`
      return [key1, key2]
    }
    
    for (const f of visibleFaces) {
      const [a, b, c] = hullFaces[f]
      const edges = [[a, b], [b, c], [c, a]]
      for (const [ea, eb] of edges) {
        const [k1, k2] = edgeKey(ea, eb)
        edgeCount.set(k1, (edgeCount.get(k1) || 0) + 1)
        edgeCount.set(k2, (edgeCount.get(k2) || 0) + 1)
      }
    }
    
    // Boundary edges appear only once
    for (const f of visibleFaces) {
      const [a, b, c] = hullFaces[f]
      const edges = [[a, b], [b, c], [c, a]]
      for (const [ea, eb] of edges) {
        const [k1] = edgeKey(ea, eb)
        if (edgeCount.get(k1) === 1) {
          boundaryEdges.push([ea, eb])
        }
      }
    }
    
    // Remove visible faces (in reverse order to preserve indices)
    visibleFaces.sort((a, b) => b - a)
    for (const f of visibleFaces) {
      hullFaces.splice(f, 1)
    }
    
    // Add new faces connecting boundary to point
    for (const [ea, eb] of boundaryEdges) {
      hullFaces.push(makeFace(ea, eb, pt))
    }
  }
  
  return hullFaces
}

// ============================================================================
// BOULDER GEOMETRY FACTORY
// ============================================================================

/**
 * Create a boulder geometry based on type
 * Mix of platonic solids and convex hull shapes for variety
 * @param {string} type - Boulder type from BoulderType
 * @param {number} size - Base size
 * @param {function} rng - Random number generator
 * @returns {THREE.BufferGeometry}
 */
function createBoulderGeometry(type, size, rng) {
  // If random, pick a type with weights
  if (type === BoulderType.RANDOM) {
    const types = [
      // Platonic solids
      BoulderType.TETRAHEDRON,
      BoulderType.CUBE,
      BoulderType.OCTAHEDRON,
      BoulderType.DODECAHEDRON,
      BoulderType.DODECAHEDRON,    // Weighted - classic look
      BoulderType.ICOSAHEDRON,
      // Smooth variants
      BoulderType.SMOOTH_ICOSAHEDRON,
      BoulderType.SMOOTH_OCTAHEDRON,
      // Convex hull organic shapes
      BoulderType.BOULDER,
      BoulderType.BOULDER,         // Weighted - natural look
      BoulderType.BOULDER,
      BoulderType.SLAB,
      BoulderType.COLUMN,
      BoulderType.JAGGED,
    ]
    type = types[Math.floor(rng() * types.length)]
  }
  
  // Point counts for convex hull shapes
  const pointCounts = {
    [BoulderType.BOULDER]: 12 + Math.floor(rng() * 10),  // 12-21 points
    [BoulderType.SLAB]: 10 + Math.floor(rng() * 6),      // 10-15 points
    [BoulderType.COLUMN]: 10 + Math.floor(rng() * 8),    // 10-17 points
    [BoulderType.JAGGED]: 8 + Math.floor(rng() * 6),     // 8-13 points
  }
  
  switch (type) {
    // === PLATONIC SOLIDS (5 regular convex polyhedra) ===
    case BoulderType.TETRAHEDRON:
      // 4 triangular faces - sharp pyramid shape
      return new THREE.TetrahedronGeometry(size, 0)
    
    case BoulderType.CUBE:
      // 6 square faces - blocky, man-made look
      return new THREE.BoxGeometry(size * 1.6, size * 1.6, size * 1.6)
    
    case BoulderType.OCTAHEDRON:
      // 8 triangular faces - diamond/crystal shape
      return new THREE.OctahedronGeometry(size, 0)
    
    case BoulderType.DODECAHEDRON:
      // 12 pentagonal faces - classic boulder
      return new THREE.DodecahedronGeometry(size, 0)
    
    case BoulderType.ICOSAHEDRON:
      // 20 triangular faces - near-spherical
      return new THREE.IcosahedronGeometry(size, 0)
    
    // === SUBDIVIDED SOLIDS (smoother versions) ===
    case BoulderType.SMOOTH_ICOSAHEDRON:
      // Subdivided icosahedron - very smooth, almost spherical
      return new THREE.IcosahedronGeometry(size, 1)
    
    case BoulderType.SMOOTH_OCTAHEDRON:
      // Subdivided octahedron - rounded diamond
      return new THREE.OctahedronGeometry(size, 1)
    
    // === CONVEX HULL SHAPES (organic irregular) ===
    case BoulderType.SLAB:
      // Flat irregular plate - like fallen rock slabs
      return createConvexBoulderGeometry(size, pointCounts[type], rng, {
        flatness: 0.25 + rng() * 0.2,
        irregularity: 0.25 + rng() * 0.2,
      })
    
    case BoulderType.COLUMN:
      // Tall spire - like underwater rock formations
      return createConvexBoulderGeometry(size, pointCounts[type], rng, {
        flatness: 1.8 + rng() * 1.2,
        irregularity: 0.2 + rng() * 0.15,
      })
    
    case BoulderType.JAGGED:
      // Very irregular with sharp edges
      return createConvexBoulderGeometry(size, pointCounts[type], rng, {
        flatness: 0.7 + rng() * 0.6,
        irregularity: 0.5 + rng() * 0.3,
      })
    
    case BoulderType.BOULDER:
    default:
      // Classic irregular boulder
      return createConvexBoulderGeometry(size, pointCounts[type] || 15, rng, {
        flatness: 0.8 + rng() * 0.4,
        irregularity: 0.3 + rng() * 0.2,
      })
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a single boulder with varied geometry and scale
 * @param {object} options
 * @param {number} [options.size=1] - Base boulder size
 * @param {string} [options.type='random'] - Boulder type from BoulderType
 * @param {number} [options.color] - Override color
 * @param {number} [options.seed] - Random seed for variation
 * @param {boolean} [options.nonUniformScale=true] - Apply random scale variation per axis
 * @param {number} [options.scaleVariation=0.3] - How much scale can vary (0-1)
 * @returns {THREE.Mesh}
 */
export function createBoulder(options = {}) {
  const {
    size = 1,
    type = BoulderType.RANDOM,
    color = BoulderConfig.color,
    seed = null,
    nonUniformScale = true,
    scaleVariation = 0.3,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  
  // Create geometry based on type
  const geometry = createBoulderGeometry(type, size, rng)
  
  // Slightly vary the color for each boulder
  const colorVariation = 0.15
  const baseColor = new THREE.Color(color)
  const h = { h: 0, s: 0, l: 0 }
  baseColor.getHSL(h)
  const variedColor = new THREE.Color().setHSL(
    h.h,
    h.s * (1 + (rng() - 0.5) * colorVariation),
    h.l * (1 + (rng() - 0.5) * colorVariation)
  )
  
  const material = new THREE.MeshStandardMaterial({
    color: variedColor,
    roughness: BoulderConfig.roughness,
    metalness: BoulderConfig.metalness,
    flatShading: true,  // Emphasize the faceted look
  })
  
  const boulder = new THREE.Mesh(geometry, material)
  
  // Random rotation for variety
  boulder.rotation.set(
    rng() * Math.PI * 2,
    rng() * Math.PI * 2,
    rng() * Math.PI * 2
  )
  
  // Non-uniform scale for more natural look
  if (nonUniformScale) {
    const baseScale = 1
    boulder.scale.set(
      baseScale + (rng() - 0.5) * scaleVariation * 2,
      baseScale + (rng() - 0.5) * scaleVariation * 2,
      baseScale + (rng() - 0.5) * scaleVariation * 2
    )
  }
  
  // Mark for identification
  boulder.userData.terrainType = 'boulder'
  boulder.userData.collidable = true
  boulder.userData.boulderType = type
  boulder.userData.baseSize = size
  
  return boulder
}

/**
 * Create a cluster of boulders with varied types
 * @param {object} options
 * @param {number} [options.count=5] - Number of boulders
 * @param {number} [options.spread=5] - Spread radius
 * @param {number} [options.minSize=0.5] - Minimum boulder size
 * @param {number} [options.maxSize=2] - Maximum boulder size
 * @param {string} [options.type='random'] - Boulder type (or 'random' for variety)
 * @param {number} [options.seed] - Random seed
 * @returns {THREE.Group}
 */
export function createBoulderCluster(options = {}) {
  const {
    count = 5,
    spread = 5,
    minSize = 0.5,
    maxSize = 2,
    type = BoulderType.RANDOM,
    seed = null,
  } = options
  
  const rng = seed !== null ? createRNG(seed) : Math.random
  const group = new THREE.Group()
  
  for (let i = 0; i < count; i++) {
    const size = range(rng, minSize, maxSize)
    const boulder = createBoulder({ 
      size, 
      type,
      seed: seed ? seed + i : null 
    })
    
    // Random position within spread
    boulder.position.set(
      range(rng, -spread, spread),
      size * 0.3,  // Partially buried
      range(rng, -spread, spread)
    )
    
    group.add(boulder)
  }
  
  group.userData.terrainType = 'boulderCluster'
  group.userData.collidable = true
  
  return group
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  BoulderConfig,
  BoulderType,
  createBoulder,
  createBoulderCluster,
}
