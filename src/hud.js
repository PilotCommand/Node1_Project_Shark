import Stats from 'three/examples/jsm/libs/stats.module.js'
import { getPlayer, getCurrentCreature, getPlayerNormalizationInfo, getCurrentVariantDisplayName } from './player.js'
import { Feeding } from './Feeding.js'
import { FishAdder } from './FishAdder.js'

let stats

// DOM Elements
let minimapContainer = null
let minimapCanvas = null
let minimapCtx = null
let infoPanel = null
let chatPanel = null
let chatMessages = null
let chatInput = null

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

// Chat message history
const chatHistory = []
const MAX_CHAT_MESSAGES = 50

export function initHUD() {
  createStyles()
  createFPSCounter()
  createMinimap()
  createInfoPanel()
  createChatPanel()
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
  title.innerHTML = '<span>Map</span><span class="hud-title-controls"><span class="font-btn font-decrease">−</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span>'
  
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
    <div class="hud-title"><span>Info</span><span class="hud-title-controls"><span class="font-btn font-decrease">−</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span></div>
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
    <div class="hud-title"><span>Chat</span><span class="hud-title-controls"><span class="font-btn font-decrease">−</span><span class="font-btn font-increase">+</span><span class="collapse-btn">v</span><span class="grip">::</span></span></div>
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
  
  // Chat input handling
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      addChatMessage(chatInput.value.trim(), 'player')
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
  addChatMessage('Welcome to the ocean!', 'system')
  
  // Make draggable, resizable, collapsible, and font-resizable
  makeDraggable(chatPanel)
  makeResizable(chatPanel)
  makeCollapsible(chatPanel)
  makeFontResizable(chatPanel)
}

export function addChatMessage(text, type = 'player') {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  const message = {
    text,
    type,
    timestamp,
  }
  
  chatHistory.push(message)
  if (chatHistory.length > MAX_CHAT_MESSAGES) {
    chatHistory.shift()
  }
  
  if (chatMessages) {
    const msgEl = document.createElement('div')
    msgEl.className = 'chat-message ' + type
    msgEl.innerHTML = '<span class="timestamp">' + timestamp + '</span>' + text
    chatMessages.appendChild(msgEl)
    chatMessages.scrollTop = chatMessages.scrollHeight
  }
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
    
    // Calculate fade
    const fadeRatio = 1 - (timeSincePing / fadeTime)
    const pingAlpha = fadeRatio * 0.9
    
    if (pingAlpha < 0.05) continue
    
    // Draw the dot
    ctx.fillStyle = 'rgba(' + data.color.r + ',' + data.color.g + ',' + data.color.b + ',' + pingAlpha.toFixed(2) + ')'
    const dotSize = 2 + fadeRatio * 1.5
    
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

export function updateHUD() {
  stats.update()
  updateMinimap()
  updateInfoPanel()
}

// Export for external use (e.g., feeding events)
export function notifyEvent(message) {
  addChatMessage(message, 'event')
}