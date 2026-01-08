// ============================================================================
// CHATS.JS - Core Chat System Logic + Emoji Wheel
// Handles message data, history, events, and emoji wheel logic
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

// Emoji wheel configuration
// 10 emojis mapped to keys 1-9 and 0 (displayed clockwise from top)
export const EMOJI_CONFIG = {
  emojis: [
    { key: '1', emoji: '⚠️', label: 'Warning' },
    { key: '2', emoji: '✅', label: 'Yes' },
    { key: '3', emoji: '❌', label: 'No' },
    { key: '4', emoji: '❓', label: 'Question' },
    { key: '5', emoji: '☠️', label: 'Dead' },
    { key: '6', emoji: '❤️', label: 'Love' },
    { key: '7', emoji: '🍀', label: 'Lucky' },
    { key: '8', emoji: '🐬', label: 'Dolphin' },
    { key: '9', emoji: '⛵', label: 'Sailboat' },
    { key: '0', emoji: '🆘', label: 'Help' },
  ],
  wheelRadius: 75,        // Distance from center to emoji
  wheelSize: 220,         // Total wheel diameter in pixels
}

// Message types
export const MESSAGE_TYPES = {
  PLAYER: 'player',       // Local player messages
  SYSTEM: 'system',       // System notifications
  EVENT: 'event',         // Game events (eating, abilities, etc.)
  REMOTE: 'remote',       // Other players (multiplayer)
  SERVER: 'server',       // Server messages (multiplayer)
  EMOJI: 'emoji'          // Emoji quick-chat messages
}

// Message history storage
const chatHistory = []

// Event listeners for new messages (for UI updates and multiplayer)
const messageListeners = []

// ============================================================================
// EMOJI WHEEL STATE & EVENTS
// ============================================================================

let emojiWheelOpen = false
let currentHoveredIndex = -1
let chatInputElement = null  // Reference to chat input (set by hud.js)

// Event listeners for emoji wheel UI updates
const emojiWheelListeners = {
  open: [],
  close: [],
  hover: [],
  select: [],
  movement: []  // For direction visualizer updates
}

/**
 * Notify emoji wheel listeners
 */
function notifyEmojiWheelListeners(event, data) {
  const listeners = emojiWheelListeners[event]
  if (!listeners) return
  for (const callback of listeners) {
    try {
      callback(data)
    } catch (err) {
      console.error(`[Chats] Error in emoji wheel ${event} listener:`, err)
    }
  }
}

/**
 * Subscribe to emoji wheel events
 * @param {string} event - 'open', 'close', 'hover', or 'select'
 * @param {function} callback - Event handler
 * @returns {function} Unsubscribe function
 */
export function onEmojiWheel(event, callback) {
  if (!emojiWheelListeners[event] || typeof callback !== 'function') {
    return () => {}
  }
  emojiWheelListeners[event].push(callback)
  return () => {
    const index = emojiWheelListeners[event].indexOf(callback)
    if (index > -1) emojiWheelListeners[event].splice(index, 1)
  }
}

/**
 * Set reference to chat input element (called by hud.js)
 * @param {HTMLElement} element - The chat input element
 */
export function setChatInputElement(element) {
  chatInputElement = element
}

/**
 * Check if chat input is focused
 */
function isChatInputFocused() {
  return chatInputElement && document.activeElement === chatInputElement
}

// ============================================================================
// EMOJI WHEEL CONTROLS
// ============================================================================

/**
 * Open the emoji wheel
 */
export function openEmojiWheel() {
  if (emojiWheelOpen) return
  emojiWheelOpen = true
  currentHoveredIndex = -1
  currentHighlightedIndex = -1
  rawMovement.x = 0
  rawMovement.y = 0
  smoothedMovement.x = 0
  smoothedMovement.y = 0
  notifyEmojiWheelListeners('open', null)
}

/**
 * Close the emoji wheel
 */
export function closeEmojiWheel() {
  if (!emojiWheelOpen) return
  emojiWheelOpen = false
  currentHoveredIndex = -1
  notifyEmojiWheelListeners('close', null)
}

/**
 * Toggle the emoji wheel
 */
