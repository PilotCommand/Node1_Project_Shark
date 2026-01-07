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
let transitionOverlay = null
let active = false
let spawnRequested = false
let spawnCallbacks = []

// ============================================================================
// EASY-TO-EDIT CONFIGURATION
// ============================================================================

const CONFIG = {
  // -------------------------
  // SUN / LIGHT SOURCE
  // -------------------------
  sun: {
    left: '85%',           // Horizontal position of sun glow
    top: '-25%',           // Vertical position (negative = above viewport)
    width: 500,            // Width of glow in px
    height: 350,           // Height of glow in px
    blur: 30,              // Blur amount in px
    color: {
      inner: 'rgba(255, 250, 230, 0.4)',
      mid: 'rgba(200, 230, 255, 0.25)',
      outer: 'rgba(100, 200, 255, 0.1)'
    }
  },

  // -------------------------
  // LIGHT RAYS
  // -------------------------
  rays: {
    count: 12,             // Number of rays
    
    // Origin area (rays spawn randomly within this box)
    originArea: {
      leftMin: 70,         // % from left edge
      leftMax: 100,        // % from left edge  
      topMin: -18,         // % from top (negative = above)
      topMax: -5           // % from top
    },
    
    // Angle range (positive = points left, negative = points right)
    angleMin: 25,          // Minimum angle in degrees
    angleMax: 40,          // Maximum angle in degrees
    
    // Ray dimensions
    widthMin: 50,          // Minimum ray width in px
    widthMax: 120,         // Maximum ray width in px
    height: '140vh',       // Ray length
    
    // Opacity
    opacityMin: 0.10,      // Minimum base opacity
    opacityMax: 0.26,      // Maximum base opacity
    
    // Animation
    swayAmount: 6,         // Max degrees of sway (+/-)
    durationMin: 6,        // Fastest animation in seconds
    durationMax: 14,       // Slowest animation in seconds
    
    // Appearance
    blur: 6,               // Blur in px
    blurBright: 8,         // Blur for bright rays
    
    // How many rays should be "bright" (from the middle of the set)
    brightCount: 4,
    
    // Colors (gradient from top to bottom)
    colors: {
      normal: [
        { pos: 0, color: 'rgba(180, 220, 255, 0.5)' },
        { pos: 10, color: 'rgba(120, 200, 255, 0.3)' },
        { pos: 25, color: 'rgba(80, 180, 255, 0.18)' },
        { pos: 45, color: 'rgba(60, 160, 255, 0.1)' },
        { pos: 70, color: 'rgba(40, 140, 255, 0.04)' },
        { pos: 100, color: 'transparent' }
      ],
      bright: [
        { pos: 0, color: 'rgba(220, 240, 255, 0.65)' },
        { pos: 8, color: 'rgba(180, 230, 255, 0.45)' },
        { pos: 20, color: 'rgba(140, 210, 255, 0.28)' },
        { pos: 40, color: 'rgba(100, 190, 255, 0.14)' },
        { pos: 65, color: 'rgba(60, 160, 255, 0.06)' },
        { pos: 100, color: 'transparent' }
      ]
    }
  },

  // -------------------------
  // CAUSTICS (ripple patterns)
  // -------------------------
  caustics: {
    enabled: true,
    animationDuration: 15  // seconds
  },

  // -------------------------
  // BUBBLES
  // -------------------------
  bubbles: {
    count: 15,
    sizeMin: 10,           // px
    sizeMax: 50,           // px
    durationMin: 8,        // seconds
    durationMax: 20        // seconds
  },

  // -------------------------
  // DUST PARTICLES
  // -------------------------
  dust: {
    count: 30,
    sizeMin: 2,            // px
    sizeMax: 5,            // px
    durationMin: 6,        // seconds
    durationMax: 14        // seconds
  },

  // -------------------------
  // BACKGROUND
  // -------------------------
  background: {
    gradientStops: [
      { pos: 0, color: '#000a14' },
      { pos: 15, color: '#001525' },
      { pos: 35, color: '#002840' },
      { pos: 60, color: '#003b5c' },
      { pos: 85, color: '#004d6d' },
      { pos: 100, color: '#005577' }
    ]
  }
}

// ============================================================================
// STYLES GENERATOR
// ============================================================================

