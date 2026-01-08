/**
 * RemotePlayerManager.js - Manages remote players in the game
 * 
 * Handles spawning, interpolating, and cleaning up other players
 */

import * as THREE from 'three'
import { PositionBuffer } from './Interpolation.js'
import { generateCreature } from '../src/Encyclopedia.js'
import { computeCapsuleParams } from '../src/ScaleMesh.js'
import {
  isPhysicsReady,
  createRemotePlayerBody,
  removeRemotePlayerBody,
  updateRemotePlayerBody,
  toggleRemotePlayerWireframe as physicsToggleRemotePlayerWireframe,
} from '../src/Physics.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  interpolationDelay: 150,        // ms - buffer delay for smooth interpolation
  positionSmoothTime: 0.1,        // seconds - time to smooth position (lower = snappier)
  rotationSmoothTime: 0.08,       // seconds - time to smooth rotation
  scaleSmoothTime: 0.2,           // seconds - time to smooth scale
  showNameTags: true,
  nameTagHeight: 2.5,
}

// ============================================================================
// REMOTE PLAYER CLASS
// ============================================================================

class RemotePlayer {
  constructor(id, scene, data) {
    this.id = id
    this.scene = scene
    this.name = data.name || `Player ${id}`
    
    this.position = new THREE.Vector3()
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ')  // Use YXZ order like local player
    this.scale = 1
    
    this.targetPosition = new THREE.Vector3()
    this.targetRotation = new THREE.Euler(0, 0, 0, 'YXZ')  // Use YXZ order like local player
    this.targetScale = 1
    
    this.creatureData = data.creature || null
    this.mesh = null
    this.creature = null
    
    this.positionBuffer = new PositionBuffer(CONFIG.interpolationDelay)
    
    if (data.position) {
      this.position.set(data.position.x, data.position.y, data.position.z)
      this.targetPosition.copy(this.position)
    }
    
    if (data.rotation) {
      // Only use X (pitch) and Y (yaw), ignore Z (roll) - matches local player behavior
      this.rotation.x = data.rotation.x || 0
      this.rotation.y = data.rotation.y || 0
      this.rotation.z = 0  // Local player never sets Z rotation
      this.targetRotation.copy(this.rotation)
    }
    
    if (data.scale) {
      this.scale = data.scale
      this.targetScale = data.scale
    }
    
    this.createMesh(data.creature)
    
    if (CONFIG.showNameTags) {
      this.createNameTag()
    }
  }
  
  createMesh(creature) {
    if (creature) {
      this.createCreatureMesh(creature)
    } else {
      this.createPlaceholderMesh()
    }
    
    if (this.mesh) {
      this.mesh.position.copy(this.position)
      this.mesh.rotation.order = 'YXZ'  // Match local player rotation order
      this.mesh.rotation.copy(this.rotation)
      // Apply the actual scale from the player
      this.mesh.scale.setScalar(this.scale || 1)
      this.scene.add(this.mesh)
      
      // Create physics body for this remote player
      this.createPhysicsBody()
    }
  }
  
  /**
   * Create physics body and debug wireframe for this remote player
   */
  createPhysicsBody() {
    if (!isPhysicsReady() || !this.mesh) return
    
    // Compute capsule params from the mesh
    const capsuleParams = computeCapsuleParams(this.mesh, this.creature)
    
    // Scale the capsule params by the player's scale
    const scaledCapsuleParams = {
      radius: capsuleParams.radius * (this.scale || 1),
      halfHeight: capsuleParams.halfHeight * (this.scale || 1),
    }
    
    // Store for later updates
    this.capsuleParams = scaledCapsuleParams
    
    // Create the physics body with debug wireframe
    createRemotePlayerBody(this.id, this.mesh, scaledCapsuleParams)
    
    console.log(`[RemotePlayer] Created physics body for ${this.id}`)
  }
  
