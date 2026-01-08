/**
 * Room.js - Single game room containing players
 */

import { MSG, encodeMessage, isValidPosition, isValidCreature, isValidNPCSnapshot, NETWORK_CONFIG } from '../../shared/Protocol.js'

export class Room {
  constructor(id, options = {}) {
    this.id = id
    this.maxPlayers = options.maxPlayers || NETWORK_CONFIG.maxPlayersPerRoom
    this.onEmpty = options.onEmpty || null
    
    this.players = new Map()
    this.playerIdCounter = 0
    
    // World seed - all players share this for consistent map generation
    this.worldSeed = options.worldSeed || 12345  // Default matches map.js DEFAULT_SEED
    
    // NPC seed - all players share this for deterministic NPC spawning
    this.npcSeed = options.npcSeed || Math.floor(Math.random() * 0xFFFFFFFF)
    
    // Track dead NPCs for late joiners
    this.deadNpcIds = new Set()
    
    // NPC simulation host - first player to join becomes host
    this.hostId = null
    
    this.tickCount = 0
    this.tickRate = NETWORK_CONFIG.tickRate
    this.tickInterval = null
    
    this.startGameLoop()
    
    console.log(`[Room ${id}] Created (max ${this.maxPlayers} players, worldSeed: ${this.worldSeed}, npcSeed: 0x${(this.npcSeed >>> 0).toString(16).toUpperCase()})`)
  }
  
  addPlayer(ws, name = 'Player') {
    const playerId = ++this.playerIdCounter
    
    ws.id = playerId
    ws.room = this
    ws.name = name
    
    ws.position = { x: 0, y: 10, z: 0 }
    ws.rotation = { x: 0, y: 0, z: 0 }
    ws.scale = 1
    ws.creature = null
    ws.inGame = false
    ws.lastUpdate = Date.now()
    
    this.players.set(playerId, ws)
    
    // First player becomes the NPC simulation host
    const isHost = this.hostId === null
    if (isHost) {
      this.hostId = playerId
      console.log(`[Room ${this.id}] Player ${playerId} is now NPC HOST`)
    }
    
    const existingPlayers = this.getPlayersForWelcome(playerId)
    
    this.send(ws, MSG.WELCOME, {
      id: playerId,
      roomId: this.id,
      worldSeed: this.worldSeed,
      npcSeed: this.npcSeed,
      hostId: this.hostId,        // Tell client who the host is
      isHost: isHost,             // Tell client if THEY are the host
      players: existingPlayers,
      deadNpcIds: [...this.deadNpcIds],  // Array of NPC IDs that have been eaten
    })
    
    console.log(`[Room ${this.id}] Player ${playerId} (${name}) joined`)
  }
  
  removePlayer(ws) {
    const playerId = ws.id
    
    if (!this.players.has(playerId)) {
      return
    }
    
    this.players.delete(playerId)
    
    this.broadcast(MSG.PLAYER_LEAVE, { id: playerId }, playerId)
    
    console.log(`[Room ${this.id}] Player ${playerId} left (${this.getPlayerCount()} remaining)`)
    
    // Host migration - if host left, assign new host
    if (playerId === this.hostId) {
      this.migrateHost()
    }
    
    if (this.isEmpty() && this.onEmpty) {
      this.onEmpty()
    }
  }
  
  /**
   * Migrate NPC host to another player when current host disconnects
   */
  migrateHost() {
    // Pick first remaining player as new host
    const iterator = this.players.values()
    const newHost = iterator.next().value
    
    if (newHost) {
      this.hostId = newHost.id
      
      // Tell the new host they are now responsible for NPC simulation
      this.send(newHost, MSG.HOST_ASSIGNED, { isHost: true })
      
      // Tell everyone else who the new host is
      this.broadcast(MSG.HOST_CHANGED, { hostId: this.hostId }, this.hostId)
      
      console.log(`[Room ${this.id}] NPC HOST migrated to player ${this.hostId}`)
    } else {
      this.hostId = null
      console.log(`[Room ${this.id}] No players left, no NPC host`)
    }
  }
  