export function toggleEmojiWheel() {
  if (emojiWheelOpen) {
    closeEmojiWheel()
  } else {
    openEmojiWheel()
  }
}

/**
 * Check if emoji wheel is open
 */
export function isEmojiWheelOpen() {
  return emojiWheelOpen
}

/**
 * Set hovered emoji index (called by hud.js on mouse hover)
 * @param {number} index - Emoji index (0-9) or -1 for none
 */
export function setEmojiHover(index) {
  if (currentHoveredIndex !== index) {
    currentHoveredIndex = index
    notifyEmojiWheelListeners('hover', index)
  }
}

/**
 * Get currently hovered emoji index
 */
export function getEmojiHover() {
  return currentHoveredIndex
}

/**
 * Select emoji by index and send to chat
 * @param {number} index - Emoji index (0-9)
 * @returns {object|null} The message or null
 */
export function selectEmoji(index) {
  const emojiData = EMOJI_CONFIG.emojis[index]
  if (!emojiData) return null
  
  const message = emojiMessage(emojiData.emoji)
  closeEmojiWheel()
  notifyEmojiWheelListeners('select', { index, emoji: emojiData.emoji, message })
  return message
}

/**
 * Select emoji by key (0-9)
 * @param {string} key - Key character
 * @returns {object|null} The message or null
 */
export function selectEmojiByKey(key) {
  const index = EMOJI_CONFIG.emojis.findIndex(e => e.key === key)
  if (index !== -1) {
    return selectEmoji(index)
  }
  return null
}

/**
 * Get emoji data by index
 */
export function getEmojiByIndex(index) {
  return EMOJI_CONFIG.emojis[index] || null
}

/**
 * Get emoji data by key
 */
export function getEmojiByKey(key) {
  return EMOJI_CONFIG.emojis.find(e => e.key === key) || null
}

/**
 * Get emoji configuration
 */
export function getEmojiConfig() {
  return { ...EMOJI_CONFIG, emojis: [...EMOJI_CONFIG.emojis] }
}

/**
 * Calculate emoji position on wheel (for UI to use)
 * @param {number} index - Emoji index (0-9)
 * @returns {object} { x, y } offset from center in pixels
 */
export function getEmojiPosition(index) {
  const total = EMOJI_CONFIG.emojis.length
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2  // Start from top
  return {
    x: Math.cos(angle) * EMOJI_CONFIG.wheelRadius,
    y: Math.sin(angle) * EMOJI_CONFIG.wheelRadius
  }
}

// ============================================================================
// EMOJI WHEEL KEYBOARD HANDLING
// ============================================================================

/**
 * Handle keydown for emoji wheel
 * @param {KeyboardEvent} e - Keyboard event
 * @returns {boolean} True if event was handled
 */
export function handleEmojiKeyDown(e) {
  // Don't handle if typing in chat
  if (isChatInputFocused()) return false
  
  // E key toggles wheel
  if (e.code === 'KeyE') {
    e.preventDefault()
    toggleEmojiWheel()
    return true
  }
  
  // Only handle these when wheel is open
  if (emojiWheelOpen) {
    // Number keys 0-9 select emoji
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      selectEmojiByKey(e.key)
      return true
    }
    
    // Escape closes wheel
    if (e.code === 'Escape') {
      e.preventDefault()
      closeEmojiWheel()
      return true
    }
  }
  
  return false
}

/**
 * Handle keyup for emoji wheel
 * @param {KeyboardEvent} e - Keyboard event
 * @returns {boolean} True if event was handled
 */
export function handleEmojiKeyUp(e) {
  if (e.code === 'KeyE') return true
  if (emojiWheelOpen && e.key >= '0' && e.key <= '9') return true
  return false
}

/**
 * Initialize emoji wheel keyboard listeners automatically
 * Alternative to manually calling handleEmojiKeyDown/Up
 */
export function initEmojiWheelInput() {
  window.addEventListener('keydown', (e) => {
    if (handleEmojiKeyDown(e)) {
      e.stopPropagation()
    }
  })
  
  window.addEventListener('keyup', (e) => {
    if (handleEmojiKeyUp(e)) {
      e.stopPropagation()
    }
  })
}

