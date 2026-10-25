import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useGameStore } from "./store/gameStore";
import { useDialogue } from "./store/dialogue";
import { COMPANION_DIALOGUES } from "./data/companions";
import { stopSpeech } from "./lib/aiSpeech";
import ShenshanScene from "./scenes/ShenshanScene";
import StoryChapter1Scene from "./scenes/StoryChapter1Scene";
import ConvoyScene from "./scenes/ConvoyScene";
import StarArrayScene from "./games/StarArray/StarArrayScene";
import GlyphTrialScene from "./games/GlyphTrial/GlyphTrialScene";
import BreathingScene from "./games/Breathing/BreathingScene";
import GoNoGoScene from "./games/GoNoGo/GoNoGoScene";
import SteppingStonesScene from "./games/SteppingStones/SteppingStonesScene";
import { CatDock } from "./objects/CatCompanion";
import Hud, { FramePump } from "./ui/Hud";
import HomeOverlay from "./ui/HomeOverlay";
import ParentReport from "./ui/ParentReport";
import StarArrayOverlay from "./games/StarArray/StarArrayOverlay";
import GlyphTrialOverlay from "./games/GlyphTrial/GlyphTrialOverlay";
import BreathingOverlay from "./games/Breathing/BreathingOverlay";
import GoNoGoOverlay from "./games/GoNoGo/GoNoGoOverlay";
import SteppingStonesOverlay from "./games/SteppingStones/SteppingStonesOverlay";
import { default as AchievementToast } from "./ui/AchievementToast";
import QuestPanel from "./ui/QuestPanel";
import DialogueBar from "./ui/DialogueBar";
import CompanionAI from "./ui/CompanionAI";
import AIConsentDialog from "./ui/AIConsentDialog";
import ValidationPanel from "./ui/ValidationPanel";
import StoryChapterOverlay from "./ui/StoryChapterOverlay";
import ConvoyOverlay from "./ui/ConvoyOverlay";

// 进山问候本次会话只播一次（模块级标记，刷新页面才会重置）
let mountainGreeted = false;

