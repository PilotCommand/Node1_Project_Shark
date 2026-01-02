import * as THREE from 'three'
import { clock } from './clock.js'
import { createMap } from './map.js'
import { initPlayer, getPlayer } from './player.js'
import { camera, initCameraControls, updateCamera } from './camera.js'
import { initControls, updateMovement } from './controls.js'
import { initHUD, updateHUD } from './hud.js'
import { MeshRegistry } from './MeshRegistry.js'

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
const map = createMap()
scene.add(map)

initPlayer(scene)
initCameraControls(renderer.domElement)
initControls()
initHUD()

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
  
  updateMovement(delta)
  updateCamera()
  updateHUD()
  
  renderer.render(scene, camera)
}

animate()

// Controls documentation
console.log(`
🐟 FISH SIMULATOR
═══════════════════════════════════════════════════════════════

  CONTROLS:
    WASD / Space / Shift  - Swim
    Mouse                 - Look
    Scroll                - Zoom in/out
    M                     - Mutate (new fish, same family)
    N                     - Next family
    P                     - Print fish info

  FISH FAMILIES (1 unit = 1 meter):
  ───────────────────────────────────────────────────────────────
  
  CARTILAGINOUS FISH (Chondrichthyes):
    🦈 Shark      │ Selachimorpha      │ 1.5-5.0m   │ Torpedo, large dorsal
    🦅 Ray        │ Batoidea           │ 1.5-6.0m   │ Flat disc, wing fins
  
  BONY FISH (Osteichthyes):
    🐍 Eel        │ Anguilliformes     │ 0.8-3.0m   │ Serpentine, segmented
    🐟 Grouper    │ Serranidae         │ 0.4-2.5m   │ Bulky, large mouth
    🐟 Tuna       │ Scombridae         │ 0.5-3.0m   │ Torpedo, lunate tail
    🐟 Barracuda  │ Sphyraenidae       │ 0.6-2.0m   │ Cylindrical, pike-like
    🐠 Tang       │ Acanthuridae       │ 0.15-0.5m  │ Disc, laterally flat
    🐠 Angelfish  │ Pomacanthidae      │ 0.15-0.45m │ Disc, flowing fins
    🐡 Puffer     │ Tetraodontidae     │ 0.1-0.6m   │ Boxy, inflatable
    🗡️ Marlin     │ Istiophoridae      │ 1.5-4.0m   │ Bill, sail dorsal
    🫓 Flounder   │ Pleuronectiformes  │ 0.25-2.0m  │ Flat, bottom-dweller

═══════════════════════════════════════════════════════════════
`)