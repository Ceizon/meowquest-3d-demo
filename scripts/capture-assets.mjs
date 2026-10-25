// 决赛素材一次性采集脚本（设计大赛交付保障）
// - 有头模式驱动本机 Edge（回退 Chrome），真机 GPU、rAF 不节流
// - 1920×1080 视口输出 6 张关键帧 + 3 场景真机 fps 实测
// - --park=roam|glyph|star：停驻在录屏起始画面，交由用户手动录屏
// 用法：node scripts/capture-assets.mjs [--park=roam|glyph|star]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE_URL = "http://localhost:4173/";
const OUT_DIR = path.resolve("d:\\File\\GCD4FE\\补充截图与录屏\\finals-3d");
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };
const BROWSERS = [
  ["Edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"],
  ["Chrome", "C:\\Users\\85714\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"],
];

const parkArg = process.argv.find((a) => a.startsWith("--park="));
const parkMode = parkArg ? parkArg.split("=")[1] : null;
if (parkMode && !["roam", "glyph", "star"].includes(parkMode)) {
  console.error(`未知 --park 模式: ${parkMode}（可选 roam|glyph|star）`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读取 PNG 文件头 IHDR 的宽高
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function shotChecked(page, name) {
  const file = path.join(OUT_DIR, name);
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.screenshot({ path: file });
    const size = pngSize(file);
    if (size && size.width === 1920 && size.height === 1080) {
      console.log(`[ok] ${name}  ${size.width}x${size.height}`);
      return { file, size };
    }
    console.warn(`[warn] ${name} 尺寸异常（${size ? `${size.width}x${size.height}` : "非 PNG"}），第 ${attempt} 次重截`);
    await sleep(500);
  }
  const size = pngSize(file);
  console.error(`[fail] ${name} 重截后仍不合格: ${size ? `${size.width}x${size.height}` : "非 PNG"}`);
  return { file, size, failed: true };
}

async function launchBrowser() {
  for (const [name, exe] of BROWSERS) {
    if (!fs.existsSync(exe)) continue;
    try {
      const browser = await puppeteer.launch({
        executablePath: exe,
        headless: false,
        args: ["--window-size=1920,1120", "--no-first-run", "--no-default-browser-check"],
        defaultViewport: null,
      });
      console.log(`[ok] 已启动 ${name}（headed）`);
      return browser;
    } catch (e) {
      console.warn(`[warn] ${name} 启动失败: ${e.message}`);
    }
  }
  throw new Error("本机无可用 Edge/Chrome，无法采集");
}

async function openFreshPage(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction("!!window.mq", { timeout: 20000 });
  // 清掉演示持久化数据（mq-save / mq-muted），避免污染采集画面
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction("!!window.mq", { timeout: 20000 });
  return page;
}

async function go(page, screen, settleMs) {
  await page.evaluate((s) => window.mq.go(s), screen);
  await sleep(settleMs);
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`未找到可点击按钮: ${text}`);
}

// 5 秒 rAF 计数测 fps
async function measureFps(page, label) {
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
          else res(n / ((performance.now() - t0) / 1000));
        };
        requestAnimationFrame(tick);
      })
  );
  const v = Math.round(fps * 10) / 10;
  console.log(`[fps] ${label}: ${v}`);
  if (v < 30) console.warn(`[fps] ${label} 低于 30，建议降级：关 PostFX Bloom，或 App.tsx 中 dpr 改为 [1,1]`);
  return v;
}

// 03：进入符形试炼 playing 并等环形字球稳定
async function enterGlyphPlaying(page) {
  await go(page, "glyphTrial", 2500);
  await clickButtonByText(page, "Enter the Library"); // 点真实按钮，保证 2D overlay 相位正确
  await sleep(2000); // 环形字球 + 字形贴图稳定
}

