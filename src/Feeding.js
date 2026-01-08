/**
 * Feeding.js - Predation system for players eating NPCs and other players
 * 
 * DESIGN:
 *   - TotalWorldVolume determines "size" for eating eligibility
 *   - 5% RULE: Must be at least 5% larger to eat (ratio >= 1.05)
 *   - LINEAR ADDITIVE GROWTH: newVolume = predatorVolume + preyVolume
 *   - Volume capped at 1000 m³
 * 
 * FEEDING RELATIONSHIPS:
 *   - CAN_EAT: predator/prey ratio >= 1.05 (5% larger)
 *   - CAN_BE_EATEN: predator/prey ratio <= 0.95 (5% smaller)
 *   - NEUTRAL: ratio between 0.95 and 1.05 (neither can eat)
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
 *   // Get relationship for UI (radar colors)
 *   const rel = Feeding.getFeedingRelationship(myVolume, theirVolume)
 *   
 *   // For player-player (call from Physics.js collision)
 *   Feeding.handlePlayerCollision(player1Data, player2Data)
 */

import * as THREE from 'three'
import { getPlayer, getPlayerNormalizationInfo } from './player.js'
import { MeshRegistry } from './MeshRegistry.js'
import { 
  computeGroupVolume, 
  getVolume, 
  updateWorldVolume, 
  addVolume,
  unregisterVolume,
  canEatByVolume,
  getFeedingRelationship as getVolumeRelationship,
} from './MeshVolume.js'
import { addVolume as addPlayerVolume, getWorldVolume, getEffectiveWorldVolume } from './NormalScale.js'
import { networkManager } from '../network/NetworkManager.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Eating range (distance from center to center)
  eatRange: 8,
  
  // Size ratio required to eat (1.05 = must be 5% larger)
  sizeRatioRequired: 1.05,
  
  // How much of prey's volume is gained (1.0 = 100%, linear additive)
  volumeToFoodRatio: 1.0,
  
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
const onPlayerEatenCallbacks = []  // NEW: Callbacks for when local player is eaten

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
  console.log(`  - Size ratio: ${CONFIG.sizeRatioRequired}x (5% rule)`)
  console.log(`  - Volume transfer: ${CONFIG.volumeToFoodRatio * 100}% (linear additive)`)
}

// ============================================================================
// PLAYER VOLUME HELPERS
// ============================================================================

/**
 * Get player's current world volume from NormalScale
 * Uses getEffectiveWorldVolume which includes manual scale (R/T keys)
 * @returns {number} Volume in cubic meters
 */
function getPlayerWorldVolume() {
  return getEffectiveWorldVolume()
}

/**
 * Get player's current visual volume (computed from mesh)
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
// CORE FEEDING LOGIC - 5% RULE
// ============================================================================

/**
 * Check if predator can eat prey based on volume (5% rule)
 * 
 * @param {number} predatorVolume 
 * @param {number} preyVolume 
 * @returns {boolean} True if predator can eat prey
 */
function canEat(predatorVolume, preyVolume) {
  if (preyVolume <= 0) return false
  
  const ratio = predatorVolume / preyVolume
  return ratio >= CONFIG.sizeRatioRequired  // 1.05 = 5% larger
}

/**
 * Get feeding relationship between two volumes
 * Used for UI coloring (radar, nameplates, etc.)
 * 
 * @param {number} myVolume - Your volume
 * @param {number} theirVolume - Their volume
 * @returns {'CAN_EAT' | 'CAN_BE_EATEN' | 'NEUTRAL'}
 */
function getFeedingRelationship(myVolume, theirVolume) {
  if (theirVolume <= 0) return 'NEUTRAL'
  
  const ratio = myVolume / theirVolume
  
  if (ratio >= 1.05) return 'CAN_EAT'       // I can eat them (5% larger)
  if (ratio <= 0.95) return 'CAN_BE_EATEN'  // They can eat me (5% smaller)
  return 'NEUTRAL'                           // Neither can eat (within 5%)
}

/**
 * Calculate volume gained from eating prey (100% linear additive)
 * 
 * @param {number} preyVolume 
 * @returns {number} Volume to add to predator
 */
function calculateFoodValue(preyVolume) {
  return preyVolume * CONFIG.volumeToFoodRatio  // 1.0 = 100%
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
  const playerVolume = getPlayerWorldVolume()  // Use world volume
  
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
    
    // Volume check - use totalWorldVolume (or visualVolume as fallback)
    const npcVolume = npc.totalWorldVolume || npc.visualVolume || 0
    
    if (canEat(playerVolume, npcVolume)) {
      // EAT!
      return consumeNPC(npc, playerVolume, npcVolume, currentTime)
    }
  }
  
  return null
}

/**
 * Consume an NPC (linear additive growth)
 * 
 * @param {object} npc - NPC data from FishAdder
 * @param {number} playerVolume - Player's current volume
 * @param {number} npcVolume - NPC's volume (will be added to player)
 * @param {number} currentTime - Current game time
 * @returns {object} Meal data
 */
