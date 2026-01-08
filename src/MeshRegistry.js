/**
 * MeshRegistry - Central registry for all game entities (meshes + physics bodies)
 * 
 * Features:
 * - Auto-generated IDs with prefixes
 * - Category and tag-based filtering
 * - Event system for spawn/despawn hooks
 * - Spatial queries for nearby entities
 * - Object pooling for performance
 */

// Categories - mutually exclusive, every entity has exactly one
export const Category = {
  PLAYER: 'player',
  NPC: 'npc',
  REMOTE_PLAYER: 'remote_player',  // Other players in multiplayer
  MAP: 'map',
  PROJECTILE: 'projectile',
  PICKUP: 'pickup',
  EFFECT: 'effect',
  DECOR: 'decor',        // Player-placed decorations (stacker prisms, camps, etc.)
  STRUCTURE: 'structure', // Larger player-built structures
}

// Tags - flexible, entities can have multiple
export const Tag = {
  COLLIDABLE: 'collidable',
  ANIMATED: 'animated',
  DESTRUCTIBLE: 'destructible',
  PREDATOR: 'predator',
  PREY: 'prey',
  STATIC: 'static',
  INTANGIBLE: 'intangible',
}

class MeshRegistryClass {
  constructor() {
    // Main storage: id -> entity data
    this.entities = new Map()
    
    // Index by category for fast lookups
    this.byCategory = new Map()
    
    // Index by tag for fast lookups
    this.byTag = new Map()
    
    // Auto-increment counters per prefix
    this.idCounters = new Map()
    
    // Event listeners
    this.listeners = {
      register: [],
      unregister: [],
      update: [],
    }
    
    // Object pools for reuse
    this.pools = new Map()
    
    // Initialize category indexes
    Object.values(Category).forEach(cat => {
      this.byCategory.set(cat, new Set())
    })
    
    // Initialize tag indexes
    Object.values(Tag).forEach(tag => {
      this.byTag.set(tag, new Set())
    })
  }
  
