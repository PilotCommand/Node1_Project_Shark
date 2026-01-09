/**
 * eatenmenu.js - Death Screen / Eaten Menu
 * 
 * Displays when the local player is eaten by another player.
 * Shows final stats: volume, creatures eaten, who ate you, etc.
 * 
 * USAGE:
 *   import { showEatenMenu, hideEatenMenu, onRespawnRequested } from './eatenmenu.js'
 *   
 *   // When player is eaten
 *   showEatenMenu({
 *     finalVolume: 12.5,
 *     eatenBy: 'PlayerName',
 *     eatenByVolume: 25.0,
 *     npcsEaten: 15,
 *     playersEaten: 2,
 *     totalVolumeEaten: 8.5,
 *     survivalTime: 180, // seconds
 *   })
 *   
 *   // Handle respawn
 *   onRespawnRequested(() => {
 *     // Reset player, show main menu, etc.
 *   })
 */

let menuRoot = null
let active = false
let respawnCallbacks = []
let currentStats = null

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Background
  background: {
    gradientStops: [
      { pos: 0, color: '#0a0000' },
      { pos: 30, color: '#1a0505' },
      { pos: 60, color: '#2a0a0a' },
      { pos: 100, color: '#1a0505' }
    ]
  },
  
  // Blood particles
  particles: {
    count: 25,
    sizeMin: 5,
    sizeMax: 20,
    durationMin: 3,
    durationMax: 8
  },
  
  // Animation timings
  fadeInDuration: 0.8,
  statsDelay: 0.5,
}

// ============================================================================
// STYLES
// ============================================================================