function consumeNPC(npc, playerVolume, npcVolume, currentTime) {
  // LINEAR ADDITIVE: Add prey's full volume to player
  const volumeToAdd = calculateFoodValue(npcVolume)
  
  // Record meal (before growth)
  const meal = {
    type: 'npc',
    preyId: npc.id,
    preyClass: npc.creatureClass,
    preyDisplayName: npc.displayName,
    preyVolume: npcVolume,
    playerVolumeBefore: playerVolume,
    volumeAdded: volumeToAdd,
    timestamp: currentTime,
    position: npc.mesh.position.clone(),
  }
  
  // Add volume to player (linear additive growth)
  const growthResult = addPlayerVolume(volumeToAdd)
  meal.playerVolumeAfter = growthResult.totalVolume
  meal.volumeGained = growthResult.volumeGained
  meal.wasCapped = growthResult.wasCapped
  
  // MULTIPLAYER: Send eat event to server
  if (networkManager.isConnected()) {
    networkManager.sendEatNPC(npc.id)
    // Remove locally WITHOUT respawn - host will handle population via snapshots
    fishAdderRef.removeFish(npc.id, false)
  } else {
    // Single-player: Remove and respawn locally
    fishAdderRef.removeFish(npc.id, true)
  }
  
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
      volumeAdded: volumeToAdd.toFixed(2),
      newVolume: meal.playerVolumeAfter.toFixed(2),
      wasCapped: meal.wasCapped,
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
 * @param {object} player1Data - First player's data { id, mesh, worldVolume, isLocal, ... }
 * @param {object} player2Data - Second player's data
 * @returns {object|null} Meal data or null
 */
function handlePlayerCollision(player1Data, player2Data) {
  // Get world volumes
  const vol1 = player1Data.worldVolume || player1Data.capsuleVolume || 0
  const vol2 = player2Data.worldVolume || player2Data.capsuleVolume || 0
  
  if (vol1 <= 0 || vol2 <= 0) return null
  
  // Check feeding relationship using 5% rule
  const relationship = getFeedingRelationship(vol1, vol2)
  
  if (relationship === 'NEUTRAL') {
    // Neither can eat the other
    return null
  }
  
  // Determine predator and prey
  let predator, prey, predatorVolume, preyVolume
  
  if (relationship === 'CAN_EAT') {
    // Player 1 eats Player 2
    predator = player1Data
    prey = player2Data
    predatorVolume = vol1
    preyVolume = vol2
  } else {
    // Player 2 eats Player 1
    predator = player2Data
    prey = player1Data
    predatorVolume = vol2
    preyVolume = vol1
  }
  
  // Consume!
  return consumePlayer(predator, prey, predatorVolume, preyVolume)
}

/**
 * Consume another player (linear additive growth)
 * 
 * @param {object} predator - Predator player data
 * @param {object} prey - Prey player data
 * @param {number} predatorVolume - Predator's world volume
 * @param {number} preyVolume - Prey's world volume (will be added to predator)
 * @returns {object} Meal data
 */
function consumePlayer(predator, prey, predatorVolume, preyVolume) {
  const volumeToAdd = calculateFoodValue(preyVolume)
  
  const meal = {
    type: 'player',
    predatorId: predator.id,
    predatorIsLocal: predator.isLocal || false,
    preyId: prey.id,
    preyIsLocal: prey.isLocal || false,
    preyVolume,
    predatorVolumeBefore: predatorVolume,
    volumeAdded: volumeToAdd,
    timestamp: performance.now() / 1000,
    position: prey.mesh?.position?.clone() || new THREE.Vector3(),
  }
  
  // Calculate new predator volume (linear additive)
  const newPredatorVolume = Math.min(predatorVolume + volumeToAdd, 1000)
  meal.predatorVolumeAfter = newPredatorVolume
  meal.volumeGained = newPredatorVolume - predatorVolume
  meal.wasCapped = (predatorVolume + volumeToAdd) > 1000
  
  console.log(`[Feeding] Player ${predator.id} ate player ${prey.id}!`, {
    preyVolume: preyVolume.toFixed(2),
    volumeAdded: volumeToAdd.toFixed(2),
    newPredatorVolume: newPredatorVolume.toFixed(2),
  })
  
  // Handle local player involvement
  if (predator.isLocal) {
    // LOCAL PLAYER ATE SOMEONE - gain their volume
    const growthResult = addPlayerVolume(volumeToAdd)
    meal.predatorVolumeAfter = growthResult.totalVolume
    meal.volumeGained = growthResult.volumeGained
    meal.wasCapped = growthResult.wasCapped
  }
  
  if (prey.isLocal) {
    // LOCAL PLAYER WAS EATEN - trigger death
    console.log('[Feeding] Local player was eaten! Returning to menu...')
    
    // Fire eaten callbacks
    for (const callback of onPlayerEatenCallbacks) {
      callback(meal)
    }
  }
  
  // Fire general eat callbacks
  for (const callback of onEatCallbacks) {
    callback(meal)
  }
  
  // MULTIPLAYER: Send event to server
  if (networkManager.isConnected()) {
    // TODO: networkManager.sendPlayerEaten(predator.id, prey.id)
  }
  
  // Spawn effects
  if (CONFIG.showEatEffects) {
    spawnEatEffect(meal.position)
  }
  
  return meal
}

/**
 * Register callback for when local player is eaten
 * @param {function} callback - Called with meal data
 */
function onPlayerEaten(callback) {
  if (typeof callback === 'function') {
    onPlayerEatenCallbacks.push(callback)
  }
}

/**
 * Remove player eaten callback
 * @param {function} callback 
 */
function offPlayerEaten(callback) {
  const index = onPlayerEatenCallbacks.indexOf(callback)
  if (index > -1) {
    onPlayerEatenCallbacks.splice(index, 1)
  }
}

// ============================================================================
// NPC → NPC FEEDING (AI Predation)
// ============================================================================

/**
 * Check if one NPC can eat another (5% rule)
 * Used by FishAdder's AI system
 * 
 * @param {object} predatorNPC 
 * @param {object} preyNPC 
 * @returns {boolean}
 */
function canNPCEatNPC(predatorNPC, preyNPC) {
  if (!predatorNPC || !preyNPC) return false
  
  const predatorVolume = predatorNPC.totalWorldVolume || predatorNPC.visualVolume || 0
  const preyVolume = preyNPC.totalWorldVolume || preyNPC.visualVolume || 0
  
  return canEat(predatorVolume, preyVolume)
}

/**
 * Process NPC eating another NPC (linear additive)
 * Called by FishAdder when NPC predation occurs
 * 
 * @param {object} predatorNPC 
 * @param {object} preyNPC 
 * @returns {object} Result with growth amount
 */
function processNPCEatNPC(predatorNPC, preyNPC) {
  const preyVolume = preyNPC.totalWorldVolume || preyNPC.visualVolume || 0
  const volumeToAdd = calculateFoodValue(preyVolume)
  
  // Calculate new volume (linear additive, capped at 1000)
  const currentVolume = predatorNPC.totalWorldVolume || predatorNPC.visualVolume || 1
  const newVolume = Math.min(currentVolume + volumeToAdd, 1000)
  
  // Calculate scale ratio for mesh update
  // Since we're tracking totalWorldVolume, we need the ratio of new encyclopedia-based scale
  const scaleRatio = Math.cbrt(newVolume / currentVolume)
  
  return {
    volumeAdded: volumeToAdd,
    volumeGained: newVolume - currentVolume,
    oldVolume: currentVolume,
    newVolume,
    scaleRatio,
    wasCapped: (currentVolume + volumeToAdd) > 1000,
    preyId: preyNPC.id,
    preyClass: preyNPC.creatureClass,
  }
}

/**
 * Get NPC feeding relationship (for AI decisions)
 * 
 * @param {object} npc1 
 * @param {object} npc2 
 * @returns {'CAN_EAT' | 'CAN_BE_EATEN' | 'NEUTRAL'}
 */
function getNPCFeedingRelationship(npc1, npc2) {
  if (!npc1 || !npc2) return 'NEUTRAL'
  
  const vol1 = npc1.totalWorldVolume || npc1.visualVolume || 0
  const vol2 = npc2.totalWorldVolume || npc2.visualVolume || 0
  
  return getFeedingRelationship(vol1, vol2)
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
  const playerVolume = getPlayerWorldVolume()
  
  let totalVolumeEaten = 0
  let npcsEaten = 0
  let playersEaten = 0
  
  for (const meal of recentMeals) {
    totalVolumeEaten += meal.volumeAdded || meal.foodValue || 0
    if (meal.type === 'npc') npcsEaten++
    if (meal.type === 'player') playersEaten++
  }
  
  return {
    playerVolume,
    recentMeals: recentMeals.length,
    totalVolumeEaten,
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
  console.log('Total volume eaten:', stats.totalVolumeEaten.toFixed(2), 'm³')
  console.log('NPCs eaten:', stats.npcsEaten)
  console.log('Players eaten:', stats.playersEaten)
  
  if (recentMeals.length > 0) {
    console.log('Last meal:', recentMeals[0])
  }
  
  console.log('Config:', CONFIG)
  console.log('5% Rule: Must be >= 1.05x larger to eat')
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
  
  // Core functions (5% rule)
  canEat,
  getFeedingRelationship,
  calculateFoodValue,
  
  // Volume helpers
  getPlayerWorldVolume,
  getPlayerVisualVolume,
  getPlayerCapsuleVolume,
  
  // Feeding handlers
  handlePlayerCollision,
  canNPCEatNPC,
  processNPCEatNPC,
  getNPCFeedingRelationship,
  
  // Events
  onEat,
  offEat,
  onPlayerEaten,
  offPlayerEaten,
  
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