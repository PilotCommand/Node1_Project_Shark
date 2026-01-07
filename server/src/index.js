/**
 * Ocean Multiplayer Server - Entry Point
 * 
 * Run: npm start (production) or npm run dev (auto-reload)
 */

import uWS from 'uWebSockets.js'
import { RoomManager } from './RoomManager.js'
import { MSG, decodeMessage, encodeMessage } from '../../shared/Protocol.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: parseInt(process.env.PORT) || 9001,
  maxPayloadLength: 16 * 1024,
  idleTimeout: 120,
  maxBackpressure: 1024 * 1024,
  compression: uWS.SHARED_COMPRESSOR,
}

// ============================================================================
// SERVER SETUP
// ============================================================================

const roomManager = new RoomManager()
const app = uWS.App()

// ============================================================================
// WEBSOCKET HANDLER
// ============================================================================

app.ws('/*', {
  compression: CONFIG.compression,
  maxPayloadLength: CONFIG.maxPayloadLength,
  idleTimeout: CONFIG.idleTimeout,
  maxBackpressure: CONFIG.maxBackpressure,
  
  upgrade: (res, req, context) => {
    const url = req.getUrl()
    const query = req.getQuery()
    const params = new URLSearchParams(query)
    
    const preferredRoom = params.get('room')
    const playerName = params.get('name') || 'Player'
    
    console.log(`[Server] Upgrade request: room=${preferredRoom}, name=${playerName}`)
    
    res.upgrade(
      { preferredRoom, playerName, url },
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'),
      context
    )
  },
  
  open: (ws) => {
    console.log(`[Server] New connection`)
    
    const room = roomManager.findRoom(ws.preferredRoom)
    room.addPlayer(ws, ws.playerName)
    
    console.log(`[Server] Player ${ws.id} joined room ${room.id} (${room.getPlayerCount()} players)`)
  },
  
  message: (ws, message, isBinary) => {
    const data = decodeMessage(message)
    
    if (data.type === -1) {
      console.warn(`[Server] Invalid message from player ${ws.id}`)
      return
    }
    
    if (ws.room) {
      ws.room.handleMessage(ws, data)
    }
  },
  
  drain: (ws) => {
    // Backpressure relief
  },
  
  close: (ws, code, message) => {
    console.log(`[Server] Connection closed: player ${ws.id}, code ${code}`)
    
    if (ws.room) {
      ws.room.removePlayer(ws)
    }
  },
})

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

app.get('/health', (res, req) => {
  res.writeHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
})

app.get('/stats', (res, req) => {
  res.writeHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(roomManager.getStats()))
})

app.get('/rooms', (res, req) => {
  res.writeHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(roomManager.getRoomList()))
})

app.options('/*', (res, req) => {
  res.writeHeader('Access-Control-Allow-Origin', '*')
  res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.writeHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end()
})

// ============================================================================
// START SERVER
// ============================================================================

app.listen(CONFIG.port, (listenSocket) => {
  if (listenSocket) {
    console.log('')
    console.log('🌊 ═══════════════════════════════════════════════════')
    console.log('🌊  OCEAN MULTIPLAYER SERVER')
    console.log('🌊 ═══════════════════════════════════════════════════')
    console.log(`🌊  Port:     ${CONFIG.port}`)
    console.log(`🌊  WebSocket: ws://localhost:${CONFIG.port}`)
    console.log(`🌊  Stats:    http://localhost:${CONFIG.port}/stats`)
    console.log('🌊 ═══════════════════════════════════════════════════')
    console.log('')
  } else {
    console.error(`[Server] Failed to listen on port ${CONFIG.port}`)
    process.exit(1)
  }
})

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...')
  roomManager.destroy()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[Server] Terminating...')
  roomManager.destroy()
  process.exit(0)
})
