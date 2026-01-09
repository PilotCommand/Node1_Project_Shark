/**
 * NetworkManager.js - Client-side networking
 * 
 * Usage in your src/main.js:
 *   import { networkManager } from '../network/NetworkManager.js'
 *   
 *   await networkManager.connect('ws://localhost:9001', scene)
 *   networkManager.joinGame(creatureData)
 *   
 *   // In game loop:
 *   networkManager.sendPosition(position, rotation, scale)
 *   networkManager.update(delta)
 * 
 * Volume Data Flow:
 *   - Local player: main.js -> sendPosition(volume) -> server
 *   - Remote players: server -> handleBatchPositions -> RemotePlayerManager -> PlayerRegistry
 */

import { 
  MSG, 
  encodeMessage, 
  decodeMessage, 
  NETWORK_CONFIG,
  getMessageName,
} from '../shared/Protocol.js'
import { RemotePlayerManager } from './RemotePlayerManager.js'
import { NetworkClock } from './NetworkClock.js'
import { Determine } from '../src/determine.js'
import { FishAdder } from '../src/FishAdder.js'
import { PlayerRegistry } from '../src/PlayerRegistry.js'

// ============================================================================
// NETWORK MANAGER CLASS
// ============================================================================

class NetworkManager {
  constructor() {
    this.socket = null
    this.connected = false
    this.connecting = false
    this.serverUrl = null
    
    this.playerId = null
    this.roomId = null
    this.npcSeed = null  // Seed for deterministic NPC spawning
    this.worldSeed = null  // Seed for terrain generation (syncs map across clients)
    this.deadNpcIds = []  // NPCs that were eaten before we joined
    
    // NPC Host Sync (Option 6b)
    this.isHost = false                  // Are we the NPC simulation host?
    this.hostId = null                   // Current host's player ID
    this.snapshotInterval = null         // Interval for sending snapshots
    this.snapshotRate = NETWORK_CONFIG.npcSnapshotRate || 2000
    
    this.remotePlayers = null
    this.scene = null
    
    this.clock = new NetworkClock()
    this.lastSendTime = 0
    
    this.lastSentPosition = { x: 0, y: 0, z: 0 }
    this.lastSentRotation = { x: 0, y: 0, z: 0 }
    this.lastSentScale = 1
    this.lastSentVolume = 1  // Track last sent volume for change detection
    
    this.onConnectedCallback = null
    this.onDisconnectedCallback = null
    this.onPlayerJoinCallback = null
    this.onPlayerLeaveCallback = null
    this.onMapChangeCallback = null
    this.onNPCSeedReadyCallback = null  // Called when NPC seed is received
    this.onNPCDeathCallback = null      // Called when an NPC is eaten by another player
    this.onChatMessageCallback = null   // Called when a chat message is received from another player
    this.onNPCSnapshotCallback = null   // Called when NPC snapshot received (followers only)
    this.onBecameHostCallback = null    // Called when we become NPC host
    this.onAbilityChangeCallback = null // Called when a remote player changes ability state
    this.onPrismPlaceCallback = null    // Called when a remote player places a prism
    this.onPrismRemoveCallback = null   // Called when a remote player's prism is removed
    
    this.debug = false  // Set to true for verbose logging
  }
  
  // ============================================================================
  // CONNECTION
  // ============================================================================
  
