import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const sw = readFileSync(new URL("sw.js", root), "utf8");
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

ok(html.includes('<option value="gemini">Gemini 官方 API</option>'), "Gemini 官方 API option is missing");
ok(html.includes('https://generativelanguage.googleapis.com/v1beta'), "Gemini native base URL is missing");
ok(html.includes('"x-goog-api-key"'), "Gemini native API-key header is missing");
ok(html.includes(':streamGenerateContent?alt=sse'), "Gemini streaming endpoint is missing");
ok(html.includes(':generateContent'), "Gemini one-shot endpoint is missing");
ok(html.includes('function geminiContentsFor('), "Gemini conversation conversion is missing");
ok(html.includes('supportedGenerationMethods.includes("generateContent")'), "Gemini model capability filter is missing");
ok(sw.includes('const CACHE = "role-chat-cache-v161";'), "service worker cache was not bumped to v161");

console.log("Gemini native regression checks passed");
