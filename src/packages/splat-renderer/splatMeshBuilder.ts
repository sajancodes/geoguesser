import * as THREE from 'three';
import type { DecodedGaussianSplatCloud } from './splatBinary';

export interface SplatChunkSceneHandle {
  chunkId: string;
  mesh: THREE.Mesh;
  splatCount: number;
  byteLength: number;
  dispose: () => void;
}

const SPLAT_VERTEX_SHADER = /* glsl */ `
  attribute vec3 instancePosition;
  attribute vec3 instanceScale;
  attribute vec4 instanceColor;

  varying vec4 vColor;
  varying vec2 vLocalUv;

  void main() {
    vColor = instanceColor;
    vLocalUv = uv * 2.0 - 1.0;

    // Billboard oriented quad scaled by anisotropic Gaussian axes in view-aligned local frame
    vec3 worldCenter = instancePosition;
    vec4 viewCenter = modelViewMatrix * vec4(worldCenter, 1.0);

    // Anisotropic radius based on horizontal/vertical splat scale
    float rx = max(0.025, (instanceScale.x + instanceScale.z) * 0.5);
    float ry = max(0.025, instanceScale.y + rx * 0.25);

    vec3 cornerOffset = vec3(position.x * rx * 1.15, position.y * ry * 1.15, 0.0);
    vec4 finalViewPos = viewCenter + vec4(cornerOffset, 0.0);

    gl_Position = projectionMatrix * finalViewPos;
  }
`;

const SPLAT_FRAGMENT_SHADER = /* glsl */ `
  varying vec4 vColor;
  varying vec2 vLocalUv;

  void main() {
    float rSq = dot(vLocalUv, vLocalUv);
    if (rSq > 1.0) discard;

    // Smooth 2D Gaussian kernel falloff: exp(-3.2 * r^2)
    float gaussianWeight = exp(-3.2 * rSq);
    float alpha = vColor.a * gaussianWeight * 0.55;
    if (alpha < 0.02) discard;

    gl_FragColor = vec4(vColor.rgb, alpha);
  }
`;

/**
 * Creates an instanced 3D Gaussian Splat mesh from a decoded splat cloud.
 * Shares a single base quad geometry per chunk and cleans up all GPU attributes on dispose.
 */
export function createGaussianSplatChunkMesh(
  chunkId: string,
  cloud: DecodedGaussianSplatCloud,
  maxSplatsLimit?: number
): SplatChunkSceneHandle {
  const count = maxSplatsLimit
    ? Math.min(cloud.splatCount, maxSplatsLimit)
    : cloud.splatCount;

  const baseQuad = new THREE.PlaneGeometry(1, 1, 1, 1);
  const instancedGeo = new THREE.InstancedBufferGeometry();
  instancedGeo.index = baseQuad.index;
  instancedGeo.attributes.position = baseQuad.attributes.position;
  instancedGeo.attributes.uv = baseQuad.attributes.uv;
  instancedGeo.instanceCount = count;

  const posSlice =
    count === cloud.splatCount ? cloud.positions : cloud.positions.subarray(0, count * 3);
  const scaleSlice =
    count === cloud.splatCount ? cloud.scales : cloud.scales.subarray(0, count * 3);
  const colorSlice =
    count === cloud.splatCount ? cloud.colors : cloud.colors.subarray(0, count * 4);

  instancedGeo.setAttribute(
    'instancePosition',
    new THREE.InstancedBufferAttribute(posSlice, 3)
  );
  instancedGeo.setAttribute(
    'instanceScale',
    new THREE.InstancedBufferAttribute(scaleSlice, 3)
  );
  instancedGeo.setAttribute(
    'instanceColor',
    new THREE.InstancedBufferAttribute(colorSlice, 4)
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: SPLAT_VERTEX_SHADER,
    fragmentShader: SPLAT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(instancedGeo, material);
  mesh.name = `splat-chunk:${chunkId}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const dispose = () => {
    baseQuad.dispose();
    instancedGeo.dispose();
    material.dispose();
  };

  return {
    chunkId,
    mesh,
    splatCount: count,
    byteLength: cloud.byteLength,
    dispose,
  };
}
