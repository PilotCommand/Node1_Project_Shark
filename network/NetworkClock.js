/**
 * NetworkClock.js - Timing and server synchronization
 */

export class NetworkClock {
  constructor() {
    this.serverTimeOffset = 0
    this.offsetSamples = []
    this.maxOffsetSamples = 10
    
    this.rtt = 100
    this.rttSamples = []
    this.maxRttSamples = 10
    this.minRtt = Infinity
    
    this.interpolationDelay = 100
    
    this.sendRate = 20
    this.lastSendTime = 0
    this.sendAccumulator = 0
    
    this.lastFrameTime = performance.now()
    this.frameDelta = 0
    
    this.initialized = false
  }
  
  syncServerTime(serverTime) {
    const localTime = performance.now()
    const newOffset = serverTime - localTime
    
    this.offsetSamples.push(newOffset)
    
    if (this.offsetSamples.length > this.maxOffsetSamples) {
      this.offsetSamples.shift()
    }
    
    this.serverTimeOffset = this.median(this.offsetSamples)
    
    if (!this.initialized) {
      this.initialized = true
      console.log(`[NetworkClock] Initialized, offset: ${this.serverTimeOffset.toFixed(0)}ms`)
    }
  }
  
  handlePong(clientSendTime, serverTime) {
    const now = performance.now()
    const rtt = now - clientSendTime
    
    this.rttSamples.push(rtt)
    if (this.rttSamples.length > this.maxRttSamples) {
      this.rttSamples.shift()
    }
    
    this.minRtt = Math.min(this.minRtt, rtt)
    this.rtt = this.median(this.rttSamples)
    
    const oneWayDelay = rtt / 2
    const estimatedServerNow = serverTime + oneWayDelay
    const newOffset = estimatedServerNow - now
    
    this.offsetSamples.push(newOffset)
    if (this.offsetSamples.length > this.maxOffsetSamples) {
      this.offsetSamples.shift()
    }
    
    this.serverTimeOffset = this.median(this.offsetSamples)
  }
  
  getServerTime() {
    return performance.now() + this.serverTimeOffset
  }
  
  getRenderTime() {
    return this.getServerTime() - this.interpolationDelay
  }
  
  getLatency() {
    return this.rtt / 2
  }
  
  getRTT() {
    return this.rtt
  }
  
  getMinRTT() {
    return this.minRtt === Infinity ? this.rtt : this.minRtt
  }
  
  tick() {
    const now = performance.now()
    this.frameDelta = (now - this.lastFrameTime) / 1000
    this.lastFrameTime = now
    
    this.frameDelta = Math.min(this.frameDelta, 0.1)
    this.sendAccumulator += this.frameDelta
    
    return this.frameDelta
  }
  
  shouldSendUpdate() {
    const sendInterval = 1 / this.sendRate
    
    if (this.sendAccumulator >= sendInterval) {
      this.sendAccumulator -= sendInterval
      
      if (this.sendAccumulator > sendInterval) {
        this.sendAccumulator = 0
      }
      
      this.lastSendTime = performance.now()
      return true
    }
    
    return false
  }
  
  setSendRate(rate) {
    this.sendRate = Math.max(1, Math.min(60, rate))
  }
  
  setInterpolationDelay(delay) {
    this.interpolationDelay = Math.max(50, Math.min(500, delay))
  }
  
  median(arr) {
    if (arr.length === 0) return 0
    
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
      return sorted[mid]
    }
  }
  
  getDebugInfo() {
    return {
      serverTimeOffset: Math.round(this.serverTimeOffset),
      rtt: Math.round(this.rtt),
      minRtt: Math.round(this.minRtt === Infinity ? 0 : this.minRtt),
      interpolationDelay: this.interpolationDelay,
      initialized: this.initialized,
    }
  }
}

export const networkClock = new NetworkClock()
