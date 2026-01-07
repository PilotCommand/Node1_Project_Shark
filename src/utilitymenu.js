/**
 * utilitymenu.js - Utility Menu Panels
 * 
 * Handles the four corner button panels:
 * - Help (How to Play) - Game objectives, controls, capabilities
 * - Servers - Server browser with ping visualization
 * - Settings - Game settings (graphics, audio, controls)
 * - Donate - Support the game
 * 
 * All panels follow the underwater theme established in menu.js
 */

// ============================================================================
// STATE
// ============================================================================

let panelRoot = null
let activePanel = null
let onCloseCallback = null

// ============================================================================
// MOCK DATA
// ============================================================================

// Mock server data for the server browser
const MOCK_SERVERS = [
  { name: 'Ocean Prime', region: 'NA East', players: 47, maxPlayers: 100, ping: 24, status: 'online' },
  { name: 'Deep Blue', region: 'NA West', players: 89, maxPlayers: 100, ping: 58, status: 'online' },
  { name: 'Coral Reef', region: 'EU West', players: 62, maxPlayers: 100, ping: 112, status: 'online' },
  { name: 'Mariana', region: 'EU Central', players: 31, maxPlayers: 100, ping: 98, status: 'online' },
  { name: 'Pacific Storm', region: 'Asia', players: 78, maxPlayers: 100, ping: 185, status: 'online' },
  { name: 'Arctic Waters', region: 'NA East', players: 12, maxPlayers: 50, ping: 35, status: 'online' },
  { name: 'Tropical Bay', region: 'SA', players: 0, maxPlayers: 100, ping: 0, status: 'offline' },
  { name: 'Abyss', region: 'EU West', players: 100, maxPlayers: 100, ping: 105, status: 'full' },
]

// Control mappings for help panel
const CONTROLS = [
  { category: 'Movement', bindings: [
    { key: 'W A S D', action: 'Swim in direction' },
    { key: 'Space', action: 'Swim up' },
    { key: 'Shift', action: 'Swim down' },
    { key: 'Mouse', action: 'Look around' },
    { key: 'Scroll', action: 'Zoom in/out' },
  ]},
  { category: 'Abilities', bindings: [
    { key: 'Q (hold)', action: 'Activate ability' },
    { key: 'E', action: 'Open emoji wheel' },
    { key: '1-9, 0', action: 'Select emoji' },
  ]},
  { category: 'Creature', bindings: [
    { key: 'N / B', action: 'Next / Previous species' },
    { key: 'Z', action: 'Cycle variant' },
    { key: 'G', action: 'Mutate (random same species)' },
    { key: 'R / T', action: 'Decrease / Increase size' },
  ]},
  { category: 'Other', bindings: [
    { key: 'M', action: 'Generate new map' },
    { key: 'P', action: 'Toggle debug wireframes' },
    { key: 'V', action: 'Toggle spawn visualization' },
    { key: 'F', action: 'Debug info' },
    { key: 'Enter', action: 'Open chat' },
    { key: 'Esc', action: 'Close menus' },
  ]},
]

// Ability descriptions
const ABILITIES = [
  { 
    name: 'Speed', 
    emoji: '⚡', 
    key: 'sprinter',
    description: 'Boost your movement speed to chase prey or escape predators. Leaves a trail behind you.',
    color: '#00ffaa',
  },
  { 
    name: 'Build', 
    emoji: '🔷', 
    key: 'stacker',
    description: 'Place geometric structures in the world. Build barriers, platforms, or creative sculptures.',
    color: '#aa88ff',
  },
  { 
    name: 'Hide', 
    emoji: '👁', 
    key: 'camper',
    description: 'Camouflage yourself to blend into the environment. Become nearly invisible to predators.',
    color: '#88aa55',
  },
  { 
    name: 'Detect', 
    emoji: '🎯', 
    key: 'attacker',
    description: 'Reveal nearby threats and prey. See creatures through obstacles and at greater distances.',
    color: '#ff5555',
  },
]

// ============================================================================
// STYLES
// ============================================================================

