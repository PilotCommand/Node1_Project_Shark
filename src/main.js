import * as THREE from 'three'
import { clock } from './clock.js'
import { networkManager } from '../network/NetworkManager.js'
import { createMap } from './map.js'
import { initPlayer, getPlayer, getPlayerCapsuleParams, getNaturalCapsuleParams, getCreatureParts } from './player.js'
import { camera, initCameraControls, updateCamera } from './camera.js'
import { initControls, updateMovement, syncTerrainWithSeed } from './controls.js'
import { initHUD, updateHUD, notifyEvent } from './hud.js'
import { MeshRegistry } from './MeshRegistry.js'
import { PlayerRegistry } from './PlayerRegistry.js'
import { buildTerrainMesh, debugTerrainMesh } from './TerrainMesher.js'
import { 
  initPhysics, 
  buildTerrainCollider,
  createWorldBoundaryCollider,
  createWaterSurfaceSensor,
  updateWaterSurfaceDetection,
  onExitWater,
  onEnterWater,
  createPlayerBody,
  updatePhysics,
  debugPhysics,
  isPhysicsReady,
  setPhysicsScene,
} from './Physics.js'
import { SpawnFactory } from './SpawnFactory.js'
import { FishAdder } from './FishAdder.js'
import { Feeding } from './Feeding.js'
import { Determine } from './determine.js'
import { initTrail, setActiveAbility } from './ExtraControls.js'

// Import menu
import { initMenu, showMenu, onSpawnRequested, isMenuActive, getPlayerSelection } from './menu.js'

// Scene setup
const scene = new THREE.Scene()

// Export scene for other modules
export { scene }

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

// Underwater fog
scene.fog = new THREE.FogExp2(0x006994, 0.004)

// Lighting
const ambientLight = new THREE.AmbientLight(0x4488aa, 0.6)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight(0x00ffcc, 1.0)
sunLight.position.set(0, 100, 0)
scene.add(sunLight)

const hemisphereLight = new THREE.HemisphereLight(0x00ced1, 0x000033, 0.8)
scene.add(hemisphereLight)

const sandLight = new THREE.DirectionalLight(0xffeedd, 0.6)
sandLight.position.set(0, 50, 0)
scene.add(sandLight)

// Initialize game
const map = createMap(scene)
scene.add(map)

// Initialize SpawnFactory and analyze BEFORE player spawns
SpawnFactory.init(scene)
SpawnFactory.analyzePlayableSpace()

// Initialize PlayerRegistry with scene
PlayerRegistry.init(scene)

// Initialize FishAdder (uses SpawnFactory grid)
// NOTE: Don't spawn fish here - wait for network to provide npcSeed for deterministic spawning
FishAdder.init(scene)

// Build unified terrain collision mesh (after map is created)
const terrainMeshData = buildTerrainMesh(scene)
if (terrainMeshData) {
  debugTerrainMesh()
}

// Track if player has spawned
let playerSpawned = false
let playerBodyCreated = false

// Initialize physics (async)
initPhysics().then((success) => {
  if (success) {
    // Set scene reference for debug wireframes
    setPhysicsScene(scene)
    
    // Build terrain physics collider from the wireframe mesh data
    buildTerrainCollider()
    
    // Create world boundary collider (invisible dome to keep players inside)
    createWorldBoundaryCollider({ radius: 500 })
    
    // Create water surface sensor (detects player entering/exiting water)
    createWaterSurfaceSensor({ yLevel: 30, size: 1000 })
    
    // Register water surface callbacks
    onExitWater(({ y, waterLevel }) => {
      console.log(`[Main] Player exited water! (y: ${y.toFixed(1)}, water level: ${waterLevel})`)
      notifyEvent('Jumped out of water!')
    })
    
    onEnterWater(({ y, waterLevel }) => {
      console.log(`[Main] Player entered water (y: ${y.toFixed(1)}, water level: ${waterLevel})`)
    })
    
    debugPhysics()
    console.log('[Main] Physics initialized')
  } else {
    console.warn('[Main] Physics failed to initialize - running without physics')
    console.log('[Main] Install Rapier: npm install @dimforge/rapier3d')
  }
})

MeshRegistry.debug()

// Initialize camera controls early (needed for menu view)
initCameraControls(renderer.domElement)

// Initialize menu and show it
initMenu()
showMenu()

