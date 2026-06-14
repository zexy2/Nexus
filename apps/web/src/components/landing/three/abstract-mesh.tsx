"use client";

import { WorkflowScene } from "./workflow-scene";

interface AbstractMeshProps {
  scrollProgress: number;
  mousePosition: { x: number; y: number };
}

export function AbstractMesh({ scrollProgress, mousePosition }: AbstractMeshProps) {
  return (
    <WorkflowScene
      compact={false}
      mousePosition={mousePosition}
      reducedMotion={false}
      scrollProgress={scrollProgress}
    />
  );
}
