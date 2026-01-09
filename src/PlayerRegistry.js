/**
 * PlayerRegistry.js - Centralized Player Management System
 * 
 * Manages all players in the game (local + remote) for multiplayer preparation.
 * Each player entry tracks:
 *   - Identity (id, displayName, account status)
 *   - Creature (type, class, variant, seed, mesh, parts)
 *   - Volumes (natural, world, manualScale, effective) - SINGLE SOURCE OF TRUTH
 *   - Capsule (natural, normalized, scaleFactor) - Physics dimensions
 *   - Feeding (meals history, stats)
 *   - Physics (body reference, collider)
 *   - Stats (health, score, kills, deaths)
 *   - Capabilities/Abilities (active ability, cooldowns)
 *   - Network (ping, connectionState, lastUpdate)
 * 
 * Usage:
 *   import { PlayerRegistry, VOLUME_CONFIG } from './PlayerRegistry.js'
 *   
 *   // Register local player
 *   PlayerRegistry.registerLocal(playerId, { creature, mesh, ... })
 *   
 *   // Initialize volumes after mesh creation
 *   PlayerRegistry.initVolumes(playerId, naturalCapsuleParams)
 *   
 *   // Add volume from eating (linear additive growth)
 *   PlayerRegistry.addVolume(playerId, preyVolume)
 *   
 *   // Get volume for network (excludes manual scale)
 *   const netVolume = PlayerRegistry.getNetworkVolume(playerId)
 *   
 *   // Get effective volume for feeding (includes manual scale)
 *   const effVolume = PlayerRegistry.getEffectiveVolume(playerId)
 */

import * as THREE from 'three'
import { MeshRegistry, Category, Tag } from './MeshRegistry.js'

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Player connection states
 */
export const ConnectionState = {
  LOCAL: 'local',           // This client's player
  CONNECTED: 'connected',   // Remote player, connected
  CONNECTING: 'connecting', // Remote player, joining
  DISCONNECTED: 'disconnected', // Remote player, recently left
  SPECTATOR: 'spectator',   // Watching only
}

/**
 * Account types
 */
export const AccountType = {
  GUEST: 'guest',           // Not signed in
  REGISTERED: 'registered', // Has account
  PREMIUM: 'premium',       // Premium account
}

/**
 * Player tags (for filtering/queries)
 */
export const PlayerTag = {
  INVINCIBLE: 'invincible',   // Cannot be eaten/damaged
  INVISIBLE: 'invisible',     // Hidden from other players
  BOOSTING: 'boosting',       // Currently using boost
  STUNNED: 'stunned',         // Cannot move
  DEAD: 'dead',               // Awaiting respawn
}

// Configuration
const CONFIG = {
  // Network
  maxPing: 5000,               // Max ping before considered disconnected (ms)
  disconnectTimeout: 10000,    // Time before removing disconnected player (ms)
  interpolationDelay: 100,     // Delay for position interpolation (ms)
  
  // Physics sync
  positionSyncRate: 50,        // How often to send position updates (ms)
  fullSyncRate: 1000,          // How often to send full state (ms)
  
  // Defaults
  defaultHealth: 100,
  defaultSpeed: 12,
  respawnTime: 3000,           // Time before respawn (ms)
}

/**
 * Volume configuration - SINGLE SOURCE OF TRUTH for volume bounds
 * Used by all systems (feeding, scaling, network)
 */
export const VOLUME_CONFIG = {
  // Starting volume for all creatures
  STARTER: 1.0,
  
  // Volume bounds (cubic meters)
  MIN: 1.0,
  MAX: 1000.0,
  
  // Manual scale bounds (R/T debug keys) - LOCAL ONLY, not sent over network
  MANUAL_SCALE_MIN: 0.1,
  MANUAL_SCALE_MAX: 10.0,
  MANUAL_SCALE_STEP: 0.1,
}

// ============================================================================
// PLAYER DATA STRUCTURE
// ============================================================================

/**
 * Create a new player data object with all required fields
 * @param {string} id - Unique player ID
 * @param {boolean} isLocal - Whether this is the local player
 * @returns {object} Player data object
 */