// ============================================================================
// EMOJI WHEEL CSS (exported for hud.js to inject)
// ============================================================================

export const EMOJI_WHEEL_CSS = `
  #emoji-wheel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 280px;
    height: 280px;
    pointer-events: auto;
    z-index: 2000;
    display: none;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  }
  
  #emoji-wheel.visible {
    display: block;
    opacity: 1;
  }
  
  #emoji-wheel svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  
  .emoji-arc {
    fill: rgba(0, 30, 50, 0.85);
    stroke: rgba(0, 255, 200, 0.3);
    stroke-width: 1.5;
    cursor: pointer;
    transition: fill 0.1s ease-out, stroke 0.1s ease-out;
  }
  
  .emoji-arc:hover,
  .emoji-arc.highlighted {
    fill: rgba(0, 255, 200, 0.6);
    stroke: rgba(0, 255, 200, 0.9);
    stroke-width: 2;
  }
  
  .emoji-label {
    font-size: 24px;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  }
  
  .emoji-key {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 9px;
    fill: rgba(0, 255, 200, 0.5);
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  
  .emoji-arc.highlighted + .emoji-label + .emoji-key,
  .emoji-arc:hover + .emoji-label + .emoji-key {
    fill: rgba(0, 40, 60, 0.9);
  }
  
  #direction-visualizer {
    pointer-events: none;
  }
  
  #direction-line {
    stroke: rgba(0, 255, 200, 0.8);
    stroke-width: 2;
    stroke-linecap: round;
  }
  
  #direction-dot-center {
    fill: rgba(0, 255, 200, 0.9);
  }
  
  #direction-dot-cursor {
    fill: rgba(0, 255, 200, 1);
    filter: drop-shadow(0 0 4px rgba(0, 255, 200, 0.8));
  }
  
  .chat-message.emoji {
    font-size: 24px;
    line-height: 1.2;
  }
  
  .chat-message.emoji .timestamp {
    font-size: 9px;
    vertical-align: middle;
  }
`

// Wheel geometry config
const WHEEL_GEOMETRY = {
  outerRadius: 130,
  innerRadius: 65,
  gapWidth: 8,          // Pixels between segments (parallel gap)
  centerX: 140,
  centerY: 140,
}

// Mouse tracking for direction-based selection
let wheelMouseStart = { x: 0, y: 0 }
let rawMovement = { x: 0, y: 0 }          // Raw accumulated movement (for visualizer)
let smoothedMovement = { x: 0, y: 0 }      // Smoothed movement (for selection)
let currentHighlightedIndex = -1

// Smoothing config
const MOVEMENT_DECAY = 0.75       // How much previous movement carries over (0-1)
const MOVEMENT_SENSITIVITY = 1.5  // Multiplier for new movement
const MIN_MAGNITUDE = 8           // Minimum smoothed magnitude to register
const TETHER_MAX_RADIUS = 40      // Max distance the direction dot can travel from center

/**
 * Get the current raw movement clamped to tether radius (for visualizer)
 * @returns {object} { x, y }
 */
export function getClampedMovement() {
  const mag = Math.sqrt(rawMovement.x ** 2 + rawMovement.y ** 2)
  
  // Clamp to tether radius
  if (mag > TETHER_MAX_RADIUS) {
    const scale = TETHER_MAX_RADIUS / mag
    return {
      x: rawMovement.x * scale,
      y: rawMovement.y * scale
    }
  }
  
  return { x: rawMovement.x, y: rawMovement.y }
}

/**
 * Get tether max radius
 * @returns {number}
 */
export function getTetherRadius() {
  return TETHER_MAX_RADIUS
}

/**
 * Set the starting mouse position when wheel opens (for unlocked cursor)
 * @param {number} x - Mouse X
 * @param {number} y - Mouse Y
 */
export function setWheelMouseStart(x, y) {
  wheelMouseStart.x = x
  wheelMouseStart.y = y
  rawMovement.x = 0
  rawMovement.y = 0
  smoothedMovement.x = 0
  smoothedMovement.y = 0
}

/**
 * Add mouse movement delta (for pointer-locked mode)
 * @param {number} dx - Movement X delta
 * @param {number} dy - Movement Y delta
 */
