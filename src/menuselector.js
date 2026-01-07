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

// Ability definitions (mirrored from ExtraControls.js)
const ABILITIES = [
  {
    key: 'sprinter',
    name: 'Sprinter',
    emoji: '\u26A1',        // ⚡
    description: 'Hold Q to boost speed with a trail effect',
    color: '#00ffaa',
  },
  {
    key: 'stacker',
    name: 'Stacker',
    emoji: '\uD83D\uDD37',  // 🔷
    description: 'Press Q to build pentagonal prisms',
    color: '#aa88ff',
  },
  {
    key: 'camper',
    name: 'Camouflage',
    emoji: '\uD83D\uDC41',  // 👁
    description: 'Toggle Q to blend into environment',
    color: '#88aa55',
  },
  {
    key: 'attacker',
    name: 'Predator Vision',
    emoji: '\uD83C\uDFAF',  // 🎯
    description: 'Hold Q for threat detection overlay',
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
      gap: 20px;
      max-width: 850px;
      width: 95%;
    }
    
    .selector-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 4px;
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
      gap: 15px;
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
      border-radius: 12px;
      overflow: hidden;
      display: flex;
    }
    
    .panel-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-right: 1px solid rgba(0, 200, 255, 0.15);
    }
    
    .panel-right {
      width: 220px;
      display: flex;
      flex-direction: column;
    }
    
    .panel-section {
      padding: 10px 12px;
    }
    
    .panel-section:not(:last-child) {
      border-bottom: 1px solid rgba(0, 200, 255, 0.15);
    }
    
    .panel-section-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    /* ========================================
       TYPE TAB MENU
       ======================================== */
    
    .type-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .type-tab {
      padding: 8px 14px;
      background: rgba(0, 50, 80, 0.5);
      border: 2px solid rgba(0, 200, 255, 0.2);
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
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
      font-size: 14px;
    }
    
    /* ========================================
       CLASS LIST
       ======================================== */
    
    .class-list {
      max-height: 150px;
      overflow-y: auto;
      margin: -4px;
      padding: 4px;
    }
    
    .class-list::-webkit-scrollbar {
      width: 6px;
    }
    
    .class-list::-webkit-scrollbar-track {
      background: rgba(0, 40, 70, 0.5);
      border-radius: 3px;
    }
    
    .class-list::-webkit-scrollbar-thumb {
      background: rgba(0, 150, 200, 0.5);
      border-radius: 3px;
    }
    
    .class-item {
      padding: 8px 10px;
      cursor: pointer;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.15s;
      margin-bottom: 2px;
      color: rgba(220, 235, 245, 0.9);
    }
    
    .class-item:hover {
      background: rgba(0, 100, 150, 0.3);
      color: #fff;
    }
    
    .class-item.selected {
      background: linear-gradient(90deg, rgba(0, 150, 200, 0.5), rgba(0, 100, 150, 0.3));
      border-left: 3px solid #00d4ff;
      color: #fff;
    }
    
    .class-item .name {
      flex: 1;
    }
    
    .class-item .count {
      font-size: 10px;
      color: rgba(150, 200, 230, 0.6);
      background: rgba(0, 80, 120, 0.4);
      padding: 2px 8px;
      border-radius: 10px;
    }
    
    /* ========================================
       VARIANT CAROUSEL
       ======================================== */
    
    .variant-carousel {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .variant-nav {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.7), rgba(0, 70, 120, 0.6));
      border: 2px solid rgba(0, 200, 255, 0.4);
      border-radius: 50%;
      cursor: pointer;
      color: #00d4ff;
      font-size: 16px;
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
      border-radius: 8px;
      padding: 8px 12px;
      text-align: center;
    }
    
    .variant-display .variant-name {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
    }
    
    .variant-display .variant-counter {
      font-size: 9px;
      color: rgba(150, 200, 230, 0.5);
      margin-top: 2px;
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
    }
    
    .preview-box {
      flex: 1;
      background: linear-gradient(180deg, rgba(0, 15, 30, 0.9), rgba(0, 25, 45, 0.95));
      position: relative;
      min-height: 180px;
    }
    
    .preview-box canvas {
      width: 100% !important;
      height: 100% !important;
    }
    
    .preview-label {
      position: absolute;
      top: 8px;
      left: 8px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(0, 200, 255, 0.6);
      background: rgba(0, 20, 40, 0.8);
      padding: 3px 6px;
      border-radius: 4px;
      z-index: 10;
    }
    
    .preview-info {
      padding: 10px 12px;
      text-align: center;
      border-top: 1px solid rgba(0, 200, 255, 0.15);
    }
    
    .preview-info .creature-name {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 2px;
    }
    
    .preview-info .creature-type {
      font-size: 10px;
      color: rgba(0, 200, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .preview-info .creature-variant {
      font-size: 10px;
      color: rgba(150, 200, 230, 0.5);
      margin-top: 3px;
    }
    
    /* ========================================
       ABILITY PANEL (Right side)
       ======================================== */
    
    .ability-panel {
      width: 200px;
      flex-shrink: 0;
    }
    
    .ability-section {
      background: linear-gradient(180deg, 
        rgba(0, 30, 60, 0.9) 0%,
        rgba(0, 20, 45, 0.95) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.25);
      border-radius: 12px;
      padding: 12px 15px;
      height: 100%;
      box-sizing: border-box;
    }
    
    .ability-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 10px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .ability-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .ability-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(0, 40, 70, 0.5);
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
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
      box-shadow: 0 0 12px rgba(0, 200, 255, 0.2);
    }
    
    .ability-emoji {
      font-size: 18px;
      width: 24px;
      text-align: center;
    }
    
    .ability-info {
      flex: 1;
      min-width: 0;
    }
    
    .ability-name {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
    }
    
    .ability-desc {
      font-size: 9px;
      color: rgba(150, 200, 230, 0.5);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ability-check {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid rgba(0, 200, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
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
      gap: 15px;
      margin-top: 5px;
    }
    
    .selector-btn {
      padding: 10px 28px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      border: 2px solid rgba(0, 200, 255, 0.4);
      border-radius: 20px;
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
    
    /* ========================================
       KEYBOARD HINTS
       ======================================== */
    
    .keyboard-hints {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 10px;
    }
    
    .key-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: rgba(150, 200, 230, 0.4);
    }
    
    .key-hint kbd {
      padding: 3px 8px;
      background: rgba(0, 60, 100, 0.5);
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 4px;
      font-family: inherit;
      color: rgba(0, 200, 255, 0.7);
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
                  <span class="preview-label">Preview</span>
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
      
      <div class="keyboard-hints">
        <div class="key-hint"><kbd>\u2190</kbd> <kbd>\u2192</kbd> Variant</div>
        <div class="key-hint"><kbd>\u2191</kbd> <kbd>\u2193</kbd> Ability</div>
        <div class="key-hint"><kbd>Enter</kbd> Confirm</div>
        <div class="key-hint"><kbd>Esc</kbd> Back</div>
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
  
  const rect = container.getBoundingClientRect()
  const width = rect.width || 280
  const height = rect.height || 280
  
  // Scene
  previewScene = new THREE.Scene()
  
  // Camera
  previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  previewCamera.position.set(0, 0.5, 4)
  previewCamera.lookAt(0, 0, 0)
  
  // Renderer
  previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  previewRenderer.setSize(width, height)
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
  
  // Start animation
  animatePreview()
}

function animatePreview() {
  previewAnimationId = requestAnimationFrame(animatePreview)
  
  if (previewMesh) {
    previewMesh.rotation.y += 0.008
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