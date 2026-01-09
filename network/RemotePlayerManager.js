/**
 * RemotePlayerManager.js - Manages remote players in the game
 * 
 * Handles spawning, interpolating, and cleaning up other players
 */

import * as THREE from 'three'
import { PositionBuffer } from './Interpolation.js'
import { generateCreature } from '../src/Encyclopedia.js'
import { computeCapsuleParams } from '../src/ScaleMesh.js'
import { computeCapsuleVolume } from '../src/NormalScale.js'
import { computeGroupVolume } from '../src/MeshVolume.js'
import { MeshRegistry, Category } from '../src/MeshRegistry.js'
import { PlayerRegistry, VOLUME_CONFIG } from '../src/PlayerRegistry.js'
import {
  isPhysicsReady,
  createRemotePlayerBody,
  removeRemotePlayerBody,
  updateRemotePlayerBody,
  toggleRemotePlayerWireframe as physicsToggleRemotePlayerWireframe,
} from '../src/Physics.js'
import { 
  createRemoteTrail, 
  updateRemoteTrail, 
  stopRemoteTrail, 
  destroyRemoteTrail,
  updateAllRemoteTrails,
} from '../src/sprinter.js'
import { removeAllRemotePrismsForPlayer } from '../src/stacker.js'

// Lazy-loaded camper module to avoid circular dependency
let camperModule = null
async function getCamperModule() {
  if (!camperModule) {
    camperModule = await import('../src/camper.js')
  }
  return camperModule
}

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
    this.worldVolume = 1  // Authoritative world volume from network
    
    this.targetPosition = new THREE.Vector3()
    this.targetRotation = new THREE.Euler(0, 0, 0, 'YXZ')  // Use YXZ order like local player
    this.targetScale = 1
    
    // Encyclopedia volumes (immutable - computed at scale=1)
    this.encyclopediaVisualVolume = 1    // Sum of visual mesh boxes at scale=1
    this.encyclopediaCapsuleVolume = 1   // Capsule volume at scale=1
    
    // Physics rebuild tracking
    this._lastPhysicsScale = 0           // Scale at which physics body was last built
    this._physicsInitialized = false     // Has physics been properly initialized?
    
    this.creatureData = data.creature || null
    this.mesh = null
    this.creature = null
    
    // Ability state tracking
    this.activeAbility = null  // Currently active ability key
    this.isSprinting = false   // Is the sprinter ability active?
    this.camouflageCleanup = null  // Cleanup data for camper ability
    this._pendingCamperState = null  // Queued camper state change
    this._processingCamper = false   // Is camper state change being processed?
    this._camouflageFading = false   // Is camouflage currently fading (in or out)?
    
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
    
    // Store initial values - scale will be computed from volume after mesh creation
    if (data.volume) {
      this.worldVolume = data.volume
    }
    // Keep received scale as fallback only
    if (data.scale) {
      this._receivedScale = data.scale
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
      
      // CRITICAL: Mesh is created at scale=1, compute ALL encyclopedia volumes NOW
      // before any scaling is applied
      this.computeAllEncyclopediaVolumes()
      
      // Compute the correct scale from world volume using CAPSULE volume
      // (same formula as local player in NormalScale.js)
      this.scale = this.computeScaleFromWorldVolume(this.worldVolume)
      this.targetScale = this.scale
      
      // Apply the computed scale
      this.mesh.scale.setScalar(this.scale)
      this.scene.add(this.mesh)
      
      // Create physics body (uses already-computed base capsule params)
      this.createPhysicsBodyFromCachedParams()
      
      // Compute visual volume for attacker detection
      this.computeVisualVolume()
      
      // Register with MeshRegistry for attacker detection
      this.registerWithMeshRegistry()
      
      console.log(`[RemotePlayer] ${this.id} scale computed: worldVol=${this.worldVolume.toFixed(2)}, capsuleVol=${this.encyclopediaCapsuleVolume.toFixed(4)}, scale=${this.scale.toFixed(4)}`)
    }
  }
  
  /**
   * Compute ALL encyclopedia volumes at scale=1
   * MUST be called before any scaling is applied to the mesh
   * These are immutable and used as reference for computing display scale
   */
  computeAllEncyclopediaVolumes() {
    if (!this.mesh) {
      console.warn(`[RemotePlayer] ${this.id} no mesh for volume computation, using defaults`)
      this.encyclopediaVisualVolume = 1
      this.encyclopediaCapsuleVolume = 1
      return
    }
    
    // Mesh should be at scale=1 when this is called
    this.mesh.scale.setScalar(1)
    this.mesh.updateWorldMatrix(true, true)
    
    // 1. Compute visual mesh volume at scale=1
    try {
      this.encyclopediaVisualVolume = computeGroupVolume(this.mesh, false)
    } catch (e) {
      console.warn(`[RemotePlayer] ${this.id} visual volume computation failed:`, e)
      this.encyclopediaVisualVolume = NaN
    }
    
    // Validate visual volume
    if (!this.encyclopediaVisualVolume || isNaN(this.encyclopediaVisualVolume) || this.encyclopediaVisualVolume < 0.001) {
      this.encyclopediaVisualVolume = 1
      console.warn(`[RemotePlayer] ${this.id} visual volume invalid, using fallback: 1`)
    }
    
    // 2. Compute CAPSULE volume at scale=1 (this is what local player uses!)
    try {
      const baseCapsuleParams = computeCapsuleParams(this.mesh, this.creature)
      this.baseCapsuleParams = baseCapsuleParams
      
      if (baseCapsuleParams && baseCapsuleParams.radius && baseCapsuleParams.halfHeight) {
        this.encyclopediaCapsuleVolume = computeCapsuleVolume(baseCapsuleParams.radius, baseCapsuleParams.halfHeight)
      } else {
        console.warn(`[RemotePlayer] ${this.id} capsule params invalid:`, baseCapsuleParams)
        this.encyclopediaCapsuleVolume = NaN
      }
    } catch (e) {
      console.warn(`[RemotePlayer] ${this.id} capsule computation failed:`, e)
      this.encyclopediaCapsuleVolume = NaN
    }
    
    // Validate capsule volume
    if (!this.encyclopediaCapsuleVolume || isNaN(this.encyclopediaCapsuleVolume) || this.encyclopediaCapsuleVolume < 0.001) {
      this.encyclopediaCapsuleVolume = 1
      console.warn(`[RemotePlayer] ${this.id} capsule volume invalid, using fallback: 1`)
    }
    
    console.log(`[RemotePlayer] ${this.id} encyclopedia volumes: visual=${this.encyclopediaVisualVolume.toFixed(4)}, capsule=${this.encyclopediaCapsuleVolume.toFixed(4)}`)
  }
  
  /**
   * Compute the correct scale factor from world volume
   * Uses CAPSULE volume (same formula as local player in NormalScale.js)
   * 
   * scale = cbrt(worldVolume / encyclopediaCapsuleVolume)
   * 
   * @param {number} worldVolume - Target world volume in m^3
   * @returns {number} Scale factor to apply to mesh
   */
  computeScaleFromWorldVolume(worldVolume) {
    // Validate input
    if (!worldVolume || isNaN(worldVolume) || worldVolume <= 0) {
      worldVolume = 1
    }
    
    // Use CAPSULE volume - this matches how local player computes scale
    if (this.encyclopediaCapsuleVolume && !isNaN(this.encyclopediaCapsuleVolume) && this.encyclopediaCapsuleVolume > 0.001) {
      const scale = Math.cbrt(worldVolume / this.encyclopediaCapsuleVolume)
      if (!isNaN(scale) && scale > 0) {
        return scale
      }
    }
    
    // Fallback to visual volume if capsule not available
    if (this.encyclopediaVisualVolume && !isNaN(this.encyclopediaVisualVolume) && this.encyclopediaVisualVolume > 0.001) {
      console.warn(`[RemotePlayer] ${this.id} using visual volume fallback for scale`)
      const scale = Math.cbrt(worldVolume / this.encyclopediaVisualVolume)
      if (!isNaN(scale) && scale > 0) {
        return scale
      }
    }
    
    // Last resort: use received scale or default to 1
    console.warn(`[RemotePlayer] ${this.id} no valid encyclopedia volumes, using fallback scale`)
    return this._receivedScale || 1
  }
  
  /**
   * Compute the visual volume of this remote player based on capsule params and scale
   * This is used by the attacker ability to determine threat level
   */
  computeVisualVolume() {
    if (!this.capsuleParams) {
      // Fallback: estimate from scale (assume base volume of ~1)
      this.visualVolume = Math.pow(this.scale || 1, 3)
      return
    }
    
    // Use capsule volume formula: PI * r^2 * (4/3 * r + 2 * h)
    // where r = radius and h = halfHeight
    const r = this.capsuleParams.radius
    const h = this.capsuleParams.halfHeight
    this.visualVolume = computeCapsuleVolume(r, h)
  }
  
  /**
   * Register this remote player with MeshRegistry for detection by attacker ability
   */
  registerWithMeshRegistry() {
    if (!this.mesh) return
    
    this.registryId = MeshRegistry.register(`remote_player_${this.id}`, {
      mesh: this.mesh,
      category: Category.REMOTE_PLAYER,
      tags: [],
      metadata: {
        playerId: this.id,
        playerName: this.name,
        visualVolume: this.visualVolume || 1,
        worldVolume: this.worldVolume || 1,  // Authoritative volume for feeding
        isRemotePlayer: true,
      }
    }, true)  // Use explicit ID
    
    console.log(`[RemotePlayer] Registered ${this.id} with MeshRegistry (worldVolume: ${(this.worldVolume || 1).toFixed(2)})`)
  }
  
  /**
   * Unregister this remote player from MeshRegistry
   */
  unregisterFromMeshRegistry() {
    if (this.registryId) {
      MeshRegistry.unregister(this.registryId)
      this.registryId = null
    }
  }
  
  /**
   * Create physics body using cached base capsule params
   * Called AFTER computeAllEncyclopediaVolumes and AFTER scale is applied
   */
  createPhysicsBodyFromCachedParams() {
    if (!isPhysicsReady() || !this.mesh || !this.baseCapsuleParams) return
    
    // Use the base params computed at scale=1, scale them by current scale
    // These are the ACTUAL physics capsule dimensions
    const scaledCapsuleParams = {
      radius: this.baseCapsuleParams.radius * this.scale,
      halfHeight: this.baseCapsuleParams.halfHeight * this.scale,
    }
    
    // Store for later updates
    this.capsuleParams = scaledCapsuleParams
    this._lastPhysicsScale = this.scale
    this._physicsInitialized = true
    
    // Create the physics body
    // IMPORTANT: Pass BASE capsule params for the debug wireframe
    // The wireframe is attached to the mesh as a child, so it will be scaled automatically
    // If we pass scaled params, it would be double-scaled!
    createRemotePlayerBody(this.id, this.mesh, this.baseCapsuleParams, scaledCapsuleParams)
    
    console.log(`[RemotePlayer] Created physics body for ${this.id}: r=${scaledCapsuleParams.radius.toFixed(3)}, h=${scaledCapsuleParams.halfHeight.toFixed(3)}, scale=${this.scale.toFixed(4)}`)
  }
  
  /**
   * Rebuild physics body with current scale
   * Called when scale changes significantly to keep physics capsule in sync with visual mesh
   */
  rebuildPhysicsBody() {
    if (!isPhysicsReady() || !this.mesh || !this.baseCapsuleParams) return
    
    // Remove old physics body
    removeRemotePlayerBody(this.id)
    
    // Compute new scaled capsule params for physics
    const scaledCapsuleParams = {
      radius: this.baseCapsuleParams.radius * this.scale,
      halfHeight: this.baseCapsuleParams.halfHeight * this.scale,
    }
    
    // Store for later
    this.capsuleParams = scaledCapsuleParams
    this._lastPhysicsScale = this.scale
    this._physicsInitialized = true
    
    // Create new physics body with updated scale
    // Pass BASE params for wireframe (will be scaled by mesh), SCALED params for physics
    createRemotePlayerBody(this.id, this.mesh, this.baseCapsuleParams, scaledCapsuleParams)
    
    console.log(`[RemotePlayer] Rebuilt physics body for ${this.id}: r=${scaledCapsuleParams.radius.toFixed(3)}, h=${scaledCapsuleParams.halfHeight.toFixed(3)}, scale=${this.scale.toFixed(4)}`)
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
    // Compute scale from world volume if provided (uses capsule volume internally)
    let computedScale = data.scale || 1
    
    // Only use volume for scale computation if it's a valid number
    const hasValidVolume = data.volume !== undefined && 
                           data.volume !== null && 
                           !isNaN(data.volume) && 
                           data.volume > 0
    
    if (hasValidVolume && (this.encyclopediaCapsuleVolume > 0.001 || this.encyclopediaVisualVolume > 0.001)) {
      computedScale = this.computeScaleFromWorldVolume(data.volume)
    }
    
    // Safety check: if scale is still NaN or invalid, use fallback
    if (isNaN(computedScale) || computedScale <= 0) {
      console.warn(`[RemotePlayer] ${this.id} invalid scale computed, using fallback`)
      computedScale = this._receivedScale || this.scale || 1
    }
    
    this.positionBuffer.push(
      { x: data.x, y: data.y, z: data.z },
      { x: data.rx || 0, y: data.ry || 0, z: 0 },  // Ignore Z rotation
      computedScale,
      serverTime
    )
    
    this.targetPosition.set(data.x, data.y, data.z)
    if (data.rx !== undefined) {
      // Only update X (pitch) and Y (yaw), keep Z at 0
      this.targetRotation.x = data.rx || 0
      this.targetRotation.y = data.ry || 0
      this.targetRotation.z = 0
    }
    
    // Use computed scale from world volume
    this.targetScale = computedScale
    
    // Update world volume if provided and valid
    if (hasValidVolume) {
      this.updateVolume(data.volume)
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
    
    // If we have encyclopedia capsule volume, compute what world volume this scale represents
    // Using capsule volume to match local player formula
    if (this.encyclopediaCapsuleVolume > 0.001) {
      // scale = cbrt(worldVolume / capsuleVolume)
      // worldVolume = scale^3 * capsuleVolume
      this.worldVolume = Math.pow(newScale, 3) * this.encyclopediaCapsuleVolume
    } else if (this.encyclopediaVisualVolume > 0.001) {
      // Fallback to visual volume
      this.worldVolume = Math.pow(newScale, 3) * this.encyclopediaVisualVolume
    }
    
    // Recalculate visual volume based on the new scale
    if (this.baseCapsuleParams) {
      const newRadius = this.baseCapsuleParams.radius * newScale
      const newHalfHeight = this.baseCapsuleParams.halfHeight * newScale
      this.visualVolume = computeCapsuleVolume(newRadius, newHalfHeight)
    } else if (this.capsuleParams) {
      // Fallback: recalculate from current capsule params
      const baseRadius = this.capsuleParams.radius / (this.scale || 1)
      const baseHalfHeight = this.capsuleParams.halfHeight / (this.scale || 1)
      const newRadius = baseRadius * newScale
      const newHalfHeight = baseHalfHeight * newScale
      this.visualVolume = computeCapsuleVolume(newRadius, newHalfHeight)
    } else {
      // Last resort: estimate from scale
      this.visualVolume = Math.pow(newScale, 3)
    }
    
    // Update the MeshRegistry metadata
    if (this.registryId) {
      MeshRegistry.updateMetadata(this.registryId, {
        visualVolume: this.visualVolume,
        worldVolume: this.worldVolume,
      })
    }
  }
  
  /**
   * Update world volume (authoritative volume from network)
   * This also recomputes the display scale, visualVolume, and triggers physics rebuild if needed
   * Volume is clamped to valid bounds to match sender's constraints
   * @param {number} newVolume - World volume in m^3 (will be clamped)
   */
  updateVolume(newVolume) {
    // Validate input
    if (newVolume === undefined || newVolume === null || isNaN(newVolume) || newVolume <= 0) {
      return  // Ignore invalid volume updates
    }
    
    // Clamp volume to valid bounds (use VOLUME_CONFIG from PlayerRegistry)
    const clampedVolume = Math.max(VOLUME_CONFIG.MIN, Math.min(VOLUME_CONFIG.MAX, newVolume))
    
    // Skip if volume hasn't changed significantly
    if (Math.abs(clampedVolume - this.worldVolume) < 0.01) return
    
    const oldVolume = this.worldVolume
    this.worldVolume = clampedVolume
    
    // Also update PlayerRegistry to keep it in sync
    PlayerRegistry.setWorldVolume(this.id, clampedVolume)
    
    // Recompute scale from new volume (uses capsule volume internally)
    if (this.encyclopediaCapsuleVolume > 0.001 || this.encyclopediaVisualVolume > 0.001) {
      this.targetScale = this.computeScaleFromWorldVolume(clampedVolume)
      
      // Also update visualVolume immediately based on targetScale
      // This ensures radar threat detection stays in sync with feeding system
      if (this.baseCapsuleParams) {
        const newRadius = this.baseCapsuleParams.radius * this.targetScale
        const newHalfHeight = this.baseCapsuleParams.halfHeight * this.targetScale
        this.visualVolume = computeCapsuleVolume(newRadius, newHalfHeight)
      }
    }
    
    // Update the MeshRegistry metadata with both volumes
    if (this.registryId) {
      MeshRegistry.updateMetadata(this.registryId, {
        worldVolume: this.worldVolume,
        visualVolume: this.visualVolume,
      })
    }
    
    // Log significant changes
    if (Math.abs(clampedVolume - oldVolume) > 0.5) {
      console.log(`[RemotePlayer] ${this.id} volume: ${oldVolume.toFixed(2)} -> ${clampedVolume.toFixed(2)} m³`)
    }
  }
  
  /**
   * Get debug info for this remote player
   * Used by the P key debug panel
   * @returns {object} Debug information
   */
  getDebugInfo() {
    // Compute actual physics capsule volume from current capsule params
    let actualPhysicsCapsuleVolume = 0
    if (this.capsuleParams) {
      actualPhysicsCapsuleVolume = computeCapsuleVolume(
        this.capsuleParams.radius, 
        this.capsuleParams.halfHeight
      )
    }
    
    return {
      id: this.id,
      name: this.name,
      fishType: this.creatureData?.type || 'unknown',
      fishClass: this.creatureData?.class || 'unknown',
      
      // Volumes
      encyclopediaVisualVolume: this.encyclopediaVisualVolume,
      encyclopediaCapsuleVolume: this.encyclopediaCapsuleVolume,
      worldVolume: this.worldVolume,
      visualVolume: this.visualVolume || 0,
      actualPhysicsCapsuleVolume: actualPhysicsCapsuleVolume,
      
      // Scale
      currentScale: this.scale,
      targetScale: this.targetScale,
      receivedScale: this._receivedScale || null,
      lastPhysicsScale: this._lastPhysicsScale || 0,
      physicsInitialized: this._physicsInitialized || false,
      
      // Position
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      },
    }
  }
  
  /**
   * Set the ability state for this remote player
   * @param {string} abilityKey - 'sprinter', 'stacker', 'camper', 'attacker'
   * @param {boolean} isActive - Whether the ability is active
   * @param {Object} data - Extra data (e.g., { color, terrain } for camper)
   */
  setAbilityState(abilityKey, isActive, data = {}) {
    // Handle sprinter ability
    if (abilityKey === 'sprinter') {
      if (isActive && !this.isSprinting) {
        // Start sprinting - create trail
        this.isSprinting = true
        this.activeAbility = 'sprinter'
        createRemoteTrail(this.id, this.scene)
        console.log(`[RemotePlayer] ${this.id} started sprinting`)
      } else if (!isActive && this.isSprinting) {
        // Stop sprinting - stop trail (will fade out)
        this.isSprinting = false
        this.activeAbility = null
        stopRemoteTrail(this.id)
        console.log(`[RemotePlayer] ${this.id} stopped sprinting`)
      }
    }
    // Handle camper ability (async due to dynamic import)
    else if (abilityKey === 'camper') {
      // Queue the camper state change to prevent race conditions
      this._queueCamperStateChange(isActive, data)
    }
    // Other abilities - just track state for now
    else {
      this.activeAbility = isActive ? abilityKey : null
    }
  }
  
  /**
   * Queue camper state changes to prevent async race conditions
   * @private
   */
  _queueCamperStateChange(isActive, data) {
    // Store the desired state
    this._pendingCamperState = { isActive, data }
    
    // If not already processing, start processing
    if (!this._processingCamper) {
      this._processCamperQueue()
    }
  }
  
  /**
   * Process queued camper state changes
   * @private
   */
  async _processCamperQueue() {
    this._processingCamper = true
    
    while (this._pendingCamperState) {
      const { isActive, data } = this._pendingCamperState
      this._pendingCamperState = null
      
      await this._handleCamperAbility(isActive, data)
    }
    
    this._processingCamper = false
  }
  
  /**
   * Handle camper ability state change (async helper)
   * @private
   */
  async _handleCamperAbility(isActive, data) {
    const camper = await getCamperModule()
    
    if (isActive) {
      // If already camouflaged (or fading), remove old first
      if (this.camouflageCleanup) {
        console.log(`[RemotePlayer] ${this.id} - removing old camouflage before applying new`)
        camper.removeRemoteCamouflage(this.camouflageCleanup)
        this.camouflageCleanup = null
        this._camouflageFading = false
      }
      
      // Start camouflage - apply color and create mimic (starts fade-in)
      const colorHex = data.color || '808080'  // Default gray if no color
      const terrainType = data.terrain || 'boulder'  // Default to boulder
      const mimicSeed = data.mimicSeed !== undefined ? data.mimicSeed : Math.floor(Math.random() * 0xFFFFFFFF)
      
      this.camouflageCleanup = camper.applyRemoteCamouflage(this.mesh, colorHex, terrainType, mimicSeed)
      this.activeAbility = 'camper'
      this._camouflageFading = true  // Start fading in
      console.log(`[RemotePlayer] ${this.id} started camouflage fade-in (color: #${colorHex}, terrain: ${terrainType}, seed: ${mimicSeed})`)
    } else {
      // Stop camouflage - start fade out instead of immediate removal
      if (this.camouflageCleanup) {
        camper.startRemoteCamouflageFadeOut(this.camouflageCleanup)
        this._camouflageFading = true
        this.activeAbility = null
        console.log(`[RemotePlayer] ${this.id} starting camouflage fade out`)
      }
    }
  }
  
  /**
   * Update camouflage fade animation (called each frame)
   * Handles both fade-in and fade-out
   * @param {number} delta - Time since last frame
   */
  updateCamouflageFade(delta) {
    if (!this._camouflageFading || !this.camouflageCleanup) return
    
    // Module should already be loaded since we needed it to start the fade
    // Use cached module synchronously
    if (!camperModule) return
    
    const fadeOutComplete = camperModule.updateRemoteCamouflageFade(this.camouflageCleanup, delta)
    
    // Check if fade-in completed (no longer fading in but not fading out either)
    if (!this.camouflageCleanup.isFadingIn && !this.camouflageCleanup.isFadingOut) {
      this._camouflageFading = false
      // Camouflage is now fully active, keep cleanup data for later fade-out
    }
    
    if (fadeOutComplete) {
      // Fade-out finished, do final cleanup
      camperModule.removeRemoteCamouflage(this.camouflageCleanup)
      this.camouflageCleanup = null
      this._camouflageFading = false
      console.log(`[RemotePlayer] ${this.id} camouflage fade complete`)
    }
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
      
      // IMPORTANT: Don't use interpolated.scale - it may be the raw received scale
      // which doesn't account for different creature volumes.
      // Instead, always compute scale from world volume using our local encyclopedia volumes.
      // This ensures consistent scaling regardless of what scale value was sent.
    }
    
    // Always compute target scale from world volume (authoritative)
    // This overrides any interpolated scale values
    if (this.encyclopediaCapsuleVolume > 0.001) {
      this.targetScale = this.computeScaleFromWorldVolume(this.worldVolume)
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
    
    // Track previous scale for physics rebuild check
    const prevScale = this.scale
    
    // Smooth scale
    this.scale += (this.targetScale - this.scale) * scaleFactor
    
    // Apply to mesh
    this.mesh.position.copy(this.position)
    this.mesh.rotation.copy(this.rotation)
    this.mesh.scale.setScalar(this.scale)
    
    // Rebuild physics body if scale differs significantly from when physics was last built
    // Compare against _lastPhysicsScale (not prevScale) because scale changes smoothly
    // and small per-frame changes would never trigger a rebuild
    if (this.baseCapsuleParams) {
      const scaleDiff = Math.abs(this.scale - this._lastPhysicsScale)
      const scaleRatio = this._lastPhysicsScale > 0 ? this.scale / this._lastPhysicsScale : 999
      
      // Rebuild if scale changed by more than 5% from last physics build
      if (scaleDiff > 0.05 || scaleRatio > 1.05 || scaleRatio < 0.95) {
        this.rebuildPhysicsBody()
      }
    }
    
    // Sync physics body position
    if (isPhysicsReady()) {
      // Convert Euler to Quaternion for physics
      const quat = new THREE.Quaternion().setFromEuler(this.rotation)
      updateRemotePlayerBody(this.id, this.position, quat)
    }
    
    // Update sprinter trail if active
    if (this.isSprinting) {
      // Calculate direction from rotation
      const yaw = this.rotation.y
      const pitch = this.rotation.x
      const direction = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      ).normalize()
      
      updateRemoteTrail(this.id, delta, this.position, direction)
    }
    
    // Update camouflage fade if active
    if (this._camouflageFading) {
      this.updateCamouflageFade(delta)
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
    // Clean up sprinter trail if active
    if (this.isSprinting) {
      destroyRemoteTrail(this.id)
      this.isSprinting = false
    }
    
    // Clean up camouflage if active (async)
    if (this.camouflageCleanup) {
      const cleanupData = this.camouflageCleanup
      this.camouflageCleanup = null
      getCamperModule().then(camper => {
        camper.removeRemoteCamouflage(cleanupData)
      })
    }
    
    // Unregister from MeshRegistry (for attacker detection)
    this.unregisterFromMeshRegistry()
    
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
      
      // Clean up any stacker prisms this player placed
      removeAllRemotePrismsForPlayer(id)
      
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
  
  /**
   * Update world volume for a remote player
   * @param {number} id - Player ID
   * @param {number} volume - World volume in m^3
   */
  updateVolume(id, volume) {
    const player = this.players.get(id)
    if (player) {
      player.updateVolume(volume)
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
    
    // Update all remote player trails (handles fading for stopped trails)
    updateAllRemoteTrails(delta)
  }
  
  /**
   * Set the ability state for a remote player
   * @param {number} playerId - The player ID
   * @param {string} abilityKey - 'sprinter', 'stacker', 'camper', 'attacker'
   * @param {boolean} isActive - Whether the ability is active
   * @param {Object} data - Extra data (e.g., { color, terrain } for camper)
   */
  setAbilityState(playerId, abilityKey, isActive, data = {}) {
    const player = this.players.get(playerId)
    if (player) {
      player.setAbilityState(abilityKey, isActive, data)
    }
  }
  
  /**
   * Toggle debug wireframes for all remote players
   * @returns {boolean} New visibility state
   */
  toggleWireframes() {
    return physicsToggleRemotePlayerWireframe()
  }
  
  /**
   * Get debug info for all remote players
   * Used by the P key debug panel
   * @returns {Array} Array of debug info objects
   */
  getAllDebugInfo() {
    const debugInfo = []
    this.players.forEach(player => {
      debugInfo.push(player.getDebugInfo())
    })
    return debugInfo
  }
  
  destroy() {
    this.players.forEach(player => {
      player.destroy()
    })
    this.players.clear()
  }
}