  /**
   * Create creature mesh using Encyclopedia's generateCreature
   * 
   * Uses the same creature generation system as the local player
   * to ensure visual consistency across all clients.
   */
  createCreatureMesh(creature) {
    try {
      if (!creature || !creature.type || !creature.class) {
        console.warn(`[RemotePlayer] Invalid creature data, using placeholder`)
        this.createPlaceholderMesh()
        return
      }
      
      // Use Encyclopedia's generateCreature - same as local player
      const seed = creature.seed || Math.floor(Math.random() * 0xFFFFFFFF)
      const variantIndex = creature.variant !== undefined ? creature.variant : 0
      
      const generatedCreature = generateCreature(
        seed,
        creature.type,
        creature.class,
        variantIndex
      )
      
      if (generatedCreature && generatedCreature.mesh) {
        this.creature = generatedCreature
        this.mesh = generatedCreature.mesh
        this.creatureData = creature
        console.log(`[RemotePlayer] Created ${creature.class} (type: ${creature.type}, variant: ${variantIndex})`)
      } else {
        console.warn(`[RemotePlayer] generateCreature returned null for ${creature.class}`)
        this.createPlaceholderMesh()
      }
      
    } catch (err) {
      console.warn(`[RemotePlayer] Failed to create creature mesh:`, err)
      this.createPlaceholderMesh()
    }
  }
  
  createPlaceholderMesh() {
    // Bigger placeholder box so it's visible (3x2x6 meters)
    const geometry = new THREE.BoxGeometry(3, 2, 6)
    const material = new THREE.MeshStandardMaterial({
      color: 0xff00ff,  // Bright magenta so it's obvious
      roughness: 0.7,
      emissive: 0xff00ff,
      emissiveIntensity: 0.2,
    })
    
    this.mesh = new THREE.Mesh(geometry, material)
  }
  
  getCreatureColor(creature) {
    if (!creature) return 0x888888
    
    const colorMap = {
      'fish': 0x4488ff,
      'mammal': 0x6666aa,
      'cephalopod': 0xff6666,
      'jelly': 0xffaaff,
      'crustacean': 0xff8844,
      'sea_cucumber': 0x88aa44,
    }
    
    const baseColor = colorMap[creature.type] || 0x888888
    const variation = (creature.seed || 0) % 0x333333
    
    return baseColor + variation
  }
  
