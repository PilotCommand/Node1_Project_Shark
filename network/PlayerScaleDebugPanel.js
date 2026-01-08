/**
 * PlayerScaleDebugPanel.js - Debug panel showing all player scale information
 * 
 * Shows for each player (local + remote):
 * - Fish type/class
 * - Encyclopedia visual volume
 * - Encyclopedia physics (capsule) volume
 * - World volume
 * - Current mesh scale
 * 
 * Usage:
 *   import { togglePlayerScalePanel } from './PlayerScaleDebugPanel.js'
 *   
 *   // On P key press (alongside wireframe toggle)
 *   togglePlayerScalePanel()
 */

import { getPlayer, getCurrentClass, getCurrentType, getNaturalCapsuleParams, getPlayerCapsuleParams, getPlayerNormalizationInfo, getPlayerWorldVolume } from '../src/player.js'
import { computeGroupVolume, computeCapsuleVolumeFromParams } from '../src/MeshVolume.js'
import { networkManager } from './NetworkManager.js'

// ============================================================================
// STATE
// ============================================================================

let panelElement = null
let isVisible = false
let updateInterval = null

// ============================================================================
// PANEL CREATION
// ============================================================================

function createPanel() {
  if (panelElement) return panelElement
  
  panelElement = document.createElement('div')
  panelElement.id = 'player-scale-debug-panel'
  panelElement.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: #00ff88;
    padding: 15px;
    border-radius: 8px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    z-index: 9999;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    border: 1px solid #00ff8844;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `
  
  document.body.appendChild(panelElement)
  return panelElement
}

