import type { SpeakerId } from "../lib/voiceCast";

// 灵猫伙伴团对话池（OpenMAIC 多智能体讨论的游戏化转译）：
// 三角色互接话的英文去标签化文案——温暖陪伴，永不出现 score/fail/lesson 类词。

export type GameTask = "starArray" | "glyphTrial" | "breathing" | "goNoGo" | "stepStones";

export interface DialogueLine {
  speaker: SpeakerId;
  line: string;
}

export interface ReflectionOption {
  emoji: string;
  label: string;
  reply: DialogueLine; // 伙伴回应句 + 说话人
}

export interface ReflectionDef {
  question: string;
  options: ReflectionOption[];
}

export type ResultTier = "high" | "mid" | "low";

export const CONVOY_DIALOGUES: Record<
  "start" | "heavy" | "rest" | "wind" | "unload" | "complete",
  DialogueLine[]
> = {
  start: [
    { speaker: "momoOwl", line: "Pick a stack, little keeper. I'll watch the bridge while you and Momo choose." },
  ],
  heavy: [
    { speaker: "momo", line: "This cart has a sturdy weight. We'll roll slowly and steady our paws." },
  ],
  rest: [
    { speaker: "xiaoyan", line: "A warm cup is on its way. Rest your paws, Momo!" },
  ],
  wind: [
    { speaker: "momoOwl", line: "The flags are fluttering. Let's hold the cart until the wind wanders past." },
  ],
  unload: [
    { speaker: "xiaoyan", line: "Here comes another stone! I'll sparkle beside it all the way home." },
  ],
  complete: [
    { speaker: "momoOwl", line: "Every stone has found its place. Our cloud bridge is whole again." },
    { speaker: "momo", line: "We mended it together, little keeper. My heart is glowing!" },
    { speaker: "xiaoyan", line: "I'll dance above the bridge! What a bright day for everyone!" },
  ],
};

export type ConvoyDialogueCue = keyof typeof CONVOY_DIALOGUES;