// Handle spawn request from menu
onSpawnRequested(async () => {
  if (playerSpawned) {
    console.warn('[Main] Player already spawned')
    return
  }
  
  // Get player's creature and ability selection from menu
  const selection = getPlayerSelection()
  console.log('[Main] Player selection:', selection)
  
  // Set the active ability based on selection
  if (selection.ability && selection.ability.key) {
    setActiveAbility(selection.ability.key)
  }
  
  // Get a valid spawn point for player
  const spawnPoint = SpawnFactory.getRandomPlayablePoint()
  if (spawnPoint) {
    console.log(`[Main] Player spawn point: (${spawnPoint.x.toFixed(1)}, ${spawnPoint.y.toFixed(1)}, ${spawnPoint.z.toFixed(1)})`)
  }
  
  // Initialize player with creature selection
  // Pass creature type, class, and variant from menu selection
  const playerMesh = initPlayer(scene, spawnPoint, {
    creatureType: selection.creature.type,
    creatureClass: selection.creature.class,
    variantIndex: selection.creature.variantIndex,
  })
  
  // Register local player with PlayerRegistry
  const playerId = crypto.randomUUID()
  PlayerRegistry.registerLocal(playerId, {
    displayName: selection.creature.displayName || 'Player',
    mesh: playerMesh,
    parts: getCreatureParts(),
    creature: {
      type: selection.creature.type,
      class: selection.creature.class,
      variant: selection.creature.variantIndex,
      displayName: selection.creature.displayName,
    },
    position: spawnPoint,
  })
  
  // Initialize volumes and capsule params (MUST be called after registerLocal)
  const naturalCapsule = getNaturalCapsuleParams()
  if (naturalCapsule) {
    PlayerRegistry.initVolumes(playerId, naturalCapsule)
  } else {
    console.warn('[Main] No natural capsule params - volume system not initialized')
  }
  
  // Listen for volume changes to rebuild physics body
  PlayerRegistry.on('volumeChange', ({ player, scaleFactor }) => {
    if (player.isLocal && isPhysicsReady()) {
      console.log(`[Main] Rebuilding physics body at scale ${scaleFactor.toFixed(3)}`)
      createPlayerBody()
    }
  })
  
  initControls()
  initTrail(scene)
  initHUD()
  
  // Create player physics body if physics is ready
  if (isPhysicsReady()) {
    createPlayerBody()
    playerBodyCreated = true
    console.log('[Main] Player physics body created')
  }
  
  // Initialize feeding system (after player and FishAdder)
  Feeding.init(FishAdder)
  
  // Register callback for when local player is eaten
  Feeding.onPlayerEaten((meal) => {
    console.log('[Main] Local player was eaten!', meal)
    // TODO: Handle death - return to menu, reset volume, etc.
    // For now, just reset volume
    PlayerRegistry.resetVolumes(PlayerRegistry.getLocalId())
  })
  
  playerSpawned = true
  console.log('[Main] Player spawned!')
  
  // ========================================================================
  // MULTIPLAYER: Connect to server
  // ========================================================================
  try {
    await networkManager.connect('ws://localhost:9001', scene)
    
    // Tell server about our creature
    const currentCreature = PlayerRegistry.getLocal()
    networkManager.joinGame({
      type: selection.creature.type,
      class: selection.creature.class,
      variantIndex: selection.creature.variantIndex,
      seed: currentCreature?.creature?.seed || Math.floor(Math.random() * 0xFFFFFFFF),
    }, selection.creature.displayName || 'Player')
    
    console.log('[Main] Connected to multiplayer server!')
    notifyEvent('Connected to server!')
    
    // Register NPC death handler (when another player eats an NPC)
    networkManager.onNPCDeath((npcId, eatenBy) => {
      // Only process if it wasn't us who ate it (we already removed it locally)
      if (eatenBy !== networkManager.getPlayerId()) {
        console.log(`[Main] Remote player ${eatenBy} ate NPC ${npcId}`)
        FishAdder.removeFish(npcId, false)  // false = don't respawn
      }
    })
    
    // NOTE: Map change handling (terrain + fish respawn) is done in controls.js
    // via performMapRegeneration() - no need for a handler here
    
    // Sync terrain with server's worldSeed before spawning NPCs
    // This ensures all clients have identical terrain and grid points
    const serverWorldSeed = networkManager.getWorldSeed()
    if (serverWorldSeed !== null) {
      console.log(`[Main] Syncing terrain with server worldSeed: 0x${serverWorldSeed.toString(16).toUpperCase()}`)
      syncTerrainWithSeed(serverWorldSeed)
    }
    
    // Spawn NPCs now that terrain is synced and Determine was initialized by NetworkManager
    console.log('[Main] Spawning NPCs with server npcSeed...')
    FishAdder.spawnInitialFish()
    
    // Start NPC snapshot broadcast if we're the host
    // (Must happen AFTER NPCs are spawned so there's something to snapshot)
    if (networkManager.isNPCHost()) {
      networkManager.startSnapshotBroadcast()
    }
    
    // Handle late joiner: remove NPCs that were already eaten
    const deadNpcIds = networkManager.getDeadNpcIds()
    if (deadNpcIds && deadNpcIds.length > 0) {
      console.log(`[Main] Late joiner: removing ${deadNpcIds.length} already-eaten NPCs`)
      for (const npcId of deadNpcIds) {
        FishAdder.removeFish(npcId, false)
      }
    }
    
  } catch (err) {
    console.warn('[Main] Multiplayer connection failed:', err.message)
    console.log('[Main] Playing in single-player mode')
    
    // Single-player: Initialize Determine with a local seed
    const localNpcSeed = Math.floor(Math.random() * 0xFFFFFFFF)
    Determine.init(localNpcSeed)
    console.log(`[Main] Single-player NPC seed: 0x${(localNpcSeed >>> 0).toString(16).toUpperCase()}`)
    
    // Spawn NPCs with local seed
    FishAdder.spawnInitialFish()
  }
})

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Game loop
function animate() {
  requestAnimationFrame(animate)
  
  const delta = clock.getDelta()
  
  // Only run game logic if player has spawned and menu is not active
  if (playerSpawned && !isMenuActive()) {
    // Ensure player physics body exists (handles race condition where player spawns before physics ready)
    if (!playerBodyCreated && isPhysicsReady() && getPlayer()) {
      createPlayerBody()
      playerBodyCreated = true
      console.log('[Main] Player physics body created (deferred)')
    }
    
    // Update physics simulation (syncs physics bodies with Three.js meshes)
    updatePhysics(delta)
    
    // Update water surface detection (checks if player entered/exited water)
    updateWaterSurfaceDetection(30)  // Water level at y=30
    
    // Update player movement (now applies forces instead of direct position)
    updateMovement(delta)
    
    // Update feeding system (player eating NPCs)
    Feeding.update(delta)
    
    // Sync local player position to PlayerRegistry
    const localPlayer = PlayerRegistry.getLocal()
    const player = getPlayer()
    if (localPlayer && player) {
      PlayerRegistry.updatePosition(localPlayer.id, player.position, player.rotation)
    }
    
    // ========================================================================
    // MULTIPLAYER: Send position & update remote players
    // ========================================================================
    if (networkManager.isConnected() && player) {
      // Get effective volume (includes R/T manual scale for visual sync)
      const localId = PlayerRegistry.getLocalId()
      const effectiveVolume = localId ? PlayerRegistry.getEffectiveVolume(localId) : 1
      
      networkManager.sendPosition(
        { x: player.position.x, y: player.position.y, z: player.position.z },
        { x: player.rotation.x, y: player.rotation.y, z: player.rotation.z },
        localPlayer?.physics?.scaleFactor || player.scale.x || 1,
        effectiveVolume  // Send effective volume (includes R/T debug scale)
      )
    }
    networkManager.update(delta)
    
    updateCamera()
    updateHUD(delta)
  }
  
  // Always update NPCs (they swim even when menu is open)
  FishAdder.update(delta)
  
  renderer.render(scene, camera)
}

