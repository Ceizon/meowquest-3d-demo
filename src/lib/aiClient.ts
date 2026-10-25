import { useAIConsent } from "../store/aiConsent";

// AI 服务层（provider 抽象）
// 演示环境：经 Vite 代理 /ai-api 调用 ECNU 开放平台（chat.ecnu.edu.cn，OpenAI 兼容，校内本地部署模型）
// 生产叙事：端侧本地模型离线推理（CosyVoice / Flash 级小模型），接口签名保持不变即可切换
// 红线：任何失败返回 null 触发降级，绝不阻塞游戏流程

const TTS_URL = "/ai-api/v1/audio/speech";
const CHAT_URL = "/ai-api/v1/chat/completions";
const TTS_TIMEOUT = 8000;
const CHAT_TIMEOUT = 10000;

// 运行时 key 覆盖（免重建切换）→ 构建期 env
export function getApiKey(): string {
  try {
    const local = localStorage.getItem("mq-ai-key");
    if (local && local.trim()) return local.trim();
  } catch { /* ignore */ }
  return (import.meta.env.VITE_ECNU_KEY as string | undefined)?.trim() ?? "";
}

export function aiEnabled(): boolean {
  return getApiKey().length > 0;
}

// ---- TTS 音频缓存（内存 LRU，key = voice|speed|text）----
const CACHE_MAX = 40;
const audioCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const v = audioCache.get(key);
  if (v !== undefined) {
    audioCache.delete(key);
    audioCache.set(key, v); // LRU 刷新
  }
  return v;
}
function cacheSet(key: string, url: string) {
  if (audioCache.size >= CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    if (oldest !== undefined) {
      const old = audioCache.get(oldest);
      if (old) URL.revokeObjectURL(old);
      audioCache.delete(oldest);
    }
  }
  audioCache.set(key, url);
}

/** 文本转语音；成功返回可播放的 blob URL，失败/无 key 返回 null（调用方降级） */
export async function tts(text: string, voice: string, speed = 1): Promise<string | null> {
  if (!useAIConsent.getState().accepted) return null;
  const key = getApiKey();
  if (!key || !text.trim()) return null;
  const cacheKey = `${voice}|${speed}|${text}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TTS_TIMEOUT);
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "ecnu-tts", input: text.slice(0, 4096), voice, response_format: "mp3", speed }),
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const url = URL.createObjectURL(blob);
    cacheSet(cacheKey, url);
    return url;
  } catch {
    return null;
  }
}

/** 对话补全；失败/无 key 返回 null（调用方降级到静态文案） */
export async function chat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  if (!useAIConsent.getState().accepted) return null;
  const key = getApiKey();
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), CHAT_TIMEOUT);
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: opts.model ?? "ecnu-plus",
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 500,
      }),
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
