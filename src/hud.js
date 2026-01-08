import Stats from 'three/examples/jsm/libs/stats.module.js'
import { getPlayer, getCurrentCreature, getPlayerNormalizationInfo, getCurrentVariantDisplayName } from './player.js'
import { Feeding } from './Feeding.js'
import { FishAdder } from './FishAdder.js'
import { camera, getCameraMode } from './camera.js'
import { getActiveCapacityConfig, getActiveAbilityName } from './ExtraControls.js'
import { getSlotInfo } from './stacker.js'
// Import core chat logic (separated for multiplayer support)
import * as Chat from './chats.js'
// Import network manager for remote player detection on radar
import { networkManager } from '../network/NetworkManager.js'

let stats

// DOM Elements
let minimapContainer = null
let minimapCanvas = null
let minimapCtx = null
let infoPanel = null
let chatPanel = null
let chatMessages = null
let chatInput = null
let cursorRing = null
let capacityBar = null
let capacityFill = null

// Proximity chat state
let proximityCheckbox = null
let proximityBubble = null
let proximityBubbleTimeout = null
const PROXIMITY_BUBBLE_DURATION = 4000 // How long bubble stays visible (ms)
const PROXIMITY_BUBBLE_FADE = 300 // Fade out duration (ms)

// Remote player bubble tracking (for multiplayer chat)
const remotePlayerBubbles = new Map() // Map of playerId -> { element, timeout }

// Capacity system state - DEFAULT/FALLBACK config (per-ability configs override these)
// Edit capacity settings in each ability file: sprinter.js, attacker.js, etc.
const DEFAULT_CAPACITY_CONFIG = {
  max: 100,
  depleteRate: 40,   // Units per second when active
  regenRate: 25,     // Units per second when inactive
  regenDelay: 0.5,   // Seconds before regen starts after deactivation
}

// Capacity bar visual settings (easy to edit!)
const CAPACITY_BAR_STYLE = {
  width: 500,         // Bar width in pixels
  height: 12,         // Bar height in pixels
  bottom: 10,         // Distance from bottom of screen
  borderRadius: 8,    // Corner roundness
  borderWidth: 2,     // Border thickness
  opacity: 0.7,       // Default opacity (0-1)
}

// Capacity is initialized on first use - will be set to active ability's max
let currentCapacity = null  // null = not yet initialized
let isCapacityActive = false
let regenDelayTimer = 0

// Track which ability's max we're currently using (to detect ability switches)
let lastAbilityMax = null

// Minimap settings
const MINIMAP_SIZE = 160
const MINIMAP_RANGE = 200 // World units to display
let minimapFontSize = 9 // Base font size for compass text

// Sonar sweep
let sonarAngle = 0
const SONAR_SPEED = 0.5 // Radians per second

// Track pinged dots with unique IDs (each ping is independent)
// Stores: { time, radarX, radarZ, color }
const pingData = new Map()
let pingIdCounter = 0

// Debounce: track last ping time per NPC to prevent multiple pings per sweep
const lastNpcPingTime = new Map()
const PING_DEBOUNCE_MS = 500 // Minimum time between pings for same NPC

// Chat message history - now managed by chats.js module
// (kept here for reference: Chat.getHistory(), Chat.addMessage(), etc.)

export function initHUD() {
  createStyles()
  createFPSCounter()
  createMinimap()
  createInfoPanel()
  createChatPanel()
  createCursorRing()
  createCapacityBar()
  createEmojiWheel()
}