  createNameTag() {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 64
    
    context.fillStyle = 'rgba(0, 0, 0, 0.5)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    
    context.font = 'bold 32px Arial'
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(this.name, canvas.width / 2, canvas.height / 2)
    
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false,
    })
    
    this.nameTag = new THREE.Sprite(material)
    this.nameTag.scale.set(4, 1, 1)
    this.nameTag.position.y = CONFIG.nameTagHeight
    
    this.mesh.add(this.nameTag)
  }
  
  updateFromServer(data, serverTime) {
    this.positionBuffer.push(
      { x: data.x, y: data.y, z: data.z },
      { x: data.rx || 0, y: data.ry || 0, z: 0 },  // Ignore Z rotation
      data.scale || 1,
      serverTime
    )
    
    this.targetPosition.set(data.x, data.y, data.z)
    if (data.rx !== undefined) {
      // Only update X (pitch) and Y (yaw), keep Z at 0
      this.targetRotation.x = data.rx || 0
      this.targetRotation.y = data.ry || 0
      this.targetRotation.z = 0
    }
    if (data.scale !== undefined) {
      this.targetScale = data.scale
    }
  }
  
  updateCreature(creature) {
    // Remove old physics body
    removeRemotePlayerBody(this.id)
    
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.disposeMesh()
    }
    
    this.createMesh(creature)
    this.creatureData = creature
  }
  
  updateScale(newScale) {
    this.targetScale = newScale
  }
  
  update(delta, renderTime) {
    if (!this.mesh) return
    
    const interpolated = this.positionBuffer.sample(renderTime)
    
    if (interpolated) {
      // We have interpolated data from the buffer - use it as target
      this.targetPosition.set(interpolated.pos.x, interpolated.pos.y, interpolated.pos.z)
      this.targetRotation.x = interpolated.rot.x
      this.targetRotation.y = interpolated.rot.y
      this.targetRotation.z = 0
      this.targetScale = interpolated.scale
    }
    
    // Frame-rate independent smoothing using exponential decay
    // lerpFactor = 1 - e^(-delta / smoothTime)
    const posFactor = 1 - Math.exp(-delta / CONFIG.positionSmoothTime)
    const rotFactor = 1 - Math.exp(-delta / CONFIG.rotationSmoothTime)
    const scaleFactor = 1 - Math.exp(-delta / CONFIG.scaleSmoothTime)
    
    // Smooth position
    this.position.x += (this.targetPosition.x - this.position.x) * posFactor
    this.position.y += (this.targetPosition.y - this.position.y) * posFactor
    this.position.z += (this.targetPosition.z - this.position.z) * posFactor
    
    // Smooth rotation with angle wrapping
    this.rotation.x += this.angleDiff(this.rotation.x, this.targetRotation.x) * rotFactor
    this.rotation.y += this.angleDiff(this.rotation.y, this.targetRotation.y) * rotFactor
    // Z stays at 0
    
    // Smooth scale
    this.scale += (this.targetScale - this.scale) * scaleFactor
    
    // Apply to mesh
    this.mesh.position.copy(this.position)
    this.mesh.rotation.copy(this.rotation)
    this.mesh.scale.setScalar(this.scale)
    
    // Sync physics body position
    if (isPhysicsReady()) {
      // Convert Euler to Quaternion for physics
      const quat = new THREE.Quaternion().setFromEuler(this.rotation)
      updateRemotePlayerBody(this.id, this.position, quat)
    }
  }
  
  /**
   * Calculate shortest angle difference (handles wraparound)
   */
  angleDiff(from, to) {
    let diff = to - from
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    return diff
  }
  
  destroy() {
    // Remove physics body first
    removeRemotePlayerBody(this.id)
    
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.disposeMesh()
    }
  }
  
  disposeMesh() {
    if (!this.mesh) return
    
    this.mesh.traverse(child => {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose()
            m.dispose()
          })
        } else {
          if (child.material.map) child.material.map.dispose()
          child.material.dispose()
        }
      }
    })
    
    this.mesh = null
  }
}

// ============================================================================
// REMOTE PLAYER MANAGER CLASS
// ============================================================================

export class RemotePlayerManager {
  constructor(scene) {
    this.scene = scene
    this.players = new Map()
  }
  
  addPlayer(id, data) {
    if (this.players.has(id)) {
      console.warn(`[RemotePlayerManager] Player ${id} already exists`)
      return
    }
    
    const player = new RemotePlayer(id, this.scene, data)
    this.players.set(id, player)
    
    console.log(`[RemotePlayerManager] Added player ${id} (${data.name || 'Unknown'})`)
  }
  
  removePlayer(id) {
    const player = this.players.get(id)
    if (player) {
      player.destroy()
      this.players.delete(id)
      console.log(`[RemotePlayerManager] Removed player ${id}`)
    }
  }
  
  updatePosition(id, data, serverTime) {
    const player = this.players.get(id)
    if (player) {
      player.updateFromServer(data, serverTime)
    }
    // Silently ignore updates for unknown players (can happen during join race condition)
  }
  
  updateCreature(id, creature) {
    const player = this.players.get(id)
    if (player) {
      player.updateCreature(creature)
    }
  }
  
  updateSize(id, scale) {
    const player = this.players.get(id)
    if (player) {
      player.updateScale(scale)
    }
  }
  
  getPlayer(id) {
    return this.players.get(id)
  }
  
  getAllPlayers() {
    return this.players
  }
  
  getCount() {
    return this.players.size
  }
  
  update(delta, renderTime) {
    this.players.forEach(player => {
      player.update(delta, renderTime)
    })
  }
  
  /**
   * Toggle debug wireframes for all remote players
   * @returns {boolean} New visibility state
   */
  toggleWireframes() {
    return physicsToggleRemotePlayerWireframe()
  }
  
  destroy() {
    this.players.forEach(player => {
      player.destroy()
    })
    this.players.clear()
  }
}