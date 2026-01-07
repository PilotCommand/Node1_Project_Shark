/**
 * menuselector.js - Creature & Ability Selector Menu
 * 
 * A sub-menu that appears when "Selector" is clicked from the main menu.
 * Allows players to choose their starting creature and ability before spawning.
 * 
 * Features:
 * - Split panel selection for Type and Class
 * - Carousel navigation for Variants
 * - Live 3D preview of selected creature
 * - Visual preview cards with creature info
 * - Smooth transitions with the main menu
 */

import * as THREE from 'three'

import { 
  getAllCreatureClasses, 
  getCreatureDisplayName,
  getCreatureTypeMeta,
  getOrderedCreatureTypes,
  getCreatureClasses,
  CreatureType,
  generateCreature,
} from './Encyclopedia.js'

import {
  getClassVariants,
  getVariantCount,
  getVariantName,
  hasVariants,
} from './Fishes.js'

// ============================================================================
// STATE
// ============================================================================

let selectorRoot = null
let isVisible = false

// Current selections
let selectedType = CreatureType.FISH
let selectedClassIndex = 0
let selectedVariantIndex = 0
let selectedAbilityIndex = 0

// Creature data (populated on init)
let creatureTypes = []
let currentClasses = []

// 3D Preview
let previewScene = null
let previewCamera = null
let previewRenderer = null
let previewMesh = null
let previewAnimationId = null
let previewSeed = Math.floor(Math.random() * 0xFFFFFFFF)

// Preview drag controls
let isDragging = false
let previousMouseX = 0
let previousMouseY = 0
let meshQuaternion = new THREE.Quaternion()
let autoRotate = true

// Ability definitions (mirrored from ExtraControls.js)
const ABILITIES = [
  {
    key: 'sprinter',
    name: 'Speed',
    emoji: '\u26A1',        // ⚡
    description: 'Boost movement',
    color: '#00ffaa',
  },
  {
    key: 'stacker',
    name: 'Build',
    emoji: '\uD83D\uDD37',  // 🔷
    description: 'Place structures',
    color: '#aa88ff',
  },
  {
    key: 'camper',
    name: 'Hide',
    emoji: '\uD83D\uDC41',  // 👁
    description: 'Become surroundings',
    color: '#88aa55',
  },
  {
    key: 'attacker',
    name: 'Detect',
    emoji: '\uD83C\uDFAF',  // 🎯
    description: 'Reveal threats',
    color: '#ff5555',
  },
]

// Emoji mapping to fix corrupted unicode from source files
const TYPE_EMOJI = {
  fish: '\uD83D\uDC1F',        // 🐟
  mammal: '\uD83D\uDC2C',      // 🐬
  crustacean: '\uD83E\uDD80',  // 🦀
  cephalopod: '\uD83D\uDC19', // 🐙
  jelly: '\uD83E\uDEBC',       // 🪼
  sea_cucumber: '\uD83E\uDD52', // 🥒
}

