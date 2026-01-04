/**
 * Feeding.js - Predation system for players eating NPCs and other players
 * 
 * DESIGN:
 *   - Visual mesh volume determines "size" for eating eligibility
 *   - Larger creatures can eat smaller creatures
 *   - Player → NPC: Pure distance + volume check (no physics needed)
 *   - Player → Player: Physics capsule collision triggers check
 * 
 * VOLUME HIERARCHY:
 *   - visualVolume: True mesh volume (sum of all BoxGeometry parts)
 *   - capsuleVolume: Physics approximation (for collision)
 *   - We use visualVolume for feeding decisions (more accurate to appearance)
 * 
 * USAGE:
 *   import { Feeding } from './Feeding.js'
 *   
 *   // Initialize (after player and FishAdder)
 *   Feeding.init()
 *   
 *   // In game loop
 *   Feeding.update(delta)
 *   
 *   // For player-player (call from Physics.js collision)
 *   Feeding.handlePlayerCollision(player1Data, player2Data)
 */

import * as THREE from 'three'
import { getPlayer, addFood, getPlayerNormalizationInfo } from './player.js'
import { MeshRegistry } from './MeshRegistry.js'
import { computeGroupVolume } from './MeshVolume.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Eating range (distance from center to center)
  eatRange: 8,
  
  // Size ratio required to eat (1.0 = any larger can eat, 1.3 = must be 30% larger)
  sizeRatioRequired: 1.0,
  
  // How much of prey's volume converts to food (0.5 = 50%)
  volumeToFoodRatio: 0.5,
  
  // Cooldown between eating (prevents eating multiple per frame)
  eatCooldown: 0.5,  // seconds
  
  // Visual feedback
  showEatEffects: true,
  
  // Debug logging
  debug: false,
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false
let playerMesh = null
let lastEatTime = 0

// Track recent meals for stats
const recentMeals = []
const MAX_RECENT_MEALS = 10

// Callbacks for external systems
const onEatCallbacks = []

// Reference to FishAdder (set during init)
let fishAdderRef = null

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize feeding system
 * @param {object} fishAdder - Reference to FishAdder module
 */
function init(fishAdder) {
  if (isInitialized) {
    console.warn('[Feeding] Already initialized')
    return
  }
  
  fishAdderRef = fishAdder
  playerMesh = getPlayer()
  
  if (!playerMesh) {
    console.error('[Feeding] Player not found - initialize player first')
    return
  }
  
  if (!fishAdderRef) {
    console.error('[Feeding] FishAdder reference required')
    return
  }
  
  isInitialized = true
  console.log('[Feeding] Initialized')
  console.log(`  - Eat range: ${CONFIG.eatRange}`)
  console.log(`  - Size ratio: ${CONFIG.sizeRatioRequired}x`)
  console.log(`  - Food conversion: ${CONFIG.volumeToFoodRatio * 100}%`)
}

// ============================================================================
// PLAYER VOLUME HELPERS
// ============================================================================

/**
 * Get player's current visual volume
 * Computed fresh each time (accounts for growth)
 * @returns {number} Volume in cubic meters
 */
function getPlayerVisualVolume() {
  if (!playerMesh) {
    playerMesh = getPlayer()
  }
  
  if (!playerMesh) return 0
  
  // Compute true visual volume from mesh
  return computeGroupVolume(playerMesh, true)
}

/**
 * Get player's capsule volume (for player-player comparisons)
 * @returns {number} Volume in cubic meters
 */
function getPlayerCapsuleVolume() {
  const info = getPlayerNormalizationInfo()
  if (!info) return 0
  
  return info.gameplay.volume
}

// ============================================================================
// CORE FEEDING LOGIC
// ============================================================================

/**
 * Check if predator can eat prey based on volume
 * @param {number} predatorVolume 
 * @param {number} preyVolume 
 * @returns {boolean}
 */
function canEat(predatorVolume, preyVolume) {
  if (preyVolume <= 0) return false
  
  const ratio = predatorVolume / preyVolume
  return ratio >= CONFIG.sizeRatioRequired
}

/**
 * Calculate food value from prey volume
 * @param {number} preyVolume 
 * @returns {number} Food value to add
 */
function calculateFoodValue(preyVolume) {
  return preyVolume * CONFIG.volumeToFoodRatio
}

// ============================================================================
// PLAYER → NPC FEEDING
// ============================================================================

/**
 * Check and process player eating NPCs
 * Called every frame from update()
 * 
 * @param {number} currentTime - Current game time
 * @returns {object|null} Eaten NPC data or null
 */