  getPlayersForWelcome(excludeId) {
    const players = []
    
    this.players.forEach((ws, id) => {
      if (id === excludeId) return
      if (!ws.inGame) return
      
      players.push({
        id: id,
        name: ws.name,
        position: ws.position,
        rotation: ws.rotation,
        scale: ws.scale,
        creature: ws.creature,
      })
    })
    
    return players
  }
  
  handleMessage(ws, data) {
    switch (data.type) {
      case MSG.POSITION:
        this.handlePosition(ws, data)
        break
        
      case MSG.JOIN_GAME:
        this.handleJoinGame(ws, data)
        break
        
      case MSG.CREATURE_UPDATE:
        this.handleCreatureUpdate(ws, data)
        break
        
      case MSG.PING:
        this.handlePing(ws, data)
        break
        
      case MSG.EAT_NPC:
        this.handleEatNPC(ws, data)
        break
        
      case MSG.EAT_PLAYER:
        this.handleEatPlayer(ws, data)
        break
        
      case MSG.REQUEST_MAP_CHANGE:
        this.handleMapChangeRequest(ws)
        break
        
      case MSG.NPC_SNAPSHOT:
        this.handleNPCSnapshot(ws, data)
        break
        
      case MSG.ABILITY_START:
      case MSG.ABILITY_STOP:
        this.handleAbilityChange(ws, data)
        break
        
      case MSG.PRISM_PLACE:
        this.handlePrismPlace(ws, data)
        break
        
      case MSG.PRISM_REMOVE:
        this.handlePrismRemove(ws, data)
        break
        
      case MSG.CHAT:
        this.handleChat(ws, data)
        break
        
      default:
        console.warn(`[Room ${this.id}] Unknown message type: ${data.type}`)
    }
  }
  
  handlePosition(ws, data) {
    if (!data.p || !isValidPosition(data.p)) {
      return
    }
    
    ws.position = {
      x: data.p.x,
      y: data.p.y,
      z: data.p.z,
    }
    
    if (data.r) {
      ws.rotation = {
        x: data.r.x || 0,
        y: data.r.y || 0,
        z: data.r.z || 0,
      }
    }
    
    if (typeof data.s === 'number' && data.s > 0 && data.s < 100) {
      ws.scale = data.s
    }
    
    ws.lastUpdate = Date.now()
  }
  
  handleJoinGame(ws, data) {
    if (!data.creature || !isValidCreature(data.creature)) {
      console.warn(`[Room ${this.id}] Invalid creature data from player ${ws.id}`)
      return
    }
    
    ws.creature = {
      type: data.creature.type,
      class: data.creature.class,
      variant: data.creature.variant || 0,
      seed: data.creature.seed,
    }
    
    if (data.name) {
      ws.name = data.name.substring(0, 20)
    }
    
    ws.inGame = true
    
    this.broadcast(MSG.PLAYER_JOIN, {
      id: ws.id,
      name: ws.name,
      position: ws.position,
      rotation: ws.rotation,
      scale: ws.scale,
      creature: ws.creature,
    }, ws.id)
    
    console.log(`[Room ${this.id}] Player ${ws.id} joined game as ${ws.creature.class}`)
  }
  
  handleCreatureUpdate(ws, data) {
    if (!data.creature || !isValidCreature(data.creature)) {
      return
    }
    
    ws.creature = {
      type: data.creature.type,
      class: data.creature.class,
      variant: data.creature.variant || 0,
      seed: data.creature.seed,
    }
    
    this.broadcast(MSG.CREATURE_UPDATE, {
      id: ws.id,
      creature: ws.creature,
    }, ws.id)
    
    console.log(`[Room ${this.id}] Player ${ws.id} changed to ${ws.creature.class}`)
  }
  
  handlePing(ws, data) {
    this.send(ws, MSG.PONG, {
      clientTime: data.clientTime,
      serverTime: Date.now(),
    })
  }
  