function createPlayerData(id, isLocal = false) {
  return {
    // === IDENTITY ===
    id,
    displayName: `Player_${id.slice(0, 6)}`,
    isLocal,
    connectionState: isLocal ? ConnectionState.LOCAL : ConnectionState.CONNECTING,
    accountType: AccountType.GUEST,
    accountId: null,              // Linked account ID if signed in
    
    // === CREATURE ===
    creature: {
      type: null,                 // CreatureType enum value
      class: null,                // FishClass, MammalClass, etc.
      variant: 0,                 // Variant index
      seed: null,                 // Generation seed
      displayName: 'Unknown',     // Human-readable name
    },
    
    // === VISUALS ===
    mesh: null,                   // THREE.Object3D
    parts: null,                  // Creature parts reference
    wireframeVisible: false,
    
    // === VOLUMES (SINGLE SOURCE OF TRUTH) ===
    volumes: {
      natural: 0,                 // Capsule volume at scale=1 (immutable after init)
      world: VOLUME_CONFIG.STARTER, // Gameplay volume [1, 1000] - grows by eating
      manualScale: 1.0,           // R/T debug multiplier [0.1, 10] - LOCAL ONLY, not networked
      effective: VOLUME_CONFIG.STARTER, // Computed: clamp(world * manualScale, MIN, MAX)
    },
    
    // === CAPSULE (Physics Dimensions) ===
    capsule: {
      natural: null,              // { radius, halfHeight, center } from Encyclopedia (immutable)
      normalized: null,           // { radius, halfHeight, center } at current scale
      scaleFactor: 1.0,           // Current mesh scale factor
    },
    
    // === FEEDING (Meal History & Stats) ===
    feeding: {
      meals: [],                  // Recent meal records
      maxMeals: 20,               // Keep last N meals
      totalVolumeEaten: 0,        // Lifetime volume consumed
      npcsEaten: 0,               // Total NPCs eaten
      playersEaten: 0,            // Total players eaten
    },
    
    // === PHYSICS ===
    physics: {
      body: null,                 // Rapier RigidBody reference
      collider: null,             // Rapier Collider reference
    },
    
    // === TRANSFORM (for interpolation) ===
    transform: {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      velocity: new THREE.Vector3(),
      // For interpolation of remote players
      targetPosition: new THREE.Vector3(),
      targetRotation: new THREE.Euler(),
      lastUpdateTime: 0,
    },
    
    // === STATS ===
    stats: {
      health: CONFIG.defaultHealth,
      maxHealth: CONFIG.defaultHealth,
      
      // Combat
      kills: 0,                   // Players eaten
      deaths: 0,                  // Times been eaten
      
      // Session
      score: 0,
      playTime: 0,                // Seconds in game
      spawnTime: 0,               // Timestamp of last spawn
    },
    
    // === CAPABILITIES ===
    capabilities: {
      activeAbility: null,        // Current ability key (e.g., 'boost', 'dash')
      abilityState: 'ready',      // 'ready', 'active', 'cooldown'
      abilityCooldown: 0,         // Remaining cooldown (ms)
      abilityCharge: 1.0,         // 0-1 charge level
      
      // Permission flags
      canEat: true,
      canBeEaten: true,
      canUseAbility: true,
      canChat: true,
    },
    
    // === NETWORK ===
    network: {
      ping: 0,                    // Round-trip time (ms)
      lastPingTime: 0,            // Timestamp of last ping
      lastUpdateTime: Date.now(), // Last received update
      packetsReceived: 0,
      packetsSent: 0,
      
      // Interpolation buffer for remote players
      positionBuffer: [],         // Array of { position, rotation, timestamp }
    },
    
    // === TAGS ===
    tags: new Set(),              // PlayerTag values
    
    // === METADATA ===
    metadata: {},                 // Arbitrary extra data
    
    // === TIMESTAMPS ===
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ============================================================================
// PLAYER REGISTRY CLASS
// ============================================================================

class PlayerRegistryClass {
  constructor() {
    // Main storage: playerId -> playerData
    this.players = new Map()
    
    // Quick reference to local player
    this.localPlayerId = null
    
    // Event listeners
    this.listeners = {
      register: [],
      unregister: [],
      update: [],
      spawn: [],
      death: [],
      eat: [],
      volumeChange: [],
      stateChange: [],
    }
    
    // Scene reference for mesh management
    this.scene = null
    
    // Statistics
    this.stats = {
      totalRegistered: 0,
      currentOnline: 0,
      peakOnline: 0,
    }
  }
  
  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  
  /**
   * Initialize the registry with scene reference
   * @param {THREE.Scene} scene 
   */
  init(scene) {
    this.scene = scene
    console.log('[PlayerRegistry] Initialized')
  }
  
  // ==========================================================================
  // REGISTRATION
  // ==========================================================================
  
  /**
   * Register the local player (this client)
   * @param {string} id - Player ID
   * @param {object} options - Initial options
   * @returns {object} Player data
   */
  registerLocal(id, options = {}) {
    if (this.localPlayerId) {
      console.warn('[PlayerRegistry] Local player already registered, replacing')
      this.unregister(this.localPlayerId)
    }
    
    const player = createPlayerData(id, true)
    this.localPlayerId = id
    
    // Apply options
    this._applyOptions(player, options)
    
    // Store
    this.players.set(id, player)
    this.stats.totalRegistered++
    this.stats.currentOnline++
    this.stats.peakOnline = Math.max(this.stats.peakOnline, this.stats.currentOnline)
    
    this._emit('register', player)
    console.log(`[PlayerRegistry] Local player registered: ${id}`)
    
    return player
  }
  
  /**
   * Register a remote player (from network)
   * @param {string} id - Player ID
   * @param {object} options - Initial state from network
   * @returns {object} Player data
   */
  registerRemote(id, options = {}) {
    if (this.players.has(id)) {
      console.warn(`[PlayerRegistry] Player ${id} already exists, updating instead`)
      return this.update(id, options)
    }
    
    const player = createPlayerData(id, false)
    
    // Apply options
    this._applyOptions(player, options)
    
    // Store
    this.players.set(id, player)
    this.stats.totalRegistered++
    this.stats.currentOnline++
    this.stats.peakOnline = Math.max(this.stats.peakOnline, this.stats.currentOnline)
    
    this._emit('register', player)
    console.log(`[PlayerRegistry] Remote player registered: ${id} (${player.displayName})`)
    
    return player
  }
  
  /**
   * Unregister a player
   * @param {string} id - Player ID
   * @param {string} reason - Reason for unregistering
   * @returns {boolean} Success
   */
  unregister(id, reason = 'unknown') {
    const player = this.players.get(id)
    if (!player) {
      console.warn(`[PlayerRegistry] Cannot unregister unknown player: ${id}`)
      return false
    }
    
    // Clean up mesh
    if (player.mesh && this.scene) {
      this.scene.remove(player.mesh)
      this._disposeMesh(player.mesh)
    }
    
    // Clean up MeshRegistry entry
    const meshRegistryId = `player_${id}`
    if (MeshRegistry.get(meshRegistryId)) {
      MeshRegistry.unregister(meshRegistryId)
    }
    
    // Clear local player reference
    if (id === this.localPlayerId) {
      this.localPlayerId = null
    }
    
    // Remove from registry
    this.players.delete(id)
    this.stats.currentOnline--
    
    this._emit('unregister', { player, reason })
    console.log(`[PlayerRegistry] Player unregistered: ${id} (reason: ${reason})`)
    
    return true
  }
  
  // ==========================================================================
  // QUERIES
  // ==========================================================================
  
  /**
   * Get player by ID
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    return this.players.get(id) || null
  }
  
  /**
   * Get the local player
   * @returns {object|null}
   */
  getLocal() {
    return this.localPlayerId ? this.players.get(this.localPlayerId) : null
  }
  
  /**
   * Get local player ID
   * @returns {string|null}
   */
  getLocalId() {
    return this.localPlayerId
  }
  
  /**
   * Get all players
   * @returns {object[]}
   */
  getAll() {
    return Array.from(this.players.values())
  }
  
  /**
   * Get all remote players
   * @returns {object[]}
   */
  getRemote() {
    return Array.from(this.players.values()).filter(p => !p.isLocal)
  }
  
  /**
   * Get all connected players (not disconnected)
   * @returns {object[]}
   */
  getConnected() {
    return Array.from(this.players.values()).filter(
      p => p.connectionState !== ConnectionState.DISCONNECTED
    )
  }
  
  /**
   * Get players near a position
   * @param {THREE.Vector3} position 
   * @param {number} radius 
   * @param {object} options
   * @returns {object[]} Players sorted by distance
   */
  getNearby(position, radius, options = {}) {
    const {
      excludeLocal = false,
      excludeDead = true,
      maxResults = Infinity,
    } = options
    
    const radiusSq = radius * radius
    const results = []
    
    for (const player of this.players.values()) {
      // Apply filters
      if (excludeLocal && player.isLocal) continue
      if (excludeDead && player.tags.has(PlayerTag.DEAD)) continue
      
      // Calculate distance
      const playerPos = player.transform.position
      const dx = playerPos.x - position.x
      const dy = playerPos.y - position.y
      const dz = playerPos.z - position.z
      const distSq = dx * dx + dy * dy + dz * dz
      
      if (distSq <= radiusSq) {
        results.push({ player, distance: Math.sqrt(distSq) })
      }
    }
    
    // Sort by distance
    results.sort((a, b) => a.distance - b.distance)
    
    // Apply limit
    return results.slice(0, maxResults).map(r => r.player)
  }
  
  /**
   * Get players by tag
   * @param {string} tag - PlayerTag value
   * @returns {object[]}
   */
  getByTag(tag) {
    return Array.from(this.players.values()).filter(p => p.tags.has(tag))
  }
  
  /**
   * Get players by connection state
   * @param {string} state - ConnectionState value
   * @returns {object[]}
   */
  getByConnectionState(state) {
    return Array.from(this.players.values()).filter(
      p => p.connectionState === state
    )
  }
  
  /**
   * Get players by creature type
   * @param {string} creatureType 
   * @returns {object[]}
   */
  getByCreatureType(creatureType) {
    return Array.from(this.players.values()).filter(
      p => p.creature.type === creatureType
    )
  }
  
  /**
   * Get player count
   * @returns {number}
   */
  getCount() {
    return this.players.size
  }
  
  /**
   * Check if player exists
   * @param {string} id 
   * @returns {boolean}
   */
  has(id) {
    return this.players.has(id)
  }
  
  // ==========================================================================
  // VOLUME MANAGEMENT (SINGLE SOURCE OF TRUTH)
  // ==========================================================================
  
  /**
   * Compute capsule volume from radius and halfHeight
   * V = pi * r^2 * (h + 4r/3) where h = 2 * halfHeight
   * @private
   */
  _computeCapsuleVolume(radius, halfHeight) {
    const r = radius
    const h = halfHeight * 2
    return Math.PI * r * r * (h + (4 * r / 3))
  }
  
  /**
   * Update effective volume from world volume and manual scale
   * Clamps to [MIN, MAX]
   * @private
   */
  _updateEffectiveVolume(player) {
    const raw = player.volumes.world * player.volumes.manualScale
    player.volumes.effective = Math.min(
      VOLUME_CONFIG.MAX,
      Math.max(VOLUME_CONFIG.MIN, raw)
    )
  }
  
  /**
   * Update capsule params and mesh scale based on current effective volume
   * @private
   */
  _updateCapsuleAndScale(player) {
    if (!player.capsule.natural || player.volumes.natural <= 0) return
    
    // Compute scale factor: cbrt(effectiveVolume / naturalVolume)
    const scaleFactor = Math.cbrt(player.volumes.effective / player.volumes.natural)
    player.capsule.scaleFactor = scaleFactor
    
    // Scale capsule params
    const nat = player.capsule.natural
    player.capsule.normalized = {
      radius: nat.radius * scaleFactor,
      halfHeight: nat.halfHeight * scaleFactor,
      center: nat.center ? new THREE.Vector3(
        nat.center.x * scaleFactor,
        nat.center.y * scaleFactor,
        nat.center.z * scaleFactor
      ) : new THREE.Vector3(),
    }
    
    // Apply scale to mesh
    if (player.mesh) {
      player.mesh.scale.setScalar(scaleFactor)
    }
    
    player.updatedAt = Date.now()
    this._emit('volumeChange', { player, scaleFactor })
  }
  
  /**
   * Initialize volumes for a player (call once after mesh creation)
   * Sets up the natural volume from capsule params and resets to starter volume
   * 
   * @param {string} id - Player ID
   * @param {object} naturalCapsuleParams - { radius, halfHeight, center } from Encyclopedia
   * @returns {object|null} The volumes object or null if player not found
   */
  initVolumes(id, naturalCapsuleParams) {
    const player = this.players.get(id)
    if (!player) {
      console.warn(`[PlayerRegistry] Cannot init volumes for unknown player: ${id}`)
      return null
    }
    
    if (!naturalCapsuleParams || !naturalCapsuleParams.radius || !naturalCapsuleParams.halfHeight) {
      console.warn(`[PlayerRegistry] Invalid capsule params for player ${id}`)
      return null
    }
    
    // Compute natural volume from capsule (this is immutable)
    const naturalVolume = this._computeCapsuleVolume(
      naturalCapsuleParams.radius,
      naturalCapsuleParams.halfHeight
    )
    
    // Store natural capsule params (deep copy)
    player.capsule.natural = {
      radius: naturalCapsuleParams.radius,
      halfHeight: naturalCapsuleParams.halfHeight,
      center: naturalCapsuleParams.center 
        ? new THREE.Vector3().copy(naturalCapsuleParams.center)
        : new THREE.Vector3(),
    }
    
    // Set volumes - preserve world volume if already set (for creature swap)
    player.volumes.natural = naturalVolume
    if (player.volumes.world === VOLUME_CONFIG.STARTER || player.volumes.world === 0) {
      player.volumes.world = VOLUME_CONFIG.STARTER
    }
    // manualScale stays as-is (preserved across creature swaps for local player)
    
    // Compute effective volume and update capsule/scale
    this._updateEffectiveVolume(player)
    this._updateCapsuleAndScale(player)
    
    console.log(`[PlayerRegistry] Volumes initialized for ${id}: natural=${naturalVolume.toFixed(4)} m^3, world=${player.volumes.world.toFixed(2)} m^3, scale=${player.capsule.scaleFactor.toFixed(4)}`)
    
    return { ...player.volumes }
  }
  
  /**
   * Add volume from eating prey (LINEAR ADDITIVE GROWTH)
   * newVolume = currentVolume + preyVolume (capped at MAX)
   * 
   * @param {string} id - Player ID
   * @param {number} preyVolume - Volume of prey eaten
   * @returns {object|null} { volumeGained, totalVolume, wasCapped, oldVolume, preyVolume }
   */
  addVolume(id, preyVolume) {
    const player = this.players.get(id)
    if (!player) {
      console.warn(`[PlayerRegistry] Cannot add volume for unknown player: ${id}`)
      return null
    }
    
    const oldVolume = player.volumes.world
    const uncapped = oldVolume + preyVolume
    const newVolume = Math.min(VOLUME_CONFIG.MAX, Math.max(VOLUME_CONFIG.MIN, uncapped))
    const wasCapped = uncapped > VOLUME_CONFIG.MAX
    const volumeGained = newVolume - oldVolume
    
    player.volumes.world = newVolume
    this._updateEffectiveVolume(player)
    this._updateCapsuleAndScale(player)
    
    console.log(`[PlayerRegistry] Volume: ${oldVolume.toFixed(2)} + ${preyVolume.toFixed(2)} = ${newVolume.toFixed(2)} m^3${wasCapped ? ' (CAPPED)' : ''}`)
    
    return {
      volumeGained,
      totalVolume: newVolume,
      wasCapped,
      oldVolume,
      preyVolume,
    }
  }
  
  /**
   * Set world volume directly (for network sync or loading saved state)
   * Does NOT affect manualScale
   * 
   * @param {string} id - Player ID
   * @param {number} volume - Volume to set (will be clamped)
   */
  setWorldVolume(id, volume) {
    const player = this.players.get(id)
    if (!player) return
    
    const clampedVolume = Math.min(VOLUME_CONFIG.MAX, Math.max(VOLUME_CONFIG.MIN, volume))
    
    if (Math.abs(clampedVolume - player.volumes.world) < 0.01) return // No significant change
    
    player.volumes.world = clampedVolume
    this._updateEffectiveVolume(player)
    this._updateCapsuleAndScale(player)
  }
  
  /**
   * Adjust manual scale multiplier (R/T debug keys)
   * LOCAL PLAYER ONLY - manual scale is not sent over network
   * 
   * @param {string} id - Player ID
   * @param {number} delta - Amount to add to manual scale (positive or negative)
   * @returns {object|null} { oldScale, newScale, effectiveVolume }
   */
  adjustManualScale(id, delta) {
    const player = this.players.get(id)
    if (!player) {
      console.warn(`[PlayerRegistry] Cannot adjust scale for unknown player: ${id}`)
      return null
    }
    
    // Only allow for local player
    if (!player.isLocal) {
      console.warn(`[PlayerRegistry] Cannot adjust manual scale for remote player: ${id}`)
      return null
    }
    
    const oldScale = player.volumes.manualScale
    const newScale = Math.min(
      VOLUME_CONFIG.MANUAL_SCALE_MAX,
      Math.max(VOLUME_CONFIG.MANUAL_SCALE_MIN, oldScale + delta)
    )
    
    player.volumes.manualScale = newScale
    this._updateEffectiveVolume(player)
    this._updateCapsuleAndScale(player)
    
    console.log(`[PlayerRegistry] Manual scale: ${(oldScale * 100).toFixed(0)}% -> ${(newScale * 100).toFixed(0)}%`)
    
    return {
      oldScale,
      newScale,
      effectiveVolume: player.volumes.effective,
    }
  }
  
  /**
   * Get volume for network transmission
   * Returns ONLY world volume (excludes manual scale)
   * This ensures R/T debug keys are local-only visual effects
   * 
   * @param {string} id - Player ID
   * @returns {number} World volume in m^3
   */
  getNetworkVolume(id) {
    const player = this.players.get(id)
    return player?.volumes.world || VOLUME_CONFIG.STARTER
  }
  
  /**
   * Get effective volume for feeding/gameplay calculations
   * Includes manual scale (for local visual size matching gameplay)
   * 
   * @param {string} id - Player ID
   * @returns {number} Effective volume in m^3
   */
  getEffectiveVolume(id) {
    const player = this.players.get(id)
    return player?.volumes.effective || VOLUME_CONFIG.STARTER
  }
  
  /**
   * Get the full volumes object for a player
   * @param {string} id - Player ID
   * @returns {object|null} { natural, world, manualScale, effective }
   */
  getVolumes(id) {
    const player = this.players.get(id)
    return player ? { ...player.volumes } : null
  }
  
  /**
   * Get the full capsule object for a player
   * @param {string} id - Player ID
   * @returns {object|null} { natural, normalized, scaleFactor }
   */
  getCapsule(id) {
    const player = this.players.get(id)
    if (!player) return null
    
    return {
      natural: player.capsule.natural ? { ...player.capsule.natural } : null,
      normalized: player.capsule.normalized ? { ...player.capsule.normalized } : null,
      scaleFactor: player.capsule.scaleFactor,
    }
  }
  
  /**
   * Reset volumes to starter values (for respawn/death)
   * Also clears feeding history
   * 
   * @param {string} id - Player ID
   */
  resetVolumes(id) {
    const player = this.players.get(id)
    if (!player) return
    
    player.volumes.world = VOLUME_CONFIG.STARTER
    player.volumes.manualScale = 1.0
    player.volumes.effective = VOLUME_CONFIG.STARTER
    
    // Clear feeding history
    player.feeding.meals = []
    
    // Update capsule and scale
    this._updateCapsuleAndScale(player)
    
    console.log(`[PlayerRegistry] Volumes reset for ${id}`)
  }
  
  // ==========================================================================
  // FEEDING TRACKING
  // ==========================================================================
  
  /**
   * Record a meal in the player's feeding history
   * 
   * @param {string} id - Player ID
   * @param {object} mealData - { type, preyId, preyClass, volumeGained, ... }
   */
  recordMeal(id, mealData) {
    const player = this.players.get(id)
    if (!player) return
    
    const meal = {
      ...mealData,
      timestamp: Date.now(),
    }
    
    // Add to front of meals array
    player.feeding.meals.unshift(meal)
    
    // Trim to max
    if (player.feeding.meals.length > player.feeding.maxMeals) {
      player.feeding.meals.pop()
    }
    
    // Update stats
    player.feeding.totalVolumeEaten += mealData.volumeGained || 0
    if (mealData.type === 'npc') player.feeding.npcsEaten++
    if (mealData.type === 'player') player.feeding.playersEaten++
    
    player.updatedAt = Date.now()
    this._emit('eat', { player, meal })
  }
  
  /**
   * Get recent meals for a player
   * @param {string} id - Player ID
   * @returns {Array} Array of meal records
   */
  getMeals(id) {
    const player = this.players.get(id)
    return player ? [...player.feeding.meals] : []
  }
  
  /**
   * Get feeding statistics for a player
   * @param {string} id - Player ID
   * @returns {object|null} Feeding stats
   */
  getFeedingStats(id) {
    const player = this.players.get(id)
    if (!player) return null
    
    return {
      meals: [...player.feeding.meals],
      mealCount: player.feeding.meals.length,
      totalVolumeEaten: player.feeding.totalVolumeEaten,
      npcsEaten: player.feeding.npcsEaten,
      playersEaten: player.feeding.playersEaten,
    }
  }
  
  // ==========================================================================
  // UPDATES
  // ==========================================================================
  
  /**
   * Update player data (general purpose)
   * @param {string} id 
   * @param {object} updates 
   * @returns {object|null} Updated player
   */
  update(id, updates) {
    const player = this.players.get(id)
    if (!player) {
      console.warn(`[PlayerRegistry] Cannot update unknown player: ${id}`)
      return null
    }
    
    this._applyOptions(player, updates)
    player.updatedAt = Date.now()
    
    this._emit('update', player)
    return player
  }
  
  /**
   * Update player position and rotation
   * Used for network sync of remote players
   * @param {string} id 
   * @param {THREE.Vector3} position 
   * @param {THREE.Euler|object} rotation 
   * @param {number} timestamp - Server timestamp
   */
  updatePosition(id, position, rotation, timestamp = Date.now()) {
    const player = this.players.get(id)
    if (!player) return
    
    if (player.isLocal) {
      // Local player - update directly
      player.transform.position.copy(position)
      if (rotation instanceof THREE.Euler) {
        player.transform.rotation.copy(rotation)
      } else {
        player.transform.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
      }
    } else {
      // Remote player - add to interpolation buffer
      player.network.positionBuffer.push({
        position: position.clone(),
        rotation: rotation instanceof THREE.Euler ? rotation.clone() : new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0),
        timestamp,
      })
      
      // Keep buffer size reasonable (last 1 second of data)
      while (player.network.positionBuffer.length > 20) {
        player.network.positionBuffer.shift()
      }
    }
    
    player.transform.lastUpdateTime = timestamp
    player.network.lastUpdateTime = Date.now()
    player.updatedAt = Date.now()
  }
  
  /**
   * Update player velocity
   * @param {string} id 
   * @param {THREE.Vector3} velocity 
   */
  updateVelocity(id, velocity) {
    const player = this.players.get(id)
    if (!player) return
    
    player.transform.velocity.copy(velocity)
    player.updatedAt = Date.now()
  }
  
  /**
   * Update player stats
   * @param {string} id 
   * @param {object} stats - Partial stats object
   */
  updateStats(id, stats) {
    const player = this.players.get(id)
    if (!player) return
    
    Object.assign(player.stats, stats)
    player.updatedAt = Date.now()
    
    this._emit('update', player)
  }
  
  /**
   * Update player creature
   * @param {string} id 
   * @param {object} creatureData 
   */
  updateCreature(id, creatureData) {
    const player = this.players.get(id)
    if (!player) return
    
    Object.assign(player.creature, creatureData)
    player.updatedAt = Date.now()
    
    this._emit('update', player)
  }
  
  /**
   * Update player mesh reference
   * @param {string} id 
   * @param {THREE.Object3D} mesh 
   * @param {object} parts 
   */
  updateMesh(id, mesh, parts = null) {
    const player = this.players.get(id)
    if (!player) return
    
    // Clean up old mesh if exists
    if (player.mesh && player.mesh !== mesh) {
      if (this.scene) this.scene.remove(player.mesh)
      this._disposeMesh(player.mesh)
    }
    
    player.mesh = mesh
    if (parts) player.parts = parts
    player.updatedAt = Date.now()
  }
  
  /**
   * Update physics references
   * @param {string} id 
   * @param {object} physicsData 
   */
  updatePhysics(id, physicsData) {
    const player = this.players.get(id)
    if (!player) return
    
    Object.assign(player.physics, physicsData)
    player.updatedAt = Date.now()
  }
  
  /**
   * Update capability state
   * @param {string} id 
   * @param {object} capabilityData 
   */
  updateCapabilities(id, capabilityData) {
    const player = this.players.get(id)
    if (!player) return
    
    Object.assign(player.capabilities, capabilityData)
    player.updatedAt = Date.now()
  }
  
  /**
   * Update network stats (ping, etc.)
   * @param {string} id 
   * @param {object} networkData 
   */
  updateNetwork(id, networkData) {
    const player = this.players.get(id)
    if (!player) return
    
    Object.assign(player.network, networkData)
    player.network.lastUpdateTime = Date.now()
    player.updatedAt = Date.now()
  }
  
  /**
   * Set player connection state
   * @param {string} id 
   * @param {string} state - ConnectionState value
   */
  setConnectionState(id, state) {
    const player = this.players.get(id)
    if (!player) return
    
    const oldState = player.connectionState
    player.connectionState = state
    player.updatedAt = Date.now()
    
    this._emit('stateChange', { player, oldState, newState: state })
  }
  
  // ==========================================================================
  // TAGS
  // ==========================================================================
  
  /**
   * Add a tag to player
   * @param {string} id 
   * @param {string} tag 
   */
  addTag(id, tag) {
    const player = this.players.get(id)
    if (!player) return
    
    player.tags.add(tag)
    player.updatedAt = Date.now()
  }
  
  /**
   * Remove a tag from player
   * @param {string} id 
   * @param {string} tag 
   */
  removeTag(id, tag) {
    const player = this.players.get(id)
    if (!player) return
    
    player.tags.delete(tag)
    player.updatedAt = Date.now()
  }
  
  /**
   * Check if player has a tag
   * @param {string} id 
   * @param {string} tag 
   * @returns {boolean}
   */
  hasTag(id, tag) {
    const player = this.players.get(id)
    return player ? player.tags.has(tag) : false
  }
  
  // ==========================================================================
  // GAME ACTIONS
  // ==========================================================================
  
  /**
   * Record player spawn
   * @param {string} id 
   * @param {THREE.Vector3} position 
   */
  spawn(id, position) {
    const player = this.players.get(id)
    if (!player) return
    
    player.stats.spawnTime = Date.now()
    player.stats.health = player.stats.maxHealth
    player.transform.position.copy(position)
    player.tags.delete(PlayerTag.DEAD)
    player.updatedAt = Date.now()
    
    this._emit('spawn', player)
  }
  
  /**
   * Record player death
   * @param {string} id 
   * @param {string} killerId - ID of player who killed them (null if NPC/environment)
   * @param {string} cause 
   */
  death(id, killerId = null, cause = 'eaten') {
    const player = this.players.get(id)
    if (!player) return
    
    player.stats.deaths++
    player.stats.health = 0
    player.tags.add(PlayerTag.DEAD)
    player.updatedAt = Date.now()
    
    // Credit killer if exists
    if (killerId) {
      const killer = this.players.get(killerId)
      if (killer) {
        killer.stats.kills++
        killer.updatedAt = Date.now()
      }
    }
    
    this._emit('death', { player, killerId, cause })
  }
  
  /**
   * Apply damage to player
   * @param {string} id 
   * @param {number} amount 
   * @param {string} source 
   * @returns {boolean} Whether player died
   */
  damage(id, amount, source = 'unknown') {
    const player = this.players.get(id)
    if (!player) return false
    
    if (player.tags.has(PlayerTag.INVINCIBLE)) return false
    
    player.stats.health = Math.max(0, player.stats.health - amount)
    player.updatedAt = Date.now()
    
    if (player.stats.health <= 0) {
      this.death(id, null, source)
      return true
    }
    
    return false
  }
  
  /**
   * Heal player
   * @param {string} id 
   * @param {number} amount 
   */
  heal(id, amount) {
    const player = this.players.get(id)
    if (!player) return
    
    player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + amount)
    player.updatedAt = Date.now()
  }
  
  // ==========================================================================
  // NETWORK SYNC HELPERS
  // ==========================================================================
  
  /**
   * Get serializable state for network transmission
   * @param {string} id 
   * @param {boolean} full - Include full state or just delta
   * @returns {object}
   */
  getNetworkState(id, full = false) {
    const player = this.players.get(id)
    if (!player) return null
    
    const pos = player.transform.position
    const rot = player.transform.rotation
    const vel = player.transform.velocity
    
    const state = {
      id: player.id,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      volume: player.volumes.world,  // Send world volume (not effective)
      scale: player.capsule.scaleFactor,
      timestamp: Date.now(),
    }
    
    if (full) {
      state.displayName = player.displayName
      state.creature = { ...player.creature }
      state.stats = { ...player.stats }
      state.capabilities = {
        activeAbility: player.capabilities.activeAbility,
        abilityState: player.capabilities.abilityState,
      }
      state.tags = Array.from(player.tags)
    }
    
    return state
  }
  
  /**
   * Apply network state to player
   * @param {string} id 
   * @param {object} state - State from network
   */
  applyNetworkState(id, state) {
    let player = this.players.get(id)
    
    // Auto-register remote player if not exists
    if (!player && id !== this.localPlayerId) {
      player = this.registerRemote(id, {})
    }
    
    if (!player) return
    
    // Position update (with interpolation for remote)
    if (state.position) {
      const pos = new THREE.Vector3(state.position.x, state.position.y, state.position.z)
      const rot = state.rotation 
        ? new THREE.Euler(state.rotation.x, state.rotation.y, state.rotation.z)
        : player.transform.rotation.clone()
      
      this.updatePosition(id, pos, rot, state.timestamp)
    }
    
    // Velocity
    if (state.velocity) {
      const vel = new THREE.Vector3(state.velocity.x, state.velocity.y, state.velocity.z)
      this.updateVelocity(id, vel)
    }
    
    // Volume (network volume is world volume only)
    if (state.volume !== undefined) {
      this.setWorldVolume(id, state.volume)
    }
    
    // Full state updates
    if (state.displayName) player.displayName = state.displayName
    if (state.creature) Object.assign(player.creature, state.creature)
    if (state.stats) Object.assign(player.stats, state.stats)
    if (state.capabilities) Object.assign(player.capabilities, state.capabilities)
    if (state.tags) {
      player.tags = new Set(state.tags)
    }
    
    player.network.packetsReceived++
    player.updatedAt = Date.now()
  }
  
  /**
   * Interpolate remote player positions for smooth movement
   * Call this each frame
   * @param {number} renderTime - Current render timestamp (with delay)
   */
  interpolateRemotePlayers(renderTime) {
    for (const player of this.players.values()) {
      if (player.isLocal) continue
      if (player.network.positionBuffer.length < 2) continue
      
      const buffer = player.network.positionBuffer
      
      // Find surrounding states for interpolation
      let older = null
      let newer = null
      
      for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
          older = buffer[i]
          newer = buffer[i + 1]
          break
        }
      }
      
      if (!older || !newer) {
        // Extrapolate from latest
        if (buffer.length > 0) {
          const latest = buffer[buffer.length - 1]
          player.transform.targetPosition.copy(latest.position)
          player.transform.targetRotation.copy(latest.rotation)
        }
        continue
      }
      
      // Interpolate
      const duration = newer.timestamp - older.timestamp
      const elapsed = renderTime - older.timestamp
      const t = duration > 0 ? elapsed / duration : 0
      
      player.transform.targetPosition.lerpVectors(older.position, newer.position, t)
      
      // Interpolate rotation (simple lerp, could use quaternions)
      player.transform.targetRotation.set(
        THREE.MathUtils.lerp(older.rotation.x, newer.rotation.x, t),
        THREE.MathUtils.lerp(older.rotation.y, newer.rotation.y, t),
        THREE.MathUtils.lerp(older.rotation.z, newer.rotation.z, t)
      )
    }
  }
  
  /**
   * Apply interpolated positions to meshes
   * Call after interpolateRemotePlayers
   * @param {number} lerpFactor - Smoothing factor (0-1)
   */
  applyInterpolation(lerpFactor = 0.2) {
    for (const player of this.players.values()) {
      if (player.isLocal) continue
      if (!player.mesh) continue
      
      // Lerp mesh position toward target
      player.mesh.position.lerp(player.transform.targetPosition, lerpFactor)
      
      // Lerp rotation
      player.mesh.rotation.x = THREE.MathUtils.lerp(
        player.mesh.rotation.x, 
        player.transform.targetRotation.x, 
        lerpFactor
      )
      player.mesh.rotation.y = THREE.MathUtils.lerp(
        player.mesh.rotation.y, 
        player.transform.targetRotation.y, 
        lerpFactor
      )
    }
  }
  
  // ==========================================================================
  // EVENTS
  // ==========================================================================
  
  /**
   * Subscribe to registry events
   * @param {string} event - Event name
   * @param {function} callback 
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      console.warn(`[PlayerRegistry] Unknown event: ${event}`)
      return () => {}
    }
    
    this.listeners[event].push(callback)
    return () => {
      const idx = this.listeners[event].indexOf(callback)
      if (idx > -1) this.listeners[event].splice(idx, 1)
    }
  }
  
  /**
   * Emit an event
   * @private
   */
  _emit(event, data) {
    this.listeners[event]?.forEach(cb => {
      try {
        cb(data)
      } catch (e) {
        console.error(`[PlayerRegistry] Error in ${event} listener:`, e)
      }
    })
  }
  
  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================
  
  /**
   * Update play time for all connected players
   * Call periodically (e.g., every second)
   */
  updatePlayTime() {
    const now = Date.now()
    for (const player of this.players.values()) {
      if (player.connectionState !== ConnectionState.DISCONNECTED) {
        player.stats.playTime = Math.floor((now - player.stats.spawnTime) / 1000)
      }
    }
  }
  
  /**
   * Check for disconnected players (by timeout)
   * Call periodically
   */
  checkDisconnects() {
    const now = Date.now()
    const disconnected = []
    
    for (const player of this.players.values()) {
      if (player.isLocal) continue
      if (player.connectionState === ConnectionState.DISCONNECTED) continue
      
      const timeSinceUpdate = now - player.network.lastUpdateTime
      
      if (timeSinceUpdate > CONFIG.maxPing) {
        player.connectionState = ConnectionState.DISCONNECTED
        disconnected.push(player)
        this._emit('stateChange', { 
          player, 
          oldState: ConnectionState.CONNECTED, 
          newState: ConnectionState.DISCONNECTED 
        })
      }
    }
    
    return disconnected
  }
  
  /**
   * Clean up players who have been disconnected too long
   * Call periodically
   */
  cleanupDisconnected() {
    const now = Date.now()
    const removed = []
    
    for (const player of this.players.values()) {
      if (player.connectionState !== ConnectionState.DISCONNECTED) continue
      
      const timeSinceUpdate = now - player.network.lastUpdateTime
      
      if (timeSinceUpdate > CONFIG.disconnectTimeout) {
        this.unregister(player.id, 'timeout')
        removed.push(player.id)
      }
    }
    
    return removed
  }
  
  /**
   * Clear all players
   */
  clear() {
    for (const id of this.players.keys()) {
      this.unregister(id, 'clear')
    }
    
    this.localPlayerId = null
    this.stats.currentOnline = 0
  }
  
  // ==========================================================================
  // DEBUG
  // ==========================================================================
  
  /**
   * Log registry state
   */
  debug() {
    console.group('[PlayerRegistry] Debug')
    console.log(`Total players: ${this.players.size}`)
    console.log(`Local player: ${this.localPlayerId || 'none'}`)
    console.log(`Stats:`, this.stats)
    
    console.group('Players')
    for (const player of this.players.values()) {
      console.log(`${player.id} (${player.isLocal ? 'LOCAL' : 'REMOTE'})`)
      console.log(`  Name: ${player.displayName}`)
      console.log(`  State: ${player.connectionState}`)
      console.log(`  Creature: ${player.creature.displayName} (${player.creature.type}/${player.creature.class})`)
      console.log(`  Position: (${player.transform.position.x.toFixed(1)}, ${player.transform.position.y.toFixed(1)}, ${player.transform.position.z.toFixed(1)})`)
      console.log(`  Volumes: natural=${player.volumes.natural.toFixed(4)}, world=${player.volumes.world.toFixed(2)}, manual=${player.volumes.manualScale.toFixed(2)}, effective=${player.volumes.effective.toFixed(2)} m^3`)
      console.log(`  Scale: ${player.capsule.scaleFactor.toFixed(4)}`)
      console.log(`  Feeding: ${player.feeding.npcsEaten} NPCs, ${player.feeding.playersEaten} players, ${player.feeding.totalVolumeEaten.toFixed(2)} m^3 total`)
      console.log(`  Health: ${player.stats.health}/${player.stats.maxHealth}`)
      console.log(`  Ping: ${player.network.ping}ms`)
      console.log(`  Tags: ${Array.from(player.tags).join(', ') || 'none'}`)
    }
    console.groupEnd()
    
    console.groupEnd()
  }
  
  /**
   * Get summary for HUD display
   * @returns {object}
   */
  getSummary() {
    return {
      total: this.players.size,
      local: this.localPlayerId ? 1 : 0,
      remote: this.players.size - (this.localPlayerId ? 1 : 0),
      connected: this.getConnected().length,
      ...this.stats,
    }
  }
  
  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================
  
  /**
   * Apply options to player data
   * @private
   */
  _applyOptions(player, options) {
    // Direct field mappings
    if (options.displayName) player.displayName = options.displayName
    if (options.accountType) player.accountType = options.accountType
    if (options.accountId) player.accountId = options.accountId
    if (options.connectionState) player.connectionState = options.connectionState
    
    // Creature
    if (options.creature) {
      Object.assign(player.creature, options.creature)
    }
    if (options.creatureType) player.creature.type = options.creatureType
    if (options.creatureClass) player.creature.class = options.creatureClass
    if (options.creatureSeed) player.creature.seed = options.creatureSeed
    if (options.variantIndex !== undefined) player.creature.variant = options.variantIndex
    
    // Mesh & Parts
    if (options.mesh) player.mesh = options.mesh
    if (options.parts) player.parts = options.parts
    
    // Physics
    if (options.physics) {
      Object.assign(player.physics, options.physics)
    }
    
    // Transform
    if (options.position) {
      if (options.position instanceof THREE.Vector3) {
        player.transform.position.copy(options.position)
      } else {
        player.transform.position.set(
          options.position.x || 0,
          options.position.y || 0,
          options.position.z || 0
        )
      }
    }
    if (options.rotation) {
      if (options.rotation instanceof THREE.Euler) {
        player.transform.rotation.copy(options.rotation)
      } else {
        player.transform.rotation.set(
          options.rotation.x || 0,
          options.rotation.y || 0,
          options.rotation.z || 0
        )
      }
    }
    
    // Stats
    if (options.stats) {
      Object.assign(player.stats, options.stats)
    }
    if (options.health !== undefined) player.stats.health = options.health
    if (options.score !== undefined) player.stats.score = options.score
    
    // Capabilities
    if (options.capabilities) {
      Object.assign(player.capabilities, options.capabilities)
    }
    if (options.activeAbility) player.capabilities.activeAbility = options.activeAbility
    
    // Network
    if (options.network) {
      Object.assign(player.network, options.network)
    }
    if (options.ping !== undefined) player.network.ping = options.ping
    
    // Tags
    if (options.tags) {
      if (Array.isArray(options.tags)) {
        options.tags.forEach(t => player.tags.add(t))
      } else if (options.tags instanceof Set) {
        options.tags.forEach(t => player.tags.add(t))
      }
    }
    
    // Metadata
    if (options.metadata) {
      Object.assign(player.metadata, options.metadata)
    }
  }
  
  /**
   * Dispose mesh resources
   * @private
   */
  _disposeMesh(mesh) {
    mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const PlayerRegistry = new PlayerRegistryClass()

// Also export the class for testing/extension
export { PlayerRegistryClass }

// Default export
export default PlayerRegistry