  /**
   * Register an entity
   * @param {string} prefixOrId - Either a prefix for auto-ID ("fish" -> "fish_0") or explicit ID
   * @param {object} data - Entity data
   * @param {THREE.Object3D} data.mesh - The Three.js mesh/group
   * @param {object} [data.body] - Optional Rapier physics body
   * @param {string} data.category - Category from Category enum
   * @param {string[]} [data.tags=[]] - Array of tags from Tag enum
   * @param {object} [data.metadata={}] - Any extra data (health, speed, etc)
   * @param {boolean} [explicit=false] - If true, use prefixOrId as exact ID
   * @returns {string} The assigned ID
   */
  register(prefixOrId, { mesh, body = null, category, tags = [], metadata = {} }, explicit = false) {
    // Generate or use explicit ID
    let id
    if (explicit) {
      id = prefixOrId
      if (this.entities.has(id)) {
        console.warn(`MeshRegistry: Overwriting existing entity "${id}"`)
        this.unregister(id)
      }
    } else {
      const counter = this.idCounters.get(prefixOrId) || 0
      id = `${prefixOrId}_${counter}`
      this.idCounters.set(prefixOrId, counter + 1)
    }
    
    // Validate category
    if (!Object.values(Category).includes(category)) {
      console.warn(`MeshRegistry: Unknown category "${category}", defaulting to MAP`)
      category = Category.MAP
    }
    
    // Create entity record
    const entity = {
      id,
      mesh,
      body,
      category,
      tags: new Set(tags),
      metadata,
      createdAt: performance.now(),
    }
    
    // Store in main map
    this.entities.set(id, entity)
    
    // Index by category
    this.byCategory.get(category)?.add(id)
    
    // Index by tags
    tags.forEach(tag => {
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set())
      }
      this.byTag.get(tag).add(id)
    })
    
    // Store ID on mesh for reverse lookup
    mesh.userData.registryId = id
    
    // Fire event
    this._emit('register', entity)
    
    return id
  }
  
  /**
   * Unregister an entity and optionally pool it for reuse
   * @param {string} id - Entity ID
   * @param {boolean} [pool=false] - If true, add to pool instead of disposing
   * @returns {boolean} Success
   */
  unregister(id, pool = false) {
    const entity = this.entities.get(id)
    if (!entity) {
      console.warn(`MeshRegistry: Cannot unregister unknown entity "${id}"`)
      return false
    }
    
    // Remove from category index
    this.byCategory.get(entity.category)?.delete(id)
    
    // Remove from tag indexes
    entity.tags.forEach(tag => {
      this.byTag.get(tag)?.delete(id)
    })
    
    // Remove from main map
    this.entities.delete(id)
    
    // Fire event
    this._emit('unregister', entity)
    
    // Pool or dispose
    if (pool) {
      this._addToPool(entity)
    } else {
      this._dispose(entity)
    }
    
    return true
  }
  
  /**
   * Get entity by ID
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    return this.entities.get(id) || null
  }
  
  /**
   * Get entity by mesh (reverse lookup)
   * @param {THREE.Object3D} mesh
   * @returns {object|null}
   */
  getByMesh(mesh) {
    const id = mesh.userData.registryId
    return id ? this.get(id) : null
  }
  
  /**
   * Get all entities in a category
   * @param {string} category
   * @returns {object[]}
   */
  getByCategory(category) {
    const ids = this.byCategory.get(category)
    if (!ids) return []
    return Array.from(ids).map(id => this.entities.get(id)).filter(Boolean)
  }
  
  /**
   * Get all entities with a specific tag
   * @param {string} tag
   * @returns {object[]}
   */
  getByTag(tag) {
    const ids = this.byTag.get(tag)
    if (!ids) return []
    return Array.from(ids).map(id => this.entities.get(id)).filter(Boolean)
  }
  
  /**
   * Get all entities with ALL specified tags
   * @param {string[]} tags
   * @returns {object[]}
   */
  getByTags(tags) {
    if (tags.length === 0) return []
    
    // Start with first tag's set, intersect with others
    const firstTagIds = this.byTag.get(tags[0])
    if (!firstTagIds) return []
    
    const matching = Array.from(firstTagIds).filter(id => {
      const entity = this.entities.get(id)
      return entity && tags.every(tag => entity.tags.has(tag))
    })
    
    return matching.map(id => this.entities.get(id)).filter(Boolean)
  }
  
  /**
   * Get all entities with physics bodies
   * @returns {object[]}
   */
  getPhysicsEntities() {
    return Array.from(this.entities.values()).filter(e => e.body !== null)
  }
  
  /**
   * Get entities near a point (simple distance check)
   * @param {THREE.Vector3} point
   * @param {number} radius
   * @param {object} [filter] - Optional filter
   * @param {string} [filter.category] - Filter by category
   * @param {string[]} [filter.tags] - Filter by tags (must have all)
   * @param {string[]} [filter.excludeIds] - IDs to exclude
   * @returns {object[]} Entities sorted by distance (closest first)
   */
  getNearby(point, radius, filter = {}) {
    const radiusSq = radius * radius
    const results = []
    
    for (const entity of this.entities.values()) {
      // Apply filters
      if (filter.category && entity.category !== filter.category) continue
      if (filter.tags && !filter.tags.every(t => entity.tags.has(t))) continue
      if (filter.excludeIds && filter.excludeIds.includes(entity.id)) continue
      
      // Check distance
      const pos = entity.mesh.position
      const dx = pos.x - point.x
      const dy = pos.y - point.y
      const dz = pos.z - point.z
      const distSq = dx * dx + dy * dy + dz * dz
      
      if (distSq <= radiusSq) {
        results.push({ entity, distance: Math.sqrt(distSq) })
      }
    }
    
    // Sort by distance
    results.sort((a, b) => a.distance - b.distance)
    return results.map(r => r.entity)
  }
  
  /**
   * Add a tag to an existing entity
   * @param {string} id
   * @param {string} tag
   */
  addTag(id, tag) {
    const entity = this.entities.get(id)
    if (!entity) return
    
    if (!entity.tags.has(tag)) {
      entity.tags.add(tag)
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set())
      }
      this.byTag.get(tag).add(id)
      this._emit('update', entity)
    }
  }
  
  /**
   * Remove a tag from an existing entity
   * @param {string} id
   * @param {string} tag
   */
  removeTag(id, tag) {
    const entity = this.entities.get(id)
    if (!entity) return
    
    if (entity.tags.has(tag)) {
      entity.tags.delete(tag)
      this.byTag.get(tag)?.delete(id)
      this._emit('update', entity)
    }
  }
  
  /**
   * Update entity metadata
   * @param {string} id
   * @param {object} metadata - Will be merged with existing
   */
  updateMetadata(id, metadata) {
    const entity = this.entities.get(id)
    if (!entity) return
    
    Object.assign(entity.metadata, metadata)
    this._emit('update', entity)
  }
  
  /**
   * Subscribe to events
   * @param {'register'|'unregister'|'update'} event
   * @param {function} callback
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      console.warn(`MeshRegistry: Unknown event "${event}"`)
      return () => {}
    }
    
    this.listeners[event].push(callback)
    return () => {
      const idx = this.listeners[event].indexOf(callback)
      if (idx > -1) this.listeners[event].splice(idx, 1)
    }
  }
  
  /**
   * Get a pooled entity or null
   * @param {string} poolName
   * @returns {object|null}
   */
  getFromPool(poolName) {
    const pool = this.pools.get(poolName)
    if (pool && pool.length > 0) {
      return pool.pop()
    }
    return null
  }
  
  /**
   * Clear all entities
   * @param {boolean} [dispose=true] - If true, dispose all meshes
   */
  clear(dispose = true) {
    if (dispose) {
      for (const entity of this.entities.values()) {
        this._dispose(entity)
      }
    }
    
    this.entities.clear()
    this.idCounters.clear()
    
    for (const set of this.byCategory.values()) set.clear()
    for (const set of this.byTag.values()) set.clear()
    for (const pool of this.pools.values()) pool.length = 0
  }
  
  /**
   * Debug: log registry state
   */
  debug() {
    console.group('MeshRegistry Debug')
    console.log(`Total entities: ${this.entities.size}`)
    
    console.group('By Category')
    for (const [cat, ids] of this.byCategory) {
      if (ids.size > 0) console.log(`${cat}: ${ids.size}`)
    }
    console.groupEnd()
    
    console.group('By Tag')
    for (const [tag, ids] of this.byTag) {
      if (ids.size > 0) console.log(`${tag}: ${ids.size}`)
    }
    console.groupEnd()
    
    console.group('Pools')
    for (const [name, pool] of this.pools) {
      console.log(`${name}: ${pool.length} available`)
    }
    console.groupEnd()
    
    console.groupEnd()
  }
  
  // Private methods
  
  _emit(event, data) {
    this.listeners[event]?.forEach(cb => {
      try {
        cb(data)
      } catch (e) {
        console.error(`MeshRegistry: Error in ${event} listener`, e)
      }
    })
  }
  
  _addToPool(entity) {
    // Extract prefix from ID for pool name
    const prefix = entity.id.replace(/_\d+$/, '')
    
    if (!this.pools.has(prefix)) {
      this.pools.set(prefix, [])
    }
    
    // Reset entity state
    entity.mesh.visible = false
    entity.mesh.position.set(0, -1000, 0) // Move off-screen
    
    this.pools.get(prefix).push(entity)
  }
  
  _dispose(entity) {
    // Dispose mesh geometry and materials
    if (entity.mesh) {
      entity.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
    
    // Remove physics body (will need Rapier world reference)
    // This will be handled when we integrate physics
  }
}

// Singleton instance
export const MeshRegistry = new MeshRegistryClass()

// Default export for convenience
export default MeshRegistry