  handleEatNPC(ws, data) {
    if (!data.npcId) {
      console.warn(`[Room ${this.id}] Invalid EAT_NPC - missing npcId`)
      return
    }
    
    const npcId = data.npcId
    
    // Check if already eaten (prevent double-eat race condition)
    if (this.deadNpcIds.has(npcId)) {
      console.log(`[Room ${this.id}] NPC ${npcId} already dead, ignoring duplicate eat`)
      return
    }
    
    // Track as dead
    this.deadNpcIds.add(npcId)
    
    // Broadcast NPC_DEATH to ALL players (including the eater, for confirmation)
    this.broadcast(MSG.NPC_DEATH, {
      npcId: npcId,
      eatenBy: ws.id,
    })
    
    console.log(`[Room ${this.id}] Player ${ws.id} ate NPC ${npcId} (${this.deadNpcIds.size} total dead)`)
  }
  
  handleEatPlayer(ws, data) {
    // TODO: Phase 4
  }
  
  /**
   * Handle NPC snapshot from host - relay to all other players
   * Server does NO processing - just forwards the bytes
   */
  handleNPCSnapshot(ws, data) {
    // Only accept snapshots from the current host
    if (ws.id !== this.hostId) {
      // Silently ignore - could be stale snapshot from old host
      return
    }
    
    // Validate snapshot structure
    if (!isValidNPCSnapshot(data)) {
      console.warn(`[Room ${this.id}] Invalid NPC snapshot from host ${ws.id}`)
      return
    }
    
    // Relay to all OTHER players (not back to host)
    // Pass the data directly - no processing needed
    this.broadcast(MSG.NPC_SNAPSHOT, {
      tick: data.tick,
      fish: data.fish,
    }, ws.id)
  }
  
  /**
   * Handle ability state change - relay to all other players
   * @param {WebSocket} ws - The sending player
   * @param {Object} data - { type: ABILITY_START|ABILITY_STOP, ability: string, ...extraData }
   */
  handleAbilityChange(ws, data) {
    // Validate ability key
    const validAbilities = ['sprinter', 'stacker', 'camper', 'attacker']
    if (!data.ability || !validAbilities.includes(data.ability)) {
      console.warn(`[Room ${this.id}] Invalid ability key from player ${ws.id}: ${data.ability}`)
      return
    }
    
    // Build relay data - include all fields except 'type' (which is added by broadcast)
    const relayData = {
      id: ws.id,
      ability: data.ability,
    }
    
    // Forward extra data for camper ability (color, terrain, mimicSeed)
    if (data.color !== undefined) relayData.color = data.color
    if (data.terrain !== undefined) relayData.terrain = data.terrain
    if (data.mimicSeed !== undefined) relayData.mimicSeed = data.mimicSeed
    
    // Relay to all OTHER players (not back to sender)
    this.broadcast(data.type, relayData, ws.id)
  }
  
  /**
   * Handle prism placement - relay to all other players
   * @param {WebSocket} ws - The sending player
   * @param {Object} data - Prism data (prismId, position, quaternion, length, radius, color, etc.)
   */
  handlePrismPlace(ws, data) {
    // Validate required fields
    if (!data.prismId || !data.position || !data.quaternion) {
      console.warn(`[Room ${this.id}] Invalid prism data from player ${ws.id}`)
      return
    }
    
    // Relay to all OTHER players with player ID
    this.broadcast(MSG.PRISM_PLACE, {
      id: ws.id,
      prismId: data.prismId,
      position: data.position,
      quaternion: data.quaternion,
      length: data.length,
      radius: data.radius,
      color: data.color,
      roughness: data.roughness,
      metalness: data.metalness,
      emissive: data.emissive,
    }, ws.id)
  }
  
  /**
   * Handle prism removal - relay to all other players
   * @param {WebSocket} ws - The sending player
   * @param {Object} data - { prismId: string }
   */
  handlePrismRemove(ws, data) {
    if (!data.prismId) {
      console.warn(`[Room ${this.id}] Invalid prism removal from player ${ws.id}`)
      return
    }
    
    // Relay to all OTHER players
    this.broadcast(MSG.PRISM_REMOVE, {
      id: ws.id,
      prismId: data.prismId,
    }, ws.id)
  }
  
