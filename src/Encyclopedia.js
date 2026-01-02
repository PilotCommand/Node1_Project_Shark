/**
 * Encyclopedia.js - Complete creature database and unified API
 * 
 * The single source of truth for all procedurally generated sea creatures.
 * 
 * Usage:
 *   import { generateCreature, CreatureType, getAllCreatureClasses } from './Encyclopedia.js'
 *   
 *   const fish = generateCreature(seed, CreatureType.FISH, FishClass.SHARK)
 *   const mammal = generateCreature(seed, CreatureType.MAMMAL, MammalClass.DOLPHIN)
 *   
 *   // Get every creature class for cycling
 *   const allClasses = getAllCreatureClasses()
 */

// Re-export everything from individual modules
export * from './Fishes.js'
export * from './Mammals.js'

// Import for internal use
import { 
  FishClass, 
  generateFish, 
  generateStarterFish,
  getOrderedClasses as getFishOrderedClasses,
  getClassDisplayName as getFishDisplayName,
  getClassShortName as getFishShortName,
} from './Fishes.js'

import { 
  MammalClass, 
  generateMammal,
  getOrderedClasses as getMammalOrderedClasses,
  getClassDisplayName as getMammalDisplayName,
  getClassShortName as getMammalShortName,
} from './Mammals.js'

// ============================================================================
// CREATURE TYPES
// ============================================================================

export const CreatureType = {
  FISH: 'fish',
  MAMMAL: 'mammal',
  // Future:
  // CRUSTACEAN: 'crustacean',
  // CEPHALOPOD: 'cephalopod',
}

/**
 * Metadata for creature types
 */
const CREATURE_TYPE_META = {
  [CreatureType.FISH]: {
    name: 'Fish',
    emoji: '🐟',
    order: 10,
    classes: FishClass,
    generator: generateFish,
    starterGenerator: generateStarterFish,
    starterClass: FishClass.STARTER,
    getOrderedClasses: getFishOrderedClasses,
    getDisplayName: getFishDisplayName,
    getShortName: getFishShortName,
  },
  [CreatureType.MAMMAL]: {
    name: 'Marine Mammal',
    emoji: '🐬',
    order: 20,
    classes: MammalClass,
    generator: generateMammal,
    starterGenerator: null,  // No starter for mammals
    starterClass: null,
    getOrderedClasses: getMammalOrderedClasses,
    getDisplayName: getMammalDisplayName,
    getShortName: getMammalShortName,
  },
}

// ============================================================================
// UNIFIED GENERATION
// ============================================================================

/**
 * Generate any creature by type and class
 * @param {number} seed - Random seed
 * @param {string} creatureType - From CreatureType enum
 * @param {string} creatureClass - Class within that type (e.g., FishClass.SHARK)
 * @returns {object} Generated creature with mesh, parts, seed, etc.
 */
export function generateCreature(seed, creatureType, creatureClass = null) {
  const meta = CREATURE_TYPE_META[creatureType]
  if (!meta) {
    console.warn(`Unknown creature type: ${creatureType}`)
    return null
  }
  
  const result = meta.generator(seed, creatureClass)
  if (result) {
    result.creatureType = creatureType
  }
  return result
}

/**
 * Generate starter creature for a type (if available)
 */
export function generateStarter(creatureType) {
  const meta = CREATURE_TYPE_META[creatureType]
  if (!meta?.starterGenerator) {
    // No starter - generate random of first class
    const classes = meta.getOrderedClasses()
    if (classes.length > 0) {
      return generateCreature(Math.floor(Math.random() * 0xFFFFFFFF), creatureType, classes[0])
    }
    return null
  }
  
  const result = meta.starterGenerator()
  if (result) {
    result.creatureType = creatureType
  }
  return result
}

// ============================================================================
// UNIFIED CLASS HELPERS
// ============================================================================

/**
 * Get display name for any creature class
 */
export function getCreatureDisplayName(creatureType, creatureClass) {
  const meta = CREATURE_TYPE_META[creatureType]
  if (!meta) return creatureClass
  return meta.getDisplayName(creatureClass)
}

/**
 * Get short name for any creature class
 */
export function getCreatureShortName(creatureType, creatureClass) {
  const meta = CREATURE_TYPE_META[creatureType]
  if (!meta) return creatureClass
  return meta.getShortName(creatureClass)
}

/**
 * Get all classes for a creature type in order
 */
export function getCreatureClasses(creatureType) {
  const meta = CREATURE_TYPE_META[creatureType]
  if (!meta) return []
  return meta.getOrderedClasses()
}

/**
 * Get ordered list of creature types
 */
export function getOrderedCreatureTypes() {
  return Object.values(CreatureType)
    .filter(ct => CREATURE_TYPE_META[ct])
    .sort((a, b) => CREATURE_TYPE_META[a].order - CREATURE_TYPE_META[b].order)
}

/**
 * Get ALL creature classes across ALL types, flattened and ordered
 * Returns: [{ type, class, displayName, shortName }, ...]
 */
export function getAllCreatureClasses() {
  const all = []
  
  for (const creatureType of getOrderedCreatureTypes()) {
    const meta = CREATURE_TYPE_META[creatureType]
    const classes = meta.getOrderedClasses()
    
    for (const creatureClass of classes) {
      all.push({
        type: creatureType,
        class: creatureClass,
        displayName: meta.getDisplayName(creatureClass),
        shortName: meta.getShortName(creatureClass),
        isStarter: creatureClass === meta.starterClass,
      })
    }
  }
  
  return all
}

/**
 * Get creature type metadata
 */
export function getCreatureTypeMeta(creatureType) {
  return CREATURE_TYPE_META[creatureType] || null
}

/**
 * Determine creature type from a class value
 */
export function getTypeFromClass(creatureClass) {
  if (Object.values(FishClass).includes(creatureClass)) {
    return CreatureType.FISH
  }
  if (Object.values(MammalClass).includes(creatureClass)) {
    return CreatureType.MAMMAL
  }
  return null
}

// ============================================================================
// RANDOM SEED UTILITIES (re-export for convenience)
// ============================================================================

export function randomSeed() {
  return Math.floor(Math.random() * 0xFFFFFFFF)
}

export function seedToString(seed) {
  return seed.toString(16).toUpperCase().padStart(8, '0')
}

export function stringToSeed(str) {
  return parseInt(str, 16)
}

export default {
  // Types
  CreatureType,
  FishClass,
  MammalClass,
  
  // Generation
  generateCreature,
  generateStarter,
  
  // Class helpers
  getCreatureDisplayName,
  getCreatureShortName,
  getCreatureClasses,
  getOrderedCreatureTypes,
  getAllCreatureClasses,
  getCreatureTypeMeta,
  getTypeFromClass,
  
  // Utilities
  randomSeed,
  seedToString,
  stringToSeed,
}