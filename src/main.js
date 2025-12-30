import * as THREE from 'three'
import { clock } from './clock.js'
import { createMap } from './map.js'
import { player } from './player.js'
import { camera, initCameraControls, updateCamera } from './camera.js'
import { initControls, updateMovement } from './controls.js'
import { initHUD, updateHUD } from './hud.js'

// Scene setup
const scene = new THREE.Scene()

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

// Underwater fog - reduced so colors show through
scene.fog = new THREE.FogExp2(0x006994, 0.004)

// Add lighting - underwater caustic feel
const ambientLight = new THREE.AmbientLight(0x4488aa, 0.6)
scene.add(ambientLight)

// Sunlight from above (through water)
const sunLight = new THREE.DirectionalLight(0x00ffcc, 1.0)
sunLight.position.set(0, 100, 0)
scene.add(sunLight)

// Hemisphere: bright turquoise from above, dark blue from below
const hemisphereLight = new THREE.HemisphereLight(0x00ced1, 0x000033, 0.8)
scene.add(hemisphereLight)

// Warm light to illuminate the sand floor
const sandLight = new THREE.DirectionalLight(0xffeedd, 0.6)
sandLight.position.set(0, 50, 0)
scene.add(sandLight)

// Initialize game objects
const map = createMap()
scene.add(map)

scene.add(player)

// Initialize systems
initCameraControls(renderer.domElement)
initControls()
initHUD()

// Handle window resize
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