function createStyles() {
  const style = document.createElement('style')
  style.textContent = `
    .hud-panel {
      position: absolute;
      background: rgba(0, 20, 40, 0.75);
      border: 1px solid rgba(0, 255, 200, 0.3);
      border-radius: 4px;
      color: #00ffc8;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      backdrop-filter: blur(4px);
      pointer-events: auto;
      min-width: 100px;
      min-height: 60px;
    }
    
    .hud-title {
      background: rgba(0, 255, 200, 0.15);
      padding: 4px 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid rgba(0, 255, 200, 0.2);
      cursor: move;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .hud-title-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .hud-title-controls .font-btn {
      opacity: 0.5;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      transition: opacity 0.2s;
      line-height: 1;
      padding: 0 2px;
      user-select: none;
    }
    
    .hud-title-controls .font-btn:hover {
      opacity: 1;
    }
    
    .hud-title-controls .grip {
      opacity: 0.4;
      font-size: 10px;
      letter-spacing: 1px;
    }
    
    .hud-title-controls .collapse-btn {
      opacity: 0.5;
      font-size: 8px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
      line-height: 1;
    }
    
    .hud-title-controls .collapse-btn:hover {
      opacity: 1;
    }
    
    .hud-panel.collapsed .collapse-btn {
      transform: rotate(180deg);
    }
    
    /* Collapsible content wrappers */
    .hud-collapsible {
      overflow: hidden;
      transition: max-height 0.3s ease, opacity 0.2s ease;
      max-height: 500px;
      opacity: 1;
    }
    
    .hud-panel.collapsed .hud-collapsible {
      max-height: 0;
      opacity: 0;
    }
    
    .hud-panel.collapsed {
      min-height: auto !important;
    }
    
    .hud-panel.collapsed .resize-handle {
      display: none;
    }
    
    /* Resize handle - default bottom-right */
    .resize-handle {
      position: absolute;
      width: 12px;
      height: 12px;
      bottom: 0;
      right: 0;
      cursor: nwse-resize;
      opacity: 0.4;
      transition: opacity 0.2s;
    }
    
    .resize-handle::before {
      content: '';
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 8px;
      height: 8px;
      border-right: 2px solid #00ffc8;
      border-bottom: 2px solid #00ffc8;
    }
    
    .hud-panel:hover .resize-handle {
      opacity: 0.8;
    }
    
    /* Info Panel - resize handle on bottom-left (inner corner) */
    #info-panel .resize-handle {
      right: auto;
      left: 0;
      cursor: nesw-resize;
    }
    
    #info-panel .resize-handle::before {
      right: auto;
      left: 2px;
      border-right: none;
      border-left: 2px solid #00ffc8;
    }
    
    /* Minimap - resize handle on top-left (inner corner) */
    #minimap-container .resize-handle {
      bottom: auto;
      top: 0;
      right: auto;
      left: 0;
      cursor: nwse-resize;
    }
    
    #minimap-container .resize-handle::before {
      bottom: auto;
      top: 2px;
      right: auto;
      left: 2px;
      border-right: none;
      border-bottom: none;
      border-left: 2px solid #00ffc8;
      border-top: 2px solid #00ffc8;
    }
    
    /* Minimap - Lower Right */
    #minimap-container {
      right: 10px;
      bottom: 10px;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    
    #minimap-canvas-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    #minimap-canvas {
      display: block;
    }
    
    /* Info Panel - Upper Right */
    #info-panel {
      right: 10px;
      top: 10px;
      width: 200px;
      min-height: 120px;
    }
    
    #info-panel .info-content {
      padding: 8px;
    }
    
    #info-panel .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    
    #info-panel .info-label {
      color: rgba(0, 255, 200, 0.6);
    }
    
    #info-panel .info-value {
      color: #00ffc8;
      font-weight: bold;
    }
    
    #info-panel .info-divider {
      border-top: 1px solid rgba(0, 255, 200, 0.2);
      margin: 6px 0;
    }
    
    /* Chat Panel - Upper Left */
    #chat-panel {
      left: 10px;
      top: 10px;
      width: 280px;
    }
    
    #chat-panel .hud-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    #chat-panel .hud-title-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .proximity-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      opacity: 0.7;
      cursor: pointer;
      user-select: none;
    }
    
    .proximity-toggle:hover {
      opacity: 1;
    }
    
    .proximity-toggle input[type="checkbox"] {
      display: none;
    }
    
    .proximity-toggle .checkbox-icon {
      font-size: 12px;
      cursor: pointer;
    }
    
    .proximity-toggle label {
      cursor: pointer;
    }
    
    #chat-panel .hud-collapsible {
      display: flex;
      flex-direction: column;
      height: 150px;
    }
    
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      font-size: var(--chat-font-size, 11px);
    }
    
    #chat-messages::-webkit-scrollbar {
      width: 4px;
    }
    
    #chat-messages::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    
    #chat-messages::-webkit-scrollbar-thumb {
      background: rgba(0, 255, 200, 0.3);
      border-radius: 2px;
    }
    
    .chat-message {
      margin-bottom: 4px;
      line-height: 1.3;
    }
    
    .chat-message.system {
      color: rgba(0, 255, 200, 0.5);
      font-style: italic;
    }
    
    .chat-message.event {
      color: #ffcc00;
    }
    
    .chat-message .timestamp {
      color: rgba(0, 255, 200, 0.4);
      font-size: 0.82em;
      margin-right: 4px;
    }
    
    #chat-input-container {
      border-top: 1px solid rgba(0, 255, 200, 0.2);
      padding: 4px;
    }
    
    #chat-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(0, 255, 200, 0.2);
      border-radius: 2px;
      color: #00ffc8;
      font-family: inherit;
      font-size: var(--chat-font-size, 11px);
      padding: 4px 6px;
      outline: none;
      box-sizing: border-box;
    }
    
    #chat-input:focus {
      border-color: rgba(0, 255, 200, 0.5);
      background: rgba(0, 0, 0, 0.5);
    }
    
    #chat-input::placeholder {
      color: rgba(0, 255, 200, 0.3);
    }
    
    .hud-panel.dragging {
      opacity: 0.8;
      z-index: 1000;
    }
    
    .hud-panel.resizing {
      opacity: 0.9;
    }
    
    /* Cursor Ring - Sprint color ring that appears only when zoomed in */
    #cursor-ring {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 24px;
      height: 24px;
      border: 2px solid #00ffaa;
      border-radius: 50%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease-out;
      box-shadow: 0 0 8px rgba(0, 255, 170, 0.4);
      z-index: 9999;
    }
    
    #cursor-ring.visible {
      opacity: 0.8;
    }
    
    /* Capacity Bar - Lower center of screen */
    #capacity-bar {
      position: fixed;
      bottom: ${CAPACITY_BAR_STYLE.bottom}px;
      left: 50%;
      transform: translateX(-50%);
      width: ${CAPACITY_BAR_STYLE.width}px;
      height: ${CAPACITY_BAR_STYLE.height}px;
      background: rgba(0, 20, 40, 0.8);
      border: ${CAPACITY_BAR_STYLE.borderWidth}px solid rgba(0, 255, 170, 0.3);
      border-radius: ${CAPACITY_BAR_STYLE.borderRadius}px;
      overflow: visible;
      pointer-events: none;
      opacity: ${CAPACITY_BAR_STYLE.opacity};
      transition: opacity 0.2s ease-out;
      z-index: 100;
    }
    
    #capacity-bar:hover {
      opacity: 1;
    }
    
    #capacity-bar.active {
      border-color: rgba(0, 255, 170, 0.6);
      box-shadow: 0 0 15px rgba(0, 255, 170, 0.3);
    }
    
    #capacity-bar.depleted {
      border-color: rgba(255, 100, 100, 0.5);
    }
    
    #capacity-fill {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #00ffaa 0%, #00ddaa 100%);
      border-radius: ${CAPACITY_BAR_STYLE.borderRadius - 2}px;
      transition: width 0.05s linear;
      box-shadow: 0 0 10px rgba(0, 255, 170, 0.5);
    }
    
    #capacity-bar.depleted #capacity-fill {
      background: linear-gradient(90deg, #ff6666 0%, #ff4444 100%);
      box-shadow: 0 0 10px rgba(255, 100, 100, 0.5);
    }
    
    #capacity-bar.regenerating #capacity-fill {
      background: linear-gradient(90deg, #00ffaa 0%, #88ffcc 100%);
    }
    
    /* Stacker segmented capacity display */
    #capacity-segments {
      display: flex;
      gap: 4px;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
    }
    
    .capacity-segment {
      flex: 1;
      height: 100%;
      background: rgba(0, 40, 60, 0.5);
      border-radius: ${CAPACITY_BAR_STYLE.borderRadius - 2}px;
      overflow: hidden;
    }
    
    .capacity-segment-fill {
      height: 100%;
      background: linear-gradient(90deg, #00ffaa 0%, #00ddaa 100%);
      transition: width 0.1s linear;
    }
    
    /* Proximity Chat Bubble - floats near player in 3D space */
    .proximity-bubble {
      position: fixed;
      background: rgba(0, 20, 40, 0.9);
      border: 1px solid rgba(0, 255, 200, 0.5);
      border-radius: 8px;
      padding: 6px 12px;
      color: #00ffc8;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      max-width: 200px;
      word-wrap: break-word;
      pointer-events: none;
      z-index: 1000;
      transform: translate(-50%, -100%);
      opacity: 1;
      transition: opacity 0.3s ease-out;
      box-shadow: 0 0 10px rgba(0, 255, 200, 0.3);
    }
    
    .proximity-bubble::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid rgba(0, 255, 200, 0.5);
    }
    
    .proximity-bubble.fading {
      opacity: 0;
    }
    
    ${Chat.EMOJI_WHEEL_CSS}
  `
  document.head.appendChild(style)
}

// ============================================================================
// DRAG & RESIZE FUNCTIONALITY
// ============================================================================

function makeDraggable(panel) {
  const titleBar = panel.querySelector('.hud-title')
  if (!titleBar) return
  
  let isDragging = false
  let startX, startY, startLeft, startTop
  
  titleBar.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT') return
    
    isDragging = true
    panel.classList.add('dragging')
    
    // Get current position
    const rect = panel.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    startLeft = rect.left
    startTop = rect.top
    
    // Clear any right/bottom positioning and switch to left/top
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.left = startLeft + 'px'
    panel.style.top = startTop + 'px'
    
    e.preventDefault()
  })
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    
    let newLeft = startLeft + dx
    let newTop = startTop + dy
    
    // Constrain to viewport
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth))
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight))
    
    panel.style.left = newLeft + 'px'
    panel.style.top = newTop + 'px'
  })
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      panel.classList.remove('dragging')
    }
  })
}

