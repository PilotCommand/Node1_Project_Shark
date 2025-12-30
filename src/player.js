import * as THREE from 'three'

// Create player fish from simple meshes
const fishGroup = new THREE.Group()

// Material for the fish
const bodyMaterial = new THREE.MeshStandardMaterial({ 
  color: 0xff6600,
  metalness: 0.3,
  roughness: 0.7
})

const finMaterial = new THREE.MeshStandardMaterial({ 
  color: 0xff8833,
  metalness: 0.2,
  roughness: 0.8
})

// 1. Main body - rectangular prism
const bodyGeometry = new THREE.BoxGeometry(0.8, 0.5, 1.5)
const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
fishGroup.add(body)

// 2. Head - tapered box at front
const headGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.5)
const head = new THREE.Mesh(headGeometry, bodyMaterial)
head.position.set(0, 0, -0.9)
fishGroup.add(head)

// 3. Tail - flat triangle shape
const tailGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.5)
const tail = new THREE.Mesh(tailGeometry, finMaterial)
tail.position.set(0, 0, 1.0)
tail.rotation.x = Math.PI / 6
fishGroup.add(tail)

// 4. Dorsal fin (top)
const dorsalGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.6)
const dorsalFin = new THREE.Mesh(dorsalGeometry, finMaterial)
dorsalFin.position.set(0, 0.4, 0)
fishGroup.add(dorsalFin)

// 5. Left side fin
const leftFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
const leftFin = new THREE.Mesh(leftFinGeometry, finMaterial)
leftFin.position.set(-0.5, -0.1, -0.2)
leftFin.rotation.z = -Math.PI / 6
fishGroup.add(leftFin)

// 6. Right side fin
const rightFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
const rightFin = new THREE.Mesh(rightFinGeometry, finMaterial)
rightFin.position.set(0.5, -0.1, -0.2)
rightFin.rotation.z = Math.PI / 6
fishGroup.add(rightFin)

export const player = fishGroup

// Export fish parts for visibility control
export const fishParts = {
  body,
  head,
  tail,
  dorsalFin,
  leftFin,
  rightFin
}

// Set rotation order for proper 3D rotation
player.rotation.order = 'YXZ'

// Starting position
player.position.set(0, 0, 0)