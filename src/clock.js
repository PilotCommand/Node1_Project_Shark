import * as THREE from 'three'

// Central clock for delta time calculations
// Use clock.getDelta() to get time since last frame
// This ensures movement is consistent regardless of FPS
export const clock = new THREE.Clock()