function generateStyles() {
  const bgGradient = CONFIG.background.gradientStops
    .map(s => `${s.color} ${s.pos}%`)
    .join(', ')

  const rayGradientNormal = CONFIG.rays.colors.normal
    .map(s => `${s.color} ${s.pos}%`)
    .join(', ')

  const rayGradientBright = CONFIG.rays.colors.bright
    .map(s => `${s.color} ${s.pos}%`)
    .join(', ')

  return `
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

    @keyframes sunPulse {
      0%, 100% {
        transform: translateX(-50%) scale(1);
        opacity: 1;
      }
      50% {
        transform: translateX(-50%) scale(1.1);
        opacity: 0.85;
      }
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
      background: linear-gradient(180deg, ${bgGradient});
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

    /* Light Rays Container */
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

    /* Sun Glow */
    .menu-sun-glow {
      position: absolute;
      left: ${CONFIG.sun.left};
      top: ${CONFIG.sun.top};
      width: ${CONFIG.sun.width}px;
      height: ${CONFIG.sun.height}px;
      transform: translateX(-50%);
      background: radial-gradient(
        ellipse at center,
        ${CONFIG.sun.color.inner} 0%,
        ${CONFIG.sun.color.mid} 30%,
        ${CONFIG.sun.color.outer} 60%,
        transparent 100%
      );
      filter: blur(${CONFIG.sun.blur}px);
      animation: sunPulse 8s ease-in-out infinite;
    }

    /* Base Ray Style */
    .menu-ray {
      position: absolute;
      height: ${CONFIG.rays.height};
      transform-origin: top center;
      background: linear-gradient(180deg, ${rayGradientNormal});
      filter: blur(${CONFIG.rays.blur}px);
    }

    .menu-ray-bright {
      background: linear-gradient(180deg, ${rayGradientBright});
      filter: blur(${CONFIG.rays.blurBright}px);
    }

    /* Caustics */
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
      mix-blend-mode: screen;
      opacity: 0;
      animation: contentFadeIn 2s ease-out forwards, causticShimmer ${CONFIG.caustics.animationDuration}s ease-in-out infinite;
      animation-delay: 1s, 0s;
    }

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

    /* Dust Particles */
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
      background: rgba(200, 230, 255, 0.8);
      border-radius: 50%;
      filter: blur(1px);
      animation: dustFloat linear infinite;
    }

    /* Bubbles */
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

    /* Shark Background */
    .menu-shark-bg {
      position: absolute;
      font-size: 120px;
      opacity: 0;
      animation: sharkFadeIn 2s ease-out forwards, swim 20s linear infinite;
      animation-delay: 1.5s, 0s;
      top: 30%;
      filter: blur(2px);
    }

    /* Content */
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
}

// ============================================================================
// RAY GENERATION
// ============================================================================

function generateRayKeyframes(index) {
  const sway = CONFIG.rays.swayAmount
  
  // Create varied animation patterns based on index
  const patterns = [
    // Pattern 1: Slow sweep
    `
      @keyframes raySway${index} {
        0% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.5}deg)) scaleY(0.95) scaleX(0.9);
          opacity: calc(var(--ray-opacity) * 0.7);
        }
        25% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.3}deg)) scaleY(1.08) scaleX(1.1);
          opacity: calc(var(--ray-opacity) * 1.3);
        }
        50% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.8}deg)) scaleY(1.02) scaleX(1.05);
          opacity: var(--ray-opacity);
        }
        75% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.2}deg)) scaleY(1.1) scaleX(0.95);
          opacity: calc(var(--ray-opacity) * 1.4);
        }
        100% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.5}deg)) scaleY(0.95) scaleX(0.9);
          opacity: calc(var(--ray-opacity) * 0.7);
        }
      }
    `,
    // Pattern 2: Medium oscillation
    `
      @keyframes raySway${index} {
        0% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.3}deg)) scaleY(1.05) scaleX(1);
          opacity: var(--ray-opacity);
        }
        20% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.5}deg)) scaleY(0.92) scaleX(1.15);
          opacity: calc(var(--ray-opacity) * 1.5);
        }
        40% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.8}deg)) scaleY(1.1) scaleX(0.85);
          opacity: calc(var(--ray-opacity) * 0.8);
        }
        60% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.2}deg)) scaleY(0.98) scaleX(1.1);
          opacity: calc(var(--ray-opacity) * 1.2);
        }
        80% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.6}deg)) scaleY(1.06) scaleX(0.95);
          opacity: calc(var(--ray-opacity) * 0.9);
        }
        100% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.3}deg)) scaleY(1.05) scaleX(1);
          opacity: var(--ray-opacity);
        }
      }
    `,
    // Pattern 3: Fast flicker
    `
      @keyframes raySway${index} {
        0%, 100% { 
          transform: rotate(var(--ray-angle)) scaleY(1) scaleX(1);
          opacity: var(--ray-opacity);
        }
        15% { 
          transform: rotate(calc(var(--ray-angle) + ${sway}deg)) scaleY(1.15) scaleX(1.2);
          opacity: calc(var(--ray-opacity) * 1.6);
        }
        30% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.3}deg)) scaleY(0.9) scaleX(0.8);
          opacity: calc(var(--ray-opacity) * 0.6);
        }
        50% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.6}deg)) scaleY(1.08) scaleX(1.1);
          opacity: calc(var(--ray-opacity) * 1.3);
        }
        70% { 
          transform: rotate(calc(var(--ray-angle) - ${sway}deg)) scaleY(0.95) scaleX(0.9);
          opacity: calc(var(--ray-opacity) * 0.8);
        }
        85% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.3}deg)) scaleY(1.12) scaleX(1.15);
          opacity: calc(var(--ray-opacity) * 1.4);
        }
      }
    `,
    // Pattern 4: Gentle drift
    `
      @keyframes raySway${index} {
        0% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.3}deg)) scaleY(1.02) scaleX(1);
          opacity: calc(var(--ray-opacity) * 0.9);
        }
        33% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.6}deg)) scaleY(1.12) scaleX(1.2);
          opacity: calc(var(--ray-opacity) * 1.5);
        }
        66% { 
          transform: rotate(calc(var(--ray-angle) + ${sway * 0.2}deg)) scaleY(0.94) scaleX(0.85);
          opacity: calc(var(--ray-opacity) * 0.7);
        }
        100% { 
          transform: rotate(calc(var(--ray-angle) - ${sway * 0.3}deg)) scaleY(1.02) scaleX(1);
          opacity: calc(var(--ray-opacity) * 0.9);
        }
      }
    `
  ]
  
  return patterns[index % patterns.length]
}

function createRay(index, total) {
  const cfg = CONFIG.rays
  const ray = document.createElement('div')
  ray.className = 'menu-ray'
  
  // Distribute angle across the range
  const angleRange = cfg.angleMax - cfg.angleMin
  const angle = cfg.angleMin + (angleRange * (index / (total - 1)))
  
  // Random position within origin area
  const left = cfg.originArea.leftMin + Math.random() * (cfg.originArea.leftMax - cfg.originArea.leftMin)
  const top = cfg.originArea.topMin + Math.random() * (cfg.originArea.topMax - cfg.originArea.topMin)
  
  // Random width within range
  const width = cfg.widthMin + Math.random() * (cfg.widthMax - cfg.widthMin)
  
  // Opacity based on position (brighter in middle)
  const middleIndex = total / 2
  const distFromMiddle = Math.abs(index - middleIndex) / middleIndex
  const opacity = cfg.opacityMax - (distFromMiddle * (cfg.opacityMax - cfg.opacityMin))
  
  // Animation duration
  const duration = cfg.durationMin + Math.random() * (cfg.durationMax - cfg.durationMin)
  const delay = -Math.random() * duration
  
  // Apply styles
  ray.style.cssText = `
    --ray-angle: ${angle}deg;
    --ray-opacity: ${opacity};
    left: ${left}%;
    top: ${top}%;
    width: ${width}px;
    margin-left: ${-width / 2}px;
    animation: raySway${index} ${duration}s ease-in-out infinite;
    animation-delay: ${delay}s;
  `
  
  // Mark central rays as bright
  const brightStart = Math.floor((total - cfg.brightCount) / 2)
  const brightEnd = brightStart + cfg.brightCount
  if (index >= brightStart && index < brightEnd) {
    ray.classList.add('menu-ray-bright')
  }
  
  return ray
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMenu() {
  if (menuRoot) {
    console.warn('[Menu] Already initialized')
    return
  }

  // Generate and inject styles
  const styleSheet = document.createElement('style')
  styleSheet.textContent = generateStyles()
  
  // Add ray keyframes
  for (let i = 0; i < CONFIG.rays.count; i++) {
    styleSheet.textContent += generateRayKeyframes(i)
  }
  
  document.head.appendChild(styleSheet)

  // Create transition overlay
  transitionOverlay = document.createElement('div')
  transitionOverlay.className = 'menu-transition-overlay'
  document.body.appendChild(transitionOverlay)

  // Root container
  menuRoot = document.createElement('div')
  menuRoot.id = 'game-menu'

  // Black overlay for fade-in
  const blackOverlay = document.createElement('div')
  blackOverlay.className = 'menu-black-overlay'
  menuRoot.appendChild(blackOverlay)

  // ==========================================
  // LIGHT RAYS
  // ==========================================
  const lightRays = document.createElement('div')
  lightRays.className = 'menu-light-rays'
  
  // Sun glow
  const sunGlow = document.createElement('div')
  sunGlow.className = 'menu-sun-glow'
  lightRays.appendChild(sunGlow)
  
  // Generate rays
  for (let i = 0; i < CONFIG.rays.count; i++) {
    lightRays.appendChild(createRay(i, CONFIG.rays.count))
  }
  menuRoot.appendChild(lightRays)

  // ==========================================
  // CAUSTICS
  // ==========================================
  if (CONFIG.caustics.enabled) {
    const caustics = document.createElement('div')
    caustics.className = 'menu-caustics'
    menuRoot.appendChild(caustics)

    const causticsSecondary = document.createElement('div')
    causticsSecondary.className = 'menu-caustics-secondary'
    menuRoot.appendChild(causticsSecondary)
  }

  // ==========================================
  // DUST PARTICLES
  // ==========================================
  const dustContainer = document.createElement('div')
  dustContainer.className = 'menu-dust-particles'
  
  for (let i = 0; i < CONFIG.dust.count; i++) {
    const dust = document.createElement('div')
    dust.className = 'menu-dust'
    const size = CONFIG.dust.sizeMin + Math.random() * (CONFIG.dust.sizeMax - CONFIG.dust.sizeMin)
    dust.style.left = `${Math.random() * 100}%`
    dust.style.top = `${30 + Math.random() * 70}%`
    dust.style.width = `${size}px`
    dust.style.height = `${size}px`
    dust.style.animationDuration = `${CONFIG.dust.durationMin + Math.random() * (CONFIG.dust.durationMax - CONFIG.dust.durationMin)}s`
    dust.style.animationDelay = `${Math.random() * 10}s`
    dustContainer.appendChild(dust)
  }
  menuRoot.appendChild(dustContainer)

  // ==========================================
  // BUBBLES
  // ==========================================
  const bubblesContainer = document.createElement('div')
  bubblesContainer.className = 'menu-bubbles'
  
  for (let i = 0; i < CONFIG.bubbles.count; i++) {
    const bubble = document.createElement('div')
    bubble.className = 'menu-bubble'
    const size = CONFIG.bubbles.sizeMin + Math.random() * (CONFIG.bubbles.sizeMax - CONFIG.bubbles.sizeMin)
    bubble.style.width = `${size}px`
    bubble.style.height = `${size}px`
    bubble.style.left = `${Math.random() * 100}%`
    bubble.style.animationDuration = `${CONFIG.bubbles.durationMin + Math.random() * (CONFIG.bubbles.durationMax - CONFIG.bubbles.durationMin)}s`
    bubble.style.animationDelay = `${Math.random() * 10}s`
    bubblesContainer.appendChild(bubble)
  }
  menuRoot.appendChild(bubblesContainer)

  // Swimming shark background
  const sharkBg = document.createElement('div')
  sharkBg.className = 'menu-shark-bg'
  sharkBg.textContent = '🦈'
  menuRoot.appendChild(sharkBg)

  // ==========================================
  // MAIN CONTENT
  // ==========================================
  const content = document.createElement('div')
  content.className = 'menu-content'

  const sharkIcon = document.createElement('div')
  sharkIcon.className = 'menu-shark-icon'
  sharkIcon.textContent = '🦈'
  content.appendChild(sharkIcon)

  const title = document.createElement('div')
  title.className = 'menu-title'
  title.textContent = 'SHARKY'
  content.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.className = 'menu-subtitle'
  subtitle.textContent = 'OCEAN SURVIVAL'
  content.appendChild(subtitle)

  const buttons = document.createElement('div')
  buttons.className = 'menu-buttons'

  const playBtn = document.createElement('button')
  playBtn.className = 'menu-btn menu-btn-primary'
  playBtn.textContent = '🌊 Dive In'
  playBtn.addEventListener('click', handleSpawn)
  buttons.appendChild(playBtn)

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
  console.log('[Menu] Initialized with configurable light rays')
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