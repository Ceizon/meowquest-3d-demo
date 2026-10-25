// 角色语音播放：三级降级链 ecnu-tts → speechSynthesis → 纯字幕（静默）
// fire-and-forget：永不阻塞调用方；串行排队避免台词叠播（平台并发限制 + 听感）
// 与 soundManager 静音开关联动：静音时跳过语音，字幕照常（由对话条渲染）

import { tts } from "./aiClient";
import { COMPANIONS, type SpeakerId } from "./voiceCast";
import { soundManager } from "./sounds";

let queue: Promise<void> = Promise.resolve();
let currentAudio: HTMLAudioElement | null = null;

function pickBrowserVoice(
  voices: SpeechSynthesisVoice[],
  def: (typeof COMPANIONS)[SpeakerId],
  lang: string,
) {
  const language = lang.toLowerCase();
  const sameLanguage = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language.split("-")[0]));
  const pool = sameLanguage.length > 0 ? sameLanguage : voices;
  return def.browserVoiceHints
    .map((hint) => hint.toLowerCase())
    .reduce<SpeechSynthesisVoice | undefined>(
      (found, hint) => found ?? pool.find((voice) => voice.name.toLowerCase().includes(hint)),
      undefined,
    ) ?? pool[0];
}

function browserSpeech(speaker: SpeakerId, text: string, lang = "en-US"): Promise<void> {
  if (!("speechSynthesis" in window) || soundManager.isMuted) return Promise.resolve();
  const def = COMPANIONS[speaker];
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = def.speed;
    u.pitch = def.pitch;
    const voices = window.speechSynthesis.getVoices();
    const voice = pickBrowserVoice(voices, def, lang);
    if (voice) u.voice = voice;
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      window.setTimeout(finish, 12000);
      window.speechSynthesis.speak(u);
    });
  } catch {
    return Promise.resolve();
  }
}

/** 立即停止当前语音（切屏/卸载时调用） */
export function stopSpeech() {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}

async function playOne(speaker: SpeakerId, text: string): Promise<void> {
  if (soundManager.isMuted) return;
  const def = COMPANIONS[speaker];

  // 第一级：ECNU TTS（角色专属音色）
  const url = await tts(text, def.voice, def.speed);
  if (url) {
    const played = await new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (currentAudio === audio) currentAudio = null;
        resolve(ok);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      // 安全阀：单句最长 15s，避免异常音频卡住队列
      const guard = window.setTimeout(() => {
        try { audio.pause(); } catch { /* ignore */ }
        finish(false);
      }, 15000);
      audio.addEventListener("ended", () => window.clearTimeout(guard), { once: true });
      audio.play().then(() => undefined).catch(() => {
        window.clearTimeout(guard);
        finish(false);
      });
    });
    if (played) return;
    // 非用户手势触发的 Audio.play() 可能被浏览器拦截，继续走浏览器 TTS。
  }

  // 第二级：浏览器 speechSynthesis，按角色选择音色并调整音高
  await browserSpeech(speaker, text);
  // 第三级：纯字幕（字幕由对话条渲染，此处无需动作）
}

/** 说一句角色台词（异步串行，不阻塞） */
export function speakLine(speaker: SpeakerId, text: string) {
  queue = queue.then(() => playOne(speaker, text)).catch(() => undefined);
}

/** 仅使用浏览器 TTS，给游戏内短句使用，避免为单个字形提示请求云端音频。 */
export function speakBrowserLine(speaker: SpeakerId, text: string, lang = "zh-CN") {
  queue = queue.then(() => browserSpeech(speaker, text, lang)).catch(() => undefined);
}
