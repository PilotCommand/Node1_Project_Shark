/**
 * SpawnFactory.js - Playable Space Analysis & Spawning
 * 
 * Analyzes the map to determine what space is NOT occupied by:
 * - Terrain (floor height)
 * - Boulders
 * - Coral
 * 
 * Provides visualization and spawn point generation.
 * 
 * Usage:
 *   import { SpawnFactory } from './SpawnFactory.js'
 *   
 *   SpawnFactory.init(scene)
 *   SpawnFactory.analyzePlayableSpace()
 *   SpawnFactory.visualize()  // Toggle debug dots
 *   
 *   const point = SpawnFactory.getRandomPlayablePoint()
 *   const nearbyPoints = SpawnFactory.getPlayablePointsInRadius(center, 50)
 */

import * as THREE from 'three'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Grid sampling
  gridSpacing: 25,           // Distance between sample points (lower = more detailed)
  verticalLayers: 5,         // Number of Y layers to sample
  
  // World dome (sphere boundary)
  domeRadius: 500,           // Sky dome radius (from TerrainMaker)
  domeMargin: 10,            // Stay this far inside the dome
  
  // Collision margins (extra padding around obstacles)
  terrainMargin: 2,          // Units above terrain to consider "occupied"
  boulderMargin: 2,          // Extra radius around boulders
  coralMargin: 1,            // Extra radius around coral
  ceilingMargin: 2,          // Units below water surface
  
  // Visualization
  pointSize: 3,              // Size of debug dots
  pointOpacity: 0.7,
  
  // Colors (pastel palette for depth zones)
  colors: {
    // Playable space - by depth (Y position)
    nearSurface:  new THREE.Color(0xFFB3BA),  // Pastel pink (Y > 10)
    upperMid:     new THREE.Color(0xFFDFBA),  // Pastel peach (Y: 0 to 10)
    mid:          new THREE.Color(0xFFFFBA),  // Pastel yellow (Y: -15 to 0)
    lowerMid:     new THREE.Color(0xBAFFBA),  // Pastel green (Y: -30 to -15)
    deep:         new THREE.Color(0xBAE1FF),  // Pastel blue (Y < -30)
    
    // Debug - occupied space (should NOT appear if working correctly)
    insideTerrain: new THREE.Color(0xFF4444),  // Red
    insideBoulder: new THREE.Color(0xFF8800),  // Orange
    insideCoral:   new THREE.Color(0xFF00FF),  // Magenta
    aboveWater:    new THREE.Color(0x888888),  // Gray
    outsideDome:   new THREE.Color(0x444444),  // Dark gray
  },
}

// ============================================================================
// STATE
// ============================================================================

let sceneRef = null
let isInitialized = false

// Analysis results
let playablePoints = []
let occupiedPoints = []
let obstacles = []
let analysisStats = null

// Visualization
let debugPointCloud = null
let isVisualized = false

// World bounds (from registry)
let worldBounds = null
let floorY = -50
let ceilingY = 30
let terrainData = null

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize SpawnFactory with scene reference
 * @param {THREE.Scene} scene
 */
function init(scene) {
  if (isInitialized) {
    console.warn('[SpawnFactory] Already initialized')
    return
  }
  
  sceneRef = scene
  isInitialized = true
  console.log('[SpawnFactory] Initialized')
}

/**
 * Check if initialized
 */
function checkInit() {
  if (!isInitialized) {
    console.error('[SpawnFactory] Not initialized - call init(scene) first')
    return false
  }
  return true
}

// ============================================================================
// DATA GATHERING
// ============================================================================

/**
 * Gather world bounds and terrain data from registry
 */