animate()

// Expose globals for console access
window.FishAdder = FishAdder
window.Feeding = Feeding
window.PlayerRegistry = PlayerRegistry
window.networkManager = networkManager

// Debug helper to check remote players
window.debugRemotePlayers = () => {
  console.log('%c=== Remote Players Debug ===', 'color: #00ff88; font-weight: bold')
  console.log('Connected:', networkManager.isConnected())
  console.log('My Player ID:', networkManager.getPlayerId())
  console.log('Room:', networkManager.getRoomId())
  console.log('Latency:', networkManager.getLatency() + 'ms')
  
  const count = networkManager.getRemotePlayerCount()
  console.log('Remote Player Count:', count)
  
  if (count === 0) {
    console.log('  (No remote players in room)')
    return
  }
  
  const remotePlayers = networkManager.getRemotePlayers()
  if (remotePlayers) {
    console.log('')
    remotePlayers.getAllPlayers().forEach((player, id) => {
      const pos = player.position
      const mesh = player.mesh
      console.log(`%cPlayer ${id}: ${player.name}`, 'color: #88aaff; font-weight: bold')
      console.log(`  Position: (${pos?.x?.toFixed(1) || '?'}, ${pos?.y?.toFixed(1) || '?'}, ${pos?.z?.toFixed(1) || '?'})`)
      console.log(`  Scale: ${player.scale?.toFixed(3) || 'N/A'} | Volume: ${player.worldVolume?.toFixed(2) || 'N/A'} m³`)
      console.log(`  Mesh: ${mesh ? 'YES' : 'NO'} | In Scene: ${mesh?.parent ? 'YES' : 'NO'}`)
      console.log(`  Mesh Scale: ${mesh ? mesh.scale.x.toFixed(3) : 'N/A'}`)
      console.log(`  Ability: ${player.activeAbility || 'none'}`)
    })
  }
}

// Quick network toggle
window.debugNetwork = (enabled = true) => {
  networkManager.setDebug(enabled)
  console.log(`[Debug] Network logging ${enabled ? 'ENABLED' : 'DISABLED'}`)
}

// Controls documentation
console.log(`
=== OCEAN CREATURE SIMULATOR ===

  MOVEMENT:
    WASD              - Swim
    Space             - Up
    Shift             - Down
    Q (hold)          - Extra (boost by default)

  OTHER:
    Mouse / Scroll    - Look / Zoom
    R / T             - Scale down / up (debug)
    G                 - Mutate creature
    N / B             - Next / Previous species
    M                 - New map
    P                 - Toggle wireframes
    V                 - Toggle spawn visualization
    F                 - Debug

`)