function destroyPanel() {
  if (panelElement) {
    panelElement.remove()
    panelElement = null
  }
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

function getLocalPlayerInfo() {
  const player = getPlayer()
  if (!player) return null
  
  // Get mesh scale
  const meshScale = player.scale?.x || 1
  
  // Compute encyclopedia visual volume at scale=1
  const savedScale = player.scale.x
  player.scale.setScalar(1)
  player.updateWorldMatrix(true, true)
  const encyclopediaVisualVolume = computeGroupVolume(player, false)
  player.scale.setScalar(savedScale)
  
  // Get BASE capsule params for physics volume (at scale=1)
  const naturalCapsuleParams = getNaturalCapsuleParams()
  const encyclopediaCapsuleVolume = naturalCapsuleParams 
    ? computeCapsuleVolumeFromParams(naturalCapsuleParams)
    : 0
  
  // Get CURRENT capsule params (at current scale) for actual physics volume
  const currentCapsuleParams = getPlayerCapsuleParams()
  const actualPhysicsCapsuleVolume = currentCapsuleParams
    ? computeCapsuleVolumeFromParams(currentCapsuleParams)
    : 0
  
  // Compute physics scale from capsule volumes
  // physicsScale³ = actualPhysicsVolume / encyclopediaCapsuleVolume
  let physicsScale = meshScale
  if (encyclopediaCapsuleVolume > 0.001 && actualPhysicsCapsuleVolume > 0.001) {
    physicsScale = Math.cbrt(actualPhysicsCapsuleVolume / encyclopediaCapsuleVolume)
  }
  
  // Get normalization info
  const normInfo = getPlayerNormalizationInfo()
  
  return {
    id: 'LOCAL',
    name: 'You',
    fishType: getCurrentType() || 'fish',
    fishClass: getCurrentClass() || 'starter',
    
    // Volumes
    encyclopediaVisualVolume: encyclopediaVisualVolume,
    encyclopediaCapsuleVolume: encyclopediaCapsuleVolume,
    worldVolume: getPlayerWorldVolume() || 1,
    actualPhysicsCapsuleVolume: actualPhysicsCapsuleVolume,
    
    // Scale
    currentScale: meshScale,
    targetScale: meshScale,
    lastPhysicsScale: physicsScale,
    
    // Extra from normalization
    manualScaleMultiplier: normInfo?.manualScaleMultiplier || 1,
    scaleFactor: normInfo?.scaleFactor || 1,
  }
}

function getRemotePlayersInfo() {
  if (!networkManager || !networkManager.remotePlayers) {
    return []
  }
  
  return networkManager.remotePlayers.getAllDebugInfo()
}

function getAllPlayersInfo() {
  const players = []
  
  // Add local player first
  const localInfo = getLocalPlayerInfo()
  if (localInfo) {
    players.push(localInfo)
  }
  
  // Add remote players
  const remoteInfo = getRemotePlayersInfo()
  players.push(...remoteInfo)
  
  return players
}

// ============================================================================
// PANEL RENDERING
// ============================================================================

function formatNumber(num, decimals = 2) {
  if (num === undefined || num === null || isNaN(num)) return '—'
  return num.toFixed(decimals)
}

function renderPlayerRow(player, isLocal = false) {
  const bgColor = isLocal ? '#002200' : '#001122'
  const borderColor = isLocal ? '#00ff88' : '#0088ff'
  
  // Compute expected scale from capsule volume (for verification)
  const expectedScale = player.encyclopediaCapsuleVolume > 0.001 
    ? Math.cbrt(player.worldVolume / player.encyclopediaCapsuleVolume)
    : null
  
  // Check if scale matches expected
  const scaleMatch = expectedScale && Math.abs(player.currentScale - expectedScale) < 0.01
  const scaleColor = scaleMatch ? '#00aaff' : '#ff6666'
  
  // Compute current world volumes (at current scale)
  const scale3 = Math.pow(player.currentScale, 3)
  const worldVisualVolume = player.encyclopediaVisualVolume * scale3
  const worldCapsuleVolume = player.encyclopediaCapsuleVolume * scale3
  
  // Physics capsule world volume - use actual if available, otherwise compute from physics scale
  let physicsCapsuleVolume
  if (player.actualPhysicsCapsuleVolume !== undefined && player.actualPhysicsCapsuleVolume > 0) {
    physicsCapsuleVolume = player.actualPhysicsCapsuleVolume
  } else {
    const physicsScale3 = player.lastPhysicsScale ? Math.pow(player.lastPhysicsScale, 3) : 0
    physicsCapsuleVolume = player.encyclopediaCapsuleVolume * physicsScale3
  }
  
  // Check if physics capsule matches expected world capsule
  const physicsCapsuleMatch = Math.abs(worldCapsuleVolume - physicsCapsuleVolume) < 0.05
  
  return `
    <div style="
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
    ">
      <div style="
        font-size: 14px;
        font-weight: bold;
        color: ${borderColor};
        margin-bottom: 8px;
        border-bottom: 1px solid ${borderColor}44;
        padding-bottom: 5px;
      ">
        ${isLocal ? '★ ' : ''}${player.name || player.id}
        <span style="color: #888; font-weight: normal; font-size: 11px;">
          (${player.fishClass})
        </span>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <!-- Encyclopedia Volumes (at scale=1) -->
        <tr>
          <td colspan="2" style="color: #666; padding: 4px 0 2px 0; font-size: 10px; text-transform: uppercase;">Encyclopedia (scale=1)</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Visual Mesh:</td>
          <td style="text-align: right; color: #ffaa00;">${formatNumber(player.encyclopediaVisualVolume, 4)} m³</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Physics Capsule:</td>
          <td style="text-align: right; color: #ffaa00;">${formatNumber(player.encyclopediaCapsuleVolume, 4)} m³</td>
        </tr>
        
        <!-- World Volumes (at current scale) -->
        <tr>
          <td colspan="2" style="color: #666; padding: 6px 0 2px 0; font-size: 10px; text-transform: uppercase; border-top: 1px solid #333;">World (current)</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Target Volume:</td>
          <td style="text-align: right; color: #00ff88; font-weight: bold;">${formatNumber(player.worldVolume, 2)} m³</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Visual Mesh:</td>
          <td style="text-align: right; color: #88ddff;">${formatNumber(worldVisualVolume, 4)} m³</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Expected Capsule:</td>
          <td style="text-align: right; color: #88ddff;">${formatNumber(worldCapsuleVolume, 4)} m³</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Actual Capsule:</td>
          <td style="text-align: right; color: ${physicsCapsuleMatch ? '#00ff88' : '#ff6666'};">${formatNumber(physicsCapsuleVolume, 4)} m³ ${physicsCapsuleMatch ? '✓' : '⚠'}</td>
        </tr>
        
        <!-- Scale Info -->
        <tr>
          <td colspan="2" style="color: #666; padding: 6px 0 2px 0; font-size: 10px; text-transform: uppercase; border-top: 1px solid #333;">Scale</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Mesh Scale:</td>
          <td style="text-align: right; color: ${scaleColor};">${formatNumber(player.currentScale, 4)}× ${scaleMatch ? '✓' : ''}</td>
        </tr>
        ${player.lastPhysicsScale !== undefined && player.lastPhysicsScale !== null ? `
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Physics Scale:</td>
          <td style="text-align: right; color: ${Math.abs(player.currentScale - player.lastPhysicsScale) < 0.01 ? '#00ff88' : '#ff6666'};">${formatNumber(player.lastPhysicsScale, 4)}× ${Math.abs(player.currentScale - player.lastPhysicsScale) < 0.01 ? '✓' : '⚠'}</td>
        </tr>
        ` : ''}
        ${expectedScale !== null ? `
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Expected:</td>
          <td style="text-align: right; color: #888;">${formatNumber(expectedScale, 4)}×</td>
        </tr>
        ` : ''}
        ${player.receivedScale !== null && player.receivedScale !== undefined ? `
        <tr>
          <td style="color: #888; padding: 1px 0; padding-left: 8px;">Received:</td>
          <td style="text-align: right; color: #ff8888;">${formatNumber(player.receivedScale, 4)}×</td>
        </tr>
        ` : ''}
      </table>
    </div>
  `
}

function updatePanelContent() {
  if (!panelElement || !isVisible) return
  
  const players = getAllPlayersInfo()
  
  const header = `
    <div style="
      font-size: 16px;
      font-weight: bold;
      color: #ffffff;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #00ff88;
    ">
      🐟 Player Scale Info (${players.length} players)
    </div>
    <div style="
      font-size: 10px;
      color: #666;
      margin-bottom: 10px;
    ">
      Press P to toggle | R/T to change scale
    </div>
  `
  
  let content = header
  
  if (players.length === 0) {
    content += '<div style="color: #888; text-align: center; padding: 20px;">No players found</div>'
  } else {
    // Local player first
    const localPlayer = players.find(p => p.id === 'LOCAL')
    if (localPlayer) {
      content += renderPlayerRow(localPlayer, true)
    }
    
    // Then remote players
    const remotePlayers = players.filter(p => p.id !== 'LOCAL')
    remotePlayers.forEach(player => {
      content += renderPlayerRow(player, false)
    })
  }
  
  panelElement.innerHTML = content
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Toggle the player scale debug panel visibility
 * @returns {boolean} New visibility state
 */
export function togglePlayerScalePanel() {
  isVisible = !isVisible
  
  if (isVisible) {
    createPanel()
    updatePanelContent()
    
    // Start periodic updates
    updateInterval = setInterval(updatePanelContent, 250)
  } else {
    destroyPanel()
  }
  
  return isVisible
}

/**
 * Show the panel
 */
export function showPlayerScalePanel() {
  if (!isVisible) {
    togglePlayerScalePanel()
  }
}

/**
 * Hide the panel
 */
export function hidePlayerScalePanel() {
  if (isVisible) {
    togglePlayerScalePanel()
  }
}

/**
 * Check if panel is visible
 * @returns {boolean}
 */
export function isPlayerScalePanelVisible() {
  return isVisible
}

/**
 * Force update the panel content (useful after scale changes)
 */
export function updatePlayerScalePanel() {
  if (isVisible) {
    updatePanelContent()
  }
}