function gatherWorldData() {
  // Get world bounds from mapGroup
  const mapGroup = MeshRegistry.get('mapGroup')
  if (mapGroup?.metadata?.bounds) {
    worldBounds = mapGroup.metadata.bounds
  } else {
    // Fallback defaults
    worldBounds = {
      minX: -500, maxX: 500,
      minY: -50, maxY: 30,
      minZ: -500, maxZ: 500
    }
  }
  
  // Get floor data
  const floor = MeshRegistry.get('floor')
  if (floor) {
    floorY = floor.metadata?.yLevel ?? -50
    terrainData = floor.mesh?.userData?.terrainData ?? null
  }
  
  // Get ceiling (water surface)
  const waterSurface = MeshRegistry.get('waterSurface')
  if (waterSurface) {
    ceilingY = waterSurface.metadata?.yLevel ?? 30
  }
  
  console.log(`[SpawnFactory] World bounds: X(${worldBounds.minX} to ${worldBounds.maxX}), Y(${floorY} to ${ceilingY}), Z(${worldBounds.minZ} to ${worldBounds.maxZ})`)
}

/**
 * Gather all obstacles (boulders + coral) from registry
 * @returns {Array<{center: THREE.Vector3, radius: number, type: string}>}
 */
function gatherObstacles() {
  const result = []
  
  // Get all MAP category entities
  const mapEntities = MeshRegistry.getByCategory(Category.MAP)
  
  for (const entity of mapEntities) {
    // Check for boulders
    if (entity.metadata?.type === 'obstacle') {
      const pos = entity.mesh.position
      const size = entity.metadata.size || 5
      
      result.push({
        center: new THREE.Vector3(pos.x, pos.y, pos.z),
        radius: size + CONFIG.boulderMargin,
        type: 'boulder',
        id: entity.id,
      })
    }
  }
  
  // Get coral from lifeRing group
  const lifeRing = MeshRegistry.get('lifeRing')
  if (lifeRing?.mesh) {
    lifeRing.mesh.traverse((child) => {
      if (child.userData?.terrainType === 'coral') {
        // Get world position of coral group
        const worldPos = new THREE.Vector3()
        child.getWorldPosition(worldPos)
        
        const baseSize = child.userData.baseSize || 10
        
        result.push({
          center: worldPos,
          radius: baseSize * 0.6 + CONFIG.coralMargin,  // Coral is roughly 60% of baseSize
          type: 'coral',
        })
      }
    })
  }
  
  console.log(`[SpawnFactory] Found ${result.filter(o => o.type === 'boulder').length} boulders, ${result.filter(o => o.type === 'coral').length} coral`)
  
  return result
}

// ============================================================================
// POINT CHECKING
// ============================================================================

/**
 * Get terrain height at world X, Z position
 * @param {number} x
 * @param {number} z
 * @returns {number} World Y of terrain surface
 */
function getTerrainHeightAt(x, z) {
  if (!terrainData) return floorY
  
  const localHeight = terrainData.getHeightAtWorld(x, z)
  if (localHeight === null) return floorY
  
  return floorY + localHeight
}

/**
 * Check if a point is inside any obstacle
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{inside: boolean, type: string|null}}
 */
function checkObstacleCollision(x, y, z) {
  const point = new THREE.Vector3(x, y, z)
  
  for (const obstacle of obstacles) {
    const dist = point.distanceTo(obstacle.center)
    if (dist < obstacle.radius) {
      return { inside: true, type: obstacle.type }
    }
  }
  
  return { inside: false, type: null }
}

/**
 * Check if a single point is playable
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{playable: boolean, reason: string|null}}
 */