  async connect(serverUrl, scene, options = {}) {
    if (this.connected || this.connecting) {
      console.warn('[Network] Already connected or connecting')
      return this.playerId
    }
    
    this.connecting = true
    this.serverUrl = serverUrl
    this.scene = scene
    
    this.remotePlayers = new RemotePlayerManager(scene)
    
    return new Promise((resolve, reject) => {
      console.log(`[Network] Connecting to ${serverUrl}...`)
      
      try {
        this.socket = new WebSocket(serverUrl)
        this.socket.binaryType = 'arraybuffer'
      } catch (err) {
        this.connecting = false
        reject(new Error(`Failed to create WebSocket: ${err.message}`))
        return
      }
      
      const timeout = setTimeout(() => {
        if (this.connecting) {
          this.connecting = false
          this.socket?.close()
          reject(new Error('Connection timeout'))
        }
      }, options.timeout || 5000)
      
      this.socket.onopen = () => {
        console.log('[Network] WebSocket connected, waiting for WELCOME...')
      }
      
      this.socket.onmessage = (event) => {
        const data = decodeMessage(event.data)
        
        if (this.debug) {
          console.log(`[Network] Received: ${getMessageName(data.type)}`, data)
        }
        
        if (data.type === MSG.WELCOME && this.connecting) {
          clearTimeout(timeout)
          this.connecting = false
          this.connected = true
          this.playerId = data.id
          this.roomId = data.roomId
          
          // Store world seed for terrain sync
          if (data.worldSeed !== undefined) {
            this.worldSeed = data.worldSeed
            console.log(`[Network] World seed: ${data.worldSeed} (0x${(data.worldSeed >>> 0).toString(16).toUpperCase()})`)
          }
          
          // Initialize deterministic RNG for NPCs
          if (data.npcSeed !== undefined) {
            this.npcSeed = data.npcSeed
            Determine.init(data.npcSeed)
            console.log(`[Network] NPC seed initialized: ${data.npcSeed} (0x${(data.npcSeed >>> 0).toString(16).toUpperCase()})`)
          }
          
          // Store dead NPC IDs for late joiners
          this.deadNpcIds = data.deadNpcIds || []
          if (this.deadNpcIds.length > 0) {
            console.log(`[Network] ${this.deadNpcIds.length} NPCs already dead in this room`)
          }
          
          // NPC Host status
          this.hostId = data.hostId || null
          this.isHost = data.isHost || false
          if (this.isHost) {
            console.log(`[Network] We are the NPC HOST - will broadcast snapshots`)
            // Don't start broadcast yet - wait for NPCs to spawn first
            // main.js will call startSnapshotBroadcast() after FishAdder.spawnInitialFish()
          } else {
            console.log(`[Network] NPC host is player ${this.hostId}`)
          }
          
          console.log(`[Network] Connected! Player ID: ${this.playerId}, Room: ${this.roomId}`)
          
          if (data.players && data.players.length > 0) {
            console.log(`[Network] Spawning ${data.players.length} existing players`)
            data.players.forEach(player => {
              this.remotePlayers.addPlayer(player.id, player)
            })
          }
          
          this.onConnectedCallback?.(this.playerId, this.roomId)
          
          // Notify that NPC seed is ready (after connected callback)
          if (this.npcSeed !== null) {
            this.onNPCSeedReadyCallback?.(this.npcSeed, this.deadNpcIds)
          }
          
          resolve(this.playerId)
          return
        }
        
        this.handleMessage(data)
      }
      
      this.socket.onclose = (event) => {
        console.log(`[Network] Connection closed: code=${event.code}`)
        
        if (this.connecting) {
          clearTimeout(timeout)
          this.connecting = false
          reject(new Error(`Connection closed: ${event.code}`))
          return
        }
        
        this.handleDisconnect()
      }
      
      this.socket.onerror = (error) => {
        console.error('[Network] WebSocket error:', error)
        
        if (this.connecting) {
          clearTimeout(timeout)
          this.connecting = false
          reject(new Error('WebSocket error'))
        }
      }
    })
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.handleDisconnect()
  }
  
