/**
 * RoomManager.js - Manages multiple game rooms
 */

import { Room } from './Room.js'
import { NETWORK_CONFIG } from '../../shared/Protocol.js'

export class RoomManager {
  constructor(options = {}) {
    this.maxPlayersPerRoom = options.maxPlayersPerRoom || NETWORK_CONFIG.maxPlayersPerRoom
    this.minRooms = options.minRooms || 1
    
    this.rooms = new Map()
    this.roomIdCounter = 0
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 30000)
    
    this.createRoom()
    
    console.log('[RoomManager] Initialized')
  }
  
  createRoom(customId = null) {
    const id = customId || `ocean_${++this.roomIdCounter}`
    
    const room = new Room(id, {
      maxPlayers: this.maxPlayersPerRoom,
      onEmpty: () => this.handleEmptyRoom(id),
    })
    
    this.rooms.set(id, room)
    
    console.log(`[RoomManager] Created room ${id} (total: ${this.rooms.size})`)
    
    return room
  }
  
  destroyRoom(roomId) {
    const room = this.rooms.get(roomId)
    
    if (!room) {
      return
    }
    
    room.destroy()
    this.rooms.delete(roomId)
    
    console.log(`[RoomManager] Destroyed room ${roomId} (remaining: ${this.rooms.size})`)
  }
  
  handleEmptyRoom(roomId) {
    if (this.rooms.size <= this.minRooms) {
      console.log(`[RoomManager] Room ${roomId} is empty but keeping (min rooms)`)
      return
    }
    
    setTimeout(() => {
      const room = this.rooms.get(roomId)
      if (room && room.isEmpty()) {
        this.destroyRoom(roomId)
      }
    }, 10000)
  }
  
  findRoom(preferredId = null) {
    if (preferredId) {
      const preferred = this.rooms.get(preferredId)
      if (preferred && preferred.canJoin()) {
        console.log(`[RoomManager] Assigned to preferred room ${preferredId}`)
        return preferred
      }
    }
    
    let bestRoom = null
    let bestScore = -1
    
    this.rooms.forEach((room, id) => {
      if (!room.canJoin()) return
      
      const players = room.getPlayerCount()
      const maxPlayers = room.maxPlayers
      const fillRatio = players / maxPlayers
      
      let score = players
      if (fillRatio > 0.8) {
        score *= 0.5
      }
      
      if (score > bestScore) {
        bestScore = score
        bestRoom = room
      }
    })
    
    if (!bestRoom) {
      console.log(`[RoomManager] No available rooms, creating new one`)
      bestRoom = this.createRoom()
    }
    
    return bestRoom
  }
  
  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }
  
  getStats() {
    let totalPlayers = 0
    let totalInGame = 0
    let roomStats = []
    
    this.rooms.forEach((room, id) => {
      const players = room.getPlayerCount()
      const inGame = room.getInGameCount()
      
      totalPlayers += players
      totalInGame += inGame
      
      roomStats.push({
        id: id,
        players: players,
        inGame: inGame,
        maxPlayers: room.maxPlayers,
        tickCount: room.tickCount,
      })
    })
    
    return {
      totalRooms: this.rooms.size,
      totalPlayers: totalPlayers,
      totalInGame: totalInGame,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      rooms: roomStats,
    }
  }
  
  getRoomList() {
    const list = []
    
    this.rooms.forEach((room, id) => {
      list.push(room.getInfo())
    })
    
    list.sort((a, b) => b.players - a.players)
    
    return list
  }
  
  getTotalPlayers() {
    let total = 0
    this.rooms.forEach(room => {
      total += room.getPlayerCount()
    })
    return total
  }
  
  cleanup() {
    if (this.rooms.size <= this.minRooms) {
      return
    }
    
    const toRemove = []
    
    this.rooms.forEach((room, id) => {
      if (room.isEmpty() && this.rooms.size - toRemove.length > this.minRooms) {
        toRemove.push(id)
      }
    })
    
    toRemove.forEach(id => {
      this.destroyRoom(id)
    })
    
    if (toRemove.length > 0) {
      console.log(`[RoomManager] Cleanup removed ${toRemove.length} empty rooms`)
    }
  }
  
  destroy() {
    clearInterval(this.cleanupInterval)
    
    this.rooms.forEach((room, id) => {
      room.destroy()
    })
    
    this.rooms.clear()
    
    console.log('[RoomManager] Destroyed')
  }
}
