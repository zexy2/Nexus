"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface KineticRibbonProps {
  compact: boolean;
  reducedMotion: boolean;
  scrollProgress: number;
}

const vertexShader = `
  uniform float uTime;
  uniform float uMotion;

  attribute float aProgress;
  attribute float aSide;

  varying float vProgress;
  varying float vSide;

  void main() {
    vec3 transformed = position;
    float breath = sin(aProgress * 7.85398 + uTime * 0.42) * 0.035 * uMotion;
    float drift = sin(aProgress * 6.28318 + uTime * 0.24) * 0.018 * uMotion;

    transformed.z += breath * (1.0 - abs(aSide) * 0.18);
    transformed.y += drift;

    vProgress = aProgress;
    vSide = aSide;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;

  varying float vProgress;
  varying float vSide;

  void main() {
    float centerLight = 1.0 - smoothstep(0.08, 1.0, abs(vSide));
    float surfaceVariation = 0.5 + 0.5 * sin(vProgress * 9.42477 - vSide * 1.4);

    vec3 graphite = vec3(0.025, 0.030, 0.028);
    vec3 softWhite = vec3(0.72, 0.75, 0.70);
    float bodyMix = 0.12 + centerLight * 0.48 + surfaceVariation * 0.08;
    vec3 body = mix(graphite, softWhite, bodyMix);

    float pulseHead = fract(0.16 + uTime * 0.045);
    float pulseDistance = abs(vProgress - pulseHead);
    pulseDistance = min(pulseDistance, 1.0 - pulseDistance);
    float pulse = exp(-pow(pulseDistance / 0.052, 2.0));
    pulse *= 0.58 + centerLight * 0.42;

    vec3 highlight = vec3(0.95, 0.97, 0.92);
    vec3 color = mix(body, highlight, pulse * 0.85);

    float startFade = smoothstep(0.0, 0.08, vProgress);
    float endFade = smoothstep(0.0, 0.1, 1.0 - vProgress);
    float edgeFade = 0.74 + centerLight * 0.24;

    gl_FragColor = vec4(color, startFade * endFade * edgeFade * uOpacity);
  }
`;

function createRibbonGeometry(segments: number, width: number) {
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-1.5, -0.92, 0.08),
      new THREE.Vector3(-1.16, -0.08, 0.42),
      new THREE.Vector3(-0.62, 0.78, -0.18),
      new THREE.Vector3(0.06, 1.02, 0.12),
      new THREE.Vector3(0.72, 0.28, -0.46),
      new THREE.Vector3(1.18, -0.64, 0.04),
      new THREE.Vector3(1.58, 0.18, 0.32),
    ],
    false,
    "catmullrom",
    0.52,
  );

  const positions: number[] = [];
  const progressValues: number[] = [];
  const sideValues: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const reference = new THREE.Vector3(0, 0, 1);

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const point = curve.getPointAt(progress);

    curve.getTangentAt(progress, tangent).normalize();
    normal.crossVectors(reference, tangent).normalize();
    normal.applyAxisAngle(
      tangent,
      Math.sin(progress * Math.PI * 2) * 0.42 + progress * 0.58,
    );

    const endTaper = Math.pow(Math.sin(progress * Math.PI), 0.45);
    const widthScale = 0.18 + endTaper * 0.82;
    const halfWidth = width * widthScale * 0.5;

    const left = point.clone().addScaledVector(normal, halfWidth);
    const right = point.clone().addScaledVector(normal, -halfWidth);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    progressValues.push(progress, progress);
    sideValues.push(-1, 1);
    uvs.push(progress, 0, progress, 1);

    if (index < segments) {
      const vertex = index * 2;
      indices.push(
        vertex,
        vertex + 2,
        vertex + 1,
        vertex + 2,
        vertex + 3,
        vertex + 1,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "aProgress",
    new THREE.Float32BufferAttribute(progressValues, 1),
  );
  geometry.setAttribute(
    "aSide",
    new THREE.Float32BufferAttribute(sideValues, 1),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function KineticRibbonComponent({
  compact,
  reducedMotion,
  scrollProgress,
}: KineticRibbonProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(
    () => createRibbonGeometry(compact ? 72 : 168, compact ? 0.34 : 0.46),
    [compact],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: reducedMotion ? 0 : 3.5 },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uOpacity: { value: 1 },
    }),
    [reducedMotion],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    if (!reducedMotion) {
      material.uniforms.uTime.value += delta;
    }
    material.uniforms.uMotion.value = reducedMotion ? 0 : 1;
    material.uniforms.uOpacity.value = Math.max(
      0.22,
      1 - scrollProgress * 0.74,
    );

    if (!reducedMotion) {
      state.invalidate();
    }
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

export const KineticRibbon = memo(KineticRibbonComponent);
