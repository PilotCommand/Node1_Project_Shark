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
const map = createMap(scene)
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
ðŸŒŠ OCEAN CREATURE SIMULATOR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  CONTROLS:
    WASD / Space / Shift  - Swim
    Mouse                 - Look
    Scroll                - Zoom in/out
    M                     - Mutate (new creature, same species)
    N                     - Next species
    B                     - Back (previous species)
    P                     - Print creature info

  ENCYCLOPEDIA (47 creatures, 1 unit = 1 meter):
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  
  ðŸŸ FISH (23 species):
  
    Cartilaginous:
      ðŸ¦ˆ Shark, ðŸ”¨ Hammerhead, ðŸ¦… Ray, ðŸ¦… Manta
    
    Elongated:
      ðŸ Eel, ðŸ Moray, ðŸŸ Barracuda
    
    Pelagic:
      ðŸŸ Tuna, ðŸ—¡ï¸ Marlin, âœˆï¸ Flying Fish
    
    Reef:
      ðŸŸ Grouper, ðŸ  Tang, ðŸ  Angelfish, ðŸ¦ Lionfish,
      ðŸ‘‘ Betta, ðŸ¡ Puffer, ðŸ˜ˆ Piranha, ðŸ´ Seahorse
    
    Deep Sea:
      ðŸ”¦ Anglerfish
    
    Unusual:
      ðŸŒž Sunfish
    
    Benthic:
      ðŸ«“ Flounder, ðŸ± Catfish

  ðŸ¬ MARINE MAMMALS (13 species):
  
    Large Whales:
      ðŸ‹ Blue Whale, ðŸ‹ Humpback, ðŸ‹ Sperm Whale
    
    Small Whales:
      ðŸ³ Beluga, ðŸ¦„ Narwhal, ðŸ‹ Pilot Whale
    
    Dolphins:
      ðŸ¬ Dolphin, ðŸ¬ Orca
    
    Pinnipeds:
      ðŸ¦­ Seal, ðŸ¦­ Sea Lion, ðŸ¦­ Walrus
    
    Other:
      ðŸ¦¦ Sea Otter, ðŸ˜ Manatee

  ðŸ¦€ CRUSTACEANS (11 species):
  
    Crabs:
      ðŸ¦€ Crab, ðŸ¦€ King Crab, ðŸ¦€ Spider Crab,
      ðŸ¥¥ Coconut Crab, ðŸ¦€ Fiddler Crab
    
    Lobsters:
      ðŸ¦ž Lobster, ðŸ¦ž Crayfish
    
    Shrimp:
      ðŸ¦ Shrimp, ðŸ¦ Mantis Shrimp, ðŸ¦ Pistol Shrimp
    
    Other:
      ðŸ§² Horseshoe Crab

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`)