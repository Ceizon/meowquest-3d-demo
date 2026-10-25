// 灵猫伙伴团：角色 → AI 音色映射（ECNU ecnu-tts / Fun-CosyVoice3）+ 角色视觉定义
// 头像为纯 CSS 渐变圆 + 符号，零图片资产、零预载红线

export type SpeakerId = "momo" | "momoOwl" | "xiaoyan" | "cog";

export interface CompanionDef {
  id: SpeakerId;
  name: string;          // 展示名（英文，去标签化语境）
  emoji: string;         // 头像符号
  color: string;         // 主题色（头像渐变起点）
  color2: string;        // 渐变终点
  voice: string;         // ecnu-tts 音色 ID
  speed: number;         // 语速倍率
  pitch: number;         // 浏览器 TTS 音高，卡通角色使用更明亮的音域
  browserVoiceHints: string[]; // 浏览器可用音色名称关键词，按顺序尝试
}

export const COMPANIONS: Record<SpeakerId, CompanionDef> = {
  // 灵猫 Momo：甜美亲和的女声
  momo: {
    id: "momo", name: "Momo", emoji: "🐱", color: "#ffd98a", color2: "#ff9d6c",
    voice: "female_sweet", speed: 1.04, pitch: 1.28,
    browserVoiceHints: ["girl", "female", "samantha", "zira", "xiaoxiao", "tingting"],
  },
  // 墨墨（猫头鹰学者）：沉稳讲述感
  momoOwl: {
    id: "momoOwl", name: "Momo the Owl", emoji: "🦉", color: "#9fb4e8", color2: "#6d7ec8",
    voice: "male_steady", speed: 0.92, pitch: 0.84,
    browserVoiceHints: ["male", "daniel", "alex", "david"],
  },
  // 小焰（萤火向导）：活泼动画角色音
  xiaoyan: {
    id: "xiaoyan", name: "Flicker", emoji: "✨", color: "#ffb36b", color2: "#ff7d54",
    voice: "labixiaoxin", speed: 1.08, pitch: 1.38,
    browserVoiceHints: ["girl", "female", "samantha", "zira", "xiaoxiao", "tingting"],
  },
  // 齿轮兽 Cog（机器动物 AI 小助手）：好奇、轻快的机器小动物口吻；若平台不支持该音色会走浏览器 TTS 降级
  cog: {
    id: "cog", name: "Cog", emoji: "⚙️", color: "#8fd8ff", color2: "#4bb4e6",
    voice: "labixiaoxin", speed: 1.02, pitch: 1.12,
    browserVoiceHints: ["female", "male", "samantha", "alex", "zira"],
  },
};
