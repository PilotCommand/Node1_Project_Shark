import * as THREE from 'three'
import { clock } from './clock.js'
import { createMap } from './map.js'
import { initPlayer, getPlayer } from './player.js'
import { camera, initCameraControls, updateCamera } from './camera.js'
import { initControls, updateMovement } from './controls.js'
import { initHUD, updateHUD, notifyEvent } from './hud.js'
import { MeshRegistry } from './MeshRegistry.js'
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

// Initialize FishAdder (uses SpawnFactory grid)
FishAdder.init(scene)
FishAdder.spawnInitialFish()

// Build unified terrain collision mesh (after map is created)
const terrainMeshData = buildTerrainMesh(scene)
if (terrainMeshData) {
  debugTerrainMesh()
}

// Track if player has spawned
let playerSpawned = false

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
onSpawnRequested(() => {
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
  initPlayer(scene, spawnPoint, {
    creatureType: selection.creature.type,
    creatureClass: selection.creature.class,
    variantIndex: selection.creature.variantIndex,
  })
  initControls()
  initTrail(scene)
  initHUD()
  
  // Create player physics body if physics is ready
  if (isPhysicsReady()) {
    createPlayerBody()
    console.log('[Main] Player physics body created')
  }
  
  // Initialize feeding system (after player and FishAdder)
  Feeding.init(FishAdder)
  
  // Notify HUD when player eats something
  Feeding.onEat((meal) => {
    if (meal.type === 'npc') {
      notifyEvent(`Ate a ${meal.preyDisplayName}! +${meal.volumeGained.toFixed(2)} mÂ³`)
    }
  })
  
  playerSpawned = true
  console.log('[Main] Player spawned as:', selection.creature.displayName, 'with ability:', selection.ability.name)
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
    // Update physics simulation (syncs physics bodies with Three.js meshes)
    updatePhysics(delta)
    
    // Update water surface detection (checks if player entered/exited water)
    updateWaterSurfaceDetection(30)  // Water level at y=30
    
    // Update player movement (now applies forces instead of direct position)
    updateMovement(delta)
    
    // Update feeding system (player eating NPCs)
    Feeding.update(delta)
    
    updateCamera()
    updateHUD(delta)
  }
  
  // Always update NPCs (they swim even when menu is open)
  FishAdder.update(delta)
  
  renderer.render(scene, camera)
}

animate()

// Expose FishAdder globally for console access
window.FishAdder = FishAdder
window.Feeding = Feeding

// Controls documentation
console.log(`
ðŸŒŠðŸ ðŸ¦ˆ OCEAN CREATURE SIMULATOR

  MOVEMENT:
    WASD              - Swim
    Space             - Up
    Shift             - Down
    Q (hold)          - Extra (boost by default)

  OTHER:
    Mouse / Scroll    - Look / Zoom
    R                 - Mutate creature
    N / B             - Next / Previous species
    M                 - New map
    P                 - Toggle wireframes
    V                 - Toggle spawn visualization
    F                 - Debug

`)