  handleDisconnect() {
    const wasConnected = this.connected
    
    this.connected = false
    this.connecting = false
    this.playerId = null
    this.roomId = null
    this.npcSeed = null
    this.worldSeed = null
    this.deadNpcIds = []
    
    // Clean up host state
    this.stopSnapshotBroadcast()
    this.isHost = false
    this.hostId = null
    
    this.remotePlayers?.destroy()
    this.remotePlayers = null
    
    if (wasConnected) {
      console.log('[Network] Disconnected from server')
      this.onDisconnectedCallback?.()
    }
  }
  
  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  
  handleMessage(data) {
    switch (data.type) {
      case MSG.PLAYER_JOIN:
        this.handlePlayerJoin(data)
        break
        
      case MSG.PLAYER_LEAVE:
        this.handlePlayerLeave(data)
        break
        
      case MSG.BATCH_POSITIONS:
        this.handleBatchPositions(data)
        break
        
      case MSG.CREATURE_UPDATE:
        this.handleCreatureUpdate(data)
        break
        
      case MSG.SIZE_UPDATE:
        this.handleSizeUpdate(data)
        break
        
      case MSG.PONG:
        this.handlePong(data)
        break
        
      case MSG.NPC_SPAWN:
      case MSG.NPC_BATCH_SPAWN:
      case MSG.NPC_DEATH:
        this.handleNPCMessage(data)
        break
        
      case MSG.PLAYER_EATEN:
      case MSG.PLAYER_DIED:
      case MSG.PLAYER_RESPAWN:
        this.handlePvPMessage(data)
        break
        
      case MSG.LEADERBOARD:
        this.handleLeaderboard(data)
        break
        
      case MSG.MAP_CHANGE:
        this.handleMapChange(data)
        break
        
      case MSG.HOST_ASSIGNED:
        this.handleHostAssigned(data)
        break
        
      case MSG.HOST_CHANGED:
        this.handleHostChanged(data)
        break
        
      case MSG.NPC_SNAPSHOT:
        this.handleNPCSnapshot(data)
        break
        
      case MSG.ABILITY_START:
      case MSG.ABILITY_STOP:
        this.handleAbilityChange(data)
        break
        
      case MSG.PRISM_PLACE:
        this.handlePrismPlace(data)
        break
        
      case MSG.PRISM_REMOVE:
        this.handlePrismRemove(data)
        break
        
      case MSG.CHAT:
        this.handleChatMessage(data)
        break
        
      default:
        if (this.debug) {
          console.log(`[Network] Unhandled message type: ${data.type}`)
        }
    }
  }
  
  handlePlayerJoin(data) {
    console.log(`[Network] Player ${data.id} joined: ${data.name}`)
    this.remotePlayers?.addPlayer(data.id, data)
    this.onPlayerJoinCallback?.(data)
  }
  
  handlePlayerLeave(data) {
    console.log(`[Network] Player ${data.id} left`)
    this.remotePlayers?.removePlayer(data.id)
    
    // Clean up PlayerRegistry entry for remote player
    PlayerRegistry.unregister(data.id)
    
    this.onPlayerLeaveCallback?.(data.id)
  }
  
  /**
   * Handle batch position updates from server
   * Volume data flows: server -> RemotePlayerManager -> PlayerRegistry
   */
  handleBatchPositions(data) {
    if (!data.p || !Array.isArray(data.p)) return
    
    // Server sends 'time' for timestamp (not 't' which conflicts with message type)
    if (data.time) {
      this.clock.syncServerTime(data.time)
    }
    
    const serverTime = data.time || Date.now()
    
    data.p.forEach(pos => {
      if (pos.id === this.playerId) return
      
      // RemotePlayerManager.updatePosition -> RemotePlayer.updateVolume -> PlayerRegistry.setWorldVolume
      this.remotePlayers?.updatePosition(pos.id, {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        rx: pos.rx,
        ry: pos.ry,
        rz: pos.rz,
        scale: pos.s,
        volume: pos.v,  // World volume for feeding system (synced to PlayerRegistry)
      }, serverTime)
    })
  }
  
  handleCreatureUpdate(data) {
    console.log(`[Network] Player ${data.id} changed creature`)
    this.remotePlayers?.updateCreature(data.id, data.creature)
  }
  
  handleSizeUpdate(data) {
    this.remotePlayers?.updateSize(data.id, data.scale)
  }
  
  handlePong(data) {
    this.clock.handlePong(data.clientTime, data.serverTime)
  }
  
  handleNPCMessage(data) {
    switch (data.type) {
      case MSG.NPC_DEATH:
        // Another player ate this NPC - remove it locally
        if (data.npcId) {
          console.log(`[Network] NPC ${data.npcId} was eaten by player ${data.eatenBy}`)
          this.onNPCDeathCallback?.(data.npcId, data.eatenBy)
        }
        break
        
      case MSG.NPC_SPAWN:
      case MSG.NPC_BATCH_SPAWN:
        // For late joiners - not implemented yet
        break
    }
  }
  
  handlePvPMessage(data) {
    // TODO: Phase 4
  }
  
  handleLeaderboard(data) {
    // TODO: Phase 4
  }
  
  handleMapChange(data) {
    // Server now sends ONE master seed - npcSeed is derived by client
    const masterSeed = data.seed
    console.log(`[Network] Map change received - masterSeed: 0x${masterSeed.toString(16).toUpperCase()}`)
    
    // NOTE: Determine.reset() is now handled by performMapRegeneration() in controls.js
    // This ensures proper ordering: terrain -> SpawnFactory -> Determine -> fish spawn
    
    this.onMapChangeCallback?.(masterSeed, data.requestedBy)
  }
  
