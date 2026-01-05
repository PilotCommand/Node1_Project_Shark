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
    
    .hud-title::after {
      content: '::';
      opacity: 0.4;
      font-size: 10px;
      letter-spacing: 1px;
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
      height: 180px;
      display: flex;
      flex-direction: column;
    }
    
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      font-size: 11px;
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
      font-size: 9px;
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
      font-size: 11px;
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
    
    startX = e.clientX
    startY = e.clientY
    startWidth = panel.offsetWidth
    startHeight = panel.offsetHeight
    
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

function createFPSCounter() {
  stats = new Stats()
  stats.showPanel(0)
  
  // Position flush in lower left corner (no margin)
  stats.dom.style.position = 'absolute'
  stats.dom.style.left = '0px'
  stats.dom.style.top = 'auto'
  stats.dom.style.bottom = '0px'
  
  document.body.appendChild(stats.dom)
}

function createMinimap() {
  minimapContainer = document.createElement('div')
  minimapContainer.id = 'minimap-container'
  minimapContainer.className = 'hud-panel'
  
  const title = document.createElement('div')
  title.className = 'hud-title'
  title.textContent = 'Map'
  
  minimapCanvas = document.createElement('canvas')
  minimapCanvas.id = 'minimap-canvas'
  minimapCanvas.width = MINIMAP_SIZE
  minimapCanvas.height = MINIMAP_SIZE
  
  minimapContainer.appendChild(title)
  minimapContainer.appendChild(minimapCanvas)
  document.body.appendChild(minimapContainer)
  
  minimapCtx = minimapCanvas.getContext('2d')
  
  // Make draggable and resizable
  makeDraggable(minimapContainer)
  makeResizable(minimapContainer, (width, height) => {
    // Resize canvas to match panel (minus title bar height)
    const titleHeight = title.offsetHeight
    const newSize = Math.min(width - 2, height - titleHeight - 2)
    if (newSize > 50) {
      minimapCanvas.width = newSize
      minimapCanvas.height = newSize
    }
  }, 'top-left')
}

function createInfoPanel() {
  infoPanel = document.createElement('div')
  infoPanel.id = 'info-panel'
  infoPanel.className = 'hud-panel'
  
  infoPanel.innerHTML = `
    <div class="hud-title">Info</div>
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
  `
  
  document.body.appendChild(infoPanel)
  
  // Make draggable and resizable
  makeDraggable(infoPanel)
  makeResizable(infoPanel, null, 'bottom-left')
}

function createChatPanel() {
  chatPanel = document.createElement('div')
  chatPanel.id = 'chat-panel'
  chatPanel.className = 'hud-panel'
  
  chatPanel.innerHTML = `
    <div class="hud-title">Chat</div>
    <div id="chat-messages"></div>
    <div id="chat-input-container">
      <input type="text" id="chat-input" placeholder="Press Enter to chat..." />
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
  
  // Make draggable and resizable
  makeDraggable(chatPanel)
  makeResizable(chatPanel)
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

function updateMinimap() {
  if (!minimapCtx || !minimapCanvas) return
  
  const player = getPlayer()
  if (!player) return
  
  const ctx = minimapCtx
  const size = minimapCanvas.width
  const halfSize = size / 2
  const scale = size / (MINIMAP_RANGE * 2)
  
  // Clear with dark blue background
  ctx.fillStyle = 'rgba(0, 10, 30, 0.9)'
  ctx.fillRect(0, 0, size, size)
  
  // Draw grid
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
  
  // Draw compass directions
  ctx.fillStyle = 'rgba(0, 255, 200, 0.4)'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('N', halfSize, 10)
  ctx.fillText('S', halfSize, size - 4)
  ctx.textAlign = 'left'
  ctx.fillText('W', 4, halfSize + 3)
  ctx.textAlign = 'right'
  ctx.fillText('E', size - 4, halfSize + 3)
  
  // Get player position
  const playerPos = player.position
  
  // Draw nearby NPCs
  const nearbyNPCs = FishAdder.getNearbyNPCs(playerPos, MINIMAP_RANGE)
  if (nearbyNPCs) {
    for (const npc of nearbyNPCs) {
      if (!npc.mesh) continue
      
      const relX = (npc.mesh.position.x - playerPos.x) * scale
      const relZ = (npc.mesh.position.z - playerPos.z) * scale
      
      const screenX = halfSize + relX
      const screenZ = halfSize + relZ
      
      // Skip if off minimap
      if (screenX < 0 || screenX > size || screenZ < 0 || screenZ > size) continue
      
      // Color based on size relative to player (green = smaller, red = larger)
      const playerVol = Feeding.getPlayerVisualVolume()
      const npcVol = npc.visualVolume || 0
      
      if (npcVol < playerVol * 0.8) {
        ctx.fillStyle = 'rgba(0, 255, 100, 0.7)' // Edible - green
      } else if (npcVol > playerVol * 1.2) {
        ctx.fillStyle = 'rgba(255, 80, 80, 0.7)' // Danger - red
      } else {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)' // Similar size - yellow
      }
      
      ctx.beginPath()
      ctx.arc(screenX, screenZ, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  
  // Draw player (center, with direction indicator)
  ctx.fillStyle = '#00ffc8'
  ctx.beginPath()
  ctx.arc(halfSize, halfSize, 4, 0, Math.PI * 2)
  ctx.fill()
  
  // Player direction indicator
  const rotation = player.rotation.y
  const dirX = -Math.sin(rotation) * 10
  const dirZ = Math.cos(rotation) * 10
  
  ctx.strokeStyle = '#00ffc8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(halfSize, halfSize)
  ctx.lineTo(halfSize + dirX, halfSize - dirZ)
  ctx.stroke()
  
  // Range circle
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(halfSize, halfSize, halfSize * 0.8, 0, Math.PI * 2)
  ctx.stroke()
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