function isPointPlayable(x, y, z) {
  // Check dome boundary (sphere centered at origin)
  const distFromCenter = Math.sqrt(x * x + y * y + z * z)
  const maxDist = CONFIG.domeRadius - CONFIG.domeMargin
  if (distFromCenter > maxDist) {
    return { playable: false, reason: 'outsideDome' }
  }
  
  // Check ceiling (above water)
  if (y > ceilingY - CONFIG.ceilingMargin) {
    return { playable: false, reason: 'aboveWater' }
  }
  
  // Check terrain
  const terrainHeight = getTerrainHeightAt(x, z)
  if (y < terrainHeight + CONFIG.terrainMargin) {
    return { playable: false, reason: 'insideTerrain' }
  }
  
  // Check obstacles (boulders + coral)
  const obstacleCheck = checkObstacleCollision(x, y, z)
  if (obstacleCheck.inside) {
    return { 
      playable: false, 
      reason: obstacleCheck.type === 'boulder' ? 'insideBoulder' : 'insideCoral'
    }
  }
  
  return { playable: true, reason: null }
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze playable space across the entire map
 * @param {object} options
 * @param {number} [options.spacing] - Grid spacing override
 * @param {number} [options.layers] - Vertical layers override
 * @returns {object} Analysis stats
 */
function analyzePlayableSpace(options = {}) {
  if (!checkInit()) return null
  
  const spacing = options.spacing || CONFIG.gridSpacing
  const layers = options.layers || CONFIG.verticalLayers
  
  console.log(`[SpawnFactory] Analyzing playable space (spacing: ${spacing}, layers: ${layers})...`)
  const startTime = performance.now()
  
  // Gather world data
  gatherWorldData()
  
  // Gather obstacles
  obstacles = gatherObstacles()
  
  // Reset results
  playablePoints = []
  occupiedPoints = []
  
  // Stats tracking
  const stats = {
    total: 0,
    playable: 0,
    occupied: {
      terrain: 0,
      boulder: 0,
      coral: 0,
      water: 0,
      dome: 0,
    }
  }
  
  // Calculate Y levels to sample
  const yMin = floorY + 5  // Start slightly above floor
  const yMax = ceilingY - 5  // End slightly below surface
  const yStep = (yMax - yMin) / (layers - 1)
  const yLevels = []
  for (let i = 0; i < layers; i++) {
    yLevels.push(yMin + i * yStep)
  }
  
  // Sample grid
  for (let x = worldBounds.minX; x <= worldBounds.maxX; x += spacing) {
    for (let z = worldBounds.minZ; z <= worldBounds.maxZ; z += spacing) {
      for (const y of yLevels) {
        stats.total++
        
        const result = isPointPlayable(x, y, z)
        
        if (result.playable) {
          stats.playable++
          playablePoints.push(new THREE.Vector3(x, y, z))
        } else {
          // Track why it's occupied
          switch (result.reason) {
            case 'insideTerrain': stats.occupied.terrain++; break
            case 'insideBoulder': stats.occupied.boulder++; break
            case 'insideCoral': stats.occupied.coral++; break
            case 'aboveWater': stats.occupied.water++; break
            case 'outsideDome': stats.occupied.dome++; break
          }
          
          // Store for debug visualization (optional)
          occupiedPoints.push({
            point: new THREE.Vector3(x, y, z),
            reason: result.reason,
          })
        }
      }
    }
  }
  
  const elapsed = performance.now() - startTime
  
  analysisStats = {
    ...stats,
    playablePercent: ((stats.playable / stats.total) * 100).toFixed(1),
    pointCount: playablePoints.length,
    obstacleCount: obstacles.length,
    elapsed: elapsed.toFixed(0),
  }
  
  console.log(`[SpawnFactory] Analysis complete in ${elapsed.toFixed(0)}ms`)
  console.log(`  Total points: ${stats.total}`)
  console.log(`  Playable: ${stats.playable} (${analysisStats.playablePercent}%)`)
  console.log(`  Occupied by terrain: ${stats.occupied.terrain}`)
  console.log(`  Occupied by boulder: ${stats.occupied.boulder}`)
  console.log(`  Occupied by coral: ${stats.occupied.coral}`)
  console.log(`  Above water: ${stats.occupied.water}`)
  console.log(`  Outside dome: ${stats.occupied.dome}`)
  
  return analysisStats
}

// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Get color for a point based on its Y position (depth)
 * @param {number} y
 * @returns {THREE.Color}
 */
function getDepthColor(y) {
  if (y > 10) return CONFIG.colors.nearSurface
  if (y > 0) return CONFIG.colors.upperMid
  if (y > -15) return CONFIG.colors.mid
  if (y > -30) return CONFIG.colors.lowerMid
  return CONFIG.colors.deep
}

/**
 * Get color for an occupied point based on reason
 * @param {string} reason
 * @returns {THREE.Color}
 */
function getOccupiedColor(reason) {
  switch (reason) {
    case 'insideTerrain': return CONFIG.colors.insideTerrain
    case 'insideBoulder': return CONFIG.colors.insideBoulder
    case 'insideCoral': return CONFIG.colors.insideCoral
    case 'aboveWater': return CONFIG.colors.aboveWater
    case 'outsideDome': return CONFIG.colors.outsideDome
    default: return new THREE.Color(0x888888)
  }
}

/**
 * Create or update visualization
 * @param {object} options
 * @param {boolean} [options.showOccupied=false] - Also show occupied points (debug)
 */
function visualize(options = {}) {
  if (!checkInit()) return
  
  const { showOccupied = false } = options
  
  // Run analysis if not done yet
  if (playablePoints.length === 0 && occupiedPoints.length === 0) {
    analyzePlayableSpace()
  }
  
  // Remove existing visualization
  clearVisualization()
  
  // Prepare point data
  const allPoints = []
  const allColors = []
  
  // Add playable points
  for (const point of playablePoints) {
    allPoints.push(point.x, point.y, point.z)
    const color = getDepthColor(point.y)
    allColors.push(color.r, color.g, color.b)
  }
  
  // Optionally add occupied points
  if (showOccupied) {
    for (const { point, reason } of occupiedPoints) {
      allPoints.push(point.x, point.y, point.z)
      const color = getOccupiedColor(reason)
      allColors.push(color.r, color.g, color.b)
    }
  }
  
  if (allPoints.length === 0) {
    console.warn('[SpawnFactory] No points to visualize')
    return
  }
  
  // Create geometry
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPoints, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3))
  
  // Create material
  const material = new THREE.PointsMaterial({
    size: CONFIG.pointSize,
    vertexColors: true,
    transparent: true,
    opacity: CONFIG.pointOpacity,
    sizeAttenuation: true,
  })
  
  // Create points mesh
  debugPointCloud = new THREE.Points(geometry, material)
  debugPointCloud.name = 'SpawnFactory_Debug'
  debugPointCloud.userData.isDebug = true
  
  sceneRef.add(debugPointCloud)
  isVisualized = true
  
  const totalShown = showOccupied 
    ? playablePoints.length + occupiedPoints.length 
    : playablePoints.length
  
  console.log(`[SpawnFactory] Visualization: ${totalShown} points${showOccupied ? ' (including occupied)' : ''}`)
}

