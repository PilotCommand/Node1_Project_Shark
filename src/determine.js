/**
 * determine.js - Deterministic Random Number Generator for Multiplayer Sync
 * 
 * Replaces Math.random() for NPC spawning and AI decisions so all clients
 * produce identical results from the same seed.
 * 
 * USAGE:
 *   import { Determine } from './determine.js'
 *   
 *   // Initialize with seed from server
 *   Determine.init(serverNpcSeed)
 *   
 *   // Use instead of Math.random()
 *   Determine.random()              // 0.0 to 1.0
 *   Determine.range(5, 10)          // 5.0 to 10.0
 *   Determine.rangeInt(0, 100)      // 0 to 99 (integers)
 *   Determine.index(array.length)   // Random array index
 *   Determine.pick(array)           // Random element from array
 *   Determine.chance(0.7)           // true 70% of the time
 *   Determine.plusMinus(0.5)        // -0.5 to +0.5
 *   Determine.weighted([...])       // Weighted random selection
 *   
 *   // For late joiners - save/restore state
 *   const state = Determine.getState()
 *   Determine.setState(state)
 * 
 * ALGORITHM: Mulberry32
 *   - Fast (single multiplication)
 *   - Good distribution
 *   - 32-bit state (easy to sync)
 *   - Deterministic across all browsers/platforms
 */

// ============================================================================
// STATE
// ============================================================================

let seed = 0
let callCount = 0
let isInitialized = false

// ============================================================================
// CORE PRNG - Mulberry32
// ============================================================================

/**
 * Mulberry32 PRNG - deterministic random number generator
 * Same seed + same call count = same sequence of numbers
 * 
 * @returns {number} Random float between 0 (inclusive) and 1 (exclusive)
 */
function random() {
  if (!isInitialized) {
    console.warn('[Determine] Not initialized! Call Determine.init(seed) first. Using fallback.')
    return Math.random()
  }
  
  callCount++
  
  // Mulberry32 algorithm
  seed |= 0
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize with a seed from the server
 * All clients using the same seed will generate identical sequences
 * 
 * @param {number} initialSeed - Seed value from server
 */
function init(initialSeed) {
  if (typeof initialSeed !== 'number' || isNaN(initialSeed)) {
    console.error('[Determine] Invalid seed:', initialSeed)
    initialSeed = Date.now()
  }
  
  seed = initialSeed | 0  // Ensure 32-bit integer
  callCount = 0
  isInitialized = true
  
  console.log(`[Determine] Initialized with seed: ${seed} (0x${(seed >>> 0).toString(16).toUpperCase()})`)
}

/**
 * Reset to a new seed (e.g., when map changes)
 * @param {number} newSeed
 */
function reset(newSeed) {
  init(newSeed)
}

/**
 * Check if initialized
 * @returns {boolean}
 */
function ready() {
  return isInitialized
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Random float in range [min, max)
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number}
 */
function range(min, max) {
  return min + random() * (max - min)
}

/**
 * Random integer in range [min, max)
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number}
 */
function rangeInt(min, max) {
  return Math.floor(min + random() * (max - min))
}

/**
 * Random index for an array (0 to length-1)
 * @param {number} length - Array length
 * @returns {number}
 */
function index(length) {
  return Math.floor(random() * length)
}

/**
 * Pick a random element from an array
 * @param {Array} array
 * @returns {*} Random element
 */
function pick(array) {
  if (!array || array.length === 0) return undefined
  return array[Math.floor(random() * array.length)]
}

/**
 * Random boolean with given probability
 * @param {number} probability - 0 to 1 (e.g., 0.7 = 70% true)
 * @returns {boolean}
 */
function chance(probability) {
  return random() < probability
}

/**
 * Random float centered around zero: -magnitude to +magnitude
 * @param {number} magnitude - Maximum absolute value
 * @returns {number}
 */
function plusMinus(magnitude = 0.5) {
  return (random() - 0.5) * 2 * magnitude
}

/**
 * Random float centered around zero with different vertical bias
 * Useful for 3D direction vectors where Y should be smaller
 * @param {number} magnitude - Maximum absolute value
 * @param {number} verticalScale - Multiplier for Y (e.g., 0.3)
 * @returns {{x: number, y: number, z: number}}
 */
function direction3D(magnitude = 1, verticalScale = 0.3) {
  const x = (random() - 0.5) * magnitude
  const y = (random() - 0.5) * magnitude * verticalScale
  const z = (random() - 0.5) * magnitude
  
  // Normalize
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 0.001) {
    return { x: 0, y: 0, z: 1 }  // Fallback direction
  }
  
  return {
    x: x / len,
    y: y / len,
    z: z / len
  }
}