function checkPlayerNPCFeeding(currentTime) {
  if (!isInitialized || !fishAdderRef) return null
  
  // Cooldown check
  if (currentTime - lastEatTime < CONFIG.eatCooldown) {
    return null
  }
  
  // Get player data
  playerMesh = getPlayer()
  if (!playerMesh) return null
  
  const playerPos = playerMesh.position
  const playerVolume = getPlayerVisualVolume()
  
  if (playerVolume <= 0) return null
  
  // Get nearby NPCs from FishAdder's spatial hash
  const nearbyNPCs = fishAdderRef.getNearbyNPCs(playerPos, CONFIG.eatRange * 2)
  
  if (!nearbyNPCs || nearbyNPCs.length === 0) return null
  
  const eatRangeSq = CONFIG.eatRange * CONFIG.eatRange
  
  // Find first edible NPC in range
  for (const npc of nearbyNPCs) {
    if (!npc || !npc.mesh) continue
    
    // Distance check
    const distSq = playerPos.distanceToSquared(npc.mesh.position)
    if (distSq > eatRangeSq) continue
    
    // Volume check - use visualVolume (true mesh volume)
    const npcVolume = npc.visualVolume || 0
    
    if (canEat(playerVolume, npcVolume)) {
      // EAT!
      return consumeNPC(npc, playerVolume, npcVolume, currentTime)
    }
  }
  
  return null
}

/**
 * Consume an NPC
 * @param {object} npc - NPC data from FishAdder
 * @param {number} playerVolume - Player's volume
 * @param {number} npcVolume - NPC's volume
 * @param {number} currentTime - Current game time
 * @returns {object} Meal data
 */
function consumeNPC(npc, playerVolume, npcVolume, currentTime) {
  const foodValue = calculateFoodValue(npcVolume)
  
  // Record meal
  const meal = {
    type: 'npc',
    preyId: npc.id,
    preyClass: npc.creatureClass,
    preyDisplayName: npc.displayName,
    preyVolume: npcVolume,
    playerVolumeBefore: playerVolume,
    foodValue,
    timestamp: currentTime,
    position: npc.mesh.position.clone(),
  }
  
  // Add food to player (triggers growth)
  const growthResult = addFood(foodValue)
  meal.playerVolumeAfter = growthResult.totalVolume
  meal.volumeGained = growthResult.volumeGained
  
  // Remove NPC from world
  fishAdderRef.removeFish(npc.id, true)  // true = respawn replacement
  
  // Update state
  lastEatTime = currentTime
  
  // Track meal
  recentMeals.unshift(meal)
  if (recentMeals.length > MAX_RECENT_MEALS) {
    recentMeals.pop()
  }
  
  // Fire callbacks
  for (const callback of onEatCallbacks) {
    callback(meal)
  }
  
  // Log
  if (CONFIG.debug) {
    console.log(`[Feeding] Ate ${npc.displayName}!`, {
      preyVolume: npcVolume.toFixed(2),
      foodGained: foodValue.toFixed(2),
      newVolume: meal.playerVolumeAfter.toFixed(2),
    })
  }
  
  // Spawn effects
  if (CONFIG.showEatEffects) {
    spawnEatEffect(meal.position)
  }
  
  return meal
}

// ============================================================================
// PLAYER → PLAYER FEEDING (Multiplayer)
// ============================================================================

/**
 * Handle collision between two players
 * Called from Physics.js when player capsules collide
 * 
 * @param {object} player1Data - First player's data { id, mesh, capsuleVolume, ... }
 * @param {object} player2Data - Second player's data
 * @returns {object|null} Result of feeding or null if no feeding occurred
 */
function handlePlayerCollision(player1Data, player2Data) {
  if (!player1Data || !player2Data) return null
  
  // Get volumes (use capsule volume for player-player as it's what physics uses)
  const vol1 = player1Data.capsuleVolume || 0
  const vol2 = player2Data.capsuleVolume || 0
  
  if (vol1 <= 0 || vol2 <= 0) return null
  
  // Determine predator and prey
  let predator, prey, predatorVolume, preyVolume
  
  if (vol1 > vol2) {
    predator = player1Data
    prey = player2Data
    predatorVolume = vol1
    preyVolume = vol2
  } else if (vol2 > vol1) {
    predator = player2Data
    prey = player1Data
    predatorVolume = vol2
    preyVolume = vol1
  } else {
    // Equal size - no eating
    return null
  }
  
  // Check if size difference is enough
  if (!canEat(predatorVolume, preyVolume)) {
    return null
  }
  
  // Consume!
  return consumePlayer(predator, prey, predatorVolume, preyVolume)
}

/**
 * Consume another player
 * @param {object} predator - Predator player data
 * @param {object} prey - Prey player data
 * @param {number} predatorVolume 
 * @param {number} preyVolume 
 * @returns {object} Meal data
 */
function consumePlayer(predator, prey, predatorVolume, preyVolume) {
  const foodValue = calculateFoodValue(preyVolume)
  
  const meal = {
    type: 'player',
    predatorId: predator.id,
    preyId: prey.id,
    preyVolume,
    predatorVolumeBefore: predatorVolume,
    foodValue,
    timestamp: performance.now() / 1000,
    position: prey.mesh?.position?.clone() || new THREE.Vector3(),
  }
  
  // TODO: In multiplayer, this needs to:
  // 1. Send eat event to server
  // 2. Server validates and broadcasts
  // 3. Prey player respawns
  // 4. Predator gains food
  
  // For now, log the event
  console.log(`[Feeding] Player ${predator.id} ate player ${prey.id}!`, {
    preyVolume: preyVolume.toFixed(2),
    foodValue: foodValue.toFixed(2),
  })
  
  // Fire callbacks
  for (const callback of onEatCallbacks) {
    callback(meal)
  }
  
  return meal
}

