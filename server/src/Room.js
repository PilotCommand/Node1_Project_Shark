/**
 * Room.js - Single game room containing players
 */

import { MSG, encodeMessage, isValidPosition, isValidCreature, NETWORK_CONFIG } from '../../shared/Protocol.js'

export class Room {
  constructor(id, options = {}) {
    this.id = id
    this.maxPlayers = options.maxPlayers || NETWORK_CONFIG.maxPlayersPerRoom
    this.onEmpty = options.onEmpty || null
    
    this.players = new Map()
    this.playerIdCounter = 0
    
    // World seed - all players share this for consistent map generation
    this.worldSeed = options.worldSeed || 12345  // Default matches map.js DEFAULT_SEED
    
    this.tickCount = 0
    this.tickRate = NETWORK_CONFIG.tickRate
    this.tickInterval = null
    
    this.startGameLoop()
    
    console.log(`[Room ${id}] Created (max ${this.maxPlayers} players, seed: ${this.worldSeed})`)
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
    
    const existingPlayers = this.getPlayersForWelcome(playerId)
    
    this.send(ws, MSG.WELCOME, {
      id: playerId,
      roomId: this.id,
      worldSeed: this.worldSeed,
      players: existingPlayers,
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
    
    if (this.isEmpty() && this.onEmpty) {
      this.onEmpty()
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
    // TODO: Phase 4
  }
  
  handleEatPlayer(ws, data) {
    // TODO: Phase 4
  }
  
  handleMapChangeRequest(ws) {
    // Generate new random seed
    const newSeed = Math.floor(Math.random() * 0xFFFFFFFF)
    this.worldSeed = newSeed
    
    // Broadcast to ALL players (including the requester)
    this.broadcast(MSG.MAP_CHANGE, {
      seed: newSeed,
      requestedBy: ws.id,
    })
    
    console.log(`[Room ${this.id}] Map changed to seed ${newSeed.toString(16).toUpperCase()} (requested by player ${ws.id})`)
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
