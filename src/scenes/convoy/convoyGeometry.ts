import * as THREE from "three";
import type { ConvoyLoad } from "../../lib/convoyRules";

export type ConvoyVec3 = [number, number, number];

/** 车辆与石垛坐标是地面锚点；桥面料位坐标是石块的中心。 */
export const CART_START: ConvoyVec3 = [-6.6, 0.78, 2.3];
export const CART_END: ConvoyVec3 = [2.35, 1.5, -4.4];

export const STONE_STACK_POSITIONS: Record<ConvoyLoad, ConvoyVec3> = {
  1: [-9.4, 0.79, 5.25],
  2: [-7.45, 0.79, 4.6],
  3: [-5.5, 0.79, 3.95],
  4: [-3.55, 0.79, 3.3],
};

/** 从近桥头向远桥头逐对填充，每对横跨桥宽排列。 */
export const BRIDGE_STONE_POSITIONS: readonly ConvoyVec3[] = [
  [3.7, 1.34, -4.91],
  [3.7, 1.34, -3.89],
  [4.64, 1.34, -4.91],
  [4.64, 1.34, -3.89],
  [5.58, 1.34, -4.91],
  [5.58, 1.34, -3.89],
  [6.52, 1.34, -4.91],
  [6.52, 1.34, -3.89],
  [7.46, 1.34, -4.91],
  [7.46, 1.34, -3.89],
  [8.4, 1.34, -4.91],
  [8.4, 1.34, -3.89],
];

export const TEA_SHED_POSITION: ConvoyVec3 = [-10.45, 0.79, 1.65];

const ROUTE_POINTS: readonly ConvoyVec3[] = [
  CART_START,
  [-4.75, 0.88, 1.45],
  [-1.45, 1.28, -1.2],
  [0.85, 1.47, -3.35],
  CART_END,
];

const route = new THREE.CatmullRomCurve3(
  ROUTE_POINTS.map((point) => new THREE.Vector3(...point)),
  false,
  "centripetal",
);

/**
 * 同一条弧长参数化路线供 outbound(0→1) 与 returning(1→0) 使用。
 * rotationY 以模型本地 +Z 为车头；返程时调用方在返回值上加 Math.PI。
 */
export function sampleConvoyRoute(progress: number): { position: ConvoyVec3; rotationY: number } {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const point = route.getPointAt(t);
  const tangent = route.getTangentAt(t).normalize();
  return {
    position: t === 0 ? [...CART_START] : t === 1 ? [...CART_END] : [point.x, point.y, point.z],
    rotationY: Math.atan2(tangent.x, tangent.z),
  };
}
