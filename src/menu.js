/**
 * menu.js — Main Menu State Controller
 *
 * Responsibilities:
 * - Display a stylish shark-themed main menu
 * - Capture menu input (Play, Settings)
 * - Notify the game when spawning is requested
 *
 * NON-responsibilities:
 * - Does NOT spawn the player
 * - Does NOT touch physics
 * - Does NOT manage camera logic
 */

let menuRoot = null
let active = false
let spawnRequested = false
let spawnCallbacks = []

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  @keyframes menuFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes titleFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  
  @keyframes bubble {
    0% { transform: translateY(100vh) scale(0); opacity: 0; }
    10% { opacity: 0.6; }
    100% { transform: translateY(-100px) scale(1); opacity: 0; }
  }
  
  @keyframes swim {
    0% { transform: translateX(-100%) scaleX(1); }
    49% { transform: translateX(100vw) scaleX(1); }
    50% { transform: translateX(100vw) scaleX(-1); }
    99% { transform: translateX(-100%) scaleX(-1); }
    100% { transform: translateX(-100%) scaleX(1); }
  }
  
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0, 200, 255, 0.3); }
    50% { box-shadow: 0 0 40px rgba(0, 200, 255, 0.6); }
  }

  #game-menu {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, 
      #001220 0%, 
      #002840 30%, 
      #003b5c 60%, 
      #004d6d 100%
    );
    z-index: 1000;
    font-family: 'Segoe UI', system-ui, sans-serif;
    animation: menuFadeIn 0.5s ease-out;
    overflow: hidden;
  }

  .menu-bubbles {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  }

  .menu-bubble {
    position: absolute;
    bottom: -50px;
    background: radial-gradient(circle at 30% 30%, 
      rgba(255, 255, 255, 0.3), 
      rgba(100, 200, 255, 0.1)
    );
    border-radius: 50%;
    animation: bubble linear infinite;
  }

  .menu-shark-bg {
    position: absolute;
    font-size: 120px;
    opacity: 0.08;
    animation: swim 20s linear infinite;
    top: 30%;
    filter: blur(2px);
  }

  .menu-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .menu-title {
    font-size: 72px;
    font-weight: 900;
    letter-spacing: 8px;
    color: transparent;
    background: linear-gradient(135deg, 
      #00d4ff 0%, 
      #ffffff 25%, 
      #00d4ff 50%, 
      #ffffff 75%, 
      #00d4ff 100%
    );
    background-size: 200% auto;
    background-clip: text;
    -webkit-background-clip: text;
    animation: titleFloat 3s ease-in-out infinite, shimmer 3s linear infinite;
    text-shadow: 0 0 60px rgba(0, 200, 255, 0.5);
    margin-bottom: 0;
  }

  .menu-subtitle {
    font-size: 16px;
    letter-spacing: 6px;
    color: rgba(150, 220, 255, 0.7);
    text-transform: uppercase;
    margin-bottom: 40px;
  }

  .menu-shark-icon {
    font-size: 80px;
    margin-bottom: 10px;
    filter: drop-shadow(0 0 20px rgba(0, 200, 255, 0.5));
  }

  .menu-buttons {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 20px;
  }

  .menu-btn {
    padding: 18px 60px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    border: 2px solid rgba(0, 200, 255, 0.5);
    border-radius: 50px;
    background: linear-gradient(135deg, 
      rgba(0, 60, 100, 0.8) 0%, 
      rgba(0, 100, 150, 0.6) 100%
    );
    color: #fff;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    min-width: 250px;
  }

  .menu-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(255, 255, 255, 0.2), 
      transparent
    );
    transition: left 0.5s ease;
  }

  .menu-btn:hover::before {
    left: 100%;
  }

  .menu-btn:hover {
    border-color: #00d4ff;
    background: linear-gradient(135deg, 
      rgba(0, 100, 150, 0.9) 0%, 
      rgba(0, 150, 200, 0.7) 100%
    );
    transform: translateY(-3px);
    box-shadow: 0 10px 30px rgba(0, 200, 255, 0.3);
  }

  .menu-btn:active {
    transform: translateY(0);
  }

  .menu-btn-primary {
    background: linear-gradient(135deg, 
      rgba(0, 150, 200, 0.9) 0%, 
      rgba(0, 200, 255, 0.7) 100%
    );
    border-color: #00d4ff;
    animation: pulse 2s ease-in-out infinite;
  }

  .menu-btn-primary:hover {
    background: linear-gradient(135deg, 
      rgba(0, 180, 230, 1) 0%, 
      rgba(0, 230, 255, 0.9) 100%
    );
  }

  .menu-footer {
    position: absolute;
    bottom: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .menu-controls-hint {
    font-size: 12px;
    color: rgba(150, 200, 230, 0.5);
    letter-spacing: 2px;
  }

  .menu-version {
    font-size: 11px;
    color: rgba(100, 150, 180, 0.4);
  }
`

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMenu() {
  if (menuRoot) {
    console.warn('[Menu] Already initialized')
    return
  }

  // Inject styles
  const styleSheet = document.createElement('style')
  styleSheet.textContent = STYLES
  document.head.appendChild(styleSheet)

  // Root container
  menuRoot = document.createElement('div')
  menuRoot.id = 'game-menu'

  // Bubbles background
  const bubblesContainer = document.createElement('div')
  bubblesContainer.className = 'menu-bubbles'
  
  // Create random bubbles
  for (let i = 0; i < 15; i++) {
    const bubble = document.createElement('div')
    bubble.className = 'menu-bubble'
    const size = 10 + Math.random() * 40
    bubble.style.width = `${size}px`
    bubble.style.height = `${size}px`
    bubble.style.left = `${Math.random() * 100}%`
    bubble.style.animationDuration = `${8 + Math.random() * 12}s`
    bubble.style.animationDelay = `${Math.random() * 10}s`
    bubblesContainer.appendChild(bubble)
  }
  menuRoot.appendChild(bubblesContainer)

  // Swimming shark background
  const sharkBg = document.createElement('div')
  sharkBg.className = 'menu-shark-bg'
  sharkBg.textContent = '🦈'
  menuRoot.appendChild(sharkBg)

  // Main content
  const content = document.createElement('div')
  content.className = 'menu-content'

  // Shark icon
  const sharkIcon = document.createElement('div')
  sharkIcon.className = 'menu-shark-icon'
  sharkIcon.textContent = '🦈'
  content.appendChild(sharkIcon)

  // Title
  const title = document.createElement('div')
  title.className = 'menu-title'
  title.textContent = 'SHARKY'
  content.appendChild(title)

  // Subtitle
  const subtitle = document.createElement('div')
  subtitle.className = 'menu-subtitle'
  subtitle.textContent = 'Ocean Creature Simulator'
  content.appendChild(subtitle)

  // Buttons container
  const buttons = document.createElement('div')
  buttons.className = 'menu-buttons'

  // Play button
  const playBtn = document.createElement('button')
  playBtn.className = 'menu-btn menu-btn-primary'
  playBtn.textContent = '🌊 Dive In'
  playBtn.addEventListener('click', handleSpawn)
  buttons.appendChild(playBtn)

  // How to Play button (optional)
  const helpBtn = document.createElement('button')
  helpBtn.className = 'menu-btn'
  helpBtn.textContent = '📖 Controls'
  helpBtn.addEventListener('click', showControls)
  buttons.appendChild(helpBtn)

  content.appendChild(buttons)
  menuRoot.appendChild(content)

  // Footer
  const footer = document.createElement('div')
  footer.className = 'menu-footer'

  const hint = document.createElement('div')
  hint.className = 'menu-controls-hint'
  hint.textContent = 'WASD to swim • Mouse to look • Space/Shift for depth'
  footer.appendChild(hint)

  const version = document.createElement('div')
  version.className = 'menu-version'
  version.textContent = 'v0.1 Alpha'
  footer.appendChild(version)

  menuRoot.appendChild(footer)

  document.body.appendChild(menuRoot)

  hideMenu()
  console.log('[Menu] Initialized')
}

// ============================================================================
// HANDLERS
// ============================================================================

function handleSpawn() {
  if (!active) return

  console.log('[Menu] Spawn requested')
  spawnRequested = true

  // Notify listeners
  spawnCallbacks.forEach(cb => {
    try {
      cb()
    } catch (err) {
      console.error('[Menu] Spawn callback error:', err)
    }
  })

  hideMenu()
}

function showControls() {
  // Simple alert for now - could be a modal
  alert(`
🦈 SHARKY CONTROLS 🦈

MOVEMENT:
  W/A/S/D - Swim forward/left/back/right
  Space - Swim up
  Shift - Swim down
  Q (hold) - Speed boost

CAMERA:
  Mouse - Look around
  Scroll - Zoom in/out

OTHER:
  R - Mutate creature
  N/B - Next/Previous species
  M - New map
  P - Toggle wireframes
  F - Debug info
  `)
}

// ============================================================================
// VISIBILITY
// ============================================================================

export function showMenu() {
  if (!menuRoot) {
    console.warn('[Menu] Not initialized')
    return
  }

  menuRoot.style.display = 'flex'
  active = true
  spawnRequested = false

  // Ensure pointer is released for menu interaction
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }

  console.log('[Menu] Shown')
}

export function hideMenu() {
  if (!menuRoot) return

  menuRoot.style.display = 'none'
  active = false

  console.log('[Menu] Hidden')
}

// ============================================================================
// STATE / EVENTS
// ============================================================================

export function isMenuActive() {
  return active
}

export function wasSpawnRequested() {
  return spawnRequested
}

/**
 * Register a callback fired when Spawn is pressed
 * @param {Function} callback
 */
export function onSpawnRequested(callback) {
  if (typeof callback !== 'function') {
    console.warn('[Menu] onSpawnRequested expects a function')
    return () => {}
  }

  spawnCallbacks.push(callback)

  // Return unsubscribe
  return () => {
    const idx = spawnCallbacks.indexOf(callback)
    if (idx !== -1) spawnCallbacks.splice(idx, 1)
  }
}