import * as THREE from 'three'
import { clock } from './clock.js'
import { createMap } from './map.js'
import { initPlayer, getPlayer } from './player.js'
import { camera, initCameraControls, updateCamera } from './camera.js'
import { initControls, updateMovement } from './controls.js'
import { initHUD, updateHUD } from './hud.js'
import { MeshRegistry } from './MeshRegistry.js'
import { buildTerrainMesh, debugTerrainMesh } from './TerrainMesher.js'
import { 
  initPhysics, 
  buildTerrainCollider, 
  createPlayerBody,
  updatePhysics,
  debugPhysics,
  isPhysicsReady,
} from './Physics.js'

// Scene setup
const scene = new THREE.Scene()

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

initPlayer(scene)
initCameraControls(renderer.domElement)
initControls()
initHUD()

// Build unified terrain collision mesh (after map is created)
const terrainMeshData = buildTerrainMesh(scene)
if (terrainMeshData) {
  debugTerrainMesh()
}

// Initialize physics (async)
initPhysics().then((success) => {
  if (success) {
    // Build terrain physics collider from the wireframe mesh data
    buildTerrainCollider()
    
    // Create player physics body from capsule wireframe data
    createPlayerBody()
    
    debugPhysics()
    console.log('[Main] Physics initialized and bodies created')
  } else {
    console.warn('[Main] Physics failed to initialize - running without physics')
    console.log('[Main] Install Rapier: npm install @dimforge/rapier3d')
  }
})

MeshRegistry.debug()

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
  
  // Update physics simulation (syncs physics bodies with Three.js meshes)
  updatePhysics(delta)
  
  // Update player movement (now applies forces instead of direct position)
  updateMovement(delta)
  
  updateCamera()
  updateHUD()
  
  renderer.render(scene, camera)
}

animate()

// Controls documentation
console.log(`
🌊 OCEAN CREATURE SIMULATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
    F                 - Debug

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)