  handleAbilityChange(data) {
    // Another player started/stopped an ability
    const playerId = data.id
    const abilityKey = data.ability
    const isActive = data.type === MSG.ABILITY_START
    
    if (this.debug) {
      console.log(`[Network] Player ${playerId} ${isActive ? 'started' : 'stopped'} ability: ${abilityKey}`)
    }
    
    // Extract extra data (e.g., color, terrain, mimicSeed for camper)
    const extraData = {}
    if (data.color) extraData.color = data.color
    if (data.terrain) extraData.terrain = data.terrain
    if (data.mimicSeed !== undefined) extraData.mimicSeed = data.mimicSeed
    
    // Notify the remote player manager to update the player's ability state
    this.remotePlayers?.setAbilityState(playerId, abilityKey, isActive, extraData)
    
    // Call the callback if registered
    this.onAbilityChangeCallback?.(playerId, abilityKey, isActive, extraData)
  }
  
  handlePrismPlace(data) {
    // Another player placed a stacker prism
    const playerId = data.id
    
    if (this.debug) {
      console.log(`[Network] Player ${playerId} placed prism: ${data.prismId}`)
    }
    
    // Notify the prism placement callback
    this.onPrismPlaceCallback?.(playerId, data)
  }
  
  handlePrismRemove(data) {
    // Another player's prism was removed
    const playerId = data.id
    const prismId = data.prismId
    
    if (this.debug) {
      console.log(`[Network] Player ${playerId} removed prism: ${prismId}`)
    }
    
    // Notify the prism removal callback
    this.onPrismRemoveCallback?.(playerId, prismId)
  }
  
  // ============================================================================
  // NPC HOST SYNC (Option 6b)
  // ============================================================================
  
  /**
   * Handle becoming the NPC host (first join or migration)
   */
  handleHostAssigned(data) {
    if (data.isHost) {
      console.log('[Network] We are now the NPC HOST')
      this.isHost = true
      this.hostId = this.playerId
      
      // Start broadcasting snapshots
      this.startSnapshotBroadcast()
      
      this.onBecameHostCallback?.()
    }
  }
  
  /**
   * Handle host migration (another player is now host)
   */
  handleHostChanged(data) {
    this.hostId = data.hostId
    
    if (data.hostId === this.playerId) {
      // We became the new host
      console.log('[Network] Host migrated to us - we are now NPC HOST')
      this.isHost = true
      this.startSnapshotBroadcast()
      this.onBecameHostCallback?.()
    } else {
      // Someone else is host
      console.log(`[Network] Host migrated to player ${data.hostId}`)
      this.isHost = false
      this.stopSnapshotBroadcast()
    }
  }
  
  /**
   * Handle NPC snapshot from host (followers only)
   */
  handleNPCSnapshot(data) {
    // Ignore if we're the host (shouldn't receive our own snapshots)
    if (this.isHost) return
    
    // Apply snapshot to FishAdder
    FishAdder.applySnapshot(data)
    
    // Also notify callback if registered
    this.onNPCSnapshotCallback?.(data)
  }
  
  /**
   * Start broadcasting NPC snapshots (host only)
   */
  startSnapshotBroadcast() {
    if (this.snapshotInterval) {
      console.log('[Network] Snapshot broadcast already running')
      return
    }
    
    console.log(`[Network] Starting NPC snapshot broadcast (every ${this.snapshotRate}ms)`)
    
    this.snapshotInterval = setInterval(() => {
      if (!this.connected || !this.isHost) {
        this.stopSnapshotBroadcast()
        return
      }
      
      const snapshot = FishAdder.getSnapshot()
      this.send(MSG.NPC_SNAPSHOT, snapshot)
      
      if (this.debug) {
        console.log(`[Network] Sent NPC snapshot: tick=${snapshot.tick}, fish=${snapshot.fish.length}`)
      }
    }, this.snapshotRate)
  }
  
  /**
   * Stop broadcasting NPC snapshots
   */
  stopSnapshotBroadcast() {
    if (this.snapshotInterval) {
      console.log('[Network] Stopping NPC snapshot broadcast')
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
    }
  }
  