const CLASS_EMOJI = {
  // Fish
  starter: '\u2B50',           // ⭐
  shark: '\uD83E\uDD88',       // 🦈
  hammerhead: '\uD83D\uDD28',  // 🔨
  ray: '\uD83E\uDD85',         // 🦅
  manta: '\uD83E\uDD85',       // 🦅
  eel: '\uD83D\uDC0D',         // 🐍
  moray: '\uD83D\uDC0D',       // 🐍
  barracuda: '\uD83D\uDC1F',   // 🐟
  tuna: '\uD83D\uDC1F',        // 🐟
  marlin: '\uD83D\uDDE1',      // 🗡️
  flyingfish: '\u2708',        // ✈️
  grouper: '\uD83D\uDC1F',     // 🐟
  tang: '\uD83D\uDC20',        // 🐠
  angelfish: '\uD83D\uDC20',   // 🐠
  lionfish: '\uD83E\uDD81',    // 🦁
  betta: '\uD83D\uDC51',       // 👑
  puffer: '\uD83D\uDC21',      // 🐡
  piranha: '\uD83D\uDE08',     // 😈
  seahorse: '\uD83D\uDC34',    // 🐴
  anglerfish: '\uD83D\uDD26',  // 🔦
  sunfish: '\uD83C\uDF1E',     // 🌞
  flounder: '\uD83D\uDC1F',    // 🐟
  catfish: '\uD83D\uDC31',     // 🐱
  
  // Mammals
  blue_whale: '\uD83D\uDC0B',  // 🐋
  humpback: '\uD83D\uDC0B',    // 🐋
  sperm_whale: '\uD83D\uDC0B', // 🐋
  beluga: '\uD83D\uDC33',      // 🐳
  narwhal: '\uD83E\uDD84',     // 🦄
  pilot_whale: '\uD83D\uDC0B', // 🐋
  dolphin: '\uD83D\uDC2C',     // 🐬
  orca: '\uD83D\uDC2C',        // 🐬
  seal: '\uD83E\uDDAD',        // 🦭
  sea_lion: '\uD83E\uDDAD',    // 🦭
  walrus: '\uD83E\uDDAD',      // 🦭
  sea_otter: '\uD83E\uDDA6',   // 🦦
  manatee: '\uD83D\uDC18',     // 🐘
  
  // Crustaceans
  crab: '\uD83E\uDD80',        // 🦀
  king_crab: '\uD83E\uDD80',   // 🦀
  spider_crab: '\uD83E\uDD80', // 🦀
  coconut_crab: '\uD83E\uDD65', // 🥥
  fiddler_crab: '\uD83E\uDD80', // 🦀
  lobster: '\uD83E\uDD9E',     // 🦞
  crayfish: '\uD83E\uDD9E',    // 🦞
  shrimp: '\uD83E\uDD90',      // 🦐
  mantis_shrimp: '\uD83E\uDD90', // 🦐
  pistol_shrimp: '\uD83E\uDD90', // 🦐
  horseshoe_crab: '\uD83E\uDD80', // 🦀
  
  // Cephalopods
  octopus: '\uD83D\uDC19',     // 🐙
  giant_pacific_octopus: '\uD83D\uDC19', // 🐙
  blue_ringed_octopus: '\uD83D\uDC19', // 🐙
  dumbo_octopus: '\uD83D\uDC19', // 🐙
  mimic_octopus: '\uD83D\uDC19', // 🐙
  squid: '\uD83E\uDD91',       // 🦑
  giant_squid: '\uD83E\uDD91', // 🦑
  humboldt_squid: '\uD83E\uDD91', // 🦑
  firefly_squid: '\uD83E\uDD91', // 🦑
  colossal_squid: '\uD83E\uDD91', // 🦑
  cuttlefish: '\uD83E\uDD91',  // 🦑
  flamboyant_cuttlefish: '\uD83E\uDD91', // 🦑
  pharaoh_cuttlefish: '\uD83E\uDD91', // 🦑
  nautilus: '\uD83D\uDC1A',    // 🐚
  
  // Jellies
  moon_jelly: '\uD83E\uDEBC',  // 🪼
  lions_mane: '\uD83E\uDEBC', // 🪼
  barrel_jelly: '\uD83E\uDEBC', // 🪼
  fried_egg_jelly: '\uD83C\uDF73', // 🍳
  compass_jelly: '\uD83E\uDDED', // 🧭
  box_jelly: '\uD83D\uDCE6',   // 📦
  sea_wasp: '\uD83D\uDCE6',    // 📦
  portuguese_man_o_war: '\uD83E\uDEBC', // 🪼
  by_the_wind_sailor: '\u26F5', // ⛵
  crystal_jelly: '\uD83D\uDC8E', // 💎
  sea_gooseberry: '\uD83E\uDEBC', // 🪼
  bloodybelly_comb: '\uD83E\uDEBC', // 🪼
  venus_girdle: '\uD83E\uDEBC', // 🪼
  
  // Sea cucumbers
  sea_cucumber: '\uD83E\uDD52', // 🥒
  giant_california: '\uD83E\uDD52', // 🥒
  leopard_sea_cucumber: '\uD83E\uDD52', // 🥒
  sea_apple: '\uD83C\uDF4E',   // 🍎
  sea_pig: '\uD83D\uDC37',     // 🐷
  medusa_worm: '\uD83E\uDEB1', // 🪱
  sticky_snake: '\uD83D\uDC0D', // 🐍
  donkey_dung: '\uD83E\uDD52', // 🥒
}

// Helper to get correct emoji
function getTypeEmoji(type) {
  return TYPE_EMOJI[type] || '\uD83D\uDC1F'
}

function getClassEmoji(creatureClass) {
  return CLASS_EMOJI[creatureClass] || '\uD83D\uDC1F'
}

// Callbacks
let onBackCallback = null
let onSelectionChangeCallback = null

// ============================================================================
// STYLES
// ============================================================================