  /**
   * Handle chat message - relay to all other players
   * @param {WebSocket} ws - The sending player
   * @param {Object} data - { text: string, isEmoji: boolean, showProximity: boolean }
   */
  handleChat(ws, data) {
    // Validate message
    if (!data.text || typeof data.text !== 'string') {
      console.warn(`[Room ${this.id}] Invalid chat from player ${ws.id}`)
      return
    }
    
    // Limit message length
    const text = data.text.substring(0, 200)
    
    // Relay to all OTHER players with sender info
    this.broadcast(MSG.CHAT, {
      senderId: ws.id,
      sender: ws.name,
      text: text,
      isEmoji: data.isEmoji || false,
      showProximity: data.showProximity !== false,  // Default to true if not specified
    }, ws.id)
  }
  
  handleMapChangeRequest(ws) {
    // Generate ONE master seed - npcSeed is derived from it
    // This ensures all clients derive the same seeds
    const masterSeed = Math.floor(Math.random() * 0xFFFFFFFF)
    const derivedNpcSeed = (masterSeed + 1) >>> 0  // Derived deterministically
    
    this.worldSeed = masterSeed
    this.npcSeed = derivedNpcSeed
    
    // Clear dead NPCs - all NPCs will respawn fresh
    this.deadNpcIds.clear()
    
    // Broadcast to ALL players (including the requester)
    // Send masterSeed as 'seed' - client will derive npcSeed the same way
    this.broadcast(MSG.MAP_CHANGE, {
      seed: masterSeed,
      requestedBy: ws.id,
    })
    
    console.log(`[Room ${this.id}] Map changed - masterSeed: 0x${masterSeed.toString(16).toUpperCase()} (npcSeed derived as 0x${derivedNpcSeed.toString(16).toUpperCase()}) (requested by player ${ws.id})`)
  }
  
  startGameLoop() {
    this.tickInterval = setInterval(() => {
      this.tick()
    }, 1000 / this.tickRate)
  }
  
  stopGameLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }
  
  tick() {
    this.tickCount++
    
    const positions = []
    const serverTime = Date.now()
    
    this.players.forEach((ws, id) => {
      if (!ws.inGame) return
      
      positions.push({
        id: id,
        x: ws.position.x,
        y: ws.position.y,
        z: ws.position.z,
        rx: ws.rotation.x,
        ry: ws.rotation.y,
        rz: ws.rotation.z,
        s: ws.scale,
      })
    })
    
    if (positions.length > 0) {
      this.broadcast(MSG.BATCH_POSITIONS, {
        time: serverTime,  // Changed from 't' to 'time' to avoid collision with message type
        p: positions,
      })
    }
    
    // Log every 30 seconds instead of 5
    if (this.tickCount % (this.tickRate * 30) === 0) {
      const playerCount = this.getPlayerCount()
      if (playerCount > 0) {
        console.log(`[Room ${this.id}] ${playerCount} players active`)
      }
    }
  }
  
  send(ws, type, data) {
    try {
      const message = encodeMessage(type, data)
      ws.send(message, false)
    } catch (err) {
      console.error(`[Room ${this.id}] Failed to send to player ${ws.id}:`, err.message)
    }
  }
  
  broadcast(type, data, excludeId = null) {
    const message = encodeMessage(type, data)
    
    this.players.forEach((ws, id) => {
      if (id === excludeId) return
      
      try {
        ws.send(message, false)
      } catch (err) {
        console.error(`[Room ${this.id}] Failed to broadcast to player ${id}:`, err.message)
      }
    })
  }
  
  getPlayerCount() {
    return this.players.size
  }
  
  getInGameCount() {
    let count = 0
    this.players.forEach(ws => {
      if (ws.inGame) count++
    })
    return count
  }
  
  isEmpty() {
    return this.players.size === 0
  }
  
  canJoin() {
    return this.players.size < this.maxPlayers
  }
  
  getInfo() {
    return {
      id: this.id,
      players: this.getPlayerCount(),
      inGame: this.getInGameCount(),
      maxPlayers: this.maxPlayers,
      worldSeed: this.worldSeed,
      npcSeed: this.npcSeed,
      hostId: this.hostId,
    }
  }
  
  destroy() {
    this.stopGameLoop()
    
    this.players.forEach((ws, id) => {
      try {
        ws.close()
      } catch (err) {}
    })
    
    this.players.clear()
    
    console.log(`[Room ${this.id}] Destroyed`)
  }
}