function makeResizable(panel, onResize, corner = 'bottom-right') {
  const handle = document.createElement('div')
  handle.className = 'resize-handle'
  panel.appendChild(handle)
  
  let isResizing = false
  let startX, startY, startWidth, startHeight
  
  handle.addEventListener('mousedown', (e) => {
    isResizing = true
    panel.classList.add('resizing')
    
    const rect = panel.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    startWidth = rect.width
    startHeight = rect.height
    
    // Normalize positioning based on which corner is the resize handle
    // The opposite corner should stay anchored
    if (corner === 'bottom-left') {
      // Handle at bottom-left, anchor top-right
      panel.style.left = 'auto'
      panel.style.bottom = 'auto'
      panel.style.right = (window.innerWidth - rect.right) + 'px'
      panel.style.top = rect.top + 'px'
    } else if (corner === 'top-left') {
      // Handle at top-left, anchor bottom-right
      panel.style.left = 'auto'
      panel.style.top = 'auto'
      panel.style.right = (window.innerWidth - rect.right) + 'px'
      panel.style.bottom = (window.innerHeight - rect.bottom) + 'px'
    } else {
      // Default bottom-right: anchor top-left
      panel.style.right = 'auto'
      panel.style.bottom = 'auto'
      panel.style.left = rect.left + 'px'
      panel.style.top = rect.top + 'px'
    }
    
    // Set explicit dimensions
    panel.style.width = startWidth + 'px'
    panel.style.height = startHeight + 'px'
    
    e.preventDefault()
    e.stopPropagation()
  })
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return
    
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    
    let newWidth, newHeight
    
    // Handle different corner directions
    if (corner === 'bottom-left') {
      // Dragging left increases width, dragging down increases height
      newWidth = Math.max(100, startWidth - dx)
      newHeight = Math.max(60, startHeight + dy)
    } else if (corner === 'top-left') {
      // Dragging left increases width, dragging up increases height
      newWidth = Math.max(100, startWidth - dx)
      newHeight = Math.max(60, startHeight - dy)
    } else {
      // Default bottom-right: dragging right increases width, dragging down increases height
      newWidth = Math.max(100, startWidth + dx)
      newHeight = Math.max(60, startHeight + dy)
    }
    
    panel.style.width = newWidth + 'px'
    panel.style.height = newHeight + 'px'
    
    if (onResize) {
      onResize(newWidth, newHeight)
    }
  })
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      panel.classList.remove('resizing')
    }
  })
}

function makeCollapsible(panel) {
  const collapseBtn = panel.querySelector('.collapse-btn')
  if (!collapseBtn) return
  
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    panel.classList.toggle('collapsed')
  })
}

function makeFontResizable(panel) {
  const decreaseBtn = panel.querySelector('.font-decrease')
  const increaseBtn = panel.querySelector('.font-increase')
  if (!decreaseBtn || !increaseBtn) return
  
  // Get the content area (not the title)
  const content = panel.querySelector('.hud-collapsible') || panel
  
  // Check panel type
  const isMinimap = panel.id === 'minimap-container'
  const isChat = panel.id === 'chat-panel'
  
  // Track current font size based on panel type
  let currentSize = isMinimap ? 9 : (isChat ? 11 : 12)
  const minSize = isMinimap ? 6 : 8
  const maxSize = isMinimap ? 16 : 20
  const step = 1
  
  const updateFontSizes = () => {
    if (isMinimap) {
      // Update the module-level variable used by canvas drawing
      minimapFontSize = currentSize
    } else if (isChat) {
      // Use CSS custom property for chat (handles dynamic content)
      panel.style.setProperty('--chat-font-size', currentSize + 'px')
    } else {
      // Standard font-size for other panels
      content.style.fontSize = currentSize + 'px'
    }
  }
  
  decreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (currentSize > minSize) {
      currentSize -= step
      updateFontSizes()
    }
  })
  
  increaseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (currentSize < maxSize) {
      currentSize += step
      updateFontSizes()
    }
  })
}

function createFPSCounter() {
  stats = new Stats()
  stats.showPanel(0)
  
  // Position in lower left corner with margin matching other panels
  stats.dom.style.position = 'absolute'
  stats.dom.style.left = '10px'
  stats.dom.style.top = 'auto'
  stats.dom.style.bottom = '10px'
  
  document.body.appendChild(stats.dom)
}

function createMinimap() {
  minimapContainer = document.createElement('div')
  minimapContainer.id = 'minimap-container'
  minimapContainer.className = 'hud-panel'
  
  const title = document.createElement('div')
  title.className = 'hud-title'
  title.innerHTML = '<span>Map</span><span class="hud-title-controls"><span class="font-btn font-decrease">-</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span>'
  
  const collapsible = document.createElement('div')
  collapsible.className = 'hud-collapsible'
  
  const canvasWrapper = document.createElement('div')
  canvasWrapper.id = 'minimap-canvas-wrapper'
  
  minimapCanvas = document.createElement('canvas')
  minimapCanvas.id = 'minimap-canvas'
  minimapCanvas.width = MINIMAP_SIZE
  minimapCanvas.height = MINIMAP_SIZE
  
  canvasWrapper.appendChild(minimapCanvas)
  collapsible.appendChild(canvasWrapper)
  minimapContainer.appendChild(title)
  minimapContainer.appendChild(collapsible)
  document.body.appendChild(minimapContainer)
  
  minimapCtx = minimapCanvas.getContext('2d')
  
  // Make draggable, resizable, collapsible, and font-resizable
  makeDraggable(minimapContainer)
  makeResizable(minimapContainer, (width, height) => {
    // Resize canvas to match panel (minus title bar height)
    const titleHeight = title.offsetHeight
    const availableWidth = width - 4
    const availableHeight = height - titleHeight - 4
    const newSize = Math.min(availableWidth, availableHeight)
    if (newSize > 50) {
      minimapCanvas.width = newSize
      minimapCanvas.height = newSize
    }
  }, 'top-left')
  makeCollapsible(minimapContainer)
  makeFontResizable(minimapContainer)
}

function createInfoPanel() {
  infoPanel = document.createElement('div')
  infoPanel.id = 'info-panel'
  infoPanel.className = 'hud-panel'
  
  infoPanel.innerHTML = `
    <div class="hud-title"><span>Info</span><span class="hud-title-controls"><span class="font-btn font-decrease">-</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span></div>
    <div class="hud-collapsible">
      <div class="info-content">
        <div class="info-row">
          <span class="info-label">Species</span>
          <span class="info-value" id="info-species">---</span>
        </div>
        <div class="info-row">
          <span class="info-label">Size</span>
          <span class="info-value" id="info-size">---</span>
        </div>
        <div class="info-row">
          <span class="info-label">Depth</span>
          <span class="info-value" id="info-depth">---</span>
        </div>
        <div class="info-divider"></div>
        <div class="info-row">
          <span class="info-label">Eaten</span>
          <span class="info-value" id="info-eaten">0</span>
        </div>
        <div class="info-row">
          <span class="info-label">Nearby</span>
          <span class="info-value" id="info-nearby">0</span>
        </div>
        <div class="info-row">
          <span class="info-label">Population</span>
          <span class="info-value" id="info-population">0</span>
        </div>
      </div>
    </div>
  `
  
  document.body.appendChild(infoPanel)
  
  // Make draggable, resizable, collapsible, and font-resizable
  makeDraggable(infoPanel)
  makeResizable(infoPanel, null, 'bottom-left')
  makeCollapsible(infoPanel)
  makeFontResizable(infoPanel)
}