export function addWheelMovement(dx, dy) {
  // Accumulate raw movement
  rawMovement.x += dx
  rawMovement.y += dy
  
  // Clamp raw movement to tether radius
  const rawMag = Math.sqrt(rawMovement.x ** 2 + rawMovement.y ** 2)
  if (rawMag > TETHER_MAX_RADIUS) {
    const scale = TETHER_MAX_RADIUS / rawMag
    rawMovement.x *= scale
    rawMovement.y *= scale
  }
  
  // Notify visualizer of movement update
  notifyEmojiWheelListeners('movement', getClampedMovement())
  
  // Use raw movement to determine segment (matches visualizer)
  const newIndex = getSegmentFromPosition(rawMovement.x, rawMovement.y)
  if (newIndex !== -1 && newIndex !== currentHighlightedIndex) {
    currentHighlightedIndex = newIndex
    notifyEmojiWheelListeners('hover', newIndex)
  }
}

/**
 * Calculate which segment index based on position/direction relative to center
 * @param {number} dx - X position/direction from center
 * @param {number} dy - Y position/direction from center (screen coords: positive = down)
 * @returns {number} Segment index (0-9) or -1 if too close to center
 */
function getSegmentFromPosition(dx, dy) {
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // Need minimum magnitude to register
  if (distance < MIN_MAGNITUDE) return -1
  
  // Calculate angle using atan2 (screen coords: Y down is positive)
  // atan2 gives: 0Â° = right, 90Â° = down, -90Â° = up, Â±180Â° = left
  let angle = Math.atan2(dy, dx)
  let degrees = angle * (180 / Math.PI)
  
  // Convert to wheel coords: 0Â° = top, going clockwise
  // Add 90 to shift from "right = 0" to "top = 0"
  let wheelDegrees = (degrees + 90 + 360) % 360
  
  // Each segment is 36 degrees
  // Segment 0: 0Â° to 36Â°, Segment 1: 36Â° to 72Â°, etc.
  const segmentIndex = Math.floor(wheelDegrees / 36) % 10
  
  return segmentIndex
}

/**
 * Calculate which segment index based on absolute cursor position (for unlocked cursor)
 * @param {number} mouseX - Current mouse X
 * @param {number} mouseY - Current mouse Y
 * @returns {number} Segment index (0-9) or -1 if too close to start
 */
export function getSegmentFromDirection(mouseX, mouseY) {
  const dx = mouseX - wheelMouseStart.x
  const dy = mouseY - wheelMouseStart.y
  return getSegmentFromPosition(dx, dy)
}

/**
 * Update highlighted segment based on absolute mouse position (for unlocked cursor mode)
 * @param {number} mouseX - Current mouse X  
 * @param {number} mouseY - Current mouse Y
 */
export function updateWheelHighlight(mouseX, mouseY) {
  const newIndex = getSegmentFromDirection(mouseX, mouseY)
  if (newIndex !== currentHighlightedIndex) {
    currentHighlightedIndex = newIndex
    notifyEmojiWheelListeners('hover', newIndex)
  }
}

/**
 * Set highlighted segment directly (for hover on SVG elements)
 * @param {number} index - Segment index or -1
 */
export function setHighlightedSegment(index) {
  if (index !== currentHighlightedIndex) {
    currentHighlightedIndex = index
    notifyEmojiWheelListeners('hover', index)
  }
}

/**
 * Get currently highlighted segment
 * @returns {number} Index or -1
 */
export function getHighlightedSegment() {
  return currentHighlightedIndex
}

/**
 * Reset highlight state (called when wheel opens)
 */
export function resetWheelHighlight() {
  currentHighlightedIndex = -1
  rawMovement.x = 0
  rawMovement.y = 0
  smoothedMovement.x = 0
  smoothedMovement.y = 0
}

/**
 * Select the currently highlighted emoji (for click)
 * @returns {object|null} Message or null
 */
export function selectHighlightedEmoji() {
  if (currentHighlightedIndex >= 0) {
    return selectEmoji(currentHighlightedIndex)
  }
  return null
}

/**
 * Get wheel geometry config for SVG rendering
 * @returns {object} Geometry configuration
 */
