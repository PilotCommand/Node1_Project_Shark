/**
 * MeshFactory - Centralized mesh creation
 * 
 * All mesh creation logic lives here. Other files decide when/where to create,
 * this file decides how.
 */

import * as THREE from 'three'

class MeshFactoryClass {
  constructor() {
    // Cache for reusable materials
    this.materials = {}
  }

  /**
   * Create a fish mesh
   * @param {object} options
   * @param {number} [options.bodyColor=0xff6600] - Main body color
   * @param {number} [options.finColor=0xff8833] - Fin color
   * @param {number} [options.scale=1] - Overall scale
   * @param {boolean} [options.metallic=false] - Shiny fish?
   * @returns {{ mesh: THREE.Group, parts: object }}
   */
  createFish(options = {}) {
    const {
      bodyColor = 0xff6600,
      finColor = 0xff8833,
      scale = 1,
      metallic = false
    } = options

    const fishGroup = new THREE.Group()

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: metallic ? 0.6 : 0.3,
      roughness: metallic ? 0.4 : 0.7
    })

    const finMaterial = new THREE.MeshStandardMaterial({
      color: finColor,
      metalness: metallic ? 0.5 : 0.2,
      roughness: 0.8
    })

    // 1. Main body - rectangular prism
    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.5, 1.5)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    fishGroup.add(body)

    // 2. Head - tapered box at front
    const headGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.5)
    const head = new THREE.Mesh(headGeometry, bodyMaterial)
    head.position.set(0, 0, -0.9)
    fishGroup.add(head)

    // 3. Tail - flat triangle shape
    const tailGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.5)
    const tail = new THREE.Mesh(tailGeometry, finMaterial)
    tail.position.set(0, 0, 1.0)
    tail.rotation.x = Math.PI / 6
    fishGroup.add(tail)

    // 4. Dorsal fin (top)
    const dorsalGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.6)
    const dorsalFin = new THREE.Mesh(dorsalGeometry, finMaterial)
    dorsalFin.position.set(0, 0.4, 0)
    fishGroup.add(dorsalFin)

    // 5. Left side fin
    const leftFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
    const leftFin = new THREE.Mesh(leftFinGeometry, finMaterial)
    leftFin.position.set(-0.5, -0.1, -0.2)
    leftFin.rotation.z = -Math.PI / 6
    fishGroup.add(leftFin)

    // 6. Right side fin
    const rightFinGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.3)
    const rightFin = new THREE.Mesh(rightFinGeometry, finMaterial)
    rightFin.position.set(0.5, -0.1, -0.2)
    rightFin.rotation.z = Math.PI / 6
    fishGroup.add(rightFin)

    // Apply scale
    fishGroup.scale.setScalar(scale)

    // Set rotation order for proper 3D rotation
    fishGroup.rotation.order = 'YXZ'

    // Return mesh and parts (for animation/visibility control)
    return {
      mesh: fishGroup,
      parts: {
        body,
        head,
        tail,
        dorsalFin,
        leftFin,
        rightFin
      }
    }
  }

  /**
   * Create a coral/rock formation
   * @param {object} options
   * @param {number} [options.color] - Coral color (random if not specified)
   * @param {number} [options.radius] - Base radius (random 1-4 if not specified)
   * @param {number} [options.height] - Height (random 4-12 if not specified)
   * @param {number} [options.segments] - Number of sides (random 5-8 if not specified)
   * @returns {THREE.Mesh}
   */
  createCoral(options = {}) {
    const coralColors = [0xff6b6b, 0xff8e53, 0xfeca57, 0xff9ff3, 0x48dbfb, 0x1dd1a1]

    const {
      color = coralColors[Math.floor(Math.random() * coralColors.length)],
      radius = Math.random() * 3 + 1,
      height = Math.random() * 8 + 4,
      segments = Math.floor(Math.random() * 4) + 5
    } = options

    const geometry = new THREE.ConeGeometry(radius, height, segments)
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      emissive: color,
      emissiveIntensity: 0.1
    })

    const coral = new THREE.Mesh(geometry, material)
    
    // Slight random tilt
    coral.rotation.x = Math.random() * 0.3 - 0.15
    coral.rotation.z = Math.random() * 0.3 - 0.15

    return coral
  }

  /**
   * Create ocean floor
   * @param {object} options
   * @param {number} [options.size=1000] - Floor size
   * @param {number} [options.segments=100] - Geometry segments
   * @param {number} [options.bumpiness=2] - Height variation
   * @param {number} [options.color=0xffe4b5] - Sand color
   * @returns {THREE.Mesh}
   */
  createFloor(options = {}) {
    const {
      size = 1000,
      segments = 100,
      bumpiness = 2,
      color = 0xffe4b5
    } = options

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)

    // Add random height variation
    const vertices = geometry.attributes.position.array
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] += Math.random() * bumpiness - bumpiness / 2
    }
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1.0,
      metalness: 0.0,
      emissive: 0x997755,
      emissiveIntensity: 0.15
    })

    const floor = new THREE.Mesh(geometry, material)
    floor.rotation.x = -Math.PI / 2

    return floor
  }

  /**
   * Create water surface
   * @param {object} options
   * @param {number} [options.size=1000] - Surface size
   * @param {number} [options.color=0x88ccff] - Water color
   * @param {number} [options.opacity=0.5] - Transparency
   * @returns {THREE.Mesh}
   */
  createWaterSurface(options = {}) {
    const {
      size = 1000,
      color = 0x88ccff,
      opacity = 0.5
    } = options

    const geometry = new THREE.PlaneGeometry(size, size)
    
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide
    })

    const surface = new THREE.Mesh(geometry, material)
    surface.rotation.x = -Math.PI / 2

    return surface
  }

  /**
   * Create sky dome with underwater/atmosphere gradient
   * @param {object} options
   * @param {number} [options.radius=500] - Sky sphere radius
   * @param {number} [options.waterLevel=30] - Y level where water meets air
   * @param {object} [options.waterColors] - Underwater gradient colors
   * @param {object} [options.skyColors] - Above water gradient colors
   * @returns {THREE.Mesh}
   */
  createSkyDome(options = {}) {
    const {
      radius = 500,
      waterLevel = 30,
      waterColors = {
        top: 0x00ced1,    // Bright turquoise (surface light)
        bottom: 0x000033  // Deep ocean blue
      },
      skyColors = {
        top: 0x4a90d9,    // Natural sky blue
        bottom: 0xc9dff0  // Pale warm horizon
      }
    } = options

    const geometry = new THREE.SphereGeometry(radius, 64, 64)

    const material = new THREE.ShaderMaterial({
      uniforms: {
        waterTopColor: { value: new THREE.Color(waterColors.top) },
        waterBottomColor: { value: new THREE.Color(waterColors.bottom) },
        skyTopColor: { value: new THREE.Color(skyColors.top) },
        skyBottomColor: { value: new THREE.Color(skyColors.bottom) },
        waterLevel: { value: waterLevel },
        offset: { value: 50 },
        exponent: { value: 0.4 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterTopColor;
        uniform vec3 waterBottomColor;
        uniform vec3 skyTopColor;
        uniform vec3 skyBottomColor;
        uniform float waterLevel;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          
          if (vWorldPosition.y > waterLevel) {
            // Above water - atmosphere gradient
            float skyH = (vWorldPosition.y - waterLevel) / (500.0 - waterLevel);
            gl_FragColor = vec4(mix(skyBottomColor, skyTopColor, skyH), 1.0);
          } else {
            // Below water - underwater gradient
            gl_FragColor = vec4(mix(waterBottomColor, waterTopColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
          }
        }
      `,
      side: THREE.BackSide
    })

    return new THREE.Mesh(geometry, material)
  }

  /**
   * Create a simple rock
   * @param {object} options
   * @param {number} [options.size=1] - Rock size
   * @param {number} [options.color=0x888888] - Rock color
   * @returns {THREE.Mesh}
   */
  createRock(options = {}) {
    const {
      size = 1,
      color = 0x888888
    } = options

    const geometry = new THREE.DodecahedronGeometry(size, 0)
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.1
    })

    const rock = new THREE.Mesh(geometry, material)
    
    // Random rotation for variety
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )

    return rock
  }

  /**
   * Create a seaweed strand
   * @param {object} options
   * @param {number} [options.height=5] - Seaweed height
   * @param {number} [options.color=0x228B22] - Seaweed color
   * @returns {THREE.Group}
   */
  createSeaweed(options = {}) {
    const {
      height = 5,
      color = 0x228B22
    } = options

    const group = new THREE.Group()
    const segmentCount = Math.floor(height / 0.5)

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: THREE.DoubleSide
    })

    for (let i = 0; i < segmentCount; i++) {
      const segmentGeometry = new THREE.PlaneGeometry(0.3, 0.6)
      const segment = new THREE.Mesh(segmentGeometry, material)
      
      segment.position.y = i * 0.5
      segment.rotation.y = Math.random() * Math.PI
      segment.rotation.z = Math.sin(i * 0.5) * 0.2
      
      group.add(segment)
    }

    return group
  }
}

// Singleton instance
export const MeshFactory = new MeshFactoryClass()

export default MeshFactory
