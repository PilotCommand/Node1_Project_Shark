/**
 * accountmenu.js - Account & Authentication Page
 * 
 * A sub-menu that appears when "Account" is clicked from the main menu.
 * Works like the Selector - transitions to a full page view.
 * 
 * Features:
 * - Login / Sign up forms with validation
 * - Full profile view with tabs (Stats, Achievements, Friends, History)
 * - Smooth transitions with the main menu
 * - Social login placeholders (Google, Discord)
 */

// ============================================================================
// STATE
// ============================================================================

let accountRoot = null
let isVisible = false

// Authentication state
let isLoggedIn = false
let currentUser = null

// Current profile tab
let currentProfileTab = 'stats'

// Callbacks
let onBackCallback = null

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_USER = {
  id: 'user_12345',
  username: 'OceanExplorer',
  email: 'explorer@ocean.com',
  avatar: '🦈',
  level: 27,
  xp: 4250,
  xpToNext: 5000,
  joinDate: '2024-03-15',
  lastSeen: new Date().toISOString(),
  isPremium: true,
  
  stats: {
    totalPlayTime: 47.5,
    gamesPlayed: 156,
    creaturesEaten: 2847,
    timesEaten: 89,
    largestSize: 42.7,
    longestSurvival: 45,
    totalDistanceSwum: 12450,
    abilitiesUsed: 1523,
    structuresBuilt: 234,
  },
  
  achievements: [
    { id: 'first_meal', name: 'First Meal', desc: 'Eat your first creature', icon: '🍽️', unlocked: true, date: '2024-03-15' },
    { id: 'apex_predator', name: 'Apex Predator', desc: 'Reach 10m³ volume', icon: '👑', unlocked: true, date: '2024-03-18' },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Use boost for 60 seconds total', icon: '⚡', unlocked: true, date: '2024-03-20' },
    { id: 'architect', name: 'Architect', desc: 'Build 100 structures', icon: '🏗️', unlocked: true, date: '2024-04-02' },
    { id: 'survivor', name: 'Survivor', desc: 'Survive for 30 minutes', icon: '🛡️', unlocked: true, date: '2024-04-10' },
    { id: 'social_fish', name: 'Social Fish', desc: 'Add 10 friends', icon: '🤝', unlocked: false, progress: 7, max: 10 },
    { id: 'whale_hunter', name: 'Whale Hunter', desc: 'Eat a creature 5x your size', icon: '🐋', unlocked: false, progress: 0, max: 1 },
    { id: 'marathon', name: 'Marathon', desc: 'Swim 100km total', icon: '🏊', unlocked: false, progress: 12.45, max: 100 },
  ],
  
  unlocks: {
    skins: ['default', 'golden', 'shadow', 'coral'],
    trails: ['default', 'bubbles', 'rainbow'],
    titles: ['Newcomer', 'Explorer', 'Hunter', 'Apex'],
  },
  
  friends: [
    { id: 'f1', username: 'SharkBait', avatar: '🐟', status: 'online', level: 34 },
    { id: 'f2', username: 'DeepDiver', avatar: '🐬', status: 'online', level: 19 },
    { id: 'f3', username: 'CoralQueen', avatar: '🐙', status: 'away', level: 42 },
    { id: 'f4', username: 'WaveRider', avatar: '🦈', status: 'offline', level: 28 },
    { id: 'f5', username: 'BubbleMaster', avatar: '🐡', status: 'offline', level: 15 },
  ],
  
  matchHistory: [
    { id: 'm1', date: '2024-12-01', duration: 23, size: 15.2, eaten: 34, placement: 3, server: 'Ocean Prime' },
    { id: 'm2', date: '2024-11-30', duration: 45, size: 42.7, eaten: 89, placement: 1, server: 'Deep Blue' },
    { id: 'm3', date: '2024-11-30', duration: 12, size: 5.1, eaten: 8, placement: 47, server: 'Coral Reef' },
    { id: 'm4', date: '2024-11-29', duration: 31, size: 22.4, eaten: 45, placement: 7, server: 'Ocean Prime' },
    { id: 'm5', date: '2024-11-28', duration: 18, size: 11.8, eaten: 21, placement: 12, server: 'Arctic Waters' },
  ],
}

// ============================================================================
// STYLES
// ============================================================================

