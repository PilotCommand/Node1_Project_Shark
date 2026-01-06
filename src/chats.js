// ============================================================================
// CHATS.JS - Core Chat System Logic
// Handles message data, history, and events (multiplayer-ready)
// UI/DOM rendering is handled by hud.js
// ============================================================================

// Configuration
const CHAT_CONFIG = {
  maxMessages: 50,        // Maximum messages to keep in history
  timestampFormat: {      // Options for toLocaleTimeString
    hour: '2-digit',
    minute: '2-digit'
  }
}

// Message types
export const MESSAGE_TYPES = {
  PLAYER: 'player',       // Local player messages
  SYSTEM: 'system',       // System notifications
  EVENT: 'event',         // Game events (eating, abilities, etc.)
  REMOTE: 'remote',       // Other players (multiplayer)
  SERVER: 'server'        // Server messages (multiplayer)
}

// Message history storage
const chatHistory = []

// Event listeners for new messages (for UI updates and multiplayer)
const messageListeners = []

// ============================================================================
// MESSAGE CREATION
// ============================================================================

/**
 * Create a formatted timestamp string
 * @returns {string} Formatted time string (e.g., "14:32")
 */
function createTimestamp() {
  return new Date().toLocaleTimeString([], CHAT_CONFIG.timestampFormat)
}

/**
 * Create a message object
 * @param {string} text - Message content
 * @param {string} type - Message type (use MESSAGE_TYPES)
 * @param {object} options - Additional options
 * @param {string} options.sender - Sender name (for multiplayer)
 * @param {string} options.senderId - Sender ID (for multiplayer)
 * @param {string} options.timestamp - Override timestamp
 * @returns {object} Message object
 */
export function createMessage(text, type = MESSAGE_TYPES.PLAYER, options = {}) {
  return {
    id: generateMessageId(),
    text,
    type,
    timestamp: options.timestamp || createTimestamp(),
    sender: options.sender || null,
    senderId: options.senderId || null,
    createdAt: Date.now()
  }
}

/**
 * Generate a unique message ID
 * @returns {string} Unique ID
 */
let messageIdCounter = 0
function generateMessageId() {
  return `msg_${Date.now()}_${messageIdCounter++}`
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

/**
 * Add a message to history and notify listeners
 * @param {string} text - Message content
 * @param {string} type - Message type
 * @param {object} options - Additional message options
 * @returns {object} The created message
 */
export function addMessage(text, type = MESSAGE_TYPES.PLAYER, options = {}) {
  const message = createMessage(text, type, options)
  
  // Add to history
  chatHistory.push(message)
  
  // Trim history if needed
  while (chatHistory.length > CHAT_CONFIG.maxMessages) {
    chatHistory.shift()
  }
  
  // Notify all listeners
  notifyListeners(message)
  
  return message
}

/**
 * Add a pre-created message object to history
 * Used for receiving messages from server in multiplayer
 * @param {object} message - Message object
 * @returns {object} The message
 */
export function addMessageObject(message) {
  // Ensure required fields
  if (!message.id) {
    message.id = generateMessageId()
  }
  if (!message.timestamp) {
    message.timestamp = createTimestamp()
  }
  if (!message.createdAt) {
    message.createdAt = Date.now()
  }
  
  chatHistory.push(message)
  
  while (chatHistory.length > CHAT_CONFIG.maxMessages) {
    chatHistory.shift()
  }
  
  notifyListeners(message)
  
  return message
}

/**
 * Get all messages in history
 * @returns {Array} Copy of message history
 */
export function getHistory() {
  return [...chatHistory]
}

/**
 * Get recent messages
 * @param {number} count - Number of messages to retrieve
 * @returns {Array} Recent messages
 */
export function getRecentMessages(count = 10) {
  return chatHistory.slice(-count)
}

/**
 * Clear all message history
 */
export function clearHistory() {
  chatHistory.length = 0
}

/**
 * Get message count
 * @returns {number} Number of messages in history
 */
export function getMessageCount() {
  return chatHistory.length
}

// ============================================================================
// EVENT SYSTEM (for UI updates and multiplayer)
// ============================================================================

/**
 * Subscribe to new messages
 * @param {function} callback - Function to call when message is added
 * @returns {function} Unsubscribe function
 */
export function onMessage(callback) {
  if (typeof callback !== 'function') {
    console.warn('[Chats] onMessage callback must be a function')
    return () => {}
  }
  
  messageListeners.push(callback)
  
  // Return unsubscribe function
  return () => {
    const index = messageListeners.indexOf(callback)
    if (index > -1) {
      messageListeners.splice(index, 1)
    }
  }
}

/**
 * Notify all listeners of a new message
 * @param {object} message - The new message
 */
function notifyListeners(message) {
  for (let i = 0; i < messageListeners.length; i++) {
    try {
      messageListeners[i](message)
    } catch (err) {
      console.error('[Chats] Error in message listener:', err)
    }
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Add a system message
 * @param {string} text - Message text
 * @returns {object} The message
 */
export function systemMessage(text) {
  return addMessage(text, MESSAGE_TYPES.SYSTEM)
}

/**
 * Add an event message (game events like eating, abilities)
 * @param {string} text - Event text
 * @returns {object} The message
 */
export function eventMessage(text) {
  return addMessage(text, MESSAGE_TYPES.EVENT)
}

/**
 * Add a player message
 * @param {string} text - Message text
 * @param {string} sender - Optional sender name
 * @param {string} senderId - Optional sender ID
 * @returns {object} The message
 */
export function playerMessage(text, sender = null, senderId = null) {
  return addMessage(text, MESSAGE_TYPES.PLAYER, { sender, senderId })
}

/**
 * Add a remote player message (for multiplayer)
 * @param {string} text - Message text
 * @param {string} sender - Sender name
 * @param {string} senderId - Sender ID
 * @returns {object} The message
 */
export function remoteMessage(text, sender, senderId) {
  return addMessage(text, MESSAGE_TYPES.REMOTE, { sender, senderId })
}

// ============================================================================
// CONFIGURATION ACCESS
// ============================================================================

/**
 * Get current chat configuration
 * @returns {object} Chat configuration
 */
export function getConfig() {
  return { ...CHAT_CONFIG }
}

/**
 * Update chat configuration
 * @param {object} newConfig - Configuration updates
 */
export function setConfig(newConfig) {
  if (newConfig.maxMessages !== undefined) {
    CHAT_CONFIG.maxMessages = Math.max(1, Math.floor(newConfig.maxMessages))
  }
  if (newConfig.timestampFormat !== undefined) {
    CHAT_CONFIG.timestampFormat = newConfig.timestampFormat
  }
}

// ============================================================================
// SERIALIZATION (for multiplayer/persistence)
// ============================================================================

/**
 * Serialize message for network transmission
 * @param {object} message - Message to serialize
 * @returns {object} Serialized message (JSON-safe)
 */
export function serializeMessage(message) {
  return {
    id: message.id,
    text: message.text,
    type: message.type,
    timestamp: message.timestamp,
    sender: message.sender,
    senderId: message.senderId,
    createdAt: message.createdAt
  }
}

/**
 * Deserialize message from network
 * @param {object} data - Serialized message data
 * @returns {object} Message object
 */
export function deserializeMessage(data) {
  return {
    id: data.id || generateMessageId(),
    text: data.text || '',
    type: data.type || MESSAGE_TYPES.REMOTE,
    timestamp: data.timestamp || createTimestamp(),
    sender: data.sender || null,
    senderId: data.senderId || null,
    createdAt: data.createdAt || Date.now()
  }
}

// Export config for reference
export { CHAT_CONFIG }