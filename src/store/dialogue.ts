import { create } from "zustand";
import type { SpeakerId } from "../lib/voiceCast";

// 伙伴对话条队列：当前句永远是 queue[0]，advance = shift。
// 播放中（队列非空）忽略新 push，防止多触发源叠台词。

export interface DialogueEntry {
  speaker: SpeakerId;
  line: string;
}

interface DialogueState {
  queue: DialogueEntry[];
  push: (lines: DialogueEntry[]) => void;
  advance: () => void;
  clear: () => void;
}

export const useDialogue = create<DialogueState>((set, get) => ({
  queue: [],
  push: (lines) => {
    if (lines.length === 0 || get().queue.length > 0) return;
    set({ queue: [...lines] });
  },
  advance: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));
