import { useRef } from "react";
import * as THREE from "three";
import ConvoyCart from "./actors/ConvoyCart";
import DynamicCargo from "./actors/DynamicCargo";
import StoneStacks from "./actors/StoneStacks";
import MomoPerformer from "./actors/MomoPerformer";
import BridgeArtisan from "./actors/BridgeArtisan";
import FlameCompanion from "./actors/FlameCompanion";
import { useReducedMotion } from "./actors/shared";

export default function ConvoyActors() {
  const cartRigRef = useRef<THREE.Group>(null);
  const cartBodyRef = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();

  return (
    <>
      <StoneStacks reducedMotion={reducedMotion} />
      <ConvoyCart rigRef={cartRigRef} bodyRef={cartBodyRef} reducedMotion={reducedMotion} />
      <DynamicCargo bodyRef={cartBodyRef} reducedMotion={reducedMotion} />
      <MomoPerformer cartRigRef={cartRigRef} reducedMotion={reducedMotion} />
      <BridgeArtisan reducedMotion={reducedMotion} />
      <FlameCompanion reducedMotion={reducedMotion} />
    </>
  );
}