function generateStyles() {
  return `
    /* ========================================
       ACCOUNT PAGE CONTAINER
       ======================================== */
    
    #account-menu {
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
    
    #account-menu.visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* ========================================
       MAIN LAYOUT
       ======================================== */
    
    .account-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 25px;
      max-width: 900px;
      width: 95%;
      max-height: 85vh;
    }
    
    .account-title {
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
      animation: accountTitlePulse 3s ease-in-out infinite;
    }
    
    @keyframes accountTitlePulse {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.2); }
    }
    
    /* ========================================
       MAIN PANEL
       ======================================== */
    
    .account-panel {
      background: linear-gradient(180deg, 
        rgba(0, 30, 60, 0.9) 0%,
        rgba(0, 20, 45, 0.95) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.25);
      border-radius: 18px;
      overflow: hidden;
      width: 100%;
      max-height: calc(85vh - 120px);
      display: flex;
      flex-direction: column;
    }
    
    .account-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 25px;
    }
    
    .account-panel-content::-webkit-scrollbar {
      width: 8px;
    }
    
    .account-panel-content::-webkit-scrollbar-track {
      background: rgba(0, 40, 70, 0.5);
      border-radius: 4px;
    }
    
    .account-panel-content::-webkit-scrollbar-thumb {
      background: rgba(0, 150, 200, 0.5);
      border-radius: 4px;
    }
    
    /* ========================================
       AUTH TABS
       ======================================== */
    
    .auth-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 25px;
      border-radius: 12px;
      overflow: hidden;
      border: 2px solid rgba(0, 200, 255, 0.3);
    }
    
    .auth-tab {
      flex: 1;
      padding: 15px 25px;
      background: transparent;
      border: none;
      color: rgba(150, 200, 230, 0.7);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    
    .auth-tab:hover {
      background: rgba(0, 100, 150, 0.2);
      color: #fff;
    }
    
    .auth-tab.active {
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.6), rgba(0, 80, 120, 0.4));
      color: #00d4ff;
    }
    
    /* ========================================
       AUTH FORMS
       ======================================== */
    
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 400px;
      margin: 0 auto;
    }
    
    .auth-form.hidden {
      display: none;
    }
    
    .auth-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .auth-label {
      font-size: 13px;
      color: rgba(0, 200, 255, 0.8);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .auth-input {
      padding: 15px 20px;
      background: rgba(0, 30, 50, 0.6);
      border: 2px solid rgba(0, 200, 255, 0.2);
      border-radius: 12px;
      color: #fff;
      font-size: 16px;
      outline: none;
      transition: all 0.2s ease;
    }
    
    .auth-input::placeholder {
      color: rgba(150, 200, 230, 0.4);
    }
    
    .auth-input:focus {
      border-color: rgba(0, 200, 255, 0.6);
      background: rgba(0, 40, 70, 0.7);
      box-shadow: 0 0 20px rgba(0, 200, 255, 0.15);
    }
    
    .auth-checkbox-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .auth-checkbox {
      width: 22px;
      height: 22px;
      accent-color: #00d4ff;
      cursor: pointer;
    }
    
    .auth-checkbox-label {
      font-size: 14px;
      color: rgba(200, 220, 240, 0.8);
      cursor: pointer;
    }
    
    .auth-submit {
      padding: 18px;
      background: linear-gradient(135deg, 
        rgba(0, 150, 200, 0.8) 0%, 
        rgba(0, 120, 170, 0.6) 100%
      );
      border: 2px solid rgba(0, 200, 255, 0.5);
      border-radius: 30px;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 10px;
    }
    
    .auth-submit:hover {
      background: linear-gradient(135deg, 
        rgba(0, 180, 230, 0.9) 0%, 
        rgba(0, 150, 200, 0.7) 100%
      );
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0, 200, 255, 0.3);
    }
    
    .auth-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    .auth-footer {
      text-align: center;
      margin-top: 25px;
    }
    
    .auth-footer-text {
      font-size: 14px;
      color: rgba(150, 200, 230, 0.6);
    }
    
    .auth-footer-link {
      color: #00d4ff;
      cursor: pointer;
      text-decoration: none;
    }
    
    .auth-footer-link:hover {
      text-decoration: underline;
    }
    
    /* ========================================
       PROFILE HEADER
       ======================================== */
    
    .profile-header {
      display: flex;
      align-items: center;
      gap: 25px;
      padding: 25px;
      background: linear-gradient(135deg,
        rgba(0, 80, 120, 0.4) 0%,
        rgba(0, 60, 100, 0.2) 100%
      );
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 16px;
      margin-bottom: 25px;
    }
    
    .profile-avatar {
      width: 100px;
      height: 100px;
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.6), rgba(0, 80, 130, 0.4));
      border: 4px solid rgba(0, 200, 255, 0.5);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 50px;
      position: relative;
      flex-shrink: 0;
    }
    
    .profile-avatar-premium {
      position: absolute;
      bottom: -5px;
      right: -5px;
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      border: 3px solid rgba(0, 30, 60, 0.9);
    }
    
    .profile-info {
      flex: 1;
      min-width: 0;
    }
    
    .profile-username {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 5px;
    }
    
    .profile-title {
      font-size: 15px;
      color: #00d4ff;
      margin-bottom: 12px;
    }
    
    .profile-level-bar {
      height: 10px;
      background: rgba(0, 40, 70, 0.6);
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    
    .profile-level-fill {
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #00ffaa);
      border-radius: 5px;
      transition: width 0.3s ease;
    }
    
    .profile-level-text {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: rgba(150, 200, 230, 0.7);
    }
    
    .profile-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .profile-action-btn {
      padding: 10px 20px;
      background: rgba(0, 60, 100, 0.5);
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 8px;
      color: #00d4ff;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    
    .profile-action-btn:hover {
      background: rgba(0, 80, 130, 0.6);
      border-color: #00d4ff;
    }
    
    .profile-action-btn.logout {
      border-color: rgba(255, 100, 100, 0.3);
      color: #ff8888;
    }
    
    .profile-action-btn.logout:hover {
      background: rgba(255, 100, 100, 0.2);
      border-color: #ff8888;
    }
    
    /* ========================================
       PROFILE TABS
       ======================================== */
    
    .profile-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 25px;
      border-bottom: 1px solid rgba(0, 200, 255, 0.2);
      padding-bottom: 15px;
      flex-wrap: wrap;
    }
    
    .profile-tab {
      padding: 12px 20px;
      background: transparent;
      border: 2px solid transparent;
      border-radius: 10px;
      color: rgba(150, 200, 230, 0.7);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .profile-tab:hover {
      background: rgba(0, 100, 150, 0.2);
      color: #fff;
    }
    
    .profile-tab.active {
      background: linear-gradient(135deg, rgba(0, 100, 150, 0.5), rgba(0, 80, 120, 0.3));
      border-color: rgba(0, 200, 255, 0.4);
      color: #00d4ff;
    }
    
    .profile-tab .tab-icon {
      font-size: 18px;
    }
    
    .profile-tab-content {
      display: none;
    }
    
    .profile-tab-content.active {
      display: block;
    }
    
    /* ========================================
       STATS GRID
       ======================================== */
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }
    
    .stat-card {
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      transition: all 0.2s ease;
    }
    
    .stat-card:hover {
      background: rgba(0, 50, 85, 0.5);
      border-color: rgba(0, 200, 255, 0.3);
      transform: translateY(-3px);
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #00d4ff;
      margin-bottom: 8px;
    }
    
    .stat-label {
      font-size: 12px;
      color: rgba(150, 200, 230, 0.7);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* ========================================
       ACHIEVEMENTS GRID
       ======================================== */
    
    .achievements-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    
    .achievement-card {
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      gap: 15px;
      transition: all 0.2s ease;
    }
    
    .achievement-card:hover {
      background: rgba(0, 50, 85, 0.5);
      border-color: rgba(0, 200, 255, 0.3);
    }
    
    .achievement-card.locked {
      opacity: 0.5;
    }
    
    .achievement-card.locked .achievement-icon {
      filter: grayscale(100%);
    }
    
    .achievement-icon {
      font-size: 36px;
      width: 50px;
      text-align: center;
      flex-shrink: 0;
    }
    
    .achievement-info {
      flex: 1;
      min-width: 0;
    }
    
    .achievement-name {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    
    .achievement-desc {
      font-size: 13px;
      color: rgba(150, 200, 230, 0.7);
      margin-bottom: 10px;
    }
    
    .achievement-progress {
      height: 8px;
      background: rgba(0, 40, 70, 0.6);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .achievement-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #00ffaa);
      border-radius: 4px;
    }
    
    .achievement-progress-text {
      font-size: 11px;
      color: rgba(150, 200, 230, 0.5);
      margin-top: 5px;
    }
    
    .achievement-date {
      font-size: 11px;
      color: rgba(0, 200, 255, 0.6);
    }
    
    /* ========================================
       FRIENDS LIST
       ======================================== */
    
    .friends-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .friends-count {
      font-size: 15px;
      color: rgba(150, 200, 230, 0.7);
    }
    
    .friends-add-btn {
      padding: 10px 20px;
      background: linear-gradient(135deg, rgba(0, 150, 100, 0.6), rgba(0, 120, 80, 0.4));
      border: 1px solid rgba(0, 255, 180, 0.4);
      border-radius: 25px;
      color: #00ffaa;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .friends-add-btn:hover {
      background: linear-gradient(135deg, rgba(0, 180, 120, 0.7), rgba(0, 150, 100, 0.5));
      transform: translateY(-2px);
    }
    
    .friends-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .friend-row {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px 18px;
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 12px;
      transition: all 0.2s ease;
    }
    
    .friend-row:hover {
      background: rgba(0, 50, 85, 0.5);
      border-color: rgba(0, 200, 255, 0.3);
    }
    
    .friend-avatar {
      width: 48px;
      height: 48px;
      background: rgba(0, 60, 100, 0.5);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      position: relative;
      flex-shrink: 0;
    }
    
    .friend-status-dot {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 3px solid rgba(0, 30, 60, 0.9);
    }
    
    .friend-status-dot.online { background: #00ff88; }
    .friend-status-dot.away { background: #ffaa00; }
    .friend-status-dot.offline { background: #666666; }
    
    .friend-info {
      flex: 1;
    }
    
    .friend-name {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }
    
    .friend-level {
      font-size: 13px;
      color: rgba(150, 200, 230, 0.6);
    }
    
    .friend-actions {
      display: flex;
      gap: 10px;
    }
    
    .friend-action-btn {
      width: 38px;
      height: 38px;
      background: rgba(0, 60, 100, 0.5);
      border: 1px solid rgba(0, 200, 255, 0.2);
      border-radius: 50%;
      color: #00d4ff;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    
    .friend-action-btn:hover {
      background: rgba(0, 80, 130, 0.6);
      border-color: #00d4ff;
      transform: scale(1.1);
    }
    
    .no-data-message {
      color: rgba(150, 200, 230, 0.6);
      text-align: center;
      padding: 30px;
      font-size: 15px;
    }
    
    /* ========================================
       MATCH HISTORY
       ======================================== */
    
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .history-row {
      display: grid;
      grid-template-columns: 90px 1fr 90px 90px 70px;
      align-items: center;
      gap: 15px;
      padding: 18px;
      background: rgba(0, 40, 70, 0.4);
      border: 1px solid rgba(0, 200, 255, 0.15);
      border-radius: 12px;
      transition: all 0.2s ease;
    }
    
    .history-row:hover {
      background: rgba(0, 50, 85, 0.5);
      border-color: rgba(0, 200, 255, 0.3);
    }
    
    .history-date {
      font-size: 14px;
      color: rgba(150, 200, 230, 0.7);
    }
    
    .history-server {
      font-size: 15px;
      font-weight: 500;
      color: #fff;
    }
    
    .history-stat {
      text-align: center;
    }
    
    .history-stat-value {
      font-size: 18px;
      font-weight: 600;
      color: #00d4ff;
    }
    
    .history-stat-label {
      font-size: 10px;
      color: rgba(150, 200, 230, 0.5);
      text-transform: uppercase;
    }
    
    .history-placement {
      text-align: center;
    }
    
    .history-placement-value {
      font-size: 20px;
      font-weight: 700;
    }
    
    .history-placement-value.gold { color: #ffd700; }
    .history-placement-value.silver { color: #c0c0c0; }
    .history-placement-value.bronze { color: #cd7f32; }
    .history-placement-value.normal { color: rgba(200, 220, 240, 0.8); }
    
    /* ========================================
       BUTTONS
       ======================================== */
    
    .account-buttons {
      display: flex;
      gap: 22px;
      margin-top: 8px;
    }
    
    .account-btn {
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
    
    .account-btn::before {
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
    
    .account-btn:hover::before {
      left: 100%;
    }
    
    .account-btn:hover {
      border-color: #00d4ff;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 200, 255, 0.3);
    }
    
    .account-btn-back {
      background: linear-gradient(135deg, 
        rgba(80, 60, 100, 0.7) 0%, 
        rgba(60, 40, 80, 0.5) 100%
      );
      border-color: rgba(180, 150, 255, 0.3);
    }
    
    .account-btn-back:hover {
      border-color: rgba(180, 150, 255, 0.7);
      box-shadow: 0 8px 25px rgba(150, 100, 255, 0.2);
    }
    
    /* ========================================
       RESPONSIVE
       ======================================== */
    
    @media (max-width: 768px) {
      .profile-header {
        flex-direction: column;
        text-align: center;
      }
      
      .profile-actions {
        flex-direction: row;
        justify-content: center;
      }
      
      .history-row {
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      
      .history-server {
        grid-column: 1 / -1;
      }
    }
  `
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initAccountMenu() {
  if (accountRoot) {
    console.warn('[AccountMenu] Already initialized')
    return
  }
  
  // Inject styles
  const styleSheet = document.createElement('style')
  styleSheet.textContent = generateStyles()
  document.head.appendChild(styleSheet)
  
  // Create root container
  accountRoot = document.createElement('div')
  accountRoot.id = 'account-menu'
  document.body.appendChild(accountRoot)
  
  // Attach keyboard listener
  document.addEventListener('keydown', handleKeydown)
  
  console.log('[AccountMenu] Initialized')
}

function handleKeydown(e) {
  if (!isVisible) return
  
  if (e.key === 'Escape') {
    e.preventDefault()
    handleBack()
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function buildAuthHTML() {
  return `
    <div class="account-content">
      <div class="account-title">Account</div>
      
      <div class="account-panel">
        <div class="account-panel-content">
          <!-- Auth Tabs -->
          <div class="auth-tabs">
            <button class="auth-tab active" data-tab="login">Login</button>
            <button class="auth-tab" data-tab="signup">Sign Up</button>
          </div>
          
          <!-- Login Form -->
          <form class="auth-form" id="login-form">
            <div class="auth-field">
              <label class="auth-label">Email or Username</label>
              <input type="text" class="auth-input" id="login-email" placeholder="Enter your email or username" required />
            </div>
            
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <input type="password" class="auth-input" id="login-password" placeholder="Enter your password" required />
            </div>
            
            <div class="auth-checkbox-row">
              <input type="checkbox" class="auth-checkbox" id="login-remember" />
              <label class="auth-checkbox-label" for="login-remember">Remember me</label>
            </div>
            
            <button type="submit" class="auth-submit">Login</button>
            
            <div class="auth-footer">
              <p class="auth-footer-text">
                <a class="auth-footer-link" id="forgot-password">Forgot your password?</a>
              </p>
            </div>
          </form>
          
          <!-- Signup Form -->
          <form class="auth-form hidden" id="signup-form">
            <div class="auth-field">
              <label class="auth-label">Username</label>
              <input type="text" class="auth-input" id="signup-username" placeholder="Choose a username" required minlength="3" maxlength="20" />
            </div>
            
            <div class="auth-field">
              <label class="auth-label">Email</label>
              <input type="email" class="auth-input" id="signup-email" placeholder="Enter your email" required />
            </div>
            
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <input type="password" class="auth-input" id="signup-password" placeholder="Create a password (8+ characters)" required minlength="8" />
            </div>
            
            <div class="auth-field">
              <label class="auth-label">Confirm Password</label>
              <input type="password" class="auth-input" id="signup-confirm" placeholder="Confirm your password" required />
            </div>
            
            <div class="auth-checkbox-row">
              <input type="checkbox" class="auth-checkbox" id="signup-terms" required />
              <label class="auth-checkbox-label" for="signup-terms">
                I agree to the <a class="auth-footer-link">Terms of Service</a> and <a class="auth-footer-link">Privacy Policy</a>
              </label>
            </div>
            
            <button type="submit" class="auth-submit">Create Account</button>
          </form>
        </div>
      </div>
      
      <div class="account-buttons">
        <button class="account-btn account-btn-back" id="account-back">
          ← Back
        </button>
      </div>
    </div>
  `
}

function buildProfileHTML() {
  const user = currentUser || MOCK_USER
  const xpPercent = (user.xp / user.xpToNext) * 100
  
  return `
    <div class="account-content">
      <div class="account-title">Profile</div>
      
      <div class="account-panel">
        <div class="account-panel-content">
          <!-- Profile Header -->
          <div class="profile-header">
            <div class="profile-avatar">
              ${user.avatar}
              ${user.isPremium ? '<div class="profile-avatar-premium">⭐</div>' : ''}
            </div>
            <div class="profile-info">
              <div class="profile-username">${user.username}</div>
              <div class="profile-title">${user.unlocks.titles[user.unlocks.titles.length - 1]}</div>
              <div class="profile-level-bar">
                <div class="profile-level-fill" style="width: ${xpPercent}%"></div>
              </div>
              <div class="profile-level-text">
                <span>Level ${user.level}</span>
                <span>${user.xp.toLocaleString()} / ${user.xpToNext.toLocaleString()} XP</span>
              </div>
            </div>
            <div class="profile-actions">
              <button class="profile-action-btn" id="edit-profile">✏️ Edit Profile</button>
              <button class="profile-action-btn logout" id="logout-btn">🚪 Logout</button>
            </div>
          </div>
          
          <!-- Profile Tabs -->
          <div class="profile-tabs">
            <button class="profile-tab ${currentProfileTab === 'stats' ? 'active' : ''}" data-tab="stats">
              <span class="tab-icon">📊</span>
              <span>Stats</span>
            </button>
            <button class="profile-tab ${currentProfileTab === 'achievements' ? 'active' : ''}" data-tab="achievements">
              <span class="tab-icon">🏆</span>
              <span>Achievements</span>
            </button>
            <button class="profile-tab ${currentProfileTab === 'friends' ? 'active' : ''}" data-tab="friends">
              <span class="tab-icon">👥</span>
              <span>Friends</span>
            </button>
            <button class="profile-tab ${currentProfileTab === 'history' ? 'active' : ''}" data-tab="history">
              <span class="tab-icon">📜</span>
              <span>History</span>
            </button>
          </div>
          
          <!-- Stats Tab -->
          <div class="profile-tab-content ${currentProfileTab === 'stats' ? 'active' : ''}" data-content="stats">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value">${user.stats.totalPlayTime.toFixed(1)}h</div>
                <div class="stat-label">Play Time</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.gamesPlayed.toLocaleString()}</div>
                <div class="stat-label">Games Played</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.creaturesEaten.toLocaleString()}</div>
                <div class="stat-label">Creatures Eaten</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.timesEaten.toLocaleString()}</div>
                <div class="stat-label">Times Eaten</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.largestSize.toFixed(1)}m³</div>
                <div class="stat-label">Largest Size</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.longestSurvival}min</div>
                <div class="stat-label">Longest Survival</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${(user.stats.totalDistanceSwum / 1000).toFixed(1)}km</div>
                <div class="stat-label">Distance Swum</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.abilitiesUsed.toLocaleString()}</div>
                <div class="stat-label">Abilities Used</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.stats.structuresBuilt.toLocaleString()}</div>
                <div class="stat-label">Structures Built</div>
              </div>
            </div>
          </div>
          
          <!-- Achievements Tab -->
          <div class="profile-tab-content ${currentProfileTab === 'achievements' ? 'active' : ''}" data-content="achievements">
            <div class="achievements-grid">
              ${user.achievements.map(ach => `
                <div class="achievement-card ${ach.unlocked ? '' : 'locked'}">
                  <div class="achievement-icon">${ach.icon}</div>
                  <div class="achievement-info">
                    <div class="achievement-name">${ach.name}</div>
                    <div class="achievement-desc">${ach.desc}</div>
                    ${ach.unlocked 
                      ? `<div class="achievement-date">Unlocked ${ach.date}</div>`
                      : `
                        <div class="achievement-progress">
                          <div class="achievement-progress-fill" style="width: ${(ach.progress / ach.max) * 100}%"></div>
                        </div>
                        <div class="achievement-progress-text">${ach.progress} / ${ach.max}</div>
                      `
                    }
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Friends Tab -->
          <div class="profile-tab-content ${currentProfileTab === 'friends' ? 'active' : ''}" data-content="friends">
            <div class="friends-header">
              <span class="friends-count">${user.friends.length} Friends</span>
              <button class="friends-add-btn">
                <span>+</span>
                <span>Add Friend</span>
              </button>
            </div>
            <div class="friends-list">
              ${user.friends.length > 0 ? user.friends.map(friend => `
                <div class="friend-row">
                  <div class="friend-avatar">
                    ${friend.avatar}
                    <div class="friend-status-dot ${friend.status}"></div>
                  </div>
                  <div class="friend-info">
                    <div class="friend-name">${friend.username}</div>
                    <div class="friend-level">Level ${friend.level}</div>
                  </div>
                  <div class="friend-actions">
                    <button class="friend-action-btn" title="Message">💬</button>
                    <button class="friend-action-btn" title="Invite">🎮</button>
                  </div>
                </div>
              `).join('') : '<p class="no-data-message">No friends yet. Click "Add Friend" to get started!</p>'}
            </div>
          </div>
          
          <!-- History Tab -->
          <div class="profile-tab-content ${currentProfileTab === 'history' ? 'active' : ''}" data-content="history">
            <div class="history-list">
              ${user.matchHistory.length > 0 ? user.matchHistory.map(match => {
                const placementClass = match.placement === 1 ? 'gold' : match.placement === 2 ? 'silver' : match.placement === 3 ? 'bronze' : 'normal'
                return `
                  <div class="history-row">
                    <div class="history-date">${match.date}</div>
                    <div class="history-server">${match.server}</div>
                    <div class="history-stat">
                      <div class="history-stat-value">${match.duration}m</div>
                      <div class="history-stat-label">Duration</div>
                    </div>
                    <div class="history-stat">
                      <div class="history-stat-value">${match.eaten}</div>
                      <div class="history-stat-label">Eaten</div>
                    </div>
                    <div class="history-placement">
                      <div class="history-placement-value ${placementClass}">#${match.placement}</div>
                    </div>
                  </div>
                `
              }).join('') : '<p class="no-data-message">No matches played yet. Dive in and start playing!</p>'}
            </div>
          </div>
        </div>
      </div>
      
      <div class="account-buttons">
        <button class="account-btn account-btn-back" id="account-back">
          ← Back
        </button>
      </div>
    </div>
  `
}

function render() {
  if (!accountRoot) return
  
  if (isLoggedIn) {
    accountRoot.innerHTML = buildProfileHTML()
    attachProfileListeners()
  } else {
    accountRoot.innerHTML = buildAuthHTML()
    attachAuthListeners()
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachAuthListeners() {
  // Back button
  document.getElementById('account-back')?.addEventListener('click', handleBack)
  
  // Auth tabs
  const tabs = accountRoot.querySelectorAll('.auth-tab')
  const loginForm = accountRoot.querySelector('#login-form')
  const signupForm = accountRoot.querySelector('#signup-form')
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      
      if (tab.dataset.tab === 'login') {
        loginForm.classList.remove('hidden')
        signupForm.classList.add('hidden')
      } else {
        loginForm.classList.add('hidden')
        signupForm.classList.remove('hidden')
      }
    })
  })
  
  // Login form
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    handleLogin()
  })
  
  // Signup form
  signupForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    handleSignup()
  })
  
  // Forgot password
  document.getElementById('forgot-password')?.addEventListener('click', () => {
    alert('Password reset functionality coming soon!\n\nPlease contact support for assistance.')
  })
  
  // Prevent form inputs from triggering game controls
  accountRoot.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', (e) => e.stopPropagation())
    input.addEventListener('keyup', (e) => e.stopPropagation())
  })
}

function attachProfileListeners() {
  // Back button
  document.getElementById('account-back')?.addEventListener('click', handleBack)
  
  // Profile tabs
  const tabs = accountRoot.querySelectorAll('.profile-tab')
  const tabContents = accountRoot.querySelectorAll('.profile-tab-content')
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentProfileTab = tab.dataset.tab
      
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      
      tabContents.forEach(content => {
        content.classList.toggle('active', content.dataset.content === currentProfileTab)
      })
    })
  })
  
  // Edit profile
  document.getElementById('edit-profile')?.addEventListener('click', () => {
    alert('Profile editing coming soon!\n\nYou will be able to:\n• Change avatar\n• Update username\n• Select title\n• Customize appearance')
  })
  
  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      logout()
      render()
    }
  })
  
  // Add friend
  accountRoot.querySelector('.friends-add-btn')?.addEventListener('click', () => {
    const username = prompt('Enter username to add as friend:')
    if (username && username.trim()) {
      alert(`Friend request sent to "${username.trim()}"!`)
    }
  })
  
  // Friend action buttons
  accountRoot.querySelectorAll('.friend-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.title
      const friendRow = btn.closest('.friend-row')
      const friendName = friendRow.querySelector('.friend-name').textContent
      
      if (action === 'Message') {
        alert(`Opening chat with ${friendName}...\n\nMessaging feature coming soon!`)
      } else if (action === 'Invite') {
        alert(`Game invite sent to ${friendName}!`)
      }
    })
  })
}

// ============================================================================
// AUTH HANDLERS
// ============================================================================

function handleLogin() {
  const email = document.getElementById('login-email')?.value
  const password = document.getElementById('login-password')?.value
  
  if (!email || !password) return
  
  const submitBtn = accountRoot.querySelector('#login-form .auth-submit')
  const originalText = submitBtn.textContent
  submitBtn.textContent = 'Logging in...'
  submitBtn.disabled = true
  
  // Simulate API call
  setTimeout(() => {
    isLoggedIn = true
    currentUser = { ...MOCK_USER, email }
    currentProfileTab = 'stats'
    
    console.log('[AccountMenu] Login successful')
    render()
  }, 1000)
}

function handleSignup() {
  const username = document.getElementById('signup-username')?.value
  const email = document.getElementById('signup-email')?.value
  const password = document.getElementById('signup-password')?.value
  const confirm = document.getElementById('signup-confirm')?.value
  
  if (!username || !email || !password || !confirm) return
  
  if (password !== confirm) {
    alert('Passwords do not match!')
    return
  }
  
  const submitBtn = accountRoot.querySelector('#signup-form .auth-submit')
  submitBtn.textContent = 'Creating account...'
  submitBtn.disabled = true
  
  // Simulate API call
  setTimeout(() => {
    isLoggedIn = true
    currentUser = {
      ...MOCK_USER,
      username,
      email,
      level: 1,
      xp: 0,
      stats: {
        totalPlayTime: 0,
        gamesPlayed: 0,
        creaturesEaten: 0,
        timesEaten: 0,
        largestSize: 0,
        longestSurvival: 0,
        totalDistanceSwum: 0,
        abilitiesUsed: 0,
        structuresBuilt: 0,
      },
      achievements: MOCK_USER.achievements.map(a => ({ ...a, unlocked: false, progress: 0 })),
      friends: [],
      matchHistory: [],
    }
    currentProfileTab = 'stats'
    
    console.log('[AccountMenu] Signup successful')
    render()
  }, 1500)
}

function logout() {
  isLoggedIn = false
  currentUser = null
  currentProfileTab = 'stats'
  console.log('[AccountMenu] Logged out')
}

// ============================================================================
// NAVIGATION
// ============================================================================

function handleBack() {
  hide()
  if (onBackCallback) {
    onBackCallback()
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the account menu
 */
export function show() {
  if (!accountRoot) {
    initAccountMenu()
  }
  
  render()
  
  accountRoot.classList.add('visible')
  isVisible = true
  console.log('[AccountMenu] Shown')
}

/**
 * Hide the account menu
 */
export function hide() {
  if (!accountRoot) return
  
  accountRoot.classList.remove('visible')
  isVisible = false
  console.log('[AccountMenu] Hidden')
}

/**
 * Check if account menu is visible
 */
export function isAccountVisible() {
  return isVisible
}

/**
 * Register callback for back button
 */
export function onBack(callback) {
  onBackCallback = callback
}

/**
 * Check if user is logged in
 */
export function isUserLoggedIn() {
  return isLoggedIn
}

/**
 * Get current user data
 */
export function getCurrentUser() {
  return currentUser
}

/**
 * Logout current user
 */
export function logoutUser() {
  logout()
  if (isVisible) {
    render()
  }
}

export default {
  initAccountMenu,
  show,
  hide,
  isAccountVisible,
  onBack,
  isUserLoggedIn,
  getCurrentUser,
  logoutUser,
}