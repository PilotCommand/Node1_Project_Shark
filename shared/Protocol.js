/**
 * Protocol.js - Shared message protocol between client and server
 * 
 * This file is used by BOTH client and server - keep it identical!
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export const MSG = {
  // Connection lifecycle (1-9)
  WELCOME: 1,           // Server â†’ Client: You connected, here's your ID
  PLAYER_JOIN: 2,       // Server â†’ Client: Another player joined
  PLAYER_LEAVE: 3,      // Server â†’ Client: Another player left
  PING: 4,              // Client â†’ Server: Latency check
  PONG: 5,              // Server â†’ Client: Latency response
  
  // Movement (10-19)
  POSITION: 10,         // Client â†’ Server: My position update
  BATCH_POSITIONS: 11,  // Server â†’ Client: All players' positions
  
  // Game state (20-29)
  JOIN_GAME: 20,        // Client â†’ Server: I selected my creature, ready to play
  CREATURE_UPDATE: 21,  // Client â†’ Server: I changed creature (R key, N/B keys)
  SIZE_UPDATE: 22,      // Server â†’ Client: Player size changed significantly
  
  // NPCs (30-39)
  NPC_SPAWN: 30,
  NPC_BATCH_SPAWN: 31,
  NPC_DEATH: 32,
  EAT_NPC: 33,
  NPC_SNAPSHOT: 34,       // Host → Server → Others: NPC positions sync
  HOST_ASSIGNED: 35,      // Server → Client: You are the NPC simulation host
  HOST_CHANGED: 36,       // Server → All: New host assigned
  
  // PvP (40-49) - Phase 4
  EAT_PLAYER: 40,
  PLAYER_EATEN: 41,
  PLAYER_DIED: 42,
  PLAYER_RESPAWN: 43,
  
  // Leaderboard (50-59) - Phase 4
  LEADERBOARD: 50,
  
  // Room management (60-69) - Phase 7
  ROOM_INFO: 60,
  ROOM_LIST: 61,
  SWITCH_ROOM: 62,
  
  // World sync (70-79)
  REQUEST_MAP_CHANGE: 70,  // Client â†’ Server: Request new map
  MAP_CHANGE: 71,          // Server -> All Clients: New map seed

  // Abilities (80-89)
  ABILITY_START: 80,       // Client -> Server -> Others: Player activated ability
  ABILITY_STOP: 81,        // Client -> Server -> Others: Player deactivated ability
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const NETWORK_CONFIG = {
  sendRate: 20,              // Client sends position X times per second
  tickRate: 20,              // Server broadcasts X times per second
  interpolationDelay: 100,   // ms behind server time for smooth rendering
  maxPlayersPerRoom: 100,
  positionThreshold: 0.05,   // Don't send if moved less than this
  rotationThreshold: 0.02,   // Radians
  
  // NPC Host Sync
  npcSnapshotRate: 2000,     // Host sends NPC snapshot every X ms
  npcCorrectionSpeed: 0.15,  // Lerp factor for follower corrections
}

// ============================================================================
// ENCODING (Phase 1: JSON)
// ============================================================================

export function encodeMessage(type, data = {}) {
  return JSON.stringify({ t: type, ...data })
}

export function decodeMessage(raw) {
  try {
    const str = typeof raw === 'string' 
      ? raw 
      : new TextDecoder().decode(raw)
    
    const data = JSON.parse(str)
    return { type: data.t, ...data }
  } catch (err) {
    console.error('[Protocol] Failed to decode message:', err)
    return { type: -1, error: err.message }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

export function getMessageName(type) {
  for (const [name, value] of Object.entries(MSG)) {
    if (value === type) return name
  }
  return `UNKNOWN(${type})`
}

export function createPositionMessage(position, rotation, scale) {
  return encodeMessage(MSG.POSITION, {
    p: {
      x: round(position.x, 2),
      y: round(position.y, 2),
      z: round(position.z, 2),
    },
    r: {
      x: round(rotation.x, 3),
      y: round(rotation.y, 3),
      z: round(rotation.z, 3),
    },
    s: round(scale, 3),
  })
}

export function createJoinMessage(creature, displayName = 'Player') {
  return encodeMessage(MSG.JOIN_GAME, {
    name: displayName,
    creature: {
      type: creature.type,
      class: creature.class,
      variant: creature.variantIndex || 0,
      seed: creature.seed,
    },
  })
}

function round(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ============================================================================
// VALIDATION
// ============================================================================

export function isValidPosition(pos) {
  if (!pos || typeof pos !== 'object') return false
  if (typeof pos.x !== 'number' || isNaN(pos.x)) return false
  if (typeof pos.y !== 'number' || isNaN(pos.y)) return false
  if (typeof pos.z !== 'number' || isNaN(pos.z)) return false
  if (Math.abs(pos.x) > 1000) return false
  if (Math.abs(pos.y) > 100) return false
  if (Math.abs(pos.z) > 1000) return false
  return true
}

export function isValidCreature(creature) {
  if (!creature || typeof creature !== 'object') return false
  if (!creature.type || typeof creature.type !== 'string') return false
  if (!creature.class || typeof creature.class !== 'string') return false
  if (typeof creature.seed !== 'number') return false
  return true
}

// ============================================================================
// NPC SNAPSHOT HELPERS
// ============================================================================

/**
 * Create a compact NPC snapshot message
 * @param {number} tick - Simulation tick
 * @param {Array} fishArray - Array of {id, x, y, z, ry, gi, pi, st}
 * @returns {string} Encoded message
 */
export function createNPCSnapshotMessage(tick, fishArray) {
  return encodeMessage(MSG.NPC_SNAPSHOT, {
    tick: tick,
    fish: fishArray.map(f => ({
      id: f.id,
      x: round(f.x, 1),
      y: round(f.y, 1),
      z: round(f.z, 1),
      ry: round(f.ry, 2),
      gi: f.gi,    // grid index
      pi: f.pi,    // path index
      st: f.st,    // state
    }))
  })
}

/**
 * Validate an NPC snapshot
 * @param {object} snapshot
 * @returns {boolean}
 */
export function isValidNPCSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  if (typeof snapshot.tick !== 'number') return false
  if (!Array.isArray(snapshot.fish)) return false
  return true
}