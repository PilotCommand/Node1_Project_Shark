import * as THREE from 'three'

export function createMap() {
  const group = new THREE.Group()
  
  // Underwater sky sphere - tropical water gradient below, atmosphere above
  const skyGeometry = new THREE.SphereGeometry(500, 64, 64)
  
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      // Underwater colors
      waterTopColor: { value: new THREE.Color(0x00ced1) },     // Bright turquoise (surface light)
      waterBottomColor: { value: new THREE.Color(0x000033) },  // Deep ocean blue
      // Atmosphere colors
      skyTopColor: { value: new THREE.Color(0x4a90d9) },       // Natural sky blue
      skyBottomColor: { value: new THREE.Color(0xc9dff0) },    // Pale warm horizon
      waterLevel: { value: 30.0 },
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
  
  const sky = new THREE.Mesh(skyGeometry, skyMaterial)
  group.add(sky)
  
  // Sandy ocean floor
  const floorGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100)
  
  // Add some random height variation to the floor
  const floorVertices = floorGeometry.attributes.position.array
  for (let i = 0; i < floorVertices.length; i += 3) {
    floorVertices[i + 2] += Math.random() * 2 - 1 // Random Z offset (will be Y after rotation)
  }
  floorGeometry.computeVertexNormals()
  
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    roughness: 1.0,
    metalness: 0.0,
    emissive: 0x997755,
    emissiveIntensity: 0.15
  })
  
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -50
  group.add(floor)
  
  // Add some coral/rock formations
  for (let i = 0; i < 30; i++) {
    const coralGeometry = new THREE.ConeGeometry(
      Math.random() * 3 + 1,
      Math.random() * 8 + 4,
      Math.floor(Math.random() * 4) + 5
    )
    
    const coralColors = [0xff6b6b, 0xff8e53, 0xfeca57, 0xff9ff3, 0x48dbfb, 0x1dd1a1]
    const coralMaterial = new THREE.MeshStandardMaterial({
      color: coralColors[Math.floor(Math.random() * coralColors.length)],
      roughness: 0.7,
      emissive: coralColors[Math.floor(Math.random() * coralColors.length)],
      emissiveIntensity: 0.1
    })
    
    const coral = new THREE.Mesh(coralGeometry, coralMaterial)
    coral.position.set(
      Math.random() * 400 - 200,
      -50 + Math.random() * 4,
      Math.random() * 400 - 200
    )
    coral.rotation.x = Math.random() * 0.3 - 0.15
    coral.rotation.z = Math.random() * 0.3 - 0.15
    group.add(coral)
  }
  
  // Water surface (simple static plane)
  const surfaceGeometry = new THREE.PlaneGeometry(1000, 1000)
  const surfaceMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  })
  
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
  surface.rotation.x = -Math.PI / 2
  surface.position.y = 30
  group.add(surface)
  
  return group
}