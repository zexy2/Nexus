"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";

export function SceneEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={0.94}
        luminanceSmoothing={0.22}
        intensity={0.18}
      />
    </EffectComposer>
  );
}