/**
 * Toggle visualization on/off
 * @param {object} options - Passed to visualize() if turning on
 * @returns {boolean} New visibility state
 */
function toggleVisualization(options = {}) {
  if (!checkInit()) return false
  
  if (isVisualized) {
    clearVisualization()
    return false
  } else {
    visualize(options)
    return true
  }
}

/**
 * Remove visualization from scene
 */
function clearVisualization() {
  if (debugPointCloud && sceneRef) {
    sceneRef.remove(debugPointCloud)
    debugPointCloud.geometry.dispose()
    debugPointCloud.material.dispose()
    debugPointCloud = null
  }
  isVisualized = false
}

// ============================================================================
// SPAWN POINT RETRIEVAL
// ============================================================================

/**
 * Get a random playable point
 * @returns {THREE.Vector3|null}
 */
function getRandomPlayablePoint() {
  if (playablePoints.length === 0) {
    console.warn('[SpawnFactory] No playable points - run analyzePlayableSpace() first')
    return null
  }
  
  const index = Math.floor(Math.random() * playablePoints.length)
  return playablePoints[index].clone()
}

/**
 * Get playable points within a radius of a center point
 * @param {THREE.Vector3} center
 * @param {number} radius
 * @returns {THREE.Vector3[]}
 */
function getPlayablePointsInRadius(center, radius) {
  const radiusSq = radius * radius
  const results = []
  
  for (const point of playablePoints) {
    const distSq = center.distanceToSquared(point)
    if (distSq <= radiusSq) {
      results.push(point.clone())
    }
  }
  
  return results
}

/**
 * Get playable points in a specific depth range
 * @param {number} minY
 * @param {number} maxY
 * @returns {THREE.Vector3[]}
 */
function getPlayablePointsInDepthRange(minY, maxY) {
  return playablePoints
    .filter(p => p.y >= minY && p.y <= maxY)
    .map(p => p.clone())
}

