# Ocean Creature Simulator - Multiplayer Documentation

**Created:** January 2025  
**Status:** Phase 1-3 Complete (Basic Multiplayer + Interpolation)  
**Architecture:** Client-Authoritative with Server Relay

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Folder Structure](#folder-structure)
4. [File Descriptions](#file-descriptions)
5. [How to Run](#how-to-run)
6. [How It Works](#how-it-works)
7. [Message Protocol](#message-protocol)
8. [Integration Points](#integration-points)
9. [What's Implemented](#whats-implemented)
10. [Future Phases](#future-phases)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The multiplayer system allows multiple players to see each other swimming around in the same ocean world. It uses WebSockets for real-time communication and a client-authoritative architecture where:

- **Clients** handle their own physics, movement, and game simulation
- **Server** relays position updates between players and manages rooms

This approach minimizes server costs and latency while allowing 100+ players per room.

### Key Features (Current)
- Real-time player position synchronization
- Smooth interpolation (no teleporting)
- Multiple game rooms
- Automatic room assignment
- Latency measurement (ping)
- Player join/leave notifications

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE OVERVIEW                                │
│                                                                              │
│   BROWSER (Client)                         SERVER (Node.js)                 │
│   ┌─────────────────────┐                 ┌─────────────────────┐          │
│   │                     │   WebSocket     │                     │          │
│   │  Your Ocean Game    │◄───────────────►│  uWebSockets.js     │          │
│   │  (Three.js)         │   (JSON msgs)   │  (Fast WS server)   │          │
│   │                     │                 │                     │          │
│   └─────────────────────┘                 └─────────────────────┘          │
│                                                                              │
│   CLIENT RESPONSIBILITIES:              SERVER RESPONSIBILITIES:            │
│   • Run physics (Rapier3D)              • Accept connections                │
│   • Handle player input                 • Assign player IDs                 │
│   • Render everything                   • Manage rooms                      │
│   • Send position updates               • Broadcast positions               │
│   • Interpolate remote players          • Track who's in game               │
│   • Detect eating locally               • Relay messages                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Client-Authoritative?

| Benefit | Description |
|---------|-------------|
| **Low Server Cost** | Server just relays messages, doesn't run physics |
| **Low Latency** | No round-trip needed for movement |
| **Scalability** | Can handle 100+ players on a $5/month VPS |
| **Flexibility** | Easy to change client logic without server updates |

The tradeoff is that cheating is possible, but for a casual .io game this is acceptable.

---

## Folder Structure

```
shark/                              # Your main project folder
├── node_modules/                   # NPM packages (existing)
├── public/                         # Static assets (existing)
├── src/                            # Your game source code (existing)
│   ├── main.js                     # MODIFIED - connects to server
│   ├── player.js                   # Your player code
│   ├── Encyclopedia.js             # Creature generation
│   └── ... other game files
│
├── network/                        # NEW - Client networking code
│   ├── index.js                    # Exports all network modules
│   ├── NetworkManager.js           # Main networking class
│   ├── RemotePlayerManager.js      # Manages other players' creatures
│   ├── Interpolation.js            # Smooth movement between updates
│   └── NetworkClock.js             # Timing and server sync
│
├── shared/                         # NEW - Shared between client & server
│   └── Protocol.js                 # Message types and encoding
│
└── server/                         # NEW - Game server
    ├── package.json                # Server dependencies
    └── src/
        ├── index.js                # Server entry point
        ├── Room.js                 # Game room logic
        └── RoomManager.js          # Multi-room management
```

---

## File Descriptions

### `/network/` (Client-Side Networking)

#### `NetworkManager.js`
The main networking class. Handles WebSocket connection, sending/receiving messages.

**Key Methods:**
```javascript
networkManager.connect(serverUrl, scene)  // Connect to server
networkManager.joinGame(creature, name)   // Tell server your creature
networkManager.sendPosition(pos, rot, scale) // Send your position
networkManager.update(delta)              // Update remote players (call every frame)
networkManager.isConnected()              // Check connection status
networkManager.getPlayerId()              // Get your player ID
networkManager.getRemotePlayerCount()     // How many other players
networkManager.getLatency()               // Current ping in ms
```

#### `RemotePlayerManager.js`
Manages the meshes/creatures for other players.

**Key Methods:**
```javascript
addPlayer(id, data)           // Spawn a new remote player
removePlayer(id)              // Remove a player who left
updatePosition(id, data, serverTime)  // Update their position
update(delta, renderTime)     // Interpolate all remote players
```

#### `Interpolation.js`
Handles smooth movement between network updates (20 updates/sec → 60fps rendering).

**Key Class: `PositionBuffer`**
```javascript
const buffer = new PositionBuffer(100)  // 100ms interpolation delay
buffer.push(position, rotation, scale, serverTime)  // Add new state
buffer.sample(renderTime)  // Get interpolated state
```

#### `NetworkClock.js`
Handles timing, server time synchronization, and latency measurement.

**Key Methods:**
```javascript
syncServerTime(serverTime)    // Sync with server clock
getRenderTime()               // Get time for interpolation (100ms behind)
getLatency()                  // Get estimated one-way latency
handlePong(clientTime, serverTime)  // Process ping response
```

### `/shared/` (Shared Code)

#### `Protocol.js`
Defines message types and encoding/decoding functions.

**Message Types:**
```javascript
MSG.WELCOME         // 1  - Server sends on connect
MSG.PLAYER_JOIN     // 2  - Another player joined
MSG.PLAYER_LEAVE    // 3  - Another player left
MSG.PING            // 4  - Client ping request
MSG.PONG            // 5  - Server ping response
MSG.POSITION        // 10 - Player position update
MSG.BATCH_POSITIONS // 11 - All players' positions
MSG.JOIN_GAME       // 20 - Client joins with creature info
MSG.CREATURE_UPDATE // 21 - Player changed creature
```

**Encoding:**
```javascript
encodeMessage(MSG.POSITION, { p: {x, y, z}, r: {x, y, z}, s: scale })
decodeMessage(rawData)  // Returns { type, ...data }
```

### `/server/` (Game Server)

#### `index.js`
Entry point. Sets up uWebSockets.js server and HTTP endpoints.

**Endpoints:**
- `ws://localhost:9001` - WebSocket game connection
- `http://localhost:9001/health` - Health check
- `http://localhost:9001/stats` - Server statistics (JSON)
- `http://localhost:9001/rooms` - List of rooms

#### `Room.js`
Handles a single game room with players.

**Responsibilities:**
- Track players in the room
- Handle incoming messages
- Broadcast position updates at 20 Hz
- Manage player join/leave

#### `RoomManager.js`
Manages multiple rooms.

**Responsibilities:**
- Create/destroy rooms
- Assign players to rooms
- Clean up empty rooms
- Provide statistics

---

## How to Run

### Step 1: Start the Server

Open a terminal in the `shark` folder:

```bash
cd server
npm install      # Only needed first time
npm run dev      # Start server with auto-reload
```

You should see:
```
🌊 ═══════════════════════════════════════════════════
🌊  OCEAN MULTIPLAYER SERVER
🌊 ═══════════════════════════════════════════════════
🌊  Port:     9001
🌊  WebSocket: ws://localhost:9001
🌊  Stats:    http://localhost:9001/stats
🌊 ═══════════════════════════════════════════════════
```

### Step 2: Start the Game Client

Open a **second** terminal in the `shark` folder:

```bash
npm run dev      # Start Vite dev server
```

### Step 3: Play

1. Open http://localhost:5173/ in your browser
2. Spawn a creature
3. Check http://localhost:9001/stats to see player count
4. Open more browser tabs to test multiplayer!

### Production Deployment

For production, you would:
1. Build the client: `npm run build`
2. Host the static files on a CDN
3. Run the server on a VPS: `cd server && npm start`
4. Update the server URL in `main.js` from `localhost:9001` to your server's address

---

## How It Works

### Connection Flow

```
1. Player clicks "Play" in menu
   │
2. main.js calls networkManager.connect('ws://localhost:9001', scene)
   │
3. WebSocket connection established
   │
4. Server sends WELCOME message with player ID
   │
5. Client calls networkManager.joinGame(creature, name)
   │
6. Server broadcasts PLAYER_JOIN to other players
   │
7. Game loop starts sending POSITION updates at 20 Hz
   │
8. Server broadcasts BATCH_POSITIONS to all players at 20 Hz
   │
9. Client interpolates remote player positions for smooth 60fps rendering
```

### Position Update Flow

```
CLIENT A                     SERVER                      CLIENT B
   │                           │                            │
   │  POSITION {x,y,z,rx,ry}   │                            │
   │ ─────────────────────────>│                            │
   │                           │                            │
   │                           │  (collects all positions)  │
   │                           │                            │
   │                           │  BATCH_POSITIONS           │
   │ <─────────────────────────│─────────────────────────> │
   │                           │                            │
   │  (interpolate & render)   │    (interpolate & render)  │
```

### Interpolation

The server sends updates 20 times per second (every 50ms), but the game renders at 60fps (every 16ms). Without interpolation, remote players would "teleport" between positions.

**Solution:** Render 100ms behind real-time, interpolating between known positions.

```
Time:     0ms    50ms   100ms   150ms   200ms
Server:   P1 ─────P2─────P3─────P4─────P5────>
Render:              ^
                     │
                     └── Interpolate between P1 and P2
                         (smooth 60fps movement)
```

---

## Message Protocol

### Client → Server

| Message | Data | Description |
|---------|------|-------------|
| `POSITION` | `{p:{x,y,z}, r:{x,y,z}, s:scale}` | My current position |
| `JOIN_GAME` | `{name, creature:{type,class,variant,seed}}` | Join with creature |
| `CREATURE_UPDATE` | `{creature:{...}}` | I changed creature |
| `PING` | `{clientTime}` | Latency measurement |

### Server → Client

| Message | Data | Description |
|---------|------|-------------|
| `WELCOME` | `{id, roomId, players:[...]}` | Connection accepted |
| `PLAYER_JOIN` | `{id, name, position, creature}` | New player joined |
| `PLAYER_LEAVE` | `{id}` | Player disconnected |
| `BATCH_POSITIONS` | `{t:serverTime, p:[{id,x,y,z,rx,ry,rz,s},...]}` | All positions |
| `PONG` | `{clientTime, serverTime}` | Ping response |

### Example Messages

```javascript
// Client sends position
{"t":10,"p":{"x":100.5,"y":15.2,"z":-50.3},"r":{"x":0,"y":1.57,"z":0},"s":1.5}

// Server broadcasts positions
{"t":11,"t":1704672000000,"p":[
  {"id":1,"x":100.5,"y":15.2,"z":-50.3,"rx":0,"ry":1.57,"rz":0,"s":1.5},
  {"id":2,"x":-30.2,"y":8.1,"z":120.0,"rx":0,"ry":-0.5,"rz":0,"s":1.0}
]}
```

---

## Integration Points

### Changes Made to `main.js`

1. **Import** (line 3):
```javascript
import { networkManager } from '../network/NetworkManager.js'
```

2. **Connect after spawn** (inside `onSpawnRequested`, after `playerSpawned = true`):
```javascript
try {
  await networkManager.connect('ws://localhost:9001', scene)
  networkManager.joinGame({
    type: selection.creature.type,
    class: selection.creature.class,
    variantIndex: selection.creature.variantIndex,
    seed: currentCreature?.creature?.seed || Math.floor(Math.random() * 0xFFFFFFFF),
  }, selection.creature.displayName || 'Player')
  console.log('[Main] Connected to multiplayer server!')
  notifyEvent('Connected to server!')
} catch (err) {
  console.warn('[Main] Multiplayer connection failed:', err.message)
}
```

3. **Send position in game loop** (inside `animate()`, after registry sync):
```javascript
if (networkManager.isConnected() && player) {
  networkManager.sendPosition(
    { x: player.position.x, y: player.position.y, z: player.position.z },
    { x: player.rotation.x, y: player.rotation.y, z: player.rotation.z },
    localPlayer?.volume || 1
  )
}
networkManager.update(delta)
```

### Future Integration: Real Creature Rendering

Currently, remote players appear as placeholder fish shapes. To render actual creatures:

In `RemotePlayerManager.js`, modify `createCreatureMesh()`:

```javascript
// Import your Encyclopedia
import { generateCreature } from '../src/Encyclopedia.js'

createCreatureMesh(creature) {
  // Generate the actual creature mesh
  this.creature = generateCreature(
    creature.seed,
    creature.type,
    creature.class,
    creature.variant
  )
  this.mesh = this.creature.mesh
}
```

### Future Integration: NPC Sync (Phase 4)

Currently NPCs are local-only. For multiplayer sync:

1. Server will send `NPC_SPAWN` messages with ID and seed
2. Clients generate NPC deterministically from seed
3. When eating, client sends `EAT_NPC` to server
4. Server validates and broadcasts `NPC_DEATH` to all

---

## What's Implemented

### Phase 1: Basic Multiplayer ✅
- [x] WebSocket server (uWebSockets.js)
- [x] Player connections
- [x] Player ID assignment
- [x] Position broadcasting
- [x] Player join/leave events

### Phase 2: Creature Sync ✅
- [x] Send creature type/class/variant/seed
- [x] Spawn placeholder mesh for remote players
- [x] Sync rotation and scale
- [ ] Render actual creatures from Encyclopedia (TODO)

### Phase 3: Smooth Interpolation ✅
- [x] Position buffer for interpolation
- [x] Server time synchronization
- [x] Render 100ms behind for smoothness
- [x] Latency measurement (ping/pong)

### Phase 7: Rooms ✅ (Partial)
- [x] Multiple rooms support
- [x] Automatic room assignment
- [x] Room capacity limits
- [ ] Shareable room links (TODO)
- [ ] Room browser UI (TODO)

---

## Future Phases

### Phase 4: Gameplay Sync
- Server-authoritative NPC spawning
- Eating NPCs synced across clients
- Player vs player eating
- Death and respawn flow
- Leaderboard

### Phase 5: Binary Protocol
- Replace JSON with binary encoding
- 70% bandwidth reduction
- Faster parsing

### Phase 6: Bandwidth Optimization
- Delta compression (only send changes)
- Spatial filtering (only nearby players)
- Tiered update rates by distance

### Phase 8: Regional Servers
- Matchmaker service
- Multiple server regions
- Auto-connect to nearest

### Phase 9: Accounts
- Google/Discord OAuth
- Persistent stats
- Global leaderboards

### Phase 10: Monetization
- Ads (death screen, rewarded video)
- Cosmetic shop
- Premium subscription

---

## Troubleshooting

### "Cannot find module 'uWebSockets.js'"
```bash
cd server
npm install
```

### "Connection refused" or "WebSocket error"
- Make sure server is running: `cd server && npm run dev`
- Check the port matches (default 9001)
- Check for firewall blocking the port

### "Players not visible"
- Both players need to spawn (click Play in menu)
- Check browser console for connection errors
- Verify `networkManager.update(delta)` is being called in game loop

### "Movement is jittery"
- Increase interpolation delay in `NetworkClock.js`: `this.interpolationDelay = 150`
- Check network conditions (high latency/packet loss)

### "Stats page shows 0 players but I'm connected"
- You might be connected but not "in game"
- Make sure `networkManager.joinGame()` was called
- Check for errors in browser console

### Server crashes on Windows
- uWebSockets.js should work on Windows, but if issues occur:
- Try running as Administrator
- Check Node.js version (v18+ recommended)

---

## Quick Reference

### Server Commands
```bash
cd server
npm install          # Install dependencies (first time)
npm run dev          # Start with auto-reload (development)
npm start            # Start without auto-reload (production)
```

### Server URLs
```
ws://localhost:9001        # WebSocket connection
http://localhost:9001/stats   # Server statistics
http://localhost:9001/rooms   # Room list
http://localhost:9001/health  # Health check
```

### Key Imports
```javascript
// In your game code (src/main.js)
import { networkManager } from '../network/NetworkManager.js'

// In network code (network/*.js)
import { MSG, encodeMessage, decodeMessage } from '../shared/Protocol.js'
```

### Network Manager API
```javascript
// Connection
await networkManager.connect(url, scene)
networkManager.disconnect()
networkManager.isConnected()

// Game
networkManager.joinGame(creature, displayName)
networkManager.sendPosition(position, rotation, scale)
networkManager.sendCreatureUpdate(creature)
networkManager.update(delta)  // Call every frame!

// Info
networkManager.getPlayerId()
networkManager.getRoomId()
networkManager.getRemotePlayerCount()
networkManager.getLatency()

// Callbacks
networkManager.onConnected((playerId, roomId) => {})
networkManager.onDisconnected(() => {})
networkManager.onPlayerJoin((data) => {})
networkManager.onPlayerLeave((playerId) => {})
```

---

## Contact / Notes

This multiplayer system was designed for:
- **Target:** 100+ concurrent players per room
- **Cost:** $5-10/month VPS at scale
- **Latency:** ~50-100ms typical (+ 100ms interpolation delay)
- **Bandwidth:** ~5-10 KB/sec per player (after Phase 5-6 optimizations)

The client-authoritative design prioritizes player experience and low costs over anti-cheat. For a casual .io game, this tradeoff is acceptable.
