import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ConvoyVec3 } from "../convoyGeometry";

export const STONE_GEOMETRY = new THREE.DodecahedronGeometry(0.25, 0);
export const STONE_MARK_GEOMETRY = new THREE.TorusGeometry(0.105, 0.014, 5, 14, Math.PI * 1.45);
export const DEFAULT_STONE_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#b9b4a7",
  roughness: 0.92,
  metalness: 0.02,
  flatShading: true,
});
export const STONE_MARK_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#e2d6b8",
  roughness: 0.82,
  emissive: "#6d6044",
  emissiveIntensity: 0.12,
});

export const CARGO_SLOTS: readonly ConvoyVec3[] = [
  [-0.28, 0.88, -0.13],
  [0.28, 0.88, -0.13],
  [-0.25, 1.17, 0.18],
  [0.25, 1.17, 0.18],
];

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function dampAngle(current: number, target: number, smoothing: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-smoothing * dt));
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