function generateStyles() {
  return `
    /* ========================================
       PANEL CONTAINER
       ======================================== */
    
    #utility-panel-root {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1002;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease-out;
    }
    
    #utility-panel-root.visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* Backdrop blur overlay */
    .utility-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 10, 20, 0.85);
      backdrop-filter: blur(8px);
    }
    
    /* ========================================
       PANEL BASE
       ======================================== */
    
    .utility-panel {
      position: relative;
      background: linear-gradient(180deg, 
        rgba(0, 30, 60, 0.95) 0%,
        rgba(0, 20, 45, 0.98) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.3);
      border-radius: 20px;
      padding: 0;
      max-width: 800px;
      max-height: 80vh;
      width: 90%;
      overflow: hidden;
      box-shadow: 
        0 0 60px rgba(0, 150, 200, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
    }
    
    .utility-panel.wide {
      max-width: 900px;
    }
    
    /* ========================================
       PANEL HEADER
       ======================================== */
    
    .utility-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 25px;
      background: linear-gradient(90deg,
        rgba(0, 100, 150, 0.3) 0%,
        rgba(0, 80, 120, 0.2) 100%
      );
      border-bottom: 1px solid rgba(0, 200, 255, 0.2);
    }
    
    .utility-header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .utility-header-icon {
      font-size: 32px;
      filter: drop-shadow(0 0 10px currentColor);
    }
    
    .utility-header-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 4px;
      color: transparent;
      background: linear-gradient(135deg, #00d4ff 0%, #ffffff 50%, #00d4ff 100%);
      background-clip: text;
      -webkit-background-clip: text;
      text-transform: uppercase;
    }
    
    .utility-close-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 100, 100, 0.2);
      border: 2px solid rgba(255, 100, 100, 0.4);
      color: #ff8888;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    
    .utility-close-btn:hover {
      background: rgba(255, 100, 100, 0.4);
      border-color: #ff8888;
      transform: scale(1.1);
      box-shadow: 0 0 20px rgba(255, 100, 100, 0.4);
    }
    
    /* ========================================
       PANEL CONTENT
       ======================================== */
    
    .utility-content {
      flex: 1;
      overflow-y: auto;
      padding: 25px;
    }
    
    .utility-content::-webkit-scrollbar {
      width: 8px;
    }
    
    .utility-content::-webkit-scrollbar-track {
      background: rgba(0, 40, 70, 0.5);
      border-radius: 4px;
    }
    
    .utility-content::-webkit-scrollbar-thumb {
      background: rgba(0, 150, 200, 0.5);
      border-radius: 4px;
    }
    
    .utility-content::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 180, 230, 0.7);
    }
    
    /* ========================================
       SECTION STYLING
       ======================================== */
    
    .utility-section {
      margin-bottom: 25px;
    }
    
    .utility-section:last-child {
      margin-bottom: 0;
    }
    
    .utility-section-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(0, 200, 255, 0.2);
    }
    
    .utility-text {
      color: rgba(200, 220, 240, 0.9);
      font-size: 15px;
      line-height: 1.6;
    }
    
    .utility-text-muted {
      color: rgba(150, 180, 200, 0.7);
      font-size: 14px;
    }
    
    /* ========================================
       HELP PANEL SPECIFIC
       ======================================== */
    
    .help-objective {
      background: linear-gradient(135deg,
        rgba(0, 100, 150, 0.3) 0%,
        rgba(0, 80, 120, 0.2) 100%
      );
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
    }
    
    .help-objective-title {
      font-size: 18px;
      font-weight: 700;
      color: #00d4ff;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .help-controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    
    .help-controls-category {
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 10px;
      padding: 15px;
    }
    
    .help-controls-category-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(0, 200, 255, 0.9);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    
    .help-control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0, 200, 255, 0.1);
    }
    
    .help-control-row:last-child {
      border-bottom: none;
    }
    
    .help-control-key {
      background: linear-gradient(135deg, rgba(0, 80, 120, 0.6), rgba(0, 60, 100, 0.4));
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 6px;
      padding: 4px 10px;
      font-family: 'Consolas', monospace;
      font-size: 13px;
      color: #00d4ff;
      white-space: nowrap;
    }
    
    .help-control-action {
      color: rgba(200, 220, 240, 0.8);
      font-size: 14px;
      text-align: right;
    }
    
    .help-abilities-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    
    .help-ability-card {
      background: rgba(0, 40, 70, 0.4);
      border: 2px solid var(--ability-color, rgba(0, 200, 255, 0.3));
      border-radius: 12px;
      padding: 15px;
      transition: all 0.2s ease;
    }
    
    .help-ability-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    }
    
    .help-ability-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .help-ability-emoji {
      font-size: 24px;
    }
    
    .help-ability-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--ability-color, #00d4ff);
    }
    
    .help-ability-desc {
      font-size: 13px;
      color: rgba(180, 200, 220, 0.8);
      line-height: 1.5;
    }
    
    /* ========================================
       SERVERS PANEL SPECIFIC
       ======================================== */
    
    .servers-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      gap: 15px;
      flex-wrap: wrap;
    }
    
    .servers-search {
      flex: 1;
      min-width: 200px;
      padding: 10px 15px;
      background: rgba(0, 40, 70, 0.5);
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }
    
    .servers-search::placeholder {
      color: rgba(150, 200, 230, 0.4);
    }
    
    .servers-search:focus {
      border-color: rgba(0, 200, 255, 0.5);
      box-shadow: 0 0 15px rgba(0, 200, 255, 0.2);
    }
    
    .servers-refresh-btn {
      padding: 10px 20px;
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.7), rgba(0, 80, 120, 0.5));
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 8px;
      color: #00d4ff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .servers-refresh-btn:hover {
      background: linear-gradient(135deg, rgba(0, 130, 180, 0.8), rgba(0, 100, 150, 0.6));
      border-color: #00d4ff;
      transform: translateY(-2px);
    }
    
    .servers-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .server-row {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 80px 100px;
      align-items: center;
      gap: 15px;
      padding: 15px 20px;
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .server-row:hover {
      background: rgba(0, 60, 100, 0.5);
      border-color: rgba(0, 200, 255, 0.4);
      transform: translateX(5px);
    }
    
    .server-row.offline {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .server-row.full {
      border-color: rgba(255, 200, 100, 0.4);
    }
    
    .server-name {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }
    
    .server-region {
      font-size: 14px;
      color: rgba(150, 200, 230, 0.7);
    }
    
    .server-players {
      font-size: 14px;
      color: rgba(200, 220, 240, 0.9);
    }
    
    .server-players-full {
      color: #ffaa55;
    }
    
    .server-ping {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .server-ping-bars {
      display: flex;
      gap: 2px;
      align-items: flex-end;
      height: 16px;
    }
    
    .server-ping-bar {
      width: 4px;
      background: rgba(100, 150, 180, 0.3);
      border-radius: 2px;
      transition: background 0.2s;
    }
    
    .server-ping-bar.active {
      background: var(--ping-color, #00ff88);
    }
    
    .server-ping-bar:nth-child(1) { height: 4px; }
    .server-ping-bar:nth-child(2) { height: 8px; }
    .server-ping-bar:nth-child(3) { height: 12px; }
    .server-ping-bar:nth-child(4) { height: 16px; }
    
    .server-ping-ms {
      font-size: 13px;
      color: var(--ping-color, rgba(150, 200, 230, 0.7));
      font-family: 'Consolas', monospace;
    }
    
    .server-status {
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
    }
    
    .server-status.online {
      background: rgba(0, 255, 136, 0.15);
      color: #00ff88;
      border: 1px solid rgba(0, 255, 136, 0.3);
    }
    
    .server-status.full {
      background: rgba(255, 170, 85, 0.15);
      color: #ffaa55;
      border: 1px solid rgba(255, 170, 85, 0.3);
    }
    
    .server-status.offline {
      background: rgba(255, 100, 100, 0.15);
      color: #ff6666;
      border: 1px solid rgba(255, 100, 100, 0.3);
    }
    
    .servers-footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid rgba(0, 200, 255, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .servers-create-btn {
      padding: 12px 25px;
      background: linear-gradient(135deg, rgba(0, 150, 100, 0.7), rgba(0, 120, 80, 0.5));
      border: 1px solid rgba(0, 255, 180, 0.4);
      border-radius: 25px;
      color: #00ffaa;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .servers-create-btn:hover {
      background: linear-gradient(135deg, rgba(0, 180, 120, 0.8), rgba(0, 150, 100, 0.6));
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 255, 180, 0.2);
    }
    
    /* ========================================
       SETTINGS PANEL SPECIFIC
       ======================================== */
    
    .settings-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 25px;
      border-bottom: 1px solid rgba(0, 200, 255, 0.2);
      padding-bottom: 15px;
    }
    
    .settings-tab {
      padding: 10px 20px;
      background: transparent;
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 8px;
      color: rgba(150, 200, 230, 0.7);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .settings-tab:hover {
      background: rgba(0, 100, 150, 0.3);
      color: #fff;
    }
    
    .settings-tab.active {
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.6), rgba(0, 80, 120, 0.4));
      border-color: rgba(0, 200, 255, 0.5);
      color: #00d4ff;
    }
    
    .settings-group {
      margin-bottom: 25px;
    }
    
    .settings-group-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(0, 200, 255, 0.8);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 15px;
    }
    
    .settings-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 0;
      border-bottom: 1px solid rgba(0, 200, 255, 0.1);
    }
    
    .settings-row:last-child {
      border-bottom: none;
    }
    
    .settings-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .settings-label-text {
      font-size: 15px;
      color: #fff;
    }
    
    .settings-label-desc {
      font-size: 12px;
      color: rgba(150, 180, 200, 0.6);
    }
    
    .settings-control {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    /* Toggle Switch */
    .settings-toggle {
      position: relative;
      width: 50px;
      height: 26px;
      background: rgba(100, 120, 140, 0.4);
      border-radius: 13px;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    
    .settings-toggle.active {
      background: rgba(0, 200, 150, 0.5);
    }
    
    .settings-toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s ease;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    }
    
    .settings-toggle.active::after {
      transform: translateX(24px);
    }
    
    /* Slider */
    .settings-slider-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .settings-slider {
      width: 150px;
      height: 6px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(100, 120, 140, 0.4);
      border-radius: 3px;
      outline: none;
    }
    
    .settings-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #00d4ff, #00a0cc);
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 200, 255, 0.4);
    }
    
    .settings-slider-value {
      font-size: 14px;
      color: #00d4ff;
      font-family: 'Consolas', monospace;
      min-width: 40px;
      text-align: right;
    }
    
    /* Dropdown */
    .settings-select {
      padding: 8px 15px;
      background: rgba(0, 40, 70, 0.6);
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      min-width: 150px;
    }
    
    .settings-select option {
      background: #001525;
      color: #fff;
    }
    
    .settings-footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid rgba(0, 200, 255, 0.2);
      display: flex;
      justify-content: flex-end;
      gap: 15px;
    }
    
    .settings-btn {
      padding: 10px 25px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .settings-btn-reset {
      background: transparent;
      border: 1px solid rgba(255, 150, 100, 0.4);
      color: #ffaa88;
    }
    
    .settings-btn-reset:hover {
      background: rgba(255, 150, 100, 0.2);
      border-color: #ffaa88;
    }
    
    .settings-btn-save {
      background: linear-gradient(135deg, rgba(0, 150, 100, 0.7), rgba(0, 120, 80, 0.5));
      border: 1px solid rgba(0, 255, 180, 0.4);
      color: #00ffaa;
    }
    
    .settings-btn-save:hover {
      background: linear-gradient(135deg, rgba(0, 180, 120, 0.8), rgba(0, 150, 100, 0.6));
      transform: translateY(-2px);
    }
    
    /* ========================================
       DONATE PANEL SPECIFIC
       ======================================== */
    
    .donate-hero {
      text-align: center;
      padding: 20px 0 30px;
    }
    
    .donate-heart {
      font-size: 64px;
      margin-bottom: 15px;
      animation: heartbeat 1.5s ease-in-out infinite;
    }
    
    @keyframes heartbeat {
      0%, 100% { transform: scale(1); }
      15% { transform: scale(1.15); }
      30% { transform: scale(1); }
      45% { transform: scale(1.1); }
    }
    
    .donate-tagline {
      font-size: 18px;
      color: rgba(200, 220, 240, 0.9);
      margin-bottom: 10px;
    }
    
    .donate-subtitle {
      font-size: 14px;
      color: rgba(150, 180, 200, 0.7);
    }
    
    .donate-tiers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .donate-tier {
      background: rgba(0, 40, 70, 0.4);
      border: 2px solid rgba(0, 200, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .donate-tier:hover {
      transform: translateY(-5px);
      border-color: var(--tier-color, rgba(0, 200, 255, 0.5));
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    
    .donate-tier.selected {
      border-color: var(--tier-color, #00d4ff);
      background: rgba(0, 80, 120, 0.4);
    }
    
    .donate-tier-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .donate-tier-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--tier-color, #fff);
      margin-bottom: 5px;
    }
    
    .donate-tier-amount {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 10px;
    }
    
    .donate-tier-perks {
      font-size: 12px;
      color: rgba(150, 180, 200, 0.8);
      line-height: 1.5;
    }
    
    .donate-custom {
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
    }
    
    .donate-custom-title {
      font-size: 14px;
      color: rgba(0, 200, 255, 0.8);
      margin-bottom: 12px;
    }
    
    .donate-custom-input-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    
    .donate-custom-currency {
      font-size: 20px;
      color: #fff;
    }
    
    .donate-custom-input {
      flex: 1;
      padding: 12px 15px;
      background: rgba(0, 30, 50, 0.6);
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 8px;
      color: #fff;
      font-size: 18px;
      outline: none;
    }
    
    .donate-custom-input:focus {
      border-color: rgba(0, 200, 255, 0.6);
    }
    
    .donate-button {
      width: 100%;
      padding: 18px;
      background: linear-gradient(135deg, 
        rgba(255, 100, 150, 0.8) 0%, 
        rgba(255, 80, 120, 0.6) 100%
      );
      border: 2px solid rgba(255, 150, 180, 0.5);
      border-radius: 12px;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-transform: uppercase;
    }
    
    .donate-button:hover {
      background: linear-gradient(135deg, 
        rgba(255, 120, 170, 0.9) 0%, 
        rgba(255, 100, 140, 0.7) 100%
      );
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(255, 100, 150, 0.3);
    }
    
    .donate-footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid rgba(0, 200, 255, 0.1);
    }
    
    .donate-footer-text {
      font-size: 12px;
      color: rgba(150, 180, 200, 0.5);
      line-height: 1.6;
    }
    
    .donate-payment-icons {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-top: 10px;
      opacity: 0.5;
    }
    
    .donate-payment-icon {
      font-size: 24px;
    }
  `
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initUtilityMenu() {
  if (panelRoot) {
    console.warn('[UtilityMenu] Already initialized')
    return
  }
  
  // Inject styles
  const styleSheet = document.createElement('style')
  styleSheet.textContent = generateStyles()
  document.head.appendChild(styleSheet)
  
  // Create root container
  panelRoot = document.createElement('div')
  panelRoot.id = 'utility-panel-root'
  document.body.appendChild(panelRoot)
  
  // Handle escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activePanel) {
      closePanel()
    }
  })
  
  console.log('[UtilityMenu] Initialized')
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

