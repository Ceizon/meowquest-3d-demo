// 自适应难度引擎 —— 简化移植自 web-prototype/lib/adaptiveEngine.ts
// 心流区间：正确率 60%-85% 为最佳挑战带

export function nextGlyphOptionCount(level: number, accuracy: number, avgRT: number): number {
  // 干扰字数量 3→5（题库每题仅 4 个干扰字，+1 目标字 = 上限 5）；答得快且准 → 加难度
  if (accuracy >= 0.85 && avgRT < 2500) return Math.min(5, level + 1);
  if (accuracy < 0.5) return Math.max(3, level - 1);
  return level;
}

export function nextNbackLevel(level: number, accuracy: number): number {
  if (accuracy > 0.85) return Math.min(2, level + 1); // demo 内 1-back / 2-back
  if (accuracy < 0.5) return Math.max(1, level - 1);
  return level;
}

// 溪光石阶：发光节奏倍率（0.6–1.6），影响石阶点亮的试次间隔
// 又快又准（accuracy≥85% 且 avgRT<900ms）→ 提速；accuracy<50% → 放缓
export function nextStonesSpeed(level: number, accuracy: number, avgRT: number): number {
  if (accuracy >= 0.85 && avgRT < 900) return Math.min(1.6, Math.round((level + 0.2) * 100) / 100);
  if (accuracy < 0.5) return Math.max(0.6, Math.round((level - 0.2) * 100) / 100);
  return level;
}

// 星阵进阶序列回忆：序列长度（3–6），按阶段 B 首对率升降
export function nextSeqLength(level: number, accuracy: number): number {
  if (accuracy >= 0.85) return Math.min(6, level + 1);
  if (accuracy < 0.5) return Math.max(3, level - 1);
  return level;
}