/**
 * Weighted random selection from array of { weight, ...data } objects
 * @param {Array<{weight: number}>} items - Array with weight property
 * @returns {*} Selected item (or undefined if empty)
 */
function weighted(items) {
  if (!items || items.length === 0) return undefined
  
  // Calculate total weight
  let totalWeight = 0
  for (let i = 0; i < items.length; i++) {
    totalWeight += items[i].weight || 0
  }
  
  if (totalWeight <= 0) return items[0]
  
  // Roll and find selection
  let roll = random() * totalWeight
  
  for (let i = 0; i < items.length; i++) {
    const weight = items[i].weight || 0
    roll -= weight
    if (roll <= 0) {
      return items[i]
    }
  }
  
  // Fallback (shouldn't happen)
  return items[items.length - 1]
}

/**
 * Random rotation in radians (0 to 2π)
 * @returns {number}
 */
function rotation() {
  return random() * Math.PI * 2
}

/**
 * Random variation multiplier centered around 1.0
 * e.g., variation(0.2) returns 0.9 to 1.1
 * @param {number} amount - Maximum deviation from 1.0
 * @returns {number}
 */
function variation(amount = 0.1) {
  return 1 + plusMinus(amount)
}

/**
 * Shuffle an array in place (Fisher-Yates)
 * @param {Array} array - Array to shuffle
 * @returns {Array} Same array, shuffled
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
  return array
}

// ============================================================================
// STATE MANAGEMENT (for late joiners)
// ============================================================================

/**
 * Get current state for serialization
 * Late joiners can use this to sync up
 * 
 * @returns {{seed: number, callCount: number}}
 */
function getState() {
  return {
    seed,
    callCount,
  }
}

/**
 * Restore state (for late joiners to fast-forward)
 * 
 * @param {{seed: number, callCount: number}} state
 */
function setState(state) {
  if (!state || typeof state.seed !== 'number') {
    console.error('[Determine] Invalid state:', state)
    return
  }
  
  seed = state.seed | 0
  callCount = state.callCount || 0
  isInitialized = true
  
  console.log(`[Determine] State restored: seed=${seed}, callCount=${callCount}`)
}

/**
 * Fast-forward the RNG by N calls
 * Used for late joiners to catch up to current simulation state
 * 
 * @param {number} calls - Number of random() calls to skip
 */
function fastForward(calls) {
  console.log(`[Determine] Fast-forwarding ${calls} calls...`)
  
  for (let i = 0; i < calls; i++) {
    // Run the PRNG without returning
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  }
  
  callCount += calls
  console.log(`[Determine] Now at callCount=${callCount}`)
}

/**
 * Get diagnostic info
 * @returns {{seed: number, callCount: number, isInitialized: boolean}}
 */
function debug() {
  return {
    seed,
    callCount,
    isInitialized,
    seedHex: '0x' + (seed >>> 0).toString(16).toUpperCase(),
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const Determine = {
  // Initialization
  init,
  reset,
  ready,
  
  // Core RNG
  random,
  
  // Convenience methods
  range,
  rangeInt,
  index,
  pick,
  chance,
  plusMinus,
  direction3D,
  weighted,
  rotation,
  variation,
  shuffle,
  
  // State management (for late joiners)
  getState,
  setState,
  fastForward,
  
  // Debug
  debug,
  
  // Direct access (read-only)
  get seed() { return seed },
  get callCount() { return callCount },
  get isInitialized() { return isInitialized },
}

export default Determine