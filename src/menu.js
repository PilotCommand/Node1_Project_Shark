/**
 * menu.js — Main Menu State Controller (Enhanced with Light Rays)
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
let transitionOverlay = null
let active = false
let spawnRequested = false
let spawnCallbacks = []

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  @keyframes overlayFadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  
  @keyframes overlayFadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  
  @keyframes contentFadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  
  @keyframes contentFadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
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

  @keyframes sharkFadeIn {
    0% { opacity: 0; }
    100% { opacity: 0.08; }
  }

  /* ========================================
     UNDERWATER LIGHT RAYS / CAUSTICS
     ======================================== */
  
  @keyframes rayMove1 {
    0%, 100% { 
      transform: translateX(0) skewX(-15deg) scaleY(1);
      opacity: 0.15;
    }
    25% { 
      transform: translateX(30px) skewX(-18deg) scaleY(1.1);
      opacity: 0.25;
    }
    50% { 
      transform: translateX(-20px) skewX(-12deg) scaleY(0.95);
      opacity: 0.12;
    }
    75% { 
      transform: translateX(15px) skewX(-20deg) scaleY(1.05);
      opacity: 0.2;
    }
  }
  
  @keyframes rayMove2 {
    0%, 100% { 
      transform: translateX(0) skewX(-20deg) scaleY(1);
      opacity: 0.12;
    }
    33% { 
      transform: translateX(-40px) skewX(-25deg) scaleY(1.15);
      opacity: 0.22;
    }
    66% { 
      transform: translateX(25px) skewX(-15deg) scaleY(0.9);
      opacity: 0.1;
    }
  }
  
  @keyframes rayMove3 {
    0%, 100% { 
      transform: translateX(0) skewX(-10deg) scaleY(1);
      opacity: 0.18;
    }
    40% { 
      transform: translateX(50px) skewX(-8deg) scaleY(1.08);
      opacity: 0.28;
    }
    80% { 
      transform: translateX(-30px) skewX(-14deg) scaleY(0.92);
      opacity: 0.14;
    }
  }

  @keyframes rayFlicker {
    0%, 100% { opacity: 0.15; }
    20% { opacity: 0.25; }
    40% { opacity: 0.1; }
    60% { opacity: 0.3; }
    80% { opacity: 0.18; }
  }

  @keyframes causticShimmer {
    0% { 
      background-position: 0% 0%;
      opacity: 0.03;
    }
    50% { 
      background-position: 100% 100%;
      opacity: 0.08;
    }
    100% { 
      background-position: 0% 0%;
      opacity: 0.03;
    }
  }

  .menu-light-rays {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    opacity: 0;
    animation: contentFadeIn 3s ease-out forwards;
    animation-delay: 0.5s;
  }

  .menu-ray {
    position: absolute;
    top: -20%;
    height: 140%;
    background: linear-gradient(
      180deg,
      rgba(120, 200, 255, 0.4) 0%,
      rgba(80, 180, 255, 0.25) 20%,
      rgba(60, 160, 255, 0.15) 40%,
      rgba(40, 140, 255, 0.08) 60%,
      rgba(20, 120, 255, 0.03) 80%,
      transparent 100%
    );
    filter: blur(8px);
    transform-origin: top center;
  }

  .menu-ray-1 {
    left: 5%;
    width: 80px;
    animation: rayMove1 8s ease-in-out infinite;
  }

  .menu-ray-2 {
    left: 15%;
    width: 120px;
    animation: rayMove2 12s ease-in-out infinite;
    animation-delay: -2s;
  }

  .menu-ray-3 {
    left: 28%;
    width: 60px;
    animation: rayMove3 10s ease-in-out infinite;
    animation-delay: -4s;
  }

  .menu-ray-4 {
    left: 40%;
    width: 150px;
    animation: rayMove1 14s ease-in-out infinite;
    animation-delay: -6s;
  }

  .menu-ray-5 {
    left: 55%;
    width: 90px;
    animation: rayMove2 9s ease-in-out infinite;
    animation-delay: -3s;
  }

  .menu-ray-6 {
    left: 68%;
    width: 110px;
    animation: rayMove3 11s ease-in-out infinite;
    animation-delay: -5s;
  }

  .menu-ray-7 {
    left: 80%;
    width: 70px;
    animation: rayMove1 13s ease-in-out infinite;
    animation-delay: -1s;
  }

  .menu-ray-8 {
    left: 90%;
    width: 100px;
    animation: rayMove2 10s ease-in-out infinite;
    animation-delay: -7s;
  }

  /* Brighter central rays */
  .menu-ray-bright {
    background: linear-gradient(
      180deg,
      rgba(180, 230, 255, 0.5) 0%,
      rgba(140, 210, 255, 0.35) 15%,
      rgba(100, 190, 255, 0.2) 35%,
      rgba(70, 160, 255, 0.1) 55%,
      rgba(40, 130, 255, 0.04) 75%,
      transparent 100%
    );
    filter: blur(12px);
  }

  /* Caustic overlay effect - the rippling light patterns */
  .menu-caustics {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    background: 
      radial-gradient(ellipse 100px 200px at 20% 30%, rgba(100, 200, 255, 0.15), transparent),
      radial-gradient(ellipse 150px 300px at 50% 20%, rgba(120, 210, 255, 0.12), transparent),
      radial-gradient(ellipse 80px 180px at 75% 40%, rgba(90, 190, 255, 0.1), transparent),
      radial-gradient(ellipse 120px 250px at 35% 60%, rgba(110, 200, 255, 0.08), transparent),
      radial-gradient(ellipse 90px 200px at 85% 25%, rgba(100, 195, 255, 0.1), transparent);
    background-size: 200% 200%;
    animation: causticShimmer 15s ease-in-out infinite;
    mix-blend-mode: screen;
    opacity: 0;
    animation: contentFadeIn 2s ease-out forwards, causticShimmer 15s ease-in-out infinite;
    animation-delay: 1s, 0s;
  }

  /* Secondary caustic layer for depth */
  .menu-caustics-secondary {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    background: 
      radial-gradient(ellipse 60px 150px at 10% 50%, rgba(150, 220, 255, 0.1), transparent),
      radial-gradient(ellipse 100px 220px at 60% 35%, rgba(130, 215, 255, 0.08), transparent),
      radial-gradient(ellipse 70px 160px at 90% 55%, rgba(140, 210, 255, 0.12), transparent);
    background-size: 150% 150%;
    animation: causticShimmer 20s ease-in-out infinite reverse;
    animation-delay: -5s;
    mix-blend-mode: screen;
    opacity: 0.5;
  }

  /* Dust particles / floating specs in light */
  @keyframes dustFloat {
    0%, 100% {
      transform: translateY(0) translateX(0);
      opacity: 0;
    }
    10% { opacity: 0.6; }
    50% {
      transform: translateY(-200px) translateX(30px);
      opacity: 0.4;
    }
    90% { opacity: 0.6; }
  }

  .menu-dust-particles {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  }

  .menu-dust {
    position: absolute;
    width: 3px;
    height: 3px;
    background: rgba(200, 230, 255, 0.8);
    border-radius: 50%;
    filter: blur(1px);
    animation: dustFloat linear infinite;
  }

  /* ========================================
     EXISTING STYLES (preserved)
     ======================================== */

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
      #000a14 0%,
      #001525 15%,
      #002840 35%, 
      #003b5c 60%, 
      #004d6d 85%,
      #005577 100%
    );
    z-index: 1000;
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
  }

  .menu-black-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000000;
    z-index: 9999;
    animation: overlayFadeOut 1.5s ease-out forwards;
    animation-delay: 0.3s;
    pointer-events: none;
  }

  .menu-transition-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000000;
    z-index: 10000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.8s ease-in-out;
  }

  .menu-transition-overlay.fade-in {
    opacity: 1;
  }

  .menu-transition-overlay.fade-out {
    opacity: 0;
  }

  .menu-bubbles {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    opacity: 0;
    animation: contentFadeIn 2s ease-out forwards;
    animation-delay: 1s;
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
    opacity: 0;
    animation: sharkFadeIn 2s ease-out forwards, swim 20s linear infinite;
    animation-delay: 1.5s, 0s;
    top: 30%;
    filter: blur(2px);
  }

  .menu-content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    opacity: 0;
    animation: contentFadeIn 1s ease-out forwards;
    animation-delay: 0.8s;
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
    opacity: 0;
    animation: contentFadeIn 1s ease-out forwards;
    animation-delay: 1.2s;
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

  // Create transition overlay (for fade to/from black when starting game)
  transitionOverlay = document.createElement('div')
  transitionOverlay.className = 'menu-transition-overlay'
  document.body.appendChild(transitionOverlay)

  // Root container
  menuRoot = document.createElement('div')
  menuRoot.id = 'game-menu'

  // Black overlay for fade-in from black
  const blackOverlay = document.createElement('div')
  blackOverlay.className = 'menu-black-overlay'
  menuRoot.appendChild(blackOverlay)

  // ==========================================
  // LIGHT RAYS (new)
  // ==========================================
  const lightRays = document.createElement('div')
  lightRays.className = 'menu-light-rays'
  
  // Create multiple light ray beams
  for (let i = 1; i <= 8; i++) {
    const ray = document.createElement('div')
    ray.className = `menu-ray menu-ray-${i}`
    // Make some rays brighter
    if (i === 2 || i === 4 || i === 6) {
      ray.classList.add('menu-ray-bright')
    }
    lightRays.appendChild(ray)
  }
  menuRoot.appendChild(lightRays)

  // ==========================================
  // CAUSTICS OVERLAY (new)
  // ==========================================
  const caustics = document.createElement('div')
  caustics.className = 'menu-caustics'
  menuRoot.appendChild(caustics)

  const causticsSecondary = document.createElement('div')
  causticsSecondary.className = 'menu-caustics-secondary'
  menuRoot.appendChild(causticsSecondary)

  // ==========================================
  // DUST PARTICLES (new)
  // ==========================================
  const dustContainer = document.createElement('div')
  dustContainer.className = 'menu-dust-particles'
  
  for (let i = 0; i < 30; i++) {
    const dust = document.createElement('div')
    dust.className = 'menu-dust'
    dust.style.left = `${Math.random() * 100}%`
    dust.style.top = `${30 + Math.random() * 70}%`
    dust.style.animationDuration = `${6 + Math.random() * 8}s`
    dust.style.animationDelay = `${Math.random() * 10}s`
    dust.style.width = `${2 + Math.random() * 3}px`
    dust.style.height = dust.style.width
    dustContainer.appendChild(dust)
  }
  menuRoot.appendChild(dustContainer)

  // ==========================================
  // BUBBLES (existing)
  // ==========================================
  const bubblesContainer = document.createElement('div')
  bubblesContainer.className = 'menu-bubbles'
  
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
  subtitle.textContent = 'OCEAN SURVIVAL'
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

  // How to Play button
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
  hint.textContent = 'Developed by Mohammad Elassaad'
  footer.appendChild(hint)

  const version = document.createElement('div')
  version.className = 'menu-version'
  version.textContent = 'v0.1 Alpha'
  footer.appendChild(version)

  menuRoot.appendChild(footer)

  document.body.appendChild(menuRoot)

  hideMenu()
  console.log('[Menu] Initialized with underwater light rays')
}

// ============================================================================
// HANDLERS
// ============================================================================

function handleSpawn() {
  if (!active) return

  console.log('[Menu] Spawn requested - starting transition')
  spawnRequested = true
  active = false

  transitionOverlay.classList.add('fade-in')

  setTimeout(() => {
    hideMenu()

    spawnCallbacks.forEach(cb => {
      try {
        cb()
      } catch (err) {
        console.error('[Menu] Spawn callback error:', err)
      }
    })

    setTimeout(() => {
      transitionOverlay.classList.remove('fade-in')
      transitionOverlay.classList.add('fade-out')
      
      setTimeout(() => {
        transitionOverlay.classList.remove('fade-out')
      }, 800)
    }, 200)

  }, 800)
}

function showControls() {
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

export function onSpawnRequested(callback) {
  if (typeof callback !== 'function') {
    console.warn('[Menu] onSpawnRequested expects a function')
    return () => {}
  }

  spawnCallbacks.push(callback)

  return () => {
    const idx = spawnCallbacks.indexOf(callback)
    if (idx !== -1) spawnCallbacks.splice(idx, 1)
  }
}