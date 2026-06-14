"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { KineticRibbon } from "./kinetic-ribbon";

interface WorkflowSceneProps {
  compact: boolean;
  mousePosition: { x: number; y: number };
  reducedMotion: boolean;
  scrollProgress: number;
}

function WorkflowSceneComponent({
  compact,
  mousePosition,
  reducedMotion,
  scrollProgress,
}: WorkflowSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const targetX = mousePosition.y * 0.045;
    const targetY = -0.08 + mousePosition.x * 0.065;
    groupRef.current.rotation.x +=
      (targetX - groupRef.current.rotation.x) * 0.045;
    groupRef.current.rotation.y +=
      (targetY - groupRef.current.rotation.y) * 0.04;

    if (!reducedMotion) {
      groupRef.current.position.y =
        Math.sin(state.clock.elapsedTime * 0.28) * 0.025;
    }

    const scale = (compact ? 0.7 : 1) * (1 - scrollProgress * 0.12);
    groupRef.current.scale.setScalar(scale);
    if (!reducedMotion && delta > 0) state.invalidate();
  });

  return (
    <group
      ref={groupRef}
      position={compact ? [1.08, -0.48, -0.48] : [1.28, -0.02, -0.12]}
      rotation={[0.03, compact ? -0.16 : -0.08, -0.04]}
      scale={compact ? 0.7 : 1}
    >
      <KineticRibbon
        compact={compact}
        reducedMotion={reducedMotion}
        scrollProgress={scrollProgress}
      />
    </group>
  );
}

export const WorkflowScene = memo(WorkflowSceneComponent);