export function getWheelGeometry() {
  return { ...WHEEL_GEOMETRY }
}

/**
 * Calculate SVG arc path for a segment with parallel gap edges
 * @param {number} index - Segment index (0-9)
 * @returns {string} SVG path d attribute
 */
export function getSegmentPath(index) {
  const { outerRadius, innerRadius, gapWidth, centerX, centerY } = WHEEL_GEOMETRY
  const segmentAngle = 36  // degrees (360 / 10)
  const halfGap = gapWidth / 2
  
  // Divider angles (where the gaps are centered)
  const startDividerRad = (index * segmentAngle - 90) * (Math.PI / 180)
  const endDividerRad = ((index + 1) * segmentAngle - 90) * (Math.PI / 180)
  
  // For parallel edges, we need to find where lines parallel to the dividers
  // (offset by halfGap) intersect with the inner and outer circles.
  //
  // Positive offset = counter-clockwise from divider
  // Negative offset = clockwise from divider
  //
  // START EDGE: offset INTO this segment (counter-clockwise from start divider)
  // END EDGE: offset INTO this segment (clockwise from end divider)
  
  const startOuter = lineCircleIntersection(startDividerRad, +halfGap, outerRadius, centerX, centerY)
  const startInner = lineCircleIntersection(startDividerRad, +halfGap, innerRadius, centerX, centerY)
  
  const endOuter = lineCircleIntersection(endDividerRad, -halfGap, outerRadius, centerX, centerY)
  const endInner = lineCircleIntersection(endDividerRad, -halfGap, innerRadius, centerX, centerY)
  
  // SVG path: start at outer-start, arc to outer-end, line to inner-end, arc back to inner-start, close
  return `
    M ${startOuter.x} ${startOuter.y}
    A ${outerRadius} ${outerRadius} 0 0 1 ${endOuter.x} ${endOuter.y}
    L ${endInner.x} ${endInner.y}
    A ${innerRadius} ${innerRadius} 0 0 0 ${startInner.x} ${startInner.y}
    Z
  `
}

/**
 * Find intersection of a line parallel to a radial with a circle
 * @param {number} angle - Radial angle in radians
 * @param {number} offset - Perpendicular offset (positive = counter-clockwise)
 * @param {number} radius - Circle radius
 * @param {number} cx - Circle center X
 * @param {number} cy - Circle center Y
 * @returns {object} {x, y} intersection point
 */
function lineCircleIntersection(angle, offset, radius, cx, cy) {
  // Line parallel to radial at angle, offset by 'offset' pixels perpendicular
  // Parametric line: P = offset * perpendicular + t * direction
  // where perpendicular = (-sin(angle), cos(angle)) and direction = (cos(angle), sin(angle))
  //
  // For intersection with circle of radius R:
  // |P|Â² = RÂ²  =>  offsetÂ² + tÂ² = RÂ²  =>  t = sqrt(RÂ² - offsetÂ²)
  
  const t = Math.sqrt(radius * radius - offset * offset)
  
  return {
    x: cx + (-offset * Math.sin(angle) + t * Math.cos(angle)),
    y: cy + (offset * Math.cos(angle) + t * Math.sin(angle))
  }
}

/**
 * Get center position for emoji label in a segment
 * @param {number} index - Segment index (0-9)
 * @returns {object} { x, y } position
 */
export function getSegmentCenter(index) {
  const { outerRadius, innerRadius, centerX, centerY } = WHEEL_GEOMETRY
  const segmentAngle = 36
  const midAngle = (index * segmentAngle + segmentAngle / 2 - 90) * (Math.PI / 180)
  const midRadius = (outerRadius + innerRadius) / 2
  
  return {
    x: centerX + midRadius * Math.cos(midAngle),
    y: centerY + midRadius * Math.sin(midAngle)
  }
}

/**
 * Get position for key hint (slightly toward outer edge)
 * @param {number} index - Segment index (0-9)
 * @returns {object} { x, y } position
 */
