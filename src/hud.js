import Stats from 'three/examples/jsm/libs/stats.module.js'

let stats

export function initHUD() {
  // Create FPS counter
  stats = new Stats()
  stats.showPanel(0) // 0 = FPS, 1 = MS, 2 = MB
  
  // Position in lower left corner
  stats.dom.style.position = 'absolute'
  stats.dom.style.left = '10px'
  stats.dom.style.top = 'auto'
  stats.dom.style.bottom = '10px'
  
  document.body.appendChild(stats.dom)
}

export function updateHUD() {
  stats.update()
}