// 04：逐索引 pick，命中正确项后在 +200ms 抓金光爆裂
async function captureGlyphBurst(page) {
  const enabledCount = () =>
    page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim().length === 1 && !b.disabled).length);

  let before = await enabledCount();
  const maxTry = Math.max(before, 6);
  for (let i = 0; i < maxTry; i++) {
    const stillEnabled = await page.evaluate((idx) => {
      const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim().length === 1);
      return !!(btns[idx] && !btns[idx].disabled);
    }, i);
    if (!stillEnabled) continue;

    await page.evaluate((idx) => window.__mqScenes.glyph.pick(idx), i);
    await sleep(200);
    const cand = path.join(OUT_DIR, `04-cand-${i}.png`);
    await page.screenshot({ path: cand });

    const after = await enabledCount();
    if (after >= before) {
      // 可用按钮数未减 → 命中正确项，金光爆裂已触发
      fs.renameSync(cand, path.join(OUT_DIR, "04-glyph-burst.png"));
      const size = pngSize(path.join(OUT_DIR, "04-glyph-burst.png"));
      const ok = size && size.width === 1920 && size.height === 1080;
      console.log(`${ok ? "[ok]" : "[fail]"} 04-glyph-burst.png  ${size ? `${size.width}x${size.height}` : "非 PNG"}（第 ${i} 项命中）`);
      return { file: path.join(OUT_DIR, "04-glyph-burst.png"), size, failed: !ok };
    }
    fs.unlinkSync(cand); // 未命中，删除候选
    before = after;
  }
  throw new Error("04 采集失败：遍历所有选项均未命中正确符形");
}

async function park(page) {
  const label = { roam: "主场景漫游（神猫山）", glyph: "符形试炼 intro", star: "星阵记忆 intro" }[parkMode];
  if (parkMode === "roam") await go(page, "mountain", 3000);
  if (parkMode === "glyph") await go(page, "glyphTrial", 2500);
  if (parkMode === "star") await go(page, "starArray", 2500);
  console.log(`窗口已停驻在 ${label}，请开始录屏；录完后在此终端按 Ctrl+C 结束`);
  await new Promise(() => {}); // 永久挂起，保持进程与浏览器不退出
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const results = [];
  const fps = {};
  try {
    const page = await openFreshPage(browser);

    if (parkMode) {
      await park(page);
      return;
    }

    // 01 开场页
    await sleep(3000); // 首屏场景与贴图加载
    results.push(await shotChecked(page, "01-home.png"));

    // 02 神猫山 + 主场景 fps
    await go(page, "mountain", 3000);
    results.push(await shotChecked(page, "02-mountain.png"));
    fps.mountain = await measureFps(page, "mountain 主场景");

    // 03 符形试炼环形字球 + playing fps
    await enterGlyphPlaying(page);
    results.push(await shotChecked(page, "03-glyph-ring.png"));
    fps.glyph = await measureFps(page, "glyphTrial playing");

    // 04 金光爆裂瞬间
    results.push(await captureGlyphBurst(page));

    // 05 星阵点亮中段 + playing fps
    await go(page, "starArray", 2500);
    await clickButtonByText(page, "Begin the Trial");
    // 时序（StarArrayScene）：start 后 400ms 首星亮 1200ms → 380ms 间隙 → 1980~3580ms 第 2 星亮
    await sleep(2600);
    results.push(await shotChecked(page, "05-star-lit.png"));
    fps.star = await measureFps(page, "starArray playing");

    // 06 家长观察笔记
    await go(page, "parent", 1500);
    results.push(await shotChecked(page, "06-parent-notes.png"));
  } finally {
    if (!parkMode) {
      try {
        const page = (await browser.pages()).pop();
        if (page) await page.evaluate(() => localStorage.clear());
      } catch { /* 清理失败不阻塞退出 */ }
      await browser.close();
    }
  }

  console.log("\n===== 采集汇总 =====");
  for (const r of results) {
    console.log(`${r.failed ? "FAIL" : " OK "}  ${r.file}  ${r.size ? `${r.size.width}x${r.size.height}` : "未知"}`);
  }
  console.log(`fps  mountain=${fps.mountain}  glyph=${fps.glyph}  star=${fps.star}`);
  if (results.some((r) => r.failed)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[fatal] ${e.message}`);
  process.exit(1);
});
