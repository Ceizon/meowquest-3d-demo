import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// AI 服务代理：浏览器直连 chat.ecnu.edu.cn 会触发 CORS，
// dev 与 preview 统一经 /ai-api 前缀转发（生产叙事：端侧本地模型，此代理仅演示环境使用）
const aiProxy = {
  "/ai-api": {
    target: "https://chat.ecnu.edu.cn",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ai-api/, "/open/api"),
  },
};

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5188, open: false, proxy: aiProxy },
  // 临时公网预览使用 loca.lt 隧道；仅允许该隧道域名，避免开放任意 Host。
  preview: { proxy: aiProxy, allowedHosts: [".loca.lt"] },
});