  /**
   * Check if we're the NPC host
   * @returns {boolean}
   */
  isNPCHost() {
    return this.isHost
  }
  
  /**
   * Get the current NPC host player ID
   * @returns {number|null}
   */
  getNPCHostId() {
    return this.hostId
  }
  
  /**
   * Get the world seed for terrain generation
   * Used to sync terrain across all clients
   * @returns {number|null}
   */
  getWorldSeed() {
    return this.worldSeed
  }
  
  /**
   * Handle chat message from another player
   * @param {object} data - { senderId, sender, text, isEmoji }
   */
  handleChatMessage(data) {
    if (this.debug) {
      console.log(`[Network] Chat from ${data.sender}: ${data.text}`)
    }
    this.onChatMessageCallback?.(data)
  }
  
  // ============================================================================
  // SENDING MESSAGES
  // ============================================================================
  
  send(type, data = {}) {
    if (!this.connected || !this.socket) {
      return false
    }
    
    try {
      const message = encodeMessage(type, data)
      this.socket.send(message)
      return true
    } catch (err) {
      console.error('[Network] Failed to send:', err)
      return false
    }
  }
  
  /**
   * Send a chat message to other players
   * @param {string} text - Message text
   * @param {boolean} isEmoji - Whether this is an emoji-only message
   * @returns {boolean} Whether send was successful
   */
  sendChatMessage(text, isEmoji = false, showProximity = true) {
    if (!this.connected || !text) return false
    return this.send(MSG.CHAT, { text, isEmoji, showProximity })
  }
  
  joinGame(creature, displayName = 'Player') {
    console.log(`[Network] Joining game as ${creature.class}`)
    
    this.send(MSG.JOIN_GAME, {
      name: displayName,
      creature: {
        type: creature.type,
        class: creature.class,
        variant: creature.variantIndex || 0,
        seed: creature.seed,
      },
    })
  }
  
  requestMapChange() {
    if (!this.connected) return false
    console.log(`[Network] Requesting map change...`)
    return this.send(MSG.REQUEST_MAP_CHANGE, {})
  }
  
  /**
   * Send ability activation to server
   * @param {string} abilityKey - 'sprinter', 'stacker', 'camper', 'attacker'
   * @param {Object} extraData - Optional extra data (e.g., { color, terrain } for camper)
   */
  sendAbilityStart(abilityKey, extraData = {}) {
    if (!this.connected) return false
    return this.send(MSG.ABILITY_START, { ability: abilityKey, ...extraData })
  }
  
  /**
   * Send ability deactivation to server
   * @param {string} abilityKey - 'sprinter', 'stacker', 'camper', 'attacker'
   */
  sendAbilityStop(abilityKey) {
    if (!this.connected) return false
    return this.send(MSG.ABILITY_STOP, { ability: abilityKey })
  }
  
  /**
   * Send prism placement to server
   * @param {Object} prismData - { prismId, position, quaternion, length, radius, color, roughness, metalness, emissive }
   */
  sendPrismPlace(prismData) {
    if (!this.connected) return false
    return this.send(MSG.PRISM_PLACE, prismData)
  }
  
  /**
   * Send prism removal to server
   * @param {string} prismId - The prism's unique ID
   */
  sendPrismRemove(prismId) {
    if (!this.connected) return false
    return this.send(MSG.PRISM_REMOVE, { prismId })
  }
  