// ============================================================================
// NPC → NPC FEEDING (AI Predation)
// ============================================================================

/**
 * Check if one NPC can eat another
 * Used by FishAdder's AI system
 * 
 * @param {object} predatorNPC 
 * @param {object} preyNPC 
 * @returns {boolean}
 */
function canNPCEatNPC(predatorNPC, preyNPC) {
  if (!predatorNPC || !preyNPC) return false
  
  const predatorVolume = predatorNPC.visualVolume || 0
  const preyVolume = preyNPC.visualVolume || 0
  
  return canEat(predatorVolume, preyVolume)
}

/**
 * Process NPC eating another NPC
 * Called by FishAdder when NPC predation occurs
 * 
 * @param {object} predatorNPC 
 * @param {object} preyNPC 
 * @returns {object} Result with growth amount
 */
function processNPCEatNPC(predatorNPC, preyNPC) {
  const preyVolume = preyNPC.visualVolume || 0
  const foodValue = calculateFoodValue(preyVolume)
  
  // Calculate new scale for predator
  const currentVolume = predatorNPC.visualVolume || 1
  const newVolume = currentVolume + foodValue
  const scaleRatio = Math.cbrt(newVolume / currentVolume)
  
  return {
    foodValue,
    volumeGained: foodValue,
    newVolume,
    scaleRatio,
    preyId: preyNPC.id,
    preyClass: preyNPC.creatureClass,
  }
}

// ============================================================================
// VISUAL EFFECTS
// ============================================================================

/**
 * Spawn eat effect at position
 * @param {THREE.Vector3} position 
 */
function spawnEatEffect(position) {
  // TODO: Implement particle burst or other visual feedback
  // For now, this is a placeholder
  
  if (CONFIG.debug) {
    console.log(`[Feeding] Eat effect at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`)
  }
}

// ============================================================================
// UPDATE LOOP
// ============================================================================

/**
 * Update feeding system
 * Call this every frame
 * 
 * @param {number} delta - Time since last frame
 * @returns {object|null} Meal data if something was eaten
 */
function update(delta) {
  if (!isInitialized) return null
  
  const currentTime = performance.now() / 1000
  
  // Check player eating NPCs
  const meal = checkPlayerNPCFeeding(currentTime)
  
  return meal
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

/**
 * Register callback for when something is eaten
 * @param {function} callback - Called with meal data
 */
function onEat(callback) {
  if (typeof callback === 'function') {
    onEatCallbacks.push(callback)
  }
}

/**
 * Remove eat callback
 * @param {function} callback 
 */
function offEat(callback) {
  const index = onEatCallbacks.indexOf(callback)
  if (index > -1) {
    onEatCallbacks.splice(index, 1)
  }
}

// ============================================================================
// STATS & DEBUG
// ============================================================================

/**
 * Get feeding statistics
 * @returns {object}
 */
function getStats() {
  const playerVolume = getPlayerVisualVolume()
  
  let totalFoodEaten = 0
  let npcsEaten = 0
  let playersEaten = 0
  
  for (const meal of recentMeals) {
    totalFoodEaten += meal.foodValue
    if (meal.type === 'npc') npcsEaten++
    if (meal.type === 'player') playersEaten++
  }
  
  return {
    playerVolume,
    recentMeals: recentMeals.length,
    totalFoodEaten,
    npcsEaten,
    playersEaten,
    lastEatTime,
  }
}

/**
 * Get recent meals list
 * @returns {Array}
 */
function getRecentMeals() {
  return [...recentMeals]
}

/**
 * Debug log current state
 */
function debug() {
  console.group('[Feeding] Debug')
  
  const stats = getStats()
  console.log('Player volume:', stats.playerVolume.toFixed(2), 'm³')
  console.log('Recent meals:', stats.recentMeals)
  console.log('Total food eaten:', stats.totalFoodEaten.toFixed(2))
  console.log('NPCs eaten:', stats.npcsEaten)
  
  if (recentMeals.length > 0) {
    console.log('Last meal:', recentMeals[0])
  }
  
  console.log('Config:', CONFIG)
  console.groupEnd()
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Update config values
 * @param {object} newConfig 
 */
function setConfig(newConfig) {
  Object.assign(CONFIG, newConfig)
  console.log('[Feeding] Config updated:', CONFIG)
}

/**
 * Get current config
 * @returns {object}
 */
function getConfig() {
  return { ...CONFIG }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const Feeding = {
  // Lifecycle
  init,
  update,
  
  // Core functions
  canEat,
  calculateFoodValue,
  getPlayerVisualVolume,
  getPlayerCapsuleVolume,
  
  // Feeding handlers
  handlePlayerCollision,
  canNPCEatNPC,
  processNPCEatNPC,
  
  // Events
  onEat,
  offEat,
  
  // Stats & Debug
  getStats,
  getRecentMeals,
  debug,
  
  // Config
  setConfig,
  getConfig,
  CONFIG,
}

export default Feeding