function createChatPanel() {
  chatPanel = document.createElement('div')
  chatPanel.id = 'chat-panel'
  chatPanel.className = 'hud-panel'
  
  chatPanel.innerHTML = `
    <div class="hud-title">
      <span class="hud-title-left">
        <span>Chat</span>
        <span class="proximity-toggle">| <label for="proximity-checkbox">Proximity</label><input type="checkbox" id="proximity-checkbox" checked /><span class="checkbox-icon">☑</span></span>
      </span>
      <span class="hud-title-controls"><span class="font-btn font-decrease">-</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span>
    </div>
    <div class="hud-collapsible">
      <div id="chat-messages"></div>
      <div id="chat-input-container">
        <input type="text" id="chat-input" placeholder="Press Enter to chat..." />
      </div>
    </div>
  `
  
  document.body.appendChild(chatPanel)
  
  chatMessages = document.getElementById('chat-messages')
  chatInput = document.getElementById('chat-input')
  proximityCheckbox = document.getElementById('proximity-checkbox')
  const checkboxIcon = chatPanel.querySelector('.checkbox-icon')
  
  // Toggle unicode checkbox icon when checkbox changes
  proximityCheckbox.addEventListener('change', () => {
    checkboxIcon.textContent = proximityCheckbox.checked ? '☑' : '☐'
  })
  
  // Click on icon toggles checkbox
  checkboxIcon.addEventListener('click', () => {
    proximityCheckbox.checked = !proximityCheckbox.checked
    checkboxIcon.textContent = proximityCheckbox.checked ? '☑' : '☐'
  })
  
  // Global Enter key to focus chat input
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement !== chatInput) {
      e.preventDefault()
      chatInput.focus()
    }
  })
  
  // Create proximity bubble element (hidden by default)
  proximityBubble = document.createElement('div')
  proximityBubble.className = 'proximity-bubble'
  proximityBubble.style.display = 'none'
  document.body.appendChild(proximityBubble)
  
  // Subscribe to chat messages for UI rendering
  // This allows the core chat logic (chats.js) to be decoupled from the UI
  Chat.onMessage(renderChatMessage)
  
  // Subscribe to remote chat messages from network
  if (networkManager) {
    networkManager.onChatMessage((data) => {
      // data contains: senderId, sender (name), text, isEmoji
      if (data.isEmoji) {
        Chat.emojiMessage(data.text, data.sender, data.senderId)
      } else {
        Chat.remoteMessage(data.text, data.sender, data.senderId)
      }
      // Show proximity bubble above the remote player's fish
      showRemotePlayerBubble(data.senderId, data.text)
    })
  }
  
  // Chat input handling
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      const message = chatInput.value.trim()
      addChatMessage(message, 'player')
      
      // Send over network if connected
      if (networkManager && networkManager.isConnected()) {
        networkManager.sendChatMessage(message, false)
      }
      
      // Show proximity bubble if checkbox is checked
      if (proximityCheckbox.checked) {
        showProximityBubble(message)
      }
      
      chatInput.value = ''
      chatInput.blur()
    }
    if (e.key === 'Escape') {
      chatInput.blur()
    }
    e.stopPropagation() // Prevent game controls while typing
  })
  
  // Prevent game input while focused
  chatInput.addEventListener('keyup', (e) => e.stopPropagation())
  chatInput.addEventListener('keypress', (e) => e.stopPropagation())
  
  // Welcome message
  Chat.systemMessage('Welcome to the ocean!')
  
  // Make draggable, resizable, collapsible, and font-resizable
  makeDraggable(chatPanel)
  makeResizable(chatPanel)
  makeCollapsible(chatPanel)
  makeFontResizable(chatPanel)
}

function createCursorRing() {
  cursorRing = document.createElement('div')
  cursorRing.id = 'cursor-ring'
  document.body.appendChild(cursorRing)
}

function updateCursorRing() {
  if (!cursorRing) return
  
  // Only show cursor ring when camera is in first-person mode (completely zoomed in)
  const cameraMode = getCameraMode()
  const shouldShow = cameraMode === 'first-person'
  
  if (shouldShow) {
    cursorRing.classList.add('visible')
  } else {
    cursorRing.classList.remove('visible')
  }
}

function createCapacityBar() {
  capacityBar = document.createElement('div')
  capacityBar.id = 'capacity-bar'
  
  // Normal single fill (for most abilities)
  capacityFill = document.createElement('div')
  capacityFill.id = 'capacity-fill'
  capacityBar.appendChild(capacityFill)
  
  // Segmented container (for stacker - 5 slots)
  const segmentContainer = document.createElement('div')
  segmentContainer.id = 'capacity-segments'
  // CSS handles the styling
  
  // Create 5 segment slots
  const numSlots = 5
  
  for (let i = 0; i < numSlots; i++) {
    const segment = document.createElement('div')
    segment.className = 'capacity-segment'
    
    const segmentFill = document.createElement('div')
    segmentFill.className = 'capacity-segment-fill'
    segmentFill.dataset.slot = i
    
    segment.appendChild(segmentFill)
    segmentContainer.appendChild(segment)
  }
  
  capacityBar.appendChild(segmentContainer)
  document.body.appendChild(capacityBar)
}

// ============================================================================
// EMOJI WHEEL (logic in chats.js, this is just DOM creation)
// ============================================================================

