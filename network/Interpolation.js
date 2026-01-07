/**
 * Interpolation.js - Smooth movement interpolation for remote players
 */

// ============================================================================
// POSITION BUFFER
// ============================================================================

export class PositionBuffer {
  constructor(delayMs = 100) {
    this.buffer = []
    this.delay = delayMs
    this.maxSize = 60
  }
  
  push(position, rotation, scale, serverTime) {
    const state = {
      time: serverTime,
      pos: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      rot: {
        x: rotation.x || 0,
        y: rotation.y || 0,
        z: rotation.z || 0,
      },
      scale: scale || 1,
    }
    
    this.buffer.push(state)
    this.buffer.sort((a, b) => a.time - b.time)
    
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }
  
  sample(renderTime) {
    const len = this.buffer.length
    
    if (len === 0) return null
    if (len === 1) return this.buffer[0]
    
    let before = null
    let after = null
    
    for (let i = 0; i < len; i++) {
      const state = this.buffer[i]
      
      if (state.time <= renderTime) {
        before = state
      } else {
        after = state
        break
      }
    }
    
    if (!before && !after) return null
    if (!before) return after
    if (!after) return before
    
    const timeDiff = after.time - before.time
    if (timeDiff <= 0) return before
    
    const t = (renderTime - before.time) / timeDiff
    const clampedT = Math.max(0, Math.min(1, t))
    
    return {
      pos: {
        x: this.lerp(before.pos.x, after.pos.x, clampedT),
        y: this.lerp(before.pos.y, after.pos.y, clampedT),
        z: this.lerp(before.pos.z, after.pos.z, clampedT),
      },
      rot: {
        x: this.lerpAngle(before.rot.x, after.rot.x, clampedT),
        y: this.lerpAngle(before.rot.y, after.rot.y, clampedT),
        z: this.lerpAngle(before.rot.z, after.rot.z, clampedT),
      },
      scale: this.lerp(before.scale, after.scale, clampedT),
    }
  }
  
  lerp(a, b, t) {
    return a + (b - a) * t
  }
  
  lerpAngle(a, b, t) {
    let diff = b - a
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    return a + diff * t
  }
  
  getLatest() {
    if (this.buffer.length === 0) return null
    return this.buffer[this.buffer.length - 1]
  }
  
  clear() {
    this.buffer = []
  }
  
  getLength() {
    return this.buffer.length
  }
}

// ============================================================================
// EXTRAPOLATOR (for prediction)
// ============================================================================

export class Extrapolator {
  constructor() {
    this.lastPosition = null
    this.lastVelocity = { x: 0, y: 0, z: 0 }
    this.lastTime = 0
    this.maxExtrapolationTime = 200
  }
  
  update(position, time) {
    if (this.lastPosition && this.lastTime > 0) {
      const dt = (time - this.lastTime) / 1000
      
      if (dt > 0 && dt < 1) {
        this.lastVelocity = {
          x: (position.x - this.lastPosition.x) / dt,
          y: (position.y - this.lastPosition.y) / dt,
          z: (position.z - this.lastPosition.z) / dt,
        }
      }
    }
    
    this.lastPosition = { ...position }
    this.lastTime = time
  }
  
  extrapolate(time) {
    if (!this.lastPosition || this.lastTime === 0) {
      return null
    }
    
    const dt = Math.min(
      (time - this.lastTime) / 1000,
      this.maxExtrapolationTime / 1000
    )
    
    if (dt <= 0) return this.lastPosition
    
    return {
      x: this.lastPosition.x + this.lastVelocity.x * dt,
      y: this.lastPosition.y + this.lastVelocity.y * dt,
      z: this.lastPosition.z + this.lastVelocity.z * dt,
    }
  }
  
  getSpeed() {
    const v = this.lastVelocity
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  }
}