function showPanel(content) {
  if (!panelRoot) {
    initUtilityMenu()
  }
  
  // Clear previous content
  panelRoot.innerHTML = ''
  
  // Add backdrop
  const backdrop = document.createElement('div')
  backdrop.className = 'utility-backdrop'
  backdrop.addEventListener('click', closePanel)
  panelRoot.appendChild(backdrop)
  
  // Add panel content
  panelRoot.appendChild(content)
  
  // Show
  panelRoot.classList.add('visible')
}

export function closePanel() {
  if (!panelRoot) return
  
  panelRoot.classList.remove('visible')
  activePanel = null
  
  if (onCloseCallback) {
    onCloseCallback()
    onCloseCallback = null
  }
}

export function isPanelOpen() {
  return activePanel !== null
}

export function onClose(callback) {
  onCloseCallback = callback
}

// ============================================================================
// HELP PANEL
// ============================================================================

export function showHelpPanel() {
  activePanel = 'help'
  
  const panel = document.createElement('div')
  panel.className = 'utility-panel wide'
  
  panel.innerHTML = `
    <div class="utility-header">
      <div class="utility-header-left">
        <span class="utility-header-icon">❓</span>
        <span class="utility-header-title">How to Play</span>
      </div>
      <button class="utility-close-btn">✕</button>
    </div>
    <div class="utility-content">
      <!-- Objective -->
      <div class="help-objective">
        <div class="help-objective-title">
          <span>🎯</span>
          <span>Objective</span>
        </div>
        <p class="utility-text">
          Survive and grow by eating creatures smaller than you! Start as a small fish and work your way up 
          the food chain. Avoid larger predators that can eat you. The bigger you get, the more creatures 
          you can hunt. Become the apex predator of the ocean!
        </p>
      </div>
      
      <!-- Size System -->
      <div class="utility-section">
        <div class="utility-section-title">Size & Eating</div>
        <p class="utility-text">
          <strong style="color: #00ff88;">Green dots on radar</strong> = Safe to eat (smaller than you)<br>
          <strong style="color: #ffff00;">Yellow dots on radar</strong> = Similar size (risky, avoid)<br>
          <strong style="color: #ff5555;">Red dots on radar</strong> = DANGER! They can eat you
        </p>
      </div>
      
      <!-- Controls -->
      <div class="utility-section">
        <div class="utility-section-title">Controls</div>
        <div class="help-controls-grid">
          ${CONTROLS.map(cat => `
            <div class="help-controls-category">
              <div class="help-controls-category-title">${cat.category}</div>
              ${cat.bindings.map(bind => `
                <div class="help-control-row">
                  <span class="help-control-key">${bind.key}</span>
                  <span class="help-control-action">${bind.action}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Abilities -->
      <div class="utility-section">
        <div class="utility-section-title">Abilities (Hold Q)</div>
        <div class="help-abilities-grid">
          ${ABILITIES.map(ability => `
            <div class="help-ability-card" style="--ability-color: ${ability.color}">
              <div class="help-ability-header">
                <span class="help-ability-emoji">${ability.emoji}</span>
                <span class="help-ability-name">${ability.name}</span>
              </div>
              <p class="help-ability-desc">${ability.description}</p>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Tips -->
      <div class="utility-section">
        <div class="utility-section-title">Tips</div>
        <ul class="utility-text" style="padding-left: 20px;">
          <li>Use the radar (bottom right) to track nearby creatures</li>
          <li>The radar sweep reveals creatures as it passes over them</li>
          <li>Zoom out (scroll) to get a better view of your surroundings</li>
          <li>Boost ability drains capacity - let it recharge between uses</li>
          <li>Different species have different swim speeds and turning rates</li>
          <li>Explore the depths - different creatures spawn at different depths</li>
        </ul>
      </div>
    </div>
  `
  
  // Add close handler
  panel.querySelector('.utility-close-btn').addEventListener('click', closePanel)
  
  showPanel(panel)
}

// ============================================================================
// SERVERS PANEL
// ============================================================================

export function showServersPanel() {
  activePanel = 'servers'
  
  const panel = document.createElement('div')
  panel.className = 'utility-panel wide'
  
  panel.innerHTML = `
    <div class="utility-header">
      <div class="utility-header-left">
        <span class="utility-header-icon">🌐</span>
        <span class="utility-header-title">Servers</span>
      </div>
      <button class="utility-close-btn">✕</button>
    </div>
    <div class="utility-content">
      <!-- Toolbar -->
      <div class="servers-toolbar">
        <input type="text" class="servers-search" placeholder="Search servers..." />
        <button class="servers-refresh-btn">
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>
      
      <!-- Server List -->
      <div class="servers-list">
        ${MOCK_SERVERS.map(server => {
          const pingColor = getPingColor(server.ping)
          const pingBars = getPingBars(server.ping)
          const isFull = server.status === 'full'
          const isOffline = server.status === 'offline'
          
          return `
            <div class="server-row ${server.status}">
              <div class="server-name">${server.name}</div>
              <div class="server-region">${server.region}</div>
              <div class="server-players ${isFull ? 'server-players-full' : ''}">
                ${server.players}/${server.maxPlayers} players
              </div>
              <div class="server-ping" style="--ping-color: ${pingColor}">
                <div class="server-ping-bars">
                  ${[1, 2, 3, 4].map(i => `
                    <div class="server-ping-bar ${i <= pingBars ? 'active' : ''}"></div>
                  `).join('')}
                </div>
                <span class="server-ping-ms">${isOffline ? '---' : server.ping + 'ms'}</span>
              </div>
              <div class="server-status ${server.status}">${server.status}</div>
            </div>
          `
        }).join('')}
      </div>
      
      <!-- Footer -->
      <div class="servers-footer">
        <span class="utility-text-muted">${MOCK_SERVERS.filter(s => s.status === 'online').length} servers online</span>
        <button class="servers-create-btn">+ Create Private Room</button>
      </div>
    </div>
  `
  
  // Add close handler
  panel.querySelector('.utility-close-btn').addEventListener('click', closePanel)
  
  // Add refresh handler
  panel.querySelector('.servers-refresh-btn').addEventListener('click', () => {
    console.log('[UtilityMenu] Refreshing servers...')
    // TODO: Implement actual refresh
  })
  
  // Add create room handler
  panel.querySelector('.servers-create-btn').addEventListener('click', () => {
    console.log('[UtilityMenu] Create private room clicked')
    alert('🔒 Private Rooms\n\nComing soon!\n\nYou will be able to:\n• Create private rooms\n• Share room codes with friends\n• Set custom game rules')
  })
  
  // Add server row click handlers
  panel.querySelectorAll('.server-row').forEach((row, index) => {
    row.addEventListener('click', () => {
      const server = MOCK_SERVERS[index]
      if (server.status === 'offline') return
      if (server.status === 'full') {
        alert(`Server "${server.name}" is full!\n\nTry another server.`)
        return
      }
      console.log(`[UtilityMenu] Joining server: ${server.name}`)
      alert(`🌊 Joining ${server.name}...\n\nMultiplayer coming soon!`)
    })
  })
  
  showPanel(panel)
}

function getPingColor(ping) {
  if (ping === 0) return '#666666'
  if (ping < 50) return '#00ff88'
  if (ping < 100) return '#88ff00'
  if (ping < 150) return '#ffaa00'
  return '#ff5555'
}

function getPingBars(ping) {
  if (ping === 0) return 0
  if (ping < 50) return 4
  if (ping < 100) return 3
  if (ping < 150) return 2
  return 1
}

// ============================================================================
// SETTINGS PANEL
// ============================================================================

// Settings state (will be saved/loaded later)
const settingsState = {
  // Graphics
  graphicsQuality: 'high',
  shadows: true,
  particles: true,
  postProcessing: true,
  fov: 75,
  renderDistance: 100,
  
  // Audio
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 100,
  ambientVolume: 70,
  
  // Gameplay
  mouseSensitivity: 50,
  invertY: false,
  showFPS: true,
  showMinimap: true,
  showChat: true,
}

export function showSettingsPanel() {
  activePanel = 'settings'
  
  const panel = document.createElement('div')
  panel.className = 'utility-panel'
  
  panel.innerHTML = `
    <div class="utility-header">
      <div class="utility-header-left">
        <span class="utility-header-icon">⚙️</span>
        <span class="utility-header-title">Settings</span>
      </div>
      <button class="utility-close-btn">✕</button>
    </div>
    <div class="utility-content">
      <!-- Tabs -->
      <div class="settings-tabs">
        <button class="settings-tab active" data-tab="graphics">Graphics</button>
        <button class="settings-tab" data-tab="audio">Audio</button>
        <button class="settings-tab" data-tab="gameplay">Gameplay</button>
      </div>
      
      <!-- Graphics Tab -->
      <div class="settings-tab-content" data-content="graphics">
        <div class="settings-group">
          <div class="settings-group-title">Quality</div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Graphics Quality</span>
              <span class="settings-label-desc">Overall visual quality preset</span>
            </div>
            <select class="settings-select" id="setting-graphics-quality">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high" selected>High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Shadows</span>
              <span class="settings-label-desc">Dynamic shadow rendering</span>
            </div>
            <div class="settings-toggle active" id="setting-shadows"></div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Particles</span>
              <span class="settings-label-desc">Bubbles and ambient particles</span>
            </div>
            <div class="settings-toggle active" id="setting-particles"></div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Post Processing</span>
              <span class="settings-label-desc">Bloom, fog, and effects</span>
            </div>
            <div class="settings-toggle active" id="setting-post-processing"></div>
          </div>
        </div>
        
        <div class="settings-group">
          <div class="settings-group-title">Camera</div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Field of View</span>
              <span class="settings-label-desc">Camera FOV angle</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-fov" min="60" max="120" value="75" />
              <span class="settings-slider-value">75°</span>
            </div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Render Distance</span>
              <span class="settings-label-desc">How far you can see</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-render-distance" min="50" max="200" value="100" />
              <span class="settings-slider-value">100</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Audio Tab (hidden by default) -->
      <div class="settings-tab-content" data-content="audio" style="display: none;">
        <div class="settings-group">
          <div class="settings-group-title">Volume</div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Master Volume</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-master-volume" min="0" max="100" value="80" />
              <span class="settings-slider-value">80%</span>
            </div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Music</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-music-volume" min="0" max="100" value="60" />
              <span class="settings-slider-value">60%</span>
            </div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Sound Effects</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-sfx-volume" min="0" max="100" value="100" />
              <span class="settings-slider-value">100%</span>
            </div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Ambient</span>
              <span class="settings-label-desc">Ocean sounds and atmosphere</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-ambient-volume" min="0" max="100" value="70" />
              <span class="settings-slider-value">70%</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Gameplay Tab (hidden by default) -->
      <div class="settings-tab-content" data-content="gameplay" style="display: none;">
        <div class="settings-group">
          <div class="settings-group-title">Controls</div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Mouse Sensitivity</span>
            </div>
            <div class="settings-slider-container">
              <input type="range" class="settings-slider" id="setting-mouse-sensitivity" min="10" max="100" value="50" />
              <span class="settings-slider-value">50</span>
            </div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Invert Y-Axis</span>
              <span class="settings-label-desc">Invert vertical mouse movement</span>
            </div>
            <div class="settings-toggle" id="setting-invert-y"></div>
          </div>
        </div>
        
        <div class="settings-group">
          <div class="settings-group-title">Interface</div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Show FPS Counter</span>
            </div>
            <div class="settings-toggle active" id="setting-show-fps"></div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Show Minimap</span>
            </div>
            <div class="settings-toggle active" id="setting-show-minimap"></div>
          </div>
          
          <div class="settings-row">
            <div class="settings-label">
              <span class="settings-label-text">Show Chat</span>
            </div>
            <div class="settings-toggle active" id="setting-show-chat"></div>
          </div>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="settings-footer">
        <button class="settings-btn settings-btn-reset">Reset to Default</button>
        <button class="settings-btn settings-btn-save">Save Changes</button>
      </div>
    </div>
  `
  
  // Add close handler
  panel.querySelector('.utility-close-btn').addEventListener('click', closePanel)
  
  // Tab switching
  const tabs = panel.querySelectorAll('.settings-tab')
  const tabContents = panel.querySelectorAll('.settings-tab-content')
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      
      // Show corresponding content
      tabContents.forEach(content => {
        content.style.display = content.dataset.content === targetTab ? 'block' : 'none'
      })
    })
  })
  
  // Toggle switches
  panel.querySelectorAll('.settings-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active')
    })
  })
  
  // Slider value updates
  panel.querySelectorAll('.settings-slider').forEach(slider => {
    const valueDisplay = slider.nextElementSibling
    slider.addEventListener('input', () => {
      let value = slider.value
      if (slider.id === 'setting-fov') value += '°'
      else if (slider.id.includes('volume')) value += '%'
      valueDisplay.textContent = value
    })
  })
  
  // Reset button
  panel.querySelector('.settings-btn-reset').addEventListener('click', () => {
    console.log('[UtilityMenu] Resetting settings to default')
    alert('Settings reset to default values!')
    // TODO: Actually reset settings
  })
  
  // Save button
  panel.querySelector('.settings-btn-save').addEventListener('click', () => {
    console.log('[UtilityMenu] Saving settings')
    alert('Settings saved!')
    closePanel()
  })
  
  showPanel(panel)
}

// ============================================================================
// DONATE PANEL
// ============================================================================

export function showDonatePanel() {
  activePanel = 'donate'
  
  const panel = document.createElement('div')
  panel.className = 'utility-panel'
  
  panel.innerHTML = `
    <div class="utility-header">
      <div class="utility-header-left">
        <span class="utility-header-icon">💖</span>
        <span class="utility-header-title">Support Us</span>
      </div>
      <button class="utility-close-btn">✕</button>
    </div>
    <div class="utility-content">
      <!-- Hero -->
      <div class="donate-hero">
        <div class="donate-heart">💙</div>
        <p class="donate-tagline">Help Keep the Ocean Alive!</p>
        <p class="donate-subtitle">Your support keeps our servers swimming</p>
      </div>
      
      <!-- Donation Tiers -->
      <div class="utility-section">
        <div class="utility-section-title">Choose Your Tier</div>
        <div class="donate-tiers">
          <div class="donate-tier" style="--tier-color: #88ccff" data-amount="5">
            <div class="donate-tier-icon">🐟</div>
            <div class="donate-tier-name">Minnow</div>
            <div class="donate-tier-amount">$5</div>
            <div class="donate-tier-perks">Supporter badge<br/>Our gratitude</div>
          </div>
          
          <div class="donate-tier" style="--tier-color: #00d4ff" data-amount="15">
            <div class="donate-tier-icon">🐬</div>
            <div class="donate-tier-name">Dolphin</div>
            <div class="donate-tier-amount">$15</div>
            <div class="donate-tier-perks">All Minnow perks<br/>Exclusive skin color</div>
          </div>
          
          <div class="donate-tier selected" style="--tier-color: #00ffaa" data-amount="25">
            <div class="donate-tier-icon">🦈</div>
            <div class="donate-tier-name">Shark</div>
            <div class="donate-tier-amount">$25</div>
            <div class="donate-tier-perks">All Dolphin perks<br/>Name in credits</div>
          </div>
          
          <div class="donate-tier" style="--tier-color: #ffaa55" data-amount="50">
            <div class="donate-tier-icon">🐋</div>
            <div class="donate-tier-name">Whale</div>
            <div class="donate-tier-amount">$50</div>
            <div class="donate-tier-perks">All Shark perks<br/>Custom chat title</div>
          </div>
        </div>
      </div>
      
      <!-- Custom Amount -->
      <div class="donate-custom">
        <div class="donate-custom-title">Or enter a custom amount</div>
        <div class="donate-custom-input-row">
          <span class="donate-custom-currency">$</span>
          <input type="number" class="donate-custom-input" placeholder="Enter amount" min="1" />
        </div>
      </div>
      
      <!-- Donate Button -->
      <button class="donate-button">
        💖 Donate Now
      </button>
      
      <!-- Footer -->
      <div class="donate-footer">
        <p class="donate-footer-text">
          All donations go directly to server costs and development.<br/>
          Thank you for supporting independent game development!
        </p>
        <div class="donate-payment-icons">
          <span class="donate-payment-icon" title="Credit Card">💳</span>
          <span class="donate-payment-icon" title="PayPal">🅿️</span>
          <span class="donate-payment-icon" title="Apple Pay">🍎</span>
        </div>
      </div>
    </div>
  `
  
  // Add close handler
  panel.querySelector('.utility-close-btn').addEventListener('click', closePanel)
  
  // Tier selection
  const tiers = panel.querySelectorAll('.donate-tier')
  const customInput = panel.querySelector('.donate-custom-input')
  
  tiers.forEach(tier => {
    tier.addEventListener('click', () => {
      tiers.forEach(t => t.classList.remove('selected'))
      tier.classList.add('selected')
      customInput.value = ''  // Clear custom input when selecting a tier
    })
  })
  
  // Custom amount clears tier selection
  customInput.addEventListener('input', () => {
    if (customInput.value) {
      tiers.forEach(t => t.classList.remove('selected'))
    }
  })
  
  // Donate button
  panel.querySelector('.donate-button').addEventListener('click', () => {
    let amount = customInput.value
    if (!amount) {
      const selectedTier = panel.querySelector('.donate-tier.selected')
      if (selectedTier) {
        amount = selectedTier.dataset.amount
      }
    }
    
    if (!amount || parseFloat(amount) < 1) {
      alert('Please select a tier or enter a custom amount.')
      return
    }
    
    console.log(`[UtilityMenu] Donate clicked: $${amount}`)
    alert(`💖 Thank you for your support!\n\nDonation amount: $${amount}\n\nPayment processing coming soon!\n\nFor now, please support us on:\n• Ko-fi\n• Patreon\n• GitHub Sponsors`)
  })
  
  showPanel(panel)
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initUtilityMenu,
  showHelpPanel,
  showServersPanel,
  showSettingsPanel,
  showDonatePanel,
  closePanel,
  isPanelOpen,
  onClose,
}