// 3D 场景层（Canvas 内）与 2D UI 层（Canvas 外）严格分离：
// div / img 等 DOM 元素绝不能放进 Canvas 子树。
//
// Canvas 的挂载方式很关键：R3F 的 Canvas 在卸载时会主动把根从全局 roots 表里删掉
// （unmountComponentAtNode → roots.delete），而它的挂载 effect 又会因为 re-rooting
// 的局部状态变化而重跑，重新 render 一个已经从 roots 里消失的根 —— 表现为场景切换后
// 画面冻结、useFrame 永不执行。因此这里不让 Canvas 卸载：首帧挂载后一直保留，
// 只通过 sceneKey 切换内部的场景组件。
export default function App() {
  const screen = useGameStore((s) => s.screen);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
  }, []);

  // 进山问候：screen 变 mountain 且本次会话未播过 → 延迟 2.5s push（2.5s 内离开则取消，下次进山再试）
  useEffect(() => {
    if (screen !== "mountain") return;
    const t = window.setTimeout(() => {
      if (mountainGreeted) return;
      mountainGreeted = true;
      useDialogue.getState().push(COMPANION_DIALOGUES.mountainGreeting);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [screen]);

  // 切屏清理：离开五个游戏屏与主线场景时立即停止语音（字幕队列自然播完不受影响）
  useEffect(() => {
    if (
      screen !== "story1" &&
      screen !== "convoy" &&
      screen !== "starArray" &&
      screen !== "glyphTrial" &&
      screen !== "breathing" &&
      screen !== "goNoGo" &&
      screen !== "stepStones"
    ) {
      stopSpeech();
    }
  }, [screen]);

  const showCanvas = mounted.current || screen !== "parent";
  const sceneKey =
    screen === "story1" ? "story1"
      : screen === "convoy" ? "convoy"
      : screen === "starArray" ? "starArray"
      : screen === "glyphTrial" ? "glyphTrial"
      : screen === "breathing" ? "breathing"
      : screen === "goNoGo" ? "goNoGo"
      : screen === "stepStones" ? "stepStones"
      : "mountain";

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
      {showCanvas && (
        <div style={{ position: "absolute", inset: 0, visibility: screen === "parent" ? "hidden" : "visible" }}>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{ preserveDrawingBuffer: false }}
            camera={{ position: [0, 3.2, 15], fov: 55, near: 0.1, far: 220 }}
            style={{ position: "absolute", inset: 0 }}
          >
            <CameraRig sceneKey={sceneKey} />
            {/* FramePump 必须放在 Suspense 之外：场景 suspend（字体/贴图加载）时 React 会
                销毁边界内所有 layout effect，useFrame 订阅会被一并移除，帧循环随之停摆。 */}
            <FramePump />
            <Suspense fallback={null}>
              {sceneKey === "story1" ? (
                <StoryChapter1Scene />
              ) : sceneKey === "convoy" ? (
                <ConvoyScene />
              ) : sceneKey === "starArray" ? (
                <StarArrayScene />
              ) : sceneKey === "glyphTrial" ? (
                <GlyphTrialScene />
              ) : sceneKey === "breathing" ? (
                <BreathingScene />
              ) : sceneKey === "goNoGo" ? (
                <GoNoGoScene />
              ) : sceneKey === "stepStones" ? (
                <SteppingStonesScene />
              ) : (
                <ShenshanScene />
              )}
            </Suspense>
          </Canvas>
        </div>
      )}
      <Hud />
      {screen === "starArray" && <StarArrayOverlay />}
      {screen === "glyphTrial" && <GlyphTrialOverlay />}
      {screen === "breathing" && <BreathingOverlay />}
      {screen === "goNoGo" && <GoNoGoOverlay />}
      {screen === "stepStones" && <SteppingStonesOverlay />}
      {screen !== "home" && screen !== "parent" && <CatDock />}
      {/* mountain 屏的 2D 挂载区：篇章卡（每日冒险）在此，后续对话条等 2D 组件按序追加 */}
      {screen === "mountain" && <QuestPanel />}
      {screen === "home" && <HomeOverlay />}
      {screen === "parent" && <ParentReport />}
      {screen === "validation" && <ValidationPanel />}
      {screen === "story1" && <StoryChapterOverlay />}
      {screen === "convoy" && <ConvoyOverlay />}
      {/* 伙伴对话条：全屏幕可见，队列空时不渲染 */}
      <DialogueBar />
      {/* 机器动物 AI 小助手 Cog：无条件挂载，自身按 screen === "parent" 决定是否渲染 */}
      <CompanionAI />
      <AIConsentDialog />
      {/* 成就提示挂最外层：所有屏可见，pointerEvents:none 不挡操作 */}
      <AchievementToast />
    </div>
  );
}

// 场景切换时把相机放回该场景的机位（Canvas 不再随场景重建，需要手动复位）
function CameraRig({ sceneKey }: { sceneKey: string }) {
  const camera = useThree((s) => s.camera);
  const pos =
    sceneKey === "convoy"
      ? ([13.8, 10.4, 19.6] as const)
      : sceneKey === "story1"
      ? ([0, 3.8, 14] as const)
      : sceneKey === "starArray"
      ? ([0, 0.8, 9] as const)
      : sceneKey === "glyphTrial"
      ? ([0, 1.4, 8.5] as const)
      : sceneKey === "breathing"
      ? ([0, 1.8, 8] as const)
      : sceneKey === "goNoGo"
      ? ([0, 2, 8] as const)
      : sceneKey === "stepStones"
      ? ([0, 3.5, 9] as const) // 溪边机位：略高俯看石阵
      : ([0, 3.2, 15] as const);
  // 石阵在低位近处，stepStones 的注视点单独压低；其余场景沿用默认注视点
  const target = sceneKey === "convoy"
    ? ([-0.8, 1.1, -1.8] as const)
    : sceneKey === "story1"
    ? ([0, 1.35, -2] as const)
    : sceneKey === "stepStones" ? ([0, 0.5, -1] as const) : ([0, 1.6, -2] as const);
  useLayoutEffect(() => {
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, sceneKey]);
  return null;
}