export function getSegmentKeyPosition(index) {
  const { outerRadius, innerRadius, centerX, centerY } = WHEEL_GEOMETRY
  const segmentAngle = 36
  const midAngle = (index * segmentAngle + segmentAngle / 2 - 90) * (Math.PI / 180)
  const keyRadius = innerRadius + (outerRadius - innerRadius) * 0.82
  
  return {
    x: centerX + keyRadius * Math.cos(midAngle),
    y: centerY + keyRadius * Math.sin(midAngle)
  }
}

// ============================================================================
// MESSAGE CREATION
// ============================================================================

/**
 * Create a formatted timestamp string
 */
function createTimestamp() {
  return new Date().toLocaleTimeString([], CHAT_CONFIG.timestampFormat)
}

/**
 * Create a message object
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
 */
export function addMessage(text, type = MESSAGE_TYPES.PLAYER, options = {}) {
  const message = createMessage(text, type, options)
  
  chatHistory.push(message)
  
  while (chatHistory.length > CHAT_CONFIG.maxMessages) {
    chatHistory.shift()
  }
  
  notifyListeners(message)
  
  return message
}

/**
 * Add a pre-created message object to history
 */
export function addMessageObject(message) {
  if (!message.id) message.id = generateMessageId()
  if (!message.timestamp) message.timestamp = createTimestamp()
  if (!message.createdAt) message.createdAt = Date.now()
  
  chatHistory.push(message)
  
  while (chatHistory.length > CHAT_CONFIG.maxMessages) {
    chatHistory.shift()
  }
  
  notifyListeners(message)
  
  return message
}

/**
 * Get all messages in history
 */
export function getHistory() {
  return [...chatHistory]
}

/**
 * Get recent messages
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
 */
export function getMessageCount() {
  return chatHistory.length
}

// ============================================================================
// EVENT SYSTEM (for UI updates and multiplayer)
// ============================================================================

/**
 * Subscribe to new messages
 */
export function onMessage(callback) {
  if (typeof callback !== 'function') {
    console.warn('[Chats] onMessage callback must be a function')
    return () => {}
  }
  
  messageListeners.push(callback)
  
  return () => {
    const index = messageListeners.indexOf(callback)
    if (index > -1) messageListeners.splice(index, 1)
  }
}

/**
 * Notify all listeners of a new message
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

export function systemMessage(text) {
  return addMessage(text, MESSAGE_TYPES.SYSTEM)
}

export function eventMessage(text) {
  return addMessage(text, MESSAGE_TYPES.EVENT)
}

export function playerMessage(text, sender = null, senderId = null) {
  return addMessage(text, MESSAGE_TYPES.PLAYER, { sender, senderId })
}

export function remoteMessage(text, sender, senderId) {
  return addMessage(text, MESSAGE_TYPES.REMOTE, { sender, senderId })
}

export function emojiMessage(emoji, sender = null, senderId = null) {
  return addMessage(emoji, MESSAGE_TYPES.EMOJI, { sender, senderId })
}

// ============================================================================
// CONFIGURATION ACCESS
// ============================================================================

export function getConfig() {
  return { ...CHAT_CONFIG }
}

export function setConfig(newConfig) {
  if (newConfig.maxMessages !== undefined) {
    CHAT_CONFIG.maxMessages = Math.max(1, Math.floor(newConfig.maxMessages))
  }
  if (newConfig.timestampFormat !== undefined) {
    CHAT_CONFIG.timestampFormat = newConfig.timestampFormat
  }
}

export function setEmojiConfig(newConfig) {
  if (newConfig.emojis !== undefined && Array.isArray(newConfig.emojis)) {
    EMOJI_CONFIG.emojis = newConfig.emojis.slice(0, 10).map((e, i) => ({
      key: e.key || String((i + 1) % 10),
      emoji: e.emoji || 'â“',
      label: e.label || `Emoji ${i}`
    }))
  }
  if (newConfig.wheelRadius !== undefined) {
    EMOJI_CONFIG.wheelRadius = Math.max(50, Math.min(150, newConfig.wheelRadius))
  }
  if (newConfig.wheelSize !== undefined) {
    EMOJI_CONFIG.wheelSize = Math.max(150, Math.min(400, newConfig.wheelSize))
  }
}

// ============================================================================
// SERIALIZATION (for multiplayer/persistence)
// ============================================================================

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