  /**
   * Send position update to server
   * @param {Object} position - { x, y, z }
   * @param {Object} rotation - { x, y, z }
   * @param {number} scale - Visual scale factor
   * @param {number|null} volume - World volume in m^3 (excludes R/T debug scale)
   */
  sendPosition(position, rotation, scale, volume = null) {
    if (!this.connected) return
    
    const now = performance.now()
    const sendInterval = 1000 / NETWORK_CONFIG.sendRate
    
    if (now - this.lastSendTime < sendInterval) {
      return
    }
    
    const posChanged = this.hasPositionChanged(position)
    const rotChanged = this.hasRotationChanged(rotation)
    const scaleChanged = Math.abs(scale - this.lastSentScale) > NETWORK_CONFIG.positionThreshold
    const volumeChanged = volume !== null && Math.abs(volume - (this.lastSentVolume || 0)) > 0.1
    
    if (!posChanged && !rotChanged && !scaleChanged && !volumeChanged) {
      return
    }
    
    this.lastSendTime = now
    this.lastSentPosition = { ...position }
    this.lastSentRotation = { ...rotation }
    this.lastSentScale = scale
    if (volume !== null) this.lastSentVolume = volume
    
    const msg = {
      p: {
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      r: {
        x: Math.round(rotation.x * 1000) / 1000,
        y: Math.round(rotation.y * 1000) / 1000,
        z: Math.round(rotation.z * 1000) / 1000,
      },
      s: Math.round(scale * 1000) / 1000,
    }
    
    // Include volume for feeding system (5% rule)
    // This is world volume only - excludes R/T debug scale
    if (volume !== null && volume !== undefined) {
      msg.v = Math.round(volume * 100) / 100
    }
    
    this.send(MSG.POSITION, msg)
  }
  
  sendCreatureUpdate(creature) {
    this.send(MSG.CREATURE_UPDATE, {
      creature: {
        type: creature.type,
        class: creature.class,
        variant: creature.variantIndex || 0,
        seed: creature.seed,
      },
    })
  }
  
  sendPing() {
    this.send(MSG.PING, {
      clientTime: performance.now(),
    })
  }
  
  sendEatNPC(npcId) {
    if (!this.connected) return false
    return this.send(MSG.EAT_NPC, {
      npcId: npcId,
    })
  }
  
  // ============================================================================
  // UPDATE LOOP
  // ============================================================================
  
  update(delta) {
    if (!this.connected) return
    
    const renderTime = this.clock.getRenderTime()
    this.remotePlayers?.update(delta, renderTime)
    
    if (Math.floor(performance.now() / 5000) !== Math.floor((performance.now() - delta * 1000) / 5000)) {
      this.sendPing()
    }
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  hasPositionChanged(pos) {
    const threshold = NETWORK_CONFIG.positionThreshold
    return (
      Math.abs(pos.x - this.lastSentPosition.x) > threshold ||
      Math.abs(pos.y - this.lastSentPosition.y) > threshold ||
      Math.abs(pos.z - this.lastSentPosition.z) > threshold
    )
  }
  
  hasRotationChanged(rot) {
    const threshold = NETWORK_CONFIG.rotationThreshold
    return (
      Math.abs(rot.x - this.lastSentRotation.x) > threshold ||
      Math.abs(rot.y - this.lastSentRotation.y) > threshold ||
      Math.abs(rot.z - this.lastSentRotation.z) > threshold
    )
  }
  
  isConnected() {
    return this.connected
  }
  
  getPlayerId() {
    return this.playerId
  }
  
  getRoomId() {
    return this.roomId
  }
  
  getRemotePlayers() {
    return this.remotePlayers
  }
  
  getRemotePlayerCount() {
    return this.remotePlayers?.getCount() || 0
  }
  
  getLatency() {
    return this.clock.getLatency()
  }
  
  getNPCSeed() {
    return this.npcSeed
  }
  
  getDeadNpcIds() {
    return this.deadNpcIds
  }
  
  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  onConnected(callback) {
    this.onConnectedCallback = callback
  }
  
  onDisconnected(callback) {
    this.onDisconnectedCallback = callback
  }
  
  onPlayerJoin(callback) {
    this.onPlayerJoinCallback = callback
  }
  
  onPlayerLeave(callback) {
    this.onPlayerLeaveCallback = callback
  }
  
  onMapChange(callback) {
    this.onMapChangeCallback = callback
  }
  
  onNPCSeedReady(callback) {
    this.onNPCSeedReadyCallback = callback
  }
  
  onNPCDeath(callback) {
    this.onNPCDeathCallback = callback
  }
  
  onChatMessage(callback) {
    this.onChatMessageCallback = callback
  }
  
  onNPCSnapshot(callback) {
    this.onNPCSnapshotCallback = callback
  }
  
  onBecameHost(callback) {
    this.onBecameHostCallback = callback
  }
  
  onAbilityChange(callback) {
    this.onAbilityChangeCallback = callback
  }
  
  onPrismPlace(callback) {
    this.onPrismPlaceCallback = callback
  }
  
  onPrismRemove(callback) {
    this.onPrismRemoveCallback = callback
  }
  
  setDebug(enabled) {
    this.debug = enabled
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const networkManager = new NetworkManager()
export { NetworkManager }