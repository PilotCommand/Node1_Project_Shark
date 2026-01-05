/**
 * attacker.js - Attacker Ability
 * 
 * TODO: Implement attacker ability
 */

// ============================================================================
// ABILITY EXPORT
// ============================================================================

export default {
  name: 'Attacker',
  description: 'TODO: Add description',
  
  onActivate: () => {
    console.log('[Attacker] Activated')
  },
  
  onDeactivate: () => {
    console.log('[Attacker] Deactivated')
  },
  
  onUpdate: (delta) => {
    // Called every frame while active
  },
  
  onPassiveUpdate: (delta) => {
    // Called every frame even when not active
  },
}
