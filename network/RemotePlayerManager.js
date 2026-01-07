/**
 * RemotePlayerManager.js - Manages remote players in the game
 * 
 * Handles spawning, interpolating, and cleaning up other players
 */

import * as THREE from 'three'
import { PositionBuffer } from './Interpolation.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  interpolationDelay: 100,
  positionLerpFactor: 0.2,
  rotationLerpFactor: 0.15,
  scaleLerpFactor: 0.1,
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
    this.rotation = new THREE.Euler()
    this.scale = 1
    
    this.targetPosition = new THREE.Vector3()
    this.targetRotation = new THREE.Euler()
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
      this.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z)
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
      this.mesh.rotation.copy(this.rotation)
      this.mesh.scale.setScalar(this.scale)
      this.scene.add(this.mesh)
    }
  }
  
  /**
   * Create creature mesh
   * 
   * TODO: Replace with actual Encyclopedia integration:
   * 
   * import { generateCreature } from '../src/Encyclopedia.js'
   * 
   * this.creature = generateCreature(
   *   creature.seed,
   *   creature.type,
   *   creature.class,
   *   creature.variant
   * )
   * this.mesh = this.creature.mesh
   */
  createCreatureMesh(creature) {
    try {
      // Placeholder fish-like shape (replace with Encyclopedia call)
      const bodyGeo = new THREE.CapsuleGeometry(0.3, 1, 8, 16)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.getCreatureColor(creature),
        roughness: 0.6,
        metalness: 0.2,
      })
      
      this.mesh = new THREE.Group()
      
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.rotation.z = Math.PI / 2
      this.mesh.add(body)
      
      // Tail fin
      const tailGeo = new THREE.ConeGeometry(0.2, 0.5, 8)
      const tail = new THREE.Mesh(tailGeo, bodyMat)
      tail.position.x = -0.7
      tail.rotation.z = -Math.PI / 2
      this.mesh.add(tail)
      
      this.creatureData = creature
      
    } catch (err) {
      console.warn(`[RemotePlayer] Failed to create creature mesh:`, err)
      this.createPlaceholderMesh()
    }
  }
  
  createPlaceholderMesh() {
    const geometry = new THREE.BoxGeometry(1, 0.6, 2)
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
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
      { x: data.rx || 0, y: data.ry || 0, z: data.rz || 0 },
      data.scale || 1,
      serverTime
    )
    
    this.targetPosition.set(data.x, data.y, data.z)
    if (data.rx !== undefined) {
      this.targetRotation.set(data.rx, data.ry || 0, data.rz || 0)
    }
    if (data.scale !== undefined) {
      this.targetScale = data.scale
    }
  }
  
  updateCreature(creature) {
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
      this.position.set(interpolated.pos.x, interpolated.pos.y, interpolated.pos.z)
      this.rotation.set(interpolated.rot.x, interpolated.rot.y, interpolated.rot.z)
      this.scale = interpolated.scale
    } else {
      this.position.lerp(this.targetPosition, CONFIG.positionLerpFactor)
      
      this.rotation.x += (this.targetRotation.x - this.rotation.x) * CONFIG.rotationLerpFactor
      this.rotation.y += (this.targetRotation.y - this.rotation.y) * CONFIG.rotationLerpFactor
      this.rotation.z += (this.targetRotation.z - this.rotation.z) * CONFIG.rotationLerpFactor
      
      this.scale += (this.targetScale - this.scale) * CONFIG.scaleLerpFactor
    }
    
    this.mesh.position.copy(this.position)
    this.mesh.rotation.copy(this.rotation)
    this.mesh.scale.setScalar(this.scale)
  }
  
  destroy() {
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
  
  destroy() {
    this.players.forEach(player => {
      player.destroy()
    })
    this.players.clear()
  }
}