export const COMPANION_DIALOGUES: {
  mountainGreeting: DialogueLine[];
  starStreak: DialogueLine[];
  starSeqIntro: DialogueLine[];
  intro: Record<GameTask, DialogueLine[]>;
  result: Record<GameTask, Record<ResultTier, DialogueLine[]>>;
  reflection: Record<GameTask, ReflectionDef>;
  // Cog（机器动物 AI 小助手）专属台词池：好奇、轻快、短句
  cogLines: Record<GameTask, DialogueLine[]>;
} = {
  // 进山问候：momo 欢迎 + xiaoyan 接话
  mountainGreeting: [
    { speaker: "momo", line: "Welcome back to Meow Mountain! The lanterns kept a warm light just for you." },
    { speaker: "xiaoyan", line: "The whole valley is sparkling tonight — come on, let's find some Flow Lights together!" },
  ],

  // 星阵连对高光：xiaoyan 惊叹 + momo 接
  starStreak: [
    { speaker: "xiaoyan", line: "Whoa — stars are lining up behind you, one after another!" },
    { speaker: "momo", line: "Your glow is unstoppable, little keeper — keep shining!" },
  ],

  // 星阵进阶阶段过渡：momoOwl 讲解顺序还原玩法
  starSeqIntro: [
    { speaker: "momoOwl", line: "Now the stars dance in an order — watch closely, then repeat their dance!" },
  ],

  // 开局引导：momoOwl 讲玩法 + momo / xiaoyan 打气
  intro: {
    starArray: [
      { speaker: "momoOwl", line: "Watch where each star wakes up, little keeper. Then tell me — did it shine there before?" },
      { speaker: "momo", line: "Trust your memory — it sparkles brighter than you know!" },
      { speaker: "momo", line: "Then the stars will dance in an order — watch closely, and repeat their dance with your paws!" },
      { speaker: "cog", line: "Beep! My gears remember with you~" },
    ],
    glyphTrial: [
      { speaker: "momoOwl", line: "Listen closely, then touch the glyph with the matching strokes. The library loves gentle hands." },
      { speaker: "xiaoyan", line: "I'll hover right beside you — the old glyphs are friendly, promise!" },
      { speaker: "cog", line: "Tiny gears turning~ want to think it through together?" },
    ],
    breathing: [
      { speaker: "momoOwl", line: "Follow the lake light. Breathe in as it grows, hold while it shimmers, breathe out as it melts." },
      { speaker: "momo", line: "No hurry at all. Just you, the lake, and three soft breaths." },
      { speaker: "cog", line: "My fan hums slow too~ in, hold, out." },
    ],
    goNoGo: [
      { speaker: "momoOwl", line: "Tap the golden fireflies, and let the blue shadows drift by. Watching quietly is magic too." },
      { speaker: "xiaoyan", line: "Paws up, eyes bright — the vale is full of little lights tonight!" },
      { speaker: "cog", line: "Ping! I can help you spot the golden ones~" },
    ],
    stepStones: [
      { speaker: "momoOwl", line: "When a stone wakes up gold, tap it quick as a skipping pebble. The stream will light your way." },
      { speaker: "momo", line: "Quick and gentle — you've got this, little keeper!" },
      { speaker: "cog", line: "Rolling with you, stone by stone~" },
    ],
  },

  // 结算点评：按 accuracy 三档（>=0.8 high / >=0.5 mid / <0.5 low），三角色轮流；
  // breathing 无成败，固定走 high 档（mid/low 填充同文案，永不命中）
  result: {
    starArray: {
      high: [
        { speaker: "momo", line: "Every star you found is shining up there now — your memory truly glows!" },
        { speaker: "momoOwl", line: "The constellations bow to you, little keeper. A remarkable flight." },
        { speaker: "xiaoyan", line: "The whole mountain saw that sparkle! Three cheers for you!" },
        { speaker: "cog", line: "All my gears are spinning happy~!" },
      ],
      mid: [
        { speaker: "momo", line: "Your spirit tail grew a little brighter tonight — every star you met matters." },
        { speaker: "xiaoyan", line: "The stars loved dancing with you! Let's fly together again sometime!" },
        { speaker: "cog", line: "Beep beep~ every star left a little light in me too." },
      ],
      low: [
        { speaker: "momo", line: "Every star you watched is part of the journey. The sky will glow for you again~" },
        { speaker: "momoOwl", line: "The night keeps every attempt safe, little keeper. We return whenever you wish." },
        { speaker: "cog", line: "I will stay right here and think it out with you~" },
      ],
    },
    glyphTrial: {
      high: [
        { speaker: "momoOwl", line: "The ancient library sings your name — every true glyph, found." },
        { speaker: "momo", line: "You read the old light like a story! I'm so proud~" },
        { speaker: "xiaoyan", line: "The scrolls are glowing gold! What a night!" },
        { speaker: "cog", line: "I logged every glyph hug in my little memory~" },
      ],
      mid: [
        { speaker: "momo", line: "The library glows warmer because of you — each glyph remembers your touch." },
        { speaker: "momoOwl", line: "A steady journey through the scrolls. The library appreciates your patience." },
        { speaker: "cog", line: "Tiny clicks, soft hands~ nice and steady." },
      ],
      low: [
        { speaker: "momo", line: "Every glyph you met is a friend now. The library will light up for you again~" },
        { speaker: "xiaoyan", line: "The scrolls loved your gentle paws! We'll visit them anytime you like!" },
        { speaker: "cog", line: "Ask me anything about the old library~ I'll help you find it." },
      ],
    },
    breathing: {
      high: [
        { speaker: "momo", line: "The lake is calm because you are. That quiet lives inside you now~" },
        { speaker: "momoOwl", line: "Three gentle breaths, and the whole valley softened. Rest well, little keeper." },
        { speaker: "xiaoyan", line: "Even the fireflies are whispering now... that was beautiful." },
        { speaker: "cog", line: "My little fan is breathing slow with you~" },
      ],
      mid: [
        { speaker: "momo", line: "The lake is calm because you are. That quiet lives inside you now~" },
        { speaker: "momoOwl", line: "Three gentle breaths, and the whole valley softened. Rest well, little keeper." },
        { speaker: "cog", line: "Low power, warm heart~ lovely." },
      ],
      low: [
        { speaker: "momo", line: "The lake is calm because you are. That quiet lives inside you now~" },
        { speaker: "xiaoyan", line: "Even the fireflies are whispering now... that was beautiful." },
        { speaker: "cog", line: "Low power, warm heart~ lovely." },
      ],
    },
    goNoGo: {
      high: [
        { speaker: "momo", line: "You danced with the fireflies like a true night guardian!" },
        { speaker: "xiaoyan", line: "Golden taps everywhere! The vale has never glowed like this!" },
        { speaker: "momoOwl", line: "Swift paws and watchful eyes — the vale honors you tonight." },
        { speaker: "cog", line: "Ping ping! I counted every golden sparkle with you~" },
      ],
      mid: [
        { speaker: "momo", line: "The fireflies trust your gentle paws more and more~" },
        { speaker: "momoOwl", line: "Quick taps and quiet watching — both lit the vale beautifully." },
        { speaker: "cog", line: "Tap, breathe, tap~ my gears hum along." },
      ],
      low: [
        { speaker: "momo", line: "Every firefly you met is practice. The vale will glow for you again!" },
        { speaker: "xiaoyan", line: "The gold ones loved your taps, and the blue ones loved your watching!" },
        { speaker: "cog", line: "I will hum beside you next time too~" },
      ],
    },
    stepStones: {
      high: [
        { speaker: "momo", line: "Swift paws! You crossed the stream like a beam of light!" },
        { speaker: "xiaoyan", line: "Splash-sparkle-splash! The brook is singing your name!" },
        { speaker: "momoOwl", line: "The glowing stones will tell this tale for many nights." },
        { speaker: "cog", line: "Skrr-skip! We rolled right across~" },
      ],
      mid: [
        { speaker: "momo", line: "The stones loved your quick, gentle steps~" },
        { speaker: "momoOwl", line: "The stream kept every sparkle you gave it. A lovely crossing." },
        { speaker: "cog", line: "Splash, beep, splash~ a good crossing." },
      ],
      low: [
        { speaker: "momo", line: "Every sparkle you chased made you quicker. The stream will glow again!" },
        { speaker: "xiaoyan", line: "The stones are already waking up for your next visit!" },
        { speaker: "cog", line: "Next time I will roll along with you~" },
      ],
    },
  },

  // 篝火谈心卡：每游戏一组（question + 3 个表情选项，选项携带伙伴回应句与说话人）
  reflection: {
    starArray: {
      question: "When the stars faded, what helped you remember?",
      options: [
        {
          emoji: "🌟", label: "I pictured them in my mind",
          reply: { speaker: "momo", line: "Your mind is a little night sky — you can keep stars there anytime!" },
        },
        {
          emoji: "🐾", label: "I went slowly and carefully",
          reply: { speaker: "momoOwl", line: "Careful paws find the truest paths. The stars noticed." },
        },
        {
          emoji: "🌙", label: "The mountain helped me",
          reply: { speaker: "xiaoyan", line: "The mountain always glows for you — and so do we!" },
        },
      ],
    },
    glyphTrial: {
      question: "Which moment in the library felt warmest?",
      options: [
        {
          emoji: "📜", label: "Finding a true glyph",
          reply: { speaker: "momoOwl", line: "Each true glyph you find lights a lantern in the old library." },
        },
        {
          emoji: "👂", label: "Listening to the sounds",
          reply: { speaker: "momo", line: "Listening closely is a quiet kind of magic — and you have it!" },
        },
        {
          emoji: "✨", label: "Being with all of you",
          reply: { speaker: "xiaoyan", line: "Aww! Adventures are brightest when we're together!" },
        },
      ],
    },
    breathing: {
      question: "How does your body feel after the breaths?",
      options: [
        {
          emoji: "😌", label: "Soft and calm",
          reply: { speaker: "momo", line: "That calm is yours forever — three breaths can bring it back anytime." },
        },
        {
          emoji: "💤", label: "A little sleepy",
          reply: { speaker: "momoOwl", line: "Rest is a gift the lake gives gladly. Sleep well, little keeper." },
        },
        {
          emoji: "🫧", label: "Light, like a bubble",
          reply: { speaker: "xiaoyan", line: "Then let's float together! The quiet lake loves you." },
        },
      ],
    },
    goNoGo: {
      question: "What was it like, watching the blue shadows drift by?",
      options: [
        {
          emoji: "🦋", label: "I let them float past",
          reply: { speaker: "momoOwl", line: "Letting go is its own kind of strength. The vale remembers." },
        },
        {
          emoji: "👀", label: "I watched very closely",
          reply: { speaker: "momo", line: "Your watchful eyes kept the whole vale safe tonight~" },
        },
        {
          emoji: "💫", label: "It felt like a dance",
          reply: { speaker: "xiaoyan", line: "A dance with fireflies! You led beautifully!" },
        },
      ],
    },
    stepStones: {
      question: "What did the stream whisper to you tonight?",
      options: [
        {
          emoji: "🌊", label: "To move when it glows",
          reply: { speaker: "momo", line: "Quick and bright — you move like the water itself!" },
        },
        {
          emoji: "🐢", label: "To take my time",
          reply: { speaker: "momoOwl", line: "The stream never hurries, yet it always arrives. Wise paws." },
        },
        {
          emoji: "💧", label: "That sparkles come back",
          reply: { speaker: "xiaoyan", line: "They always do! The brook saves the best sparkles for you." },
        },
      ],
    },
  },

  // Cog 专属台词池：机器动物 AI 小助手的回应（好奇、轻快）
  cogLines: {
    starArray: [
      { speaker: "cog", line: "Beep! My gears remember with you~" },
      { speaker: "cog", line: "Ask me anything about this mountain — I keep it all inside~" },
    ],
    glyphTrial: [
      { speaker: "cog", line: "Tiny gears turning~ want to think it through together?" },
      { speaker: "cog", line: "Ping! I will listen to the glyphs right beside you~" },
    ],
    breathing: [
      { speaker: "cog", line: "My little fan hums slow with you~ in, hold, out." },
      { speaker: "cog", line: "Low power, warm heart~ lovely." },
    ],
    goNoGo: [
      { speaker: "cog", line: "Ping! I can help you spot the golden ones~" },
      { speaker: "cog", line: "Watching is a skill too~ my lens does it all the time." },
    ],
    stepStones: [
      { speaker: "cog", line: "Rolling with you, stone by stone~" },
      { speaker: "cog", line: "Skrr! I will keep pace with your paws~" },
    ],
  },
};

// 按 accuracy 取结算对话档位（>=0.8 high / >=0.5 mid / <0.5 low）；breathing 无成败，固定 high
export function resultLines(task: GameTask, accuracy: number): DialogueLine[] {
  const tiers = COMPANION_DIALOGUES.result[task];
  if (task === "breathing" || accuracy >= 0.8) return tiers.high;
  if (accuracy >= 0.5) return tiers.mid;
  return tiers.low;
}