/**
 * Get a random playable point within constraints
 * @param {object} constraints
 * @param {THREE.Vector3} [constraints.near] - Prefer points near this position
 * @param {number} [constraints.nearRadius] - Max distance from 'near' position
 * @param {number} [constraints.minY] - Minimum Y
 * @param {number} [constraints.maxY] - Maximum Y
 * @returns {THREE.Vector3|null}
 */
function getRandomPlayablePointConstrained(constraints = {}) {
  let candidates = [...playablePoints]
  
  // Filter by depth range
  if (constraints.minY !== undefined) {
    candidates = candidates.filter(p => p.y >= constraints.minY)
  }
  if (constraints.maxY !== undefined) {
    candidates = candidates.filter(p => p.y <= constraints.maxY)
  }
  
  // Filter by proximity
  if (constraints.near && constraints.nearRadius) {
    const radiusSq = constraints.nearRadius * constraints.nearRadius
    candidates = candidates.filter(p => 
      constraints.near.distanceToSquared(p) <= radiusSq
    )
  }
  
  if (candidates.length === 0) {
    console.warn('[SpawnFactory] No points match constraints')
    return null
  }
  
  const index = Math.floor(Math.random() * candidates.length)
  return candidates[index].clone()
}

// ============================================================================
// DEBUG
// ============================================================================

/**
 * Log debug info
 */
function debug() {
  console.group('[SpawnFactory] Debug Info')
  console.log('Initialized:', isInitialized)
  console.log('Scene:', sceneRef ? 'Connected' : 'None')
  console.log('Playable points:', playablePoints.length)
  console.log('Occupied points:', occupiedPoints.length)
  console.log('Obstacles:', obstacles.length)
  console.log('Visualized:', isVisualized)
  
  if (analysisStats) {
    console.group('Last Analysis')
    console.log('Total sampled:', analysisStats.total)
    console.log('Playable:', analysisStats.playable, `(${analysisStats.playablePercent}%)`)
    console.log('Terrain collisions:', analysisStats.occupied?.terrain)
    console.log('Boulder collisions:', analysisStats.occupied?.boulder)
    console.log('Coral collisions:', analysisStats.occupied?.coral)
    console.log('Outside dome:', analysisStats.occupied?.dome)
    console.log('Time:', analysisStats.elapsed, 'ms')
    console.groupEnd()
  }
  
  if (worldBounds) {
    console.group('World Bounds')
    console.log('X:', worldBounds.minX, 'to', worldBounds.maxX)
    console.log('Y:', floorY, 'to', ceilingY)
    console.log('Z:', worldBounds.minZ, 'to', worldBounds.maxZ)
    console.log('Dome radius:', CONFIG.domeRadius, '(margin:', CONFIG.domeMargin + ')')
    console.groupEnd()
  }
  
  console.groupEnd()
}

/**
 * Update configuration
 * @param {object} newConfig - Partial config to merge
 */
function setConfig(newConfig) {
  Object.assign(CONFIG, newConfig)
  console.log('[SpawnFactory] Config updated:', newConfig)
}

/**
 * Get current configuration
 */
function getConfig() {
  return { ...CONFIG }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Reset all state
 */
function reset() {
  clearVisualization()
  playablePoints = []
  occupiedPoints = []
  obstacles = []
  analysisStats = null
  console.log('[SpawnFactory] Reset')
}

/**
 * Full cleanup
 */
function dispose() {
  reset()
  sceneRef = null
  isInitialized = false
  console.log('[SpawnFactory] Disposed')
}

// ============================================================================
// EXPORTS
// ============================================================================

export const SpawnFactory = {
  // Initialization
  init,
  dispose,
  reset,
  
  // Analysis
  analyzePlayableSpace,
  isPointPlayable,
  
  // Visualization
  visualize,
  toggleVisualization,
  clearVisualization,
  
  // Spawn points
  getRandomPlayablePoint,
  getPlayablePointsInRadius,
  getPlayablePointsInDepthRange,
  getRandomPlayablePointConstrained,
  
  // Config
  setConfig,
  getConfig,
  
  // Debug
  debug,
  
  // Direct access (for advanced use)
  get playablePoints() { return playablePoints },
  get obstacles() { return obstacles },
  get stats() { return analysisStats },
  get isVisualized() { return isVisualized },
}

export default SpawnFactory