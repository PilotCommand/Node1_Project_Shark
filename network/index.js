/**
 * Network Module Exports
 * 
 * Usage in your src/main.js:
 *   import { networkManager } from '../network/index.js'
 *   // or
 *   import { networkManager } from '../network/NetworkManager.js'
 */

export { networkManager, NetworkManager } from './NetworkManager.js'
export { RemotePlayerManager } from './RemotePlayerManager.js'
export { PositionBuffer, Extrapolator } from './Interpolation.js'
export { NetworkClock, networkClock } from './NetworkClock.js'

// Re-export protocol for convenience
export { 
  MSG, 
  encodeMessage, 
  decodeMessage, 
  NETWORK_CONFIG,
  getMessageName,
} from '../shared/Protocol.js'
