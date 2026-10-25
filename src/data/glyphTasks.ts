// 符形试炼题库 —— 移植自 web-prototype/data/literacyTasks.ts (charQuestions)
// 形近字视觉混淆是读写障碍(core deficit)的核心行为指标
export interface GlyphTask {
  prompt: string;      // 目标词（喵喵念出的语境）
  target: string;      // 正确字形
  distractors: string[]; // 干扰形近字（自适应时取前 N 个）
}

export const glyphTasks: GlyphTask[] = [
  { prompt: "self · 自己", target: "己", distractors: ["已", "巳", "乙", "弋"] },
  { prompt: "sun · 太阳", target: "太", distractors: ["大", "犬", "夫", "天"] },
  { prompt: "earth · 土地", target: "土", distractors: ["士", "干", "工", "王"] },
  { prompt: "sky · 天空", target: "天", distractors: ["夭", "夫", "矢", "太"] },
  { prompt: "sunrise · 日出", target: "日", distractors: ["曰", "目", "田", "口"] },
  { prompt: "person · 人类", target: "人", distractors: ["入", "八", "几", "大"] },
  { prompt: "noon · 午后", target: "午", distractors: ["牛", "干", "千", "于"] },
  { prompt: "white · 白色", target: "白", distractors: ["自", "百", "曰", "回"] },
  { prompt: "king · 王者", target: "王", distractors: ["玉", "主", "壬", "全"] },
  { prompt: "question · 问题", target: "问", distractors: ["间", "闻", "闷", "闪"] },
  // 第二批扩充（10→20），降低重玩重复感
  { prompt: "future · 未来", target: "未", distractors: ["末", "本", "木", "术"] },
  { prompt: "pull · 拔河", target: "拔", distractors: ["拨", "泼", "发", "友"] },
  { prompt: "sunny · 晴天", target: "晴", distractors: ["睛", "清", "情", "请"] },
  { prompt: "live · 居住", target: "住", distractors: ["往", "注", "柱", "驻"] },
  { prompt: "do · 办法", target: "办", distractors: ["为", "力", "刀", "刃"] },
  { prompt: "today · 今天", target: "今", distractors: ["令", "念", "含", "贪"] },
  { prompt: "wait · 等候", target: "候", distractors: ["侯", "喉", "猴", "逅"] },
  { prompt: "fold · 折纸", target: "折", distractors: ["拆", "析", "听", "近"] },
  { prompt: "blue · 蓝天", target: "蓝", distractors: ["篮", "监", "临", "盐"] },
  { prompt: "fish · 钓鱼", target: "钓", distractors: ["钩", "约", "的", "勺"] },
];

// 去污名化"错误"话术：永远没有红叉、失败、重来
export const wrongPickLines = [
  "This glyph is playing hide-and-seek with you~",
  "The mist whispers... look a little closer at the strokes.",
  "Almost! The spirit cat tilts its head — try the next glow.",
];