function generateStyles() {
  const bgGradient = CONFIG.background.gradientStops
    .map(s => `${s.color} ${s.pos}%`)
    .join(', ')

  return `
    @keyframes eatenMenuFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    
    @keyframes eatenPulse {
      0%, 100% { 
        text-shadow: 0 0 20px rgba(255, 50, 50, 0.8), 0 0 40px rgba(255, 0, 0, 0.5);
        transform: scale(1);
      }
      50% { 
        text-shadow: 0 0 40px rgba(255, 50, 50, 1), 0 0 80px rgba(255, 0, 0, 0.8);
        transform: scale(1.02);
      }
    }
    
    @keyframes bloodDrip {
      0% {
        transform: translateY(-20px) scale(0);
        opacity: 0;
      }
      20% {
        opacity: 0.8;
        transform: translateY(0) scale(1);
      }
      100% {
        transform: translateY(100vh) scale(0.5);
        opacity: 0;
      }
    }
    
    @keyframes statSlideIn {
      0% {
        opacity: 0;
        transform: translateX(-30px);
      }
      100% {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes buttonGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(255, 100, 100, 0.3); }
      50% { box-shadow: 0 0 40px rgba(255, 100, 100, 0.6); }
    }
    
    @keyframes skullFloat {
      0%, 100% { transform: translateY(0) rotate(-5deg); }
      50% { transform: translateY(-10px) rotate(5deg); }
    }

    #eaten-menu {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at center, ${bgGradient});
      z-index: 2000;
      font-family: 'Segoe UI', system-ui, sans-serif;
      overflow: hidden;
      animation: eatenMenuFadeIn ${CONFIG.fadeInDuration}s ease-out;
    }

    .eaten-particles {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
    }

    .eaten-particle {
      position: absolute;
      background: radial-gradient(circle, rgba(180, 0, 0, 0.8) 0%, rgba(100, 0, 0, 0.4) 100%);
      border-radius: 50%;
      animation: bloodDrip linear forwards;
    }

    .eaten-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
      z-index: 1;
      padding: 40px;
      max-width: 600px;
    }

    .eaten-skull {
      font-size: 80px;
      animation: skullFloat 3s ease-in-out infinite;
      filter: drop-shadow(0 0 20px rgba(255, 50, 50, 0.5));
    }

    .eaten-title {
      font-size: 64px;
      font-weight: 900;
      color: #ff3333;
      text-transform: uppercase;
      letter-spacing: 8px;
      animation: eatenPulse 2s ease-in-out infinite;
      text-align: center;
      margin: 0;
    }

    .eaten-subtitle {
      font-size: 24px;
      color: rgba(255, 150, 150, 0.9);
      text-align: center;
      margin-top: -10px;
    }

    .eaten-killer {
      color: #ff6666;
      font-weight: bold;
    }

    .eaten-stats {
      display: flex;
      flex-direction: column;
      gap: 15px;
      width: 100%;
      max-width: 400px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 50, 50, 0.3);
      border-radius: 15px;
      padding: 25px;
    }

    .eaten-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: rgba(255, 50, 50, 0.1);
      border-radius: 8px;
      opacity: 0;
      animation: statSlideIn 0.5s ease-out forwards;
    }

    .eaten-stat-label {
      color: rgba(255, 200, 200, 0.8);
      font-size: 16px;
    }

    .eaten-stat-value {
      color: #ff6666;
      font-size: 20px;
      font-weight: bold;
    }

    .eaten-stat-highlight {
      background: rgba(255, 50, 50, 0.2);
      border: 1px solid rgba(255, 100, 100, 0.3);
    }

    .eaten-stat-highlight .eaten-stat-value {
      color: #ff9999;
      font-size: 24px;
    }

    .eaten-buttons {
      display: flex;
      gap: 20px;
      margin-top: 20px;
    }

    .eaten-btn {
      padding: 15px 40px;
      font-size: 20px;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .eaten-btn-respawn {
      background: linear-gradient(180deg, #cc3333 0%, #991111 100%);
      color: white;
      animation: buttonGlow 2s ease-in-out infinite;
    }

    .eaten-btn-respawn:hover {
      background: linear-gradient(180deg, #ff4444 0%, #cc2222 100%);
      transform: scale(1.05);
    }

    .eaten-btn-menu {
      background: rgba(100, 50, 50, 0.3);
      color: rgba(255, 200, 200, 0.9);
      border: 1px solid rgba(255, 100, 100, 0.3);
    }

    .eaten-btn-menu:hover {
      background: rgba(150, 50, 50, 0.4);
      transform: scale(1.05);
    }

    .eaten-tip {
      font-size: 14px;
      color: rgba(255, 150, 150, 0.6);
      text-align: center;
      margin-top: 20px;
      font-style: italic;
    }
  `
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function generateHTML() {
  return `
    <div class="eaten-particles"></div>
    <div class="eaten-content">
      <div class="eaten-skull">💀</div>
      <h1 class="eaten-title">EATEN!</h1>
      <p class="eaten-subtitle">You were devoured by <span class="eaten-killer">---</span></p>
      
      <div class="eaten-stats">
        <div class="eaten-stat eaten-stat-highlight" style="animation-delay: 0.1s">
          <span class="eaten-stat-label">Your Final Volume</span>
          <span class="eaten-stat-value" id="stat-final-volume">0 m³</span>
        </div>
        <div class="eaten-stat" style="animation-delay: 0.2s">
          <span class="eaten-stat-label">Predator's Volume</span>
          <span class="eaten-stat-value" id="stat-killer-volume">0 m³</span>
        </div>
        <div class="eaten-stat" style="animation-delay: 0.3s">
          <span class="eaten-stat-label">NPCs Eaten</span>
          <span class="eaten-stat-value" id="stat-npcs-eaten">0</span>
        </div>
        <div class="eaten-stat" style="animation-delay: 0.4s">
          <span class="eaten-stat-label">Players Eaten</span>
          <span class="eaten-stat-value" id="stat-players-eaten">0</span>
        </div>
        <div class="eaten-stat" style="animation-delay: 0.5s">
          <span class="eaten-stat-label">Total Volume Consumed</span>
          <span class="eaten-stat-value" id="stat-total-volume">0 m³</span>
        </div>
        <div class="eaten-stat" style="animation-delay: 0.6s">
          <span class="eaten-stat-label">Survival Time</span>
          <span class="eaten-stat-value" id="stat-survival-time">0:00</span>
        </div>
      </div>
      
      <div class="eaten-buttons">
        <button class="eaten-btn eaten-btn-respawn" id="eaten-respawn-btn">Respawn</button>
        <button class="eaten-btn eaten-btn-menu" id="eaten-menu-btn">Main Menu</button>
      </div>
      
      <p class="eaten-tip">Tip: Eat fish and smaller players to grow. The bigger you are, the safer!</p>
    </div>
  `
}

// ============================================================================
// PARTICLES
// ============================================================================

function createParticles(container) {
  for (let i = 0; i < CONFIG.particles.count; i++) {
    const particle = document.createElement('div')
    particle.className = 'eaten-particle'
    
    const size = CONFIG.particles.sizeMin + Math.random() * (CONFIG.particles.sizeMax - CONFIG.particles.sizeMin)
    const left = Math.random() * 100
    const duration = CONFIG.particles.durationMin + Math.random() * (CONFIG.particles.durationMax - CONFIG.particles.durationMin)
    const delay = Math.random() * 3
    
    particle.style.width = `${size}px`
    particle.style.height = `${size}px`
    particle.style.left = `${left}%`
    particle.style.top = `${Math.random() * 30}%`
    particle.style.animationDuration = `${duration}s`
    particle.style.animationDelay = `${delay}s`
    
    container.appendChild(particle)
  }
}

// ============================================================================
// STATS FORMATTING
// ============================================================================

function formatVolume(volume) {
  if (volume >= 100) {
    return `${volume.toFixed(0)} m³`
  } else if (volume >= 10) {
    return `${volume.toFixed(1)} m³`
  } else {
    return `${volume.toFixed(2)} m³`
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function updateStats(stats) {
  // Update killer name
  const killerSpan = menuRoot.querySelector('.eaten-killer')
  if (killerSpan) {
    killerSpan.textContent = stats.eatenBy || 'Unknown Predator'
  }
  
  // Update stat values
  const setValue = (id, value) => {
    const el = document.getElementById(id)
    if (el) el.textContent = value
  }
  
  setValue('stat-final-volume', formatVolume(stats.finalVolume || 0))
  setValue('stat-killer-volume', formatVolume(stats.eatenByVolume || 0))
  setValue('stat-npcs-eaten', stats.npcsEaten || 0)
  setValue('stat-players-eaten', stats.playersEaten || 0)
  setValue('stat-total-volume', formatVolume(stats.totalVolumeEaten || 0))
  setValue('stat-survival-time', formatTime(stats.survivalTime || 0))
}

// ============================================================================
// RANDOM TIPS
// ============================================================================

const TIPS = [
  "Tip: Eat fish and smaller players to grow. The bigger you are, the safer!",
  "Tip: You need to be at least 5% larger than your prey to eat them.",
  "Tip: Use your boost ability (Q) to chase down prey or escape predators!",
  "Tip: The radar shows red for threats, green for prey, and yellow for similar-sized creatures.",
  "Tip: Staying near terrain can help you ambush prey or escape larger predators.",
  "Tip: Volume is additive - eating a 10m³ creature adds 10m³ to your size!",
  "Tip: Watch out for players lurking near spawn points...",
  "Tip: Different creatures have different abilities. Choose wisely!",
]

function getRandomTip() {
  return TIPS[Math.floor(Math.random() * TIPS.length)]
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initEatenMenu() {
  if (menuRoot) {
    console.warn('[EatenMenu] Already initialized')
    return
  }
  
  // Create style element
  const style = document.createElement('style')
  style.textContent = generateStyles()
  document.head.appendChild(style)
  
  // Create menu root
  menuRoot = document.createElement('div')
  menuRoot.id = 'eaten-menu'
  menuRoot.innerHTML = generateHTML()
  document.body.appendChild(menuRoot)
  
  // Create particles
  const particleContainer = menuRoot.querySelector('.eaten-particles')
  if (particleContainer) {
    createParticles(particleContainer)
  }
  
  // Setup button handlers
  const respawnBtn = document.getElementById('eaten-respawn-btn')
  const menuBtn = document.getElementById('eaten-menu-btn')
  
  if (respawnBtn) {
    respawnBtn.addEventListener('click', handleRespawn)
  }
  
  if (menuBtn) {
    menuBtn.addEventListener('click', handleMainMenu)
  }
  
  console.log('[EatenMenu] Initialized')
}

// ============================================================================
// HANDLERS
// ============================================================================

function handleRespawn() {
  console.log('[EatenMenu] Respawn requested')
  
  hideEatenMenu()
  
  // Fire respawn callbacks
  for (const callback of respawnCallbacks) {
    try {
      callback({ type: 'respawn', stats: currentStats })
    } catch (err) {
      console.error('[EatenMenu] Respawn callback error:', err)
    }
  }
}

function handleMainMenu() {
  console.log('[EatenMenu] Main menu requested')
  
  hideEatenMenu()
  
  // Fire respawn callbacks with menu flag
  for (const callback of respawnCallbacks) {
    try {
      callback({ type: 'menu', stats: currentStats })
    } catch (err) {
      console.error('[EatenMenu] Main menu callback error:', err)
    }
  }
}

// ============================================================================
// VISIBILITY
// ============================================================================

/**
 * Show the eaten menu with stats
 * @param {object} stats - Death statistics
 * @param {number} stats.finalVolume - Player's volume when eaten
 * @param {string} stats.eatenBy - Name of the player who ate you
 * @param {number} stats.eatenByVolume - Volume of the predator
 * @param {number} stats.npcsEaten - Total NPCs eaten this life
 * @param {number} stats.playersEaten - Total players eaten this life
 * @param {number} stats.totalVolumeEaten - Total volume consumed this life
 * @param {number} stats.survivalTime - Time survived in seconds
 */
export function showEatenMenu(stats = {}) {
  if (!menuRoot) {
    initEatenMenu()
  }
  
  currentStats = stats
  
  // Update stats display
  updateStats(stats)
  
  // Update random tip
  const tipEl = menuRoot.querySelector('.eaten-tip')
  if (tipEl) {
    tipEl.textContent = getRandomTip()
  }
  
  // Recreate particles for fresh animation
  const particleContainer = menuRoot.querySelector('.eaten-particles')
  if (particleContainer) {
    particleContainer.innerHTML = ''
    createParticles(particleContainer)
  }
  
  // Show menu
  menuRoot.style.display = 'flex'
  active = true
  
  // Exit pointer lock if active
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }
  
  console.log('[EatenMenu] Shown', stats)
}

/**
 * Hide the eaten menu
 */
export function hideEatenMenu() {
  if (!menuRoot) return
  
  menuRoot.style.display = 'none'
  active = false
  currentStats = null
  
  console.log('[EatenMenu] Hidden')
}

/**
 * Check if eaten menu is currently showing
 * @returns {boolean}
 */
export function isEatenMenuActive() {
  return active
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Register callback for when respawn/menu is requested
 * @param {function} callback - Called with { type: 'respawn' | 'menu', stats }
 * @returns {function} Unsubscribe function
 */
export function onRespawnRequested(callback) {
  if (typeof callback !== 'function') {
    console.warn('[EatenMenu] onRespawnRequested expects a function')
    return () => {}
  }
  
  respawnCallbacks.push(callback)
  
  return () => {
    const idx = respawnCallbacks.indexOf(callback)
    if (idx !== -1) respawnCallbacks.splice(idx, 1)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  init: initEatenMenu,
  show: showEatenMenu,
  hide: hideEatenMenu,
  isActive: isEatenMenuActive,
  onRespawnRequested,
}