function createEmojiWheel() {
  const config = Chat.getEmojiConfig()
  const geo = Chat.getWheelGeometry()
  
  // Create wheel container
  const wheel = document.createElement('div')
  wheel.id = 'emoji-wheel'
  
  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${geo.centerX * 2} ${geo.centerY * 2}`)
  
  // Store arc elements for highlighting
  const arcElements = []
  
  // Create segments
  for (let i = 0; i < config.emojis.length; i++) {
    const emoji = config.emojis[i]
    
    // Create group for this segment
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    
    // Arc path
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    arc.setAttribute('d', Chat.getSegmentPath(i))
    arc.setAttribute('class', 'emoji-arc')
    arc.dataset.index = i
    
    // Hover handlers for unlocked cursor mode
    arc.addEventListener('mouseenter', () => {
      // Only use hover when pointer is NOT locked
      if (!document.pointerLockElement) {
        Chat.setHighlightedSegment(i)
      }
    })
    
    arc.addEventListener('mouseleave', () => {
      if (!document.pointerLockElement) {
        // Only clear if we're still the highlighted one
        if (Chat.getHighlightedSegment() === i) {
          Chat.setHighlightedSegment(-1)
        }
      }
    })
    
    // Click on arc selects it (for unlocked cursor mode)
    arc.addEventListener('click', (e) => {
      e.stopPropagation()
      Chat.selectEmoji(i)
    })
    
    group.appendChild(arc)
    arcElements.push(arc)
    
    // Emoji label
    const center = Chat.getSegmentCenter(i)
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', center.x)
    label.setAttribute('y', center.y)
    label.setAttribute('class', 'emoji-label')
    label.textContent = emoji.emoji
    group.appendChild(label)
    
    // Key hint
    const keyPos = Chat.getSegmentKeyPosition(i)
    const keyHint = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    keyHint.setAttribute('x', keyPos.x)
    keyHint.setAttribute('y', keyPos.y)
    keyHint.setAttribute('class', 'emoji-key')
    keyHint.textContent = emoji.key
    group.appendChild(keyHint)
    
    svg.appendChild(group)
  }
  
  // Create direction visualizer (for pointer-locked mode)
  const visualizerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  visualizerGroup.id = 'direction-visualizer'
  
  const directionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  directionLine.id = 'direction-line'
  directionLine.setAttribute('x1', geo.centerX)
  directionLine.setAttribute('y1', geo.centerY)
  directionLine.setAttribute('x2', geo.centerX)
  directionLine.setAttribute('y2', geo.centerY)
  visualizerGroup.appendChild(directionLine)
  
  const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  centerDot.id = 'direction-dot-center'
  centerDot.setAttribute('cx', geo.centerX)
  centerDot.setAttribute('cy', geo.centerY)
  centerDot.setAttribute('r', 4)
  visualizerGroup.appendChild(centerDot)
  
  const cursorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  cursorDot.id = 'direction-dot-cursor'
  cursorDot.setAttribute('cx', geo.centerX)
  cursorDot.setAttribute('cy', geo.centerY)
  cursorDot.setAttribute('r', 6)
  visualizerGroup.appendChild(cursorDot)
  
  svg.appendChild(visualizerGroup)
  
  wheel.appendChild(svg)
  
  // Click in center area closes wheel
  wheel.addEventListener('click', (e) => {
    if (e.target === wheel || e.target === svg) {
      // Check if click is in center (empty area)
      const rect = wheel.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const innerRadiusPixels = geo.innerRadius * (rect.width / (geo.centerX * 2))
      
      if (dist < innerRadiusPixels) {
        Chat.closeEmojiWheel()
      }
    }
  })
  
  document.body.appendChild(wheel)
  
  // Subscribe to Chat events
  Chat.onEmojiWheel('open', () => {
    wheel.classList.add('visible')
    // Reset highlight and visualizer
    arcElements.forEach(arc => arc.classList.remove('highlighted'))
    directionLine.setAttribute('x2', geo.centerX)
    directionLine.setAttribute('y2', geo.centerY)
    cursorDot.setAttribute('cx', geo.centerX)
    cursorDot.setAttribute('cy', geo.centerY)
  })
  
  Chat.onEmojiWheel('close', () => {
    wheel.classList.remove('visible')
  })
  
  Chat.onEmojiWheel('hover', (index) => {
    // Update arc highlighting
    arcElements.forEach((arc, i) => {
      arc.classList.toggle('highlighted', i === index)
    })
  })
  
  Chat.onEmojiWheel('movement', (movement) => {
    // Update direction visualizer
    const targetX = geo.centerX + movement.x
    const targetY = geo.centerY + movement.y
    
    directionLine.setAttribute('x2', targetX)
    directionLine.setAttribute('y2', targetY)
    cursorDot.setAttribute('cx', targetX)
    cursorDot.setAttribute('cy', targetY)
  })
  
  // Show proximity bubble on emoji select and send over network
  Chat.onEmojiWheel('select', (data) => {
    if (proximityCheckbox && proximityCheckbox.checked) {
      showProximityBubble(data.emoji)
    }
    // Send emoji over network if connected
    if (networkManager && networkManager.isConnected()) {
      networkManager.sendChatMessage(data.emoji, true)
    }
  })
  
  // Tell Chat module about the chat input element
  Chat.setChatInputElement(chatInput)
}

function updateCapacityBar(delta) {
  if (!capacityBar || !capacityFill) return
  
  const abilityName = getActiveAbilityName()
  const isStacker = abilityName === 'stacker'
  
  // Toggle between normal and segmented display
  const segmentContainer = document.getElementById('capacity-segments')
  if (segmentContainer) {
    segmentContainer.style.display = isStacker ? 'flex' : 'none'
    capacityFill.style.display = isStacker ? 'none' : 'block'
  }
  
  if (isStacker) {
    // Update segmented display for stacker
    updateStackerSegments()
    return
  }
  
  // Normal capacity bar logic for other abilities
  const config = getActiveCapacityConfig()
  
  // Initialize capacity on first run, or handle ability switch
  if (currentCapacity === null) {
    currentCapacity = config.max
    lastAbilityMax = config.max
  } else if (lastAbilityMax !== config.max) {
    const percent = currentCapacity / lastAbilityMax
    currentCapacity = percent * config.max
    lastAbilityMax = config.max
    console.log(`[Capacity] Ability switched - scaled to ${currentCapacity.toFixed(1)}/${config.max}`)
  }
  
  if (isCapacityActive) {
    currentCapacity -= config.depleteRate * delta
    currentCapacity = Math.max(0, currentCapacity)
    regenDelayTimer = 0
    
    capacityBar.classList.add('active')
    capacityBar.classList.remove('regenerating')
    
    if (currentCapacity <= 0) {
      capacityBar.classList.add('depleted')
    }
  } else {
    capacityBar.classList.remove('active')
    
    if (currentCapacity < config.max) {
      regenDelayTimer += delta
      
      if (regenDelayTimer >= config.regenDelay) {
        capacityBar.classList.add('regenerating')
        currentCapacity += config.regenRate * delta
        currentCapacity = Math.min(config.max, currentCapacity)
      }
    } else {
      capacityBar.classList.remove('regenerating')
    }
    
    if (currentCapacity > 10) {
      capacityBar.classList.remove('depleted')
    }
  }
  
  const percent = (currentCapacity / config.max) * 100
  capacityFill.style.width = percent + '%'
}

/**
 * Update stacker's segmented capacity display
 */
function updateStackerSegments() {
  const slots = getSlotInfo()
  if (!slots) return
  
  const fills = document.querySelectorAll('.capacity-segment-fill')
  
  for (let i = 0; i < slots.length && i < fills.length; i++) {
    const slot = slots[i]
    const fill = fills[i]
    if (!fill) continue
    
    // Update fill width based on slot capacity
    fill.style.width = slot.capacity + '%'
    
    // Keep same green color for all states (as requested)
    // Just vary the glow intensity based on state
    if (slot.state === 'ready') {
      fill.style.boxShadow = '0 0 10px rgba(0, 255, 170, 0.5)'
    } else if (slot.state === 'active') {
      fill.style.boxShadow = '0 0 15px rgba(0, 255, 170, 0.7)'
    } else {
      fill.style.boxShadow = '0 0 5px rgba(0, 255, 170, 0.3)'
    }
  }
}

// ============================================================================
// CAPACITY SYSTEM EXPORTS
// ============================================================================

/**
 * Activate capacity consumption (called when Q is pressed)
 */
export function activateCapacity() {
  // Initialize if needed
  if (currentCapacity === null) {
    const config = getActiveCapacityConfig()
    currentCapacity = config.max
    lastAbilityMax = config.max
  }
  
  if (currentCapacity > 0) {
    isCapacityActive = true
    return true
  }
  return false
}

/**
 * Deactivate capacity consumption (called when Q is released)
 */
export function deactivateCapacity() {
  isCapacityActive = false
}

/**
 * Check if there's enough capacity to use ability
 */
export function hasCapacity() {
  // Initialize if needed
  if (currentCapacity === null) {
    const config = getActiveCapacityConfig()
    currentCapacity = config.max
    lastAbilityMax = config.max
  }
  return currentCapacity > 0
}

/**
 * Get current capacity as percentage (0-100)
 */
export function getCapacityPercent() {
  const config = getActiveCapacityConfig()
  if (currentCapacity === null) return 100
  return (currentCapacity / config.max) * 100
}

/**
 * Check if capacity system is currently active (depleting)
 */
export function isCapacityDepleting() {
  return isCapacityActive
}

/**
 * Consume a specific amount of capacity instantly (for one-time costs)
 * @param {number} amount - Amount to consume (0-100 scale)
 * @returns {boolean} - True if had enough capacity and consumed
 */
export function consumeCapacity(amount) {
  // Initialize if needed
  if (currentCapacity === null) {
    const config = getActiveCapacityConfig()
    currentCapacity = config.max
    lastAbilityMax = config.max
  }
  
  if (currentCapacity < amount) {
    return false
  }
  currentCapacity = Math.max(0, currentCapacity - amount)
  regenDelayTimer = 0  // Reset regen delay
  return true
}

/**
 * Set whether capacity is actively depleting (for toggle abilities)
 * Unlike activateCapacity, this can be called from ability code directly
 * @param {boolean} depleting - Whether capacity should be depleting
 */
export function setCapacityDepleting(depleting) {
  isCapacityActive = depleting
}

/**
 * Reset capacity to full (for the current ability's max)
 */
export function resetCapacity() {
  const config = getActiveCapacityConfig()
  currentCapacity = config.max
  lastAbilityMax = config.max
  regenDelayTimer = 0
  isCapacityActive = false
}

/**
 * Restore a specific amount of capacity (for abilities like stacker where
 * capacity is restored when objects despawn)
 * @param {number} amount - Amount to restore
 */
export function restoreCapacity(amount) {
  const config = getActiveCapacityConfig()
  
  // Initialize if needed
  if (currentCapacity === null) {
    currentCapacity = config.max
    lastAbilityMax = config.max
    return
  }
  
  currentCapacity = Math.min(config.max, currentCapacity + amount)
  console.log(`[Capacity] Restored ${amount.toFixed(1)} -> ${currentCapacity.toFixed(1)}/${config.max}`)
}

/**
 * Get the capacity config (for calculating per-use costs)
 * Returns the current ability's config
 */
export function getCapacityConfig() {
  return { ...getActiveCapacityConfig() }
}

/**
 * Add a chat message
 * Core logic is handled by chats.js, this handles UI rendering
 * @param {string} text - Message text
 * @param {string} type - Message type ('player', 'system', 'event')
 */
export function addChatMessage(text, type = 'player') {
  // Add message using the core chat module
  // The UI rendering is handled by the message listener set up in initChatPanel()
  Chat.addMessage(text, type)
}

/**
 * Render a message to the chat DOM
 * Called by the Chat module's message listener
 * @param {object} message - Message object from chats.js
 */
function renderChatMessage(message) {
  if (!chatMessages) return
  
  const msgEl = document.createElement('div')
  msgEl.className = 'chat-message ' + message.type
  msgEl.innerHTML = '<span class="timestamp">' + message.timestamp + '</span>' + message.text
  chatMessages.appendChild(msgEl)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

/**
 * Show a proximity chat bubble near the player
 * @param {string} text - The message to display
 */
function showProximityBubble(text) {
  if (!proximityBubble) return
  
  // Clear any existing timeout
  if (proximityBubbleTimeout) {
    clearTimeout(proximityBubbleTimeout)
    proximityBubble.classList.remove('fading')
  }
  
  // Set the message and show the bubble
  proximityBubble.textContent = text
  proximityBubble.style.display = 'block'
  
  // Start fade out after duration
  proximityBubbleTimeout = setTimeout(() => {
    proximityBubble.classList.add('fading')
    
    // Hide completely after fade
    setTimeout(() => {
      proximityBubble.style.display = 'none'
      proximityBubble.classList.remove('fading')
    }, PROXIMITY_BUBBLE_FADE)
  }, PROXIMITY_BUBBLE_DURATION)
}

/**
 * Update proximity bubble position to follow player
 * Called each frame from updateHUD
 */
function updateProximityBubble() {
  if (!proximityBubble || proximityBubble.style.display === 'none') return
  if (!camera) return
  
  const player = getPlayer()
  if (!player) return
  
  // Project player position to screen coordinates
  const screenPos = player.position.clone()
  screenPos.y += 3 // Offset above player head
  screenPos.project(camera)
  
  // Convert to CSS coordinates
  const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
  const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight
  
  // Check if in front of camera
  if (screenPos.z > 1) {
    proximityBubble.style.display = 'none'
    return
  }
  
  proximityBubble.style.left = x + 'px'
  proximityBubble.style.top = y + 'px'
}

/**
 * Show a chat bubble above a remote player's fish
 * @param {string} playerId - The remote player's ID
 * @param {string} text - The message text
 */
function showRemotePlayerBubble(playerId, text) {
  // Get or create bubble for this player
  let bubbleData = remotePlayerBubbles.get(playerId)
  
  if (!bubbleData) {
    // Create new bubble element
    const bubble = document.createElement('div')
    bubble.className = 'proximity-bubble remote-player-bubble'
    bubble.style.display = 'none'
    document.body.appendChild(bubble)
    bubbleData = { element: bubble, timeout: null }
    remotePlayerBubbles.set(playerId, bubbleData)
  }
  
  const bubble = bubbleData.element
  
  // Clear any existing timeout
  if (bubbleData.timeout) {
    clearTimeout(bubbleData.timeout)
    bubble.classList.remove('fading')
  }
  
  // Set the message and show the bubble
  bubble.textContent = text
  bubble.style.display = 'block'
  bubble.dataset.playerId = playerId
  
  // Start fade out after duration
  bubbleData.timeout = setTimeout(() => {
    bubble.classList.add('fading')
    
    // Hide completely after fade
    setTimeout(() => {
      bubble.style.display = 'none'
      bubble.classList.remove('fading')
    }, PROXIMITY_BUBBLE_FADE)
  }, PROXIMITY_BUBBLE_DURATION)
}

/**
 * Update all remote player bubble positions
 * Called each frame from updateHUD
 */
function updateRemotePlayerBubbles() {
  if (!camera || !networkManager) return
  
  const remotePlayers = networkManager.getRemotePlayers()
  if (!remotePlayers) return
  
  remotePlayerBubbles.forEach((bubbleData, playerId) => {
    const bubble = bubbleData.element
    if (bubble.style.display === 'none') return
    
    // Get the remote player
    const remotePlayer = remotePlayers.getPlayer(playerId)
    if (!remotePlayer || !remotePlayer.mesh) {
      bubble.style.display = 'none'
      return
    }
    
    // Project player position to screen coordinates
    const screenPos = remotePlayer.mesh.position.clone()
    screenPos.y += 3 // Offset above player head
    screenPos.project(camera)
    
    // Convert to CSS coordinates
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight
    
    // Check if in front of camera
    if (screenPos.z > 1) {
      bubble.style.visibility = 'hidden'
      return
    }
    
    bubble.style.visibility = 'visible'
    bubble.style.left = x + 'px'
    bubble.style.top = y + 'px'
  })
}

// Pre-computed constants for NPC colors (avoid object allocation in hot loop)
const NPC_COLOR_EDIBLE = { r: 0, g: 255, b: 100 }
const NPC_COLOR_DANGER = { r: 255, g: 80, b: 80 }
const NPC_COLOR_SIMILAR = { r: 255, g: 255, b: 0 }

// Fast angle normalization to [-PI, PI] without while loops
function normalizeAngle(angle) {
  angle = angle % (Math.PI * 2)
  if (angle > Math.PI) angle -= Math.PI * 2
  else if (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function updateMinimap() {
  if (!minimapCtx || !minimapCanvas) return
  
  const player = getPlayer()
  if (!player) return
  
  const ctx = minimapCtx
  const size = minimapCanvas.width
  const halfSize = size / 2
  const radarRadius = halfSize * 0.82 // Radar zone radius
  const scale = (radarRadius * 2) / (MINIMAP_RANGE * 2) // Scale to fit radar zone
  
  // Clip region handles exact border cutoff for dots
  
  // ==========================================================================
  // DRAW DARK NAVY BORDER (mask outside radar zone)
  // ==========================================================================
  ctx.fillStyle = 'rgba(5, 12, 25, 0.95)' // Darker navy border
  ctx.fillRect(0, 0, size, size)
  
  // ==========================================================================
  // DRAW CIRCULAR RADAR ZONE
  // ==========================================================================
  ctx.save()
  ctx.beginPath()
  ctx.arc(halfSize, halfSize, radarRadius, 0, Math.PI * 2)
  ctx.clip()
  
  // Fill radar zone with lighter background
  ctx.fillStyle = 'rgba(0, 18, 40, 0.9)'
  ctx.fillRect(0, 0, size, size)
  
  // Draw grid (inside radar zone only)
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.1)'
  ctx.lineWidth = 1
  const gridStep = 50 * scale
  for (let i = gridStep; i < size; i += gridStep) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(size, i)
    ctx.stroke()
  }
  
  // ==========================================================================
  // DRAW SONAR SWEEP (rotating dial with fading trail)
  // ==========================================================================
  sonarAngle -= SONAR_SPEED * 0.016 // Clockwise rotation (~60fps delta time)
  if (sonarAngle < 0) sonarAngle += Math.PI * 2
  
  // Draw fading trail (gradient arc behind the sweep line)
  const trailLength = Math.PI * 0.4 // ~72 degrees of trail
  const trailSteps = 20
  
  for (let i = 0; i < trailSteps; i++) {
    const t = i / trailSteps
    const angle = sonarAngle + t * trailLength // Trail behind (clockwise = positive direction is behind)
    const alpha = (1 - t) * 0.15 // Fade from 0.15 to 0
    
    ctx.strokeStyle = 'rgba(0, 255, 200, ' + alpha.toFixed(3) + ')'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(halfSize, halfSize)
    ctx.lineTo(
      halfSize + Math.cos(angle) * radarRadius,
      halfSize - Math.sin(angle) * radarRadius
    )
    ctx.stroke()
  }
  
  // Draw main sweep line
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(halfSize, halfSize)
  ctx.lineTo(
    halfSize + Math.cos(sonarAngle) * radarRadius,
    halfSize - Math.sin(sonarAngle) * radarRadius
  )
  ctx.stroke()
  
  // Get player position
  const playerPos = player.position
  
  // ==========================================================================
  // DETECT NEW PINGS - Store radar position when sonar passes over NPC
  // ==========================================================================
  // Fetch NPCs to check for new pings
  const nearbyNPCs = FishAdder.getNearbyNPCs(playerPos, MINIMAP_RANGE * 1.5)
  const currentTime = performance.now()
  const fullRotationTime = (Math.PI * 2) / SONAR_SPEED * 1000 // ms for full rotation
  const fadeTime = fullRotationTime * 0.5 // Faster fade for independent pings
  const fadeInTime = 150 // ms for dot to fade in after detection
  const pingWindow = 0.15 // Radians - how close sonar needs to be to "ping"
  
  // Get player volume for color calculation
  const playerVol = Feeding.getPlayerVisualVolume()
  const playerVolLow = playerVol * 0.8
  const playerVolHigh = playerVol * 1.2
  
  // Check for new pings from nearby NPCs
  if (nearbyNPCs) {
    for (let i = 0, len = nearbyNPCs.length; i < len; i++) {
      const npc = nearbyNPCs[i]
      if (!npc.mesh) continue
      
      const relX = (npc.mesh.position.x - playerPos.x) * scale
      const relZ = (npc.mesh.position.z - playerPos.z) * scale
      
      // Calculate NPC angle from center (matching sonar coordinate system)
      const npcAngle = Math.atan2(-relZ, relX)
      const angleDiff = normalizeAngle(sonarAngle - npcAngle)
      
      // If sonar is passing over this NPC right now, create a NEW independent ping
      if (Math.abs(angleDiff) < pingWindow) {
        // Debounce: don't ping same NPC too frequently
        const npcUuid = npc.mesh.uuid
        const lastPing = lastNpcPingTime.get(npcUuid) || 0
        if (currentTime - lastPing < PING_DEBOUNCE_MS) continue
        lastNpcPingTime.set(npcUuid, currentTime)
        
        const npcVol = npc.visualVolume || 0
        let color
        if (npcVol < playerVolLow) {
          color = NPC_COLOR_EDIBLE
        } else if (npcVol > playerVolHigh) {
          color = NPC_COLOR_DANGER
        } else {
          color = NPC_COLOR_SIMILAR
        }
        
        // Create unique ping ID - each ping is independent
        const pingId = pingIdCounter++
        
        // Store world position at ping time
        pingData.set(pingId, {
          time: currentTime,
          worldX: npc.mesh.position.x,
          worldZ: npc.mesh.position.z,
          color: color
        })
      }
    }
  }
  
  // ==========================================================================
  // DETECT PLAYER FISH - Same logic as NPCs but with distinct colors
  // ==========================================================================
  if (networkManager.remotePlayers) {
    const remotePlayers = networkManager.remotePlayers.getAllPlayers()
    for (const [remoteId, remotePlayer] of remotePlayers) {
      if (!remotePlayer.mesh) continue
      
      // Check if within radar range
      const dx = remotePlayer.position.x - playerPos.x
      const dz = remotePlayer.position.z - playerPos.z
      const distSq = dx * dx + dz * dz
      const rangeSq = (MINIMAP_RANGE * 1.5) * (MINIMAP_RANGE * 1.5)
      if (distSq > rangeSq) continue
      
      const relX = dx * scale
      const relZ = dz * scale
      
      // Calculate player angle from center (matching sonar coordinate system)
      const remoteAngle = Math.atan2(-relZ, relX)
      const angleDiff = normalizeAngle(sonarAngle - remoteAngle)
      
      // If sonar is passing over this player right now, create a NEW independent ping
      if (Math.abs(angleDiff) < pingWindow) {
        // Debounce: don't ping same player too frequently
        const playerUuid = 'player_' + remoteId
        const lastPing = lastNpcPingTime.get(playerUuid) || 0
        if (currentTime - lastPing < PING_DEBOUNCE_MS) continue
        lastNpcPingTime.set(playerUuid, currentTime)
        
        const remoteVol = remotePlayer.visualVolume || 1
        let color
        if (remoteVol < playerVolLow) {
          color = NPC_COLOR_EDIBLE
        } else if (remoteVol > playerVolHigh) {
          color = NPC_COLOR_DANGER
        } else {
          color = NPC_COLOR_SIMILAR
        }
        
        // Create unique ping ID - each ping is independent
        const pingId = pingIdCounter++
        
        // Store world position at ping time
        pingData.set(pingId, {
          time: currentTime,
          worldX: remotePlayer.position.x,
          worldZ: remotePlayer.position.z,
          color: color,
          isPlayer: true  // Mark as player for potential future features
        })
      }
    }
  }
  
  // ==========================================================================
  // DRAW ALL PINGED DOTS - Each ping is independent, like real sonar
  // ==========================================================================
  const expiredIds = []
  const radarRadiusSq = radarRadius * radarRadius // Pre-compute for border check
  
  for (const [pingId, data] of pingData) {
    const timeSincePing = currentTime - data.time
    
    // Remove if fully faded
    if (timeSincePing > fadeTime) {
      expiredIds.push(pingId)
      continue
    }
    
    // Convert stored world position to current radar position
    const relX = (data.worldX - playerPos.x) * scale
    const relZ = (data.worldZ - playerPos.z) * scale
    const screenX = halfSize + relX
    const screenZ = halfSize + relZ
    
    // Check if dot is within radar bounds - delete exactly at border
    const distSq = relX * relX + relZ * relZ
    if (distSq > radarRadiusSq) {
      // Dot has reached radar border - remove it
      expiredIds.push(pingId)
      continue
    }
    
    // Calculate fade (with fade-in at start)
    let pingAlpha
    let sizeRatio
    if (timeSincePing < fadeInTime) {
      // Fade in phase - dot grows and becomes visible
      const fadeInRatio = timeSincePing / fadeInTime
      pingAlpha = fadeInRatio * 0.9
      sizeRatio = fadeInRatio // Grow from small to full
    } else {
      // Fade out phase - dot shrinks and fades
      const fadeOutTime = timeSincePing - fadeInTime
      const fadeOutDuration = fadeTime - fadeInTime
      const fadeOutRatio = 1 - (fadeOutTime / fadeOutDuration)
      pingAlpha = fadeOutRatio * 0.9
      sizeRatio = fadeOutRatio // Shrink as it fades
    }
    
    if (pingAlpha < 0.05) continue
    
    // Draw the dot
    ctx.fillStyle = 'rgba(' + data.color.r + ',' + data.color.g + ',' + data.color.b + ',' + pingAlpha.toFixed(2) + ')'
    const dotSize = 2 + sizeRatio * 1.5
    
    ctx.beginPath()
    ctx.arc(screenX, screenZ, dotSize, 0, Math.PI * 2)
    ctx.fill()
  }
  
  // Clean up expired pings
  for (let i = 0; i < expiredIds.length; i++) {
    pingData.delete(expiredIds[i])
  }
  
  // Periodic cleanup of debounce map (every ~5 seconds worth of entries)
  if (lastNpcPingTime.size > 200) {
    for (const [npcUuid, time] of lastNpcPingTime) {
      if (currentTime - time > 5000) {
        lastNpcPingTime.delete(npcUuid)
      }
    }
  }
  
  // ==========================================================================
  // DRAW PLAYER (center, with direction indicator)
  // ==========================================================================
  ctx.fillStyle = '#00ffc8'
  ctx.beginPath()
  ctx.arc(halfSize, halfSize, 4, 0, Math.PI * 2)
  ctx.fill()
  
  // Player direction indicator
  const rotation = player.rotation.y
  const dirX = -Math.sin(rotation) * 12
  const dirZ = Math.cos(rotation) * 12
  
  ctx.strokeStyle = '#00ffc8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(halfSize, halfSize)
  ctx.lineTo(halfSize + dirX, halfSize - dirZ)
  ctx.stroke()
  
  ctx.restore() // End radar zone clipping
  
  // ==========================================================================
  // DRAW RADAR BORDER RING
  // ==========================================================================
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(halfSize, halfSize, radarRadius, 0, Math.PI * 2)
  ctx.stroke()
  
  // ==========================================================================
  // DRAW COMPASS DIRECTIONS (N, E, S, W) on the border
  // ==========================================================================
  const compassRadius = radarRadius + 9 // Position outside the radar circle
  ctx.fillStyle = 'rgba(0, 255, 200, 0.6)'
  ctx.font = 'bold ' + minimapFontSize + 'px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  // N - top
  ctx.fillText('N', halfSize, halfSize - compassRadius)
  // S - bottom
  ctx.fillText('S', halfSize, halfSize + compassRadius)
  // E - right
  ctx.fillText('E', halfSize + compassRadius, halfSize)
  // W - left
  ctx.fillText('W', halfSize - compassRadius, halfSize)
}

function updateInfoPanel() {
  const player = getPlayer()
  if (!player) return
  
  // Species
  const speciesEl = document.getElementById('info-species')
  if (speciesEl) {
    const displayName = getCurrentVariantDisplayName()
    speciesEl.textContent = displayName || '---'
  }
  
  // Size
  const sizeEl = document.getElementById('info-size')
  if (sizeEl) {
    const normInfo = getPlayerNormalizationInfo()
    if (normInfo) {
      sizeEl.textContent = normInfo.gameplay.volume.toFixed(1) + ' m3'
    }
  }
  
  // Depth
  const depthEl = document.getElementById('info-depth')
  if (depthEl) {
    const depth = Math.max(0, -player.position.y)
    depthEl.textContent = depth.toFixed(0) + ' m'
  }
  
  // Feeding stats
  const feedingStats = Feeding.getStats()
  
  const eatenEl = document.getElementById('info-eaten')
  if (eatenEl) {
    eatenEl.textContent = feedingStats.npcsEaten
  }
  
  // Nearby count
  const nearbyEl = document.getElementById('info-nearby')
  if (nearbyEl) {
    const nearby = FishAdder.getNearbyNPCs(player.position, 100)
    nearbyEl.textContent = nearby ? nearby.length : 0
  }
  
  // Population
  const popEl = document.getElementById('info-population')
  if (popEl) {
    popEl.textContent = FishAdder.getCount()
  }
}

export function updateHUD(delta) {
  stats.update()
  updateMinimap()
  updateInfoPanel()
  updateCursorRing()
  updateCapacityBar(delta)
  updateProximityBubble()
  updateRemotePlayerBubbles()
}

// Export for external use (e.g., feeding events)
export function notifyEvent(message) {
  Chat.eventMessage(message)
}

// Re-export Chat module for direct access to chat features
// Useful for multiplayer integration, command systems, etc.
export { Chat }