function generateStyles() {
  return `
    /* ========================================
       SELECTOR CONTAINER
       ======================================== */
    
    #selector-menu {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease-out;
    }
    
    #selector-menu.visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* ========================================
       MAIN LAYOUT
       ======================================== */
    
    .selector-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
      max-width: 1275px;
      width: 95%;
    }
    
    .selector-title {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 6px;
      color: transparent;
      background: linear-gradient(135deg, 
        #00d4ff 0%, 
        #ffffff 50%, 
        #00d4ff 100%
      );
      background-clip: text;
      -webkit-background-clip: text;
      text-transform: uppercase;
      text-shadow: 0 0 40px rgba(0, 200, 255, 0.4);
      animation: selectorTitlePulse 3s ease-in-out infinite;
    }
    
    @keyframes selectorTitlePulse {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.2); }
    }
    
    /* ========================================
       MAIN SELECTOR LAYOUT
       ======================================== */
    
    .selector-main {
      display: flex;
      flex-direction: row;
      gap: 22px;
      width: 100%;
    }
    
    /* ========================================
       LEFT SECTION: CREATURE SELECTION
       ======================================== */
    
    .creature-section {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    /* ========================================
       UNIFIED CREATURE PANEL
       ======================================== */
    
    .creature-panel {
      background: linear-gradient(180deg, 
        rgba(0, 30, 60, 0.9) 0%,
        rgba(0, 20, 45, 0.95) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.25);
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      min-height: 480px;
    }
    
    .panel-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-right: 1px solid rgba(0, 200, 255, 0.15);
      min-width: 0;
    }
    
    .panel-right {
      width: 330px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    
    .panel-section {
      padding: 15px 18px;
    }
    
    .panel-section:not(:last-child) {
      border-bottom: 1px solid rgba(0, 200, 255, 0.15);
    }
    
    .panel-section-header {
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 12px;
      font-weight: 600;
    }
    
    /* ========================================
       TYPE TAB MENU
       ======================================== */
    
    .type-tabs {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .type-tab {
      padding: 12px 21px;
      background: rgba(0, 50, 80, 0.5);
      border: 2px solid rgba(0, 200, 255, 0.2);
      border-radius: 30px;
      cursor: pointer;
      font-size: 18px;
      font-weight: 500;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 9px;
      color: rgba(180, 210, 230, 0.8);
    }
    
    .type-tab:hover {
      background: rgba(0, 80, 120, 0.6);
      border-color: rgba(0, 200, 255, 0.4);
      color: #fff;
    }
    
    .type-tab.selected {
      background: linear-gradient(135deg, rgba(0, 120, 180, 0.8), rgba(0, 80, 140, 0.6));
      border-color: #00d4ff;
      color: #fff;
      box-shadow: 0 0 15px rgba(0, 200, 255, 0.3);
    }
    
    .type-tab .emoji {
      font-size: 21px;
    }
    
    /* ========================================
       CLASS LIST
       ======================================== */
    
    .class-list {
      max-height: 225px;
      overflow-y: auto;
      margin: -6px;
      padding: 6px;
    }
    
    .class-list::-webkit-scrollbar {
      width: 9px;
    }
    
    .class-list::-webkit-scrollbar-track {
      background: rgba(0, 40, 70, 0.5);
      border-radius: 4px;
    }
    
    .class-list::-webkit-scrollbar-thumb {
      background: rgba(0, 150, 200, 0.5);
      border-radius: 4px;
    }
    
    .class-item {
      padding: 12px 15px;
      cursor: pointer;
      border-radius: 9px;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 15px;
      transition: all 0.15s;
      margin-bottom: 3px;
      color: rgba(220, 235, 245, 0.9);
    }
    
    .class-item:hover {
      background: rgba(0, 100, 150, 0.3);
      color: #fff;
    }
    
    .class-item.selected {
      background: linear-gradient(90deg, rgba(0, 150, 200, 0.5), rgba(0, 100, 150, 0.3));
      border-left: 4px solid #00d4ff;
      color: #fff;
    }
    
    .class-item .name {
      flex: 1;
    }
    
    .class-item .count {
      font-size: 15px;
      color: rgba(150, 200, 230, 0.6);
      background: rgba(0, 80, 120, 0.4);
      padding: 3px 12px;
      border-radius: 15px;
    }
    
    /* ========================================
       VARIANT CAROUSEL
       ======================================== */
    
    .variant-carousel {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .variant-nav {
      width: 54px;
      height: 54px;
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.7), rgba(0, 70, 120, 0.6));
      border: 2px solid rgba(0, 200, 255, 0.4);
      border-radius: 50%;
      cursor: pointer;
      color: #00d4ff;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .variant-nav:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(0, 150, 200, 0.8), rgba(0, 100, 150, 0.7));
      border-color: #00d4ff;
      transform: scale(1.1);
      box-shadow: 0 0 20px rgba(0, 200, 255, 0.4);
    }
    
    .variant-nav:active:not(:disabled) {
      transform: scale(0.95);
    }
    
    .variant-nav:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    
    .variant-display {
      flex: 1;
      background: rgba(0, 50, 80, 0.5);
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 12px;
      padding: 12px 18px;
      text-align: center;
    }
    
    .variant-display .variant-name {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
    }
    
    .variant-display .variant-counter {
      font-size: 14px;
      color: rgba(150, 200, 230, 0.5);
      margin-top: 3px;
    }
    
    .variant-display.disabled {
      opacity: 0.5;
    }
    
    /* ========================================
       PREVIEW SECTION (inside panel)
       ======================================== */
    
    .preview-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    
    .preview-box {
      flex: 1;
      background: linear-gradient(180deg, rgba(0, 15, 30, 0.9), rgba(0, 25, 45, 0.95));
      position: relative;
      min-height: 200px;
    }
    
    .preview-box canvas {
      width: 100% !important;
      height: 100% !important;
      cursor: grab;
      user-select: none;
    }
    
    .preview-box canvas:active {
      cursor: grabbing;
    }
    
    .preview-label {
      position: absolute;
      top: 12px;
      left: 12px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(0, 200, 255, 0.6);
      background: rgba(0, 20, 40, 0.8);
      padding: 5px 10px;
      border-radius: 6px;
      z-index: 10;
      pointer-events: none;
    }
    
    .preview-info {
      padding: 12px 15px;
      text-align: center;
      border-top: 1px solid rgba(0, 200, 255, 0.15);
      min-height: 85px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .preview-info .creature-name {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 3px;
      line-height: 1.2;
      word-wrap: break-word;
    }
    
    .preview-info .creature-type {
      font-size: 14px;
      color: rgba(0, 200, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    
    .preview-info .creature-variant {
      font-size: 14px;
      color: rgba(150, 200, 230, 0.5);
      margin-top: 4px;
    }
    
    /* ========================================
       ABILITY PANEL (Right side)
       ======================================== */
    
    .ability-panel {
      width: 280px;
      flex-shrink: 0;
      display: flex;
      min-height: 480px;
    }
    
    .ability-section {
      background: linear-gradient(180deg, 
        rgba(0, 30, 60, 0.9) 0%,
        rgba(0, 20, 45, 0.95) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.25);
      border-radius: 18px;
      padding: 18px 22px;
      flex: 1;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    
    .ability-header {
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .ability-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }
    
    .ability-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: rgba(0, 40, 70, 0.5);
      border: 2px solid transparent;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      flex: 1;
    }
    
    .ability-item:hover {
      background: rgba(0, 60, 100, 0.6);
      border-color: rgba(0, 200, 255, 0.3);
    }
    
    .ability-item.selected {
      background: linear-gradient(135deg, 
        rgba(0, 100, 150, 0.6) 0%,
        rgba(0, 80, 130, 0.4) 100%
      );
      border-color: var(--ability-color, #00d4ff);
      box-shadow: 0 0 18px rgba(0, 200, 255, 0.2);
    }
    
    .ability-emoji {
      font-size: 24px;
      width: 32px;
      text-align: center;
    }
    
    .ability-info {
      flex: 1;
      min-width: 0;
    }
    
    .ability-name {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    
    .ability-desc {
      font-size: 15px;
      color: rgba(150, 200, 230, 0.6);
    }
    
    .ability-check {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid rgba(0, 200, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: transparent;
      transition: all 0.2s ease;
    }
    
    .ability-item.selected .ability-check {
      background: var(--ability-color, #00d4ff);
      border-color: var(--ability-color, #00d4ff);
      color: #000;
    }
    
    /* ========================================
       BUTTONS
       ======================================== */
    
    .selector-buttons {
      display: flex;
      gap: 22px;
      margin-top: 8px;
    }
    
    .selector-btn {
      padding: 15px 42px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      border: 2px solid rgba(0, 200, 255, 0.4);
      border-radius: 30px;
      background: linear-gradient(135deg, 
        rgba(0, 60, 100, 0.8) 0%, 
        rgba(0, 100, 150, 0.6) 100%
      );
      color: #fff;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    
    .selector-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, 
        transparent, 
        rgba(255, 255, 255, 0.15), 
        transparent
      );
      transition: left 0.5s ease;
    }
    
    .selector-btn:hover::before {
      left: 100%;
    }
    
    .selector-btn:hover {
      border-color: #00d4ff;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 200, 255, 0.3);
    }
    
    .selector-btn:active {
      transform: translateY(0);
    }
    
    .selector-btn-back {
      background: linear-gradient(135deg, 
        rgba(80, 60, 100, 0.7) 0%, 
        rgba(60, 40, 80, 0.5) 100%
      );
      border-color: rgba(180, 150, 255, 0.3);
    }
    
    .selector-btn-back:hover {
      border-color: rgba(180, 150, 255, 0.7);
      box-shadow: 0 8px 25px rgba(150, 100, 255, 0.2);
    }
    
    .selector-btn-confirm {
      background: linear-gradient(135deg, 
        rgba(0, 150, 100, 0.8) 0%, 
        rgba(0, 200, 150, 0.6) 100%
      );
      border-color: rgba(0, 255, 180, 0.4);
      animation: confirmPulse 2s ease-in-out infinite;
    }
    
    .selector-btn-confirm:hover {
      border-color: rgba(0, 255, 180, 0.8);
      box-shadow: 0 8px 25px rgba(0, 255, 180, 0.3);
    }
    
    @keyframes confirmPulse {
      0%, 100% { box-shadow: 0 0 15px rgba(0, 255, 180, 0.2); }
      50% { box-shadow: 0 0 25px rgba(0, 255, 180, 0.4); }
    }
    
  `
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSelector() {
  if (selectorRoot) {
    console.warn('[Selector] Already initialized')
    return
  }
  
  // Build creature types list
  creatureTypes = getOrderedCreatureTypes()
  currentClasses = getCreatureClasses(selectedType)
  
  console.log(`[Selector] Loaded ${creatureTypes.length} creature types`)
  
  // Inject styles
  const styleSheet = document.createElement('style')
  styleSheet.textContent = generateStyles()
  document.head.appendChild(styleSheet)
  
  // Create root container
  selectorRoot = document.createElement('div')
  selectorRoot.id = 'selector-menu'
  
  // Build the UI
  selectorRoot.innerHTML = buildSelectorHTML()
  
  document.body.appendChild(selectorRoot)
  
  // Initialize 3D preview
  initPreview()
  
  // Attach event listeners
  attachEventListeners()
  
  // Initial render
  renderTypeList()
  renderClassList()
  renderVariantCarousel()
  updatePreviewInfo()
  updatePreviewMesh()
  updateAbilityDisplay()
  
  console.log('[Selector] Initialized')
}

function buildSelectorHTML() {
  return `
    <div class="selector-content">
      <div class="selector-title">Choose Your Form</div>
      
      <div class="selector-main">
        <!-- CREATURE SELECTION + PREVIEW PANEL -->
        <div class="creature-section">
          <div class="creature-panel">
            <!-- LEFT: Selection Controls -->
            <div class="panel-left">
              <!-- Type Section -->
              <div class="panel-section">
                <div class="panel-section-header">Type</div>
                <div class="type-tabs" id="type-tabs"></div>
              </div>
              
              <!-- Class Section -->
              <div class="panel-section">
                <div class="panel-section-header">Class</div>
                <div class="class-list" id="class-list"></div>
              </div>
              
              <!-- Variant Section -->
              <div class="panel-section">
                <div class="panel-section-header">Variant</div>
                <div class="variant-carousel">
                  <button class="variant-nav" id="variant-prev">\u25C0</button>
                  <div class="variant-display" id="variant-display">
                    <div class="variant-name">Default</div>
                    <div class="variant-counter"></div>
                  </div>
                  <button class="variant-nav" id="variant-next">\u25B6</button>
                </div>
              </div>
            </div>
            
            <!-- RIGHT: Preview -->
            <div class="panel-right">
              <div class="preview-section">
                <div class="preview-box" id="preview-box">
                  <span class="preview-label">Drag to rotate \u2022 Scroll to zoom</span>
                </div>
                <div class="preview-info">
                  <div class="creature-name" id="preview-name">Shark</div>
                  <div class="creature-type" id="preview-type">Fish</div>
                  <div class="creature-variant" id="preview-variant">Great White</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- ABILITY SECTION -->
        <div class="ability-panel">
          <div class="ability-section">
            <div class="ability-header">
              <span>\u26A1</span>
              <span>Ability</span>
            </div>
            <div class="ability-list" id="ability-list">
              ${ABILITIES.map((ability, index) => `
                <div class="ability-item ${index === 0 ? 'selected' : ''}" 
                     data-index="${index}"
                     style="--ability-color: ${ability.color}">
                  <span class="ability-emoji">${ability.emoji}</span>
                  <div class="ability-info">
                    <div class="ability-name">${ability.name}</div>
                    <div class="ability-desc">${ability.description}</div>
                  </div>
                  <div class="ability-check">\u2714</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      
      <div class="selector-buttons">
        <button class="selector-btn selector-btn-back" id="selector-back">
          \u2190 Back
        </button>
        <button class="selector-btn selector-btn-confirm" id="selector-confirm">
          Confirm \u2714
        </button>
      </div>
    </div>
  `
}

// ============================================================================
// 3D PREVIEW
// ============================================================================

function initPreview() {
  const container = document.getElementById('preview-box')
  if (!container) return
  
  // Scene
  previewScene = new THREE.Scene()
  
  // Camera - will set aspect ratio on resize
  previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  previewCamera.position.set(0, 0.5, 4)
  previewCamera.lookAt(0, 0, 0)
  
  // Renderer
  previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  previewRenderer.setClearColor(0x000000, 0)
  container.appendChild(previewRenderer.domElement)
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0x406080, 0.6)
  previewScene.add(ambientLight)
  
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
  mainLight.position.set(5, 5, 5)
  previewScene.add(mainLight)
  
  const fillLight = new THREE.DirectionalLight(0x00aaff, 0.4)
  fillLight.position.set(-5, 0, -5)
  previewScene.add(fillLight)
  
  const rimLight = new THREE.DirectionalLight(0x00ffff, 0.3)
  rimLight.position.set(0, -5, 2)
  previewScene.add(rimLight)
  
  // Handle resize with ResizeObserver for proper aspect ratio
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        previewCamera.aspect = width / height
        previewCamera.updateProjectionMatrix()
        previewRenderer.setSize(width, height)
      }
    }
  })
  resizeObserver.observe(container)
  
  // Initial size
  const rect = container.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    previewCamera.aspect = rect.width / rect.height
    previewCamera.updateProjectionMatrix()
    previewRenderer.setSize(rect.width, rect.height)
  }
  
  // Setup drag controls
  setupPreviewDragControls(container)
  
  // Start animation
  animatePreview()
}

function setupPreviewDragControls(container) {
  const canvas = previewRenderer.domElement
  
  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true
    autoRotate = false
    previousMouseX = e.clientX
    previousMouseY = e.clientY
    canvas.style.cursor = 'grabbing'
  })
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    
    const deltaX = e.clientX - previousMouseX
    const deltaY = e.clientY - previousMouseY
    
    // Google Earth / globe style rotation
    // Both rotations are in world space
    const rotationSpeed = 0.01
    
    // Rotate around world Y axis (horizontal drag = spin left/right)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), 
      deltaX * rotationSpeed
    )
    
    // Rotate around world X axis (vertical drag = tilt toward/away)
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), 
      deltaY * rotationSpeed
    )
    
    // Apply both rotations in world space (premultiply)
    meshQuaternion.premultiply(pitchQuat)
    meshQuaternion.premultiply(yawQuat)
    meshQuaternion.normalize()
    
    previousMouseX = e.clientX
    previousMouseY = e.clientY
  })
  
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      canvas.style.cursor = 'grab'
    }
  })
  
  // Scroll wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    
    const zoomSpeed = 0.001
    const delta = e.deltaY * zoomSpeed
    
    // Adjust camera distance
    previewCamera.position.z = Math.max(2, Math.min(8, previewCamera.position.z + delta * 3))
  }, { passive: false })
  
  // Touch events for mobile
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true
      autoRotate = false
      previousMouseX = e.touches[0].clientX
      previousMouseY = e.touches[0].clientY
    }
  }, { passive: true })
  
  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return
    
    const deltaX = e.touches[0].clientX - previousMouseX
    const deltaY = e.touches[0].clientY - previousMouseY
    
    const rotationSpeed = 0.01
    
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), 
      deltaX * rotationSpeed
    )
    
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), 
      deltaY * rotationSpeed
    )
    
    meshQuaternion.premultiply(pitchQuat)
    meshQuaternion.premultiply(yawQuat)
    meshQuaternion.normalize()
    
    previousMouseX = e.touches[0].clientX
    previousMouseY = e.touches[0].clientY
  }, { passive: true })
  
  canvas.addEventListener('touchend', () => {
    isDragging = false
  })
  
  // Double click to reset and re-enable auto rotation
  canvas.addEventListener('dblclick', () => {
    meshQuaternion.identity()
    autoRotate = true
    previewCamera.position.z = 4  // Reset zoom too
  })
  
  // Set initial cursor
  canvas.style.cursor = 'grab'
}

function animatePreview() {
  previewAnimationId = requestAnimationFrame(animatePreview)
  
  if (previewMesh) {
    if (autoRotate) {
      // Auto rotation around Y axis
      const autoRotateQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), 
        0.008
      )
      meshQuaternion.multiply(autoRotateQuat)
      meshQuaternion.normalize()
    }
    
    // Apply quaternion rotation to mesh
    previewMesh.quaternion.copy(meshQuaternion)
    
    // Gentle bobbing
    previewMesh.position.y = Math.sin(Date.now() * 0.002) * 0.05
  }
  
  if (previewRenderer && previewScene && previewCamera) {
    previewRenderer.render(previewScene, previewCamera)
  }
}

function updatePreviewMesh() {
  if (!previewScene) return
  
  // Remove old mesh
  if (previewMesh) {
    previewScene.remove(previewMesh)
    // Dispose of geometries and materials
    previewMesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
  
  // Get current selection
  const currentClass = currentClasses[selectedClassIndex]
  if (!currentClass) return
  
  // Generate creature using Encyclopedia
  try {
    const creature = generateCreature(
      previewSeed, 
      selectedType, 
      currentClass,
      selectedVariantIndex
    )
    
    if (creature && creature.mesh) {
      previewMesh = creature.mesh
      
      // Auto-scale to fit preview
      const box = new THREE.Box3().setFromObject(previewMesh)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 1.8 / maxDim
      previewMesh.scale.setScalar(scale)
      
      // Center the mesh
      const center = box.getCenter(new THREE.Vector3())
      previewMesh.position.sub(center.multiplyScalar(scale))
      
      // Reset rotation for new creature and re-enable auto rotate
      meshQuaternion.identity()
      autoRotate = true
      
      // Reset camera zoom
      if (previewCamera) {
        previewCamera.position.z = 4
      }
      
      previewScene.add(previewMesh)
    }
  } catch (err) {
    console.warn('[Selector] Could not generate preview:', err)
  }
}

function disposePreview() {
  if (previewAnimationId) {
    cancelAnimationFrame(previewAnimationId)
    previewAnimationId = null
  }
  
  if (previewMesh) {
    previewScene.remove(previewMesh)
    previewMesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
    previewMesh = null
  }
  
  if (previewRenderer) {
    previewRenderer.dispose()
    previewRenderer = null
  }
  
  previewScene = null
  previewCamera = null
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachEventListeners() {
  // Variant navigation
  document.getElementById('variant-prev')?.addEventListener('click', () => navigateVariant(-1))
  document.getElementById('variant-next')?.addEventListener('click', () => navigateVariant(1))
  
  // Back button
  document.getElementById('selector-back')?.addEventListener('click', handleBack)
  
  // Confirm button
  document.getElementById('selector-confirm')?.addEventListener('click', handleConfirm)
  
  // Ability items
  document.getElementById('ability-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.ability-item')
    if (item) {
      const index = parseInt(item.dataset.index, 10)
      selectAbility(index)
    }
  })
  
  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown)
}

function handleKeydown(e) {
  if (!isVisible) return
  
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      navigateVariant(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      navigateVariant(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      navigateAbility(-1)
      break
    case 'ArrowDown':
      e.preventDefault()
      navigateAbility(1)
      break
    case 'Enter':
      e.preventDefault()
      handleConfirm()
      break
    case 'Escape':
      e.preventDefault()
      handleBack()
      break
  }
}

// ============================================================================
// TYPE SELECTION
// ============================================================================

function renderTypeList() {
  const container = document.getElementById('type-tabs')
  if (!container) return
  
  container.innerHTML = creatureTypes.map(type => {
    const meta = getCreatureTypeMeta(type)
    const emoji = getTypeEmoji(type)
    return `
      <div class="type-tab ${type === selectedType ? 'selected' : ''}" data-type="${type}">
        <span class="emoji">${emoji}</span>
        <span class="name">${meta?.name || type}</span>
      </div>
    `
  }).join('')
  
  // Attach click listeners
  container.querySelectorAll('.type-tab').forEach(el => {
    el.addEventListener('click', () => {
      selectType(el.dataset.type)
    })
  })
}

function selectType(type) {
  if (type === selectedType) return
  
  selectedType = type
  currentClasses = getCreatureClasses(type)
  selectedClassIndex = 0
  selectedVariantIndex = 0
  
  // Generate new seed for variety
  previewSeed = Math.floor(Math.random() * 0xFFFFFFFF)
  
  renderTypeList()
  renderClassList()
  renderVariantCarousel()
  updatePreviewInfo()
  updatePreviewMesh()
  triggerSelectionChange()
}

// ============================================================================
// CLASS SELECTION
// ============================================================================

function renderClassList() {
  const list = document.getElementById('class-list')
  if (!list) return
  
  list.innerHTML = currentClasses.map((cls, index) => {
    const displayName = getCreatureDisplayName(selectedType, cls)
    
    // Get variant count for fish classes
    let variantCount = 0
    if (selectedType === CreatureType.FISH) {
      variantCount = getVariantCount(cls)
    }
    
    return `
      <div class="class-item ${index === selectedClassIndex ? 'selected' : ''}" data-index="${index}">
        <span class="name">${displayName}</span>
        ${variantCount > 1 ? `<span class="count">${variantCount}</span>` : ''}
      </div>
    `
  }).join('')
  
  // Attach click listeners
  list.querySelectorAll('.class-item').forEach(el => {
    el.addEventListener('click', () => {
      selectClass(parseInt(el.dataset.index, 10))
    })
  })
}

function selectClass(index) {
  if (index === selectedClassIndex) return
  
  selectedClassIndex = index
  selectedVariantIndex = 0
  
  // Generate new seed for variety
  previewSeed = Math.floor(Math.random() * 0xFFFFFFFF)
  
  renderClassList()
  renderVariantCarousel()
  updatePreviewInfo()
  updatePreviewMesh()
  triggerSelectionChange()
}

// ============================================================================
// VARIANT NAVIGATION
// ============================================================================

function renderVariantCarousel() {
  const display = document.getElementById('variant-display')
  const prevBtn = document.getElementById('variant-prev')
  const nextBtn = document.getElementById('variant-next')
  
  if (!display || !prevBtn || !nextBtn) return
  
  const currentClass = currentClasses[selectedClassIndex]
  let variants = []
  let variantName = 'Default'
  
  // Only fish have variants currently
  if (selectedType === CreatureType.FISH && currentClass) {
    variants = getClassVariants(currentClass)
    variantName = getVariantName(currentClass, selectedVariantIndex)
  }
  
  const hasMultipleVariants = variants.length > 1
  
  if (!hasMultipleVariants) {
    display.classList.add('disabled')
    display.innerHTML = `
      <div class="variant-name">Default</div>
      <div class="variant-counter">No variants</div>
    `
    prevBtn.disabled = true
    nextBtn.disabled = true
  } else {
    display.classList.remove('disabled')
    display.innerHTML = `
      <div class="variant-name">${variantName}</div>
      <div class="variant-counter">${selectedVariantIndex + 1} / ${variants.length}</div>
    `
    prevBtn.disabled = false
    nextBtn.disabled = false
  }
}

function navigateVariant(direction) {
  const currentClass = currentClasses[selectedClassIndex]
  if (!currentClass) return
  
  // Only fish have variants
  if (selectedType !== CreatureType.FISH) return
  
  const variants = getClassVariants(currentClass)
  if (variants.length <= 1) return
  
  selectedVariantIndex = (selectedVariantIndex + direction + variants.length) % variants.length
  
  renderVariantCarousel()
  updatePreviewInfo()
  updatePreviewMesh()
  triggerSelectionChange()
}

// ============================================================================
// PREVIEW INFO
// ============================================================================

function updatePreviewInfo() {
  const nameEl = document.getElementById('preview-name')
  const typeEl = document.getElementById('preview-type')
  const variantEl = document.getElementById('preview-variant')
  
  const currentClass = currentClasses[selectedClassIndex]
  const typeMeta = getCreatureTypeMeta(selectedType)
  const displayName = currentClass ? getCreatureDisplayName(selectedType, currentClass) : '---'
  
  let variantName = 'Default'
  if (selectedType === CreatureType.FISH && currentClass) {
    variantName = getVariantName(currentClass, selectedVariantIndex)
  }
  
  if (nameEl) nameEl.textContent = displayName
  if (typeEl) typeEl.textContent = typeMeta?.name || selectedType
  if (variantEl) variantEl.textContent = variantName
}

// ============================================================================
// ABILITY NAVIGATION
// ============================================================================

function navigateAbility(direction) {
  selectAbility(selectedAbilityIndex + direction)
}

function selectAbility(index) {
  // Clamp index
  if (index < 0) index = ABILITIES.length - 1
  if (index >= ABILITIES.length) index = 0
  
  selectedAbilityIndex = index
  updateAbilityDisplay()
  triggerSelectionChange()
}

function updateAbilityDisplay() {
  const items = document.querySelectorAll('.ability-item')
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedAbilityIndex)
  })
}

// ============================================================================
// CALLBACKS
// ============================================================================

function handleBack() {
  hide()
  if (onBackCallback) {
    onBackCallback()
  }
}

function handleConfirm() {
  console.log('[Selector] Confirmed:', getSelection())
  handleBack()
}

function triggerSelectionChange() {
  if (onSelectionChangeCallback) {
    onSelectionChangeCallback(getSelection())
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the selector menu
 */
export function show() {
  if (!selectorRoot) {
    initSelector()
  }
  
  // Reset to defaults or keep previous selection
  renderTypeList()
  renderClassList()
  renderVariantCarousel()
  updatePreviewInfo()
  updatePreviewMesh()
  
  selectorRoot.classList.add('visible')
  isVisible = true
  console.log('[Selector] Shown')
}

/**
 * Hide the selector menu
 */
export function hide() {
  if (!selectorRoot) return
  
  selectorRoot.classList.remove('visible')
  isVisible = false
  console.log('[Selector] Hidden')
}

/**
 * Check if selector is currently visible
 */
export function isSelectorVisible() {
  return isVisible
}

/**
 * Get current selection
 * @returns {{ creature: object, ability: object }}
 */
export function getSelection() {
  const currentClass = currentClasses[selectedClassIndex]
  
  return {
    creature: {
      type: selectedType,
      class: currentClass,
      variantIndex: selectedVariantIndex,
      displayName: currentClass ? getCreatureDisplayName(selectedType, currentClass) : '---',
      variantName: selectedType === CreatureType.FISH && currentClass 
        ? getVariantName(currentClass, selectedVariantIndex)
        : 'Default',
    },
    ability: ABILITIES[selectedAbilityIndex],
  }
}

/**
 * Register callback for when back button is pressed
 */
export function onBack(callback) {
  onBackCallback = callback
}

/**
 * Register callback for selection changes
 */
export function onSelectionChange(callback) {
  onSelectionChangeCallback = callback
}

/**
 * Set the selected creature by type and class
 */
export function setCreature(type, creatureClass, variantIndex = 0) {
  selectedType = type
  currentClasses = getCreatureClasses(type)
  
  const classIndex = currentClasses.indexOf(creatureClass)
  if (classIndex >= 0) {
    selectedClassIndex = classIndex
  }
  
  selectedVariantIndex = variantIndex
  
  if (selectorRoot) {
    renderTypeList()
    renderClassList()
    renderVariantCarousel()
    updatePreviewInfo()
    updatePreviewMesh()
  }
}

/**
 * Set the selected ability by key
 */
export function setAbility(abilityKey) {
  const index = ABILITIES.findIndex(a => a.key === abilityKey)
  if (index >= 0) {
    selectedAbilityIndex = index
    updateAbilityDisplay()
  }
}

export default {
  initSelector,
  show,
  hide,
  isSelectorVisible,
  getSelection,
  onBack,
  onSelectionChange,
  setCreature,
  setAbility,
}