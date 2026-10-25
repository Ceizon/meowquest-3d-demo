import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

// Bloom + Vignette：夜色风格化的关键（灯笼/星/心流之光的辉光）
export default function PostFX() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.6} mipmapBlur radius={0.7} />
      <Vignette eskil={false} offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}
