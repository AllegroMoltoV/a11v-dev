// 生成物 (dist/) の検査。目標 (JS 0 件、リクエスト 1 件、1 ページの本体 10 KB 未満) と、公開してはならない状態 (href=# の残り、
// リンク切れ、メールアドレスの書き換えを受ける書き方、noindex の食い違い) を検出する。問題があれば、終了コード 1 で終わる。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SIZE_LIMIT = 10 * 1024;
export const brSize = (s) => brotliCompressSync(Buffer.from(s), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

const ARGS = { M: 2, L: 2, H: 1, V: 1, A: 7, Q: 4, C: 6, Z: 0 };
// SVG のパスデータ: コマンドごとの引数の数が正しいこと (数値の区切りの欠落で、描画が途中で止まることを検出する)
function badPathData(d) {
  const re = /([MLHVAQCZ])([^MLHVAQCZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const nums = m[2].match(/-?\d*\.?\d+/g) || [];
    const k = ARGS[m[1]];
    if (k === 0 ? nums.length !== 0 : nums.length === 0 || nums.length % k !== 0) return `${m[1]} の引数が ${nums.length} 個`;
    if (/\d\.\d+\.\d/.test(m[2])) return "数値の連結";
  }
  return null;
}

/**
 * 1 ページの検査。
 * @param {string} name ファイル名 (index.html、<slug>.html、404.html)
 * @param {string} html
 * @param {{origin: string, indexable: boolean, urlPaths: Set<string>, ids: Map<string, Set<string>>}} ctx
 */
export function checkPage(name, html, ctx) {
  const p = [];
  const add = (msg) => p.push(`${name}: ${msg}`);
  const pagePath = name === "index.html" ? "/" : `/${name.replace(/\.html$/, "")}`;

  const br = brSize(html);
  if (br >= SIZE_LIMIT) add(`本体が Brotli で ${br} B。上限は ${SIZE_LIMIT} B 未満`);

  // 実行される script は 0 件 (JSON-LD は実行されない)
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    if (!/type\s*=\s*["']application\/ld\+json["']/.test(m[1])) add("実行される script がある");
  }
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { add("JSON-LD が JSON として読めない"); }
  }
  if (html.includes("/cdn-cgi/")) add("/cdn-cgi/ を含む (Cloudflare が注入した可能性)");

  // リクエストは 1 件 (HTML だけ)。外部のリソースを参照しない
  if (/<(img|iframe|video|audio|source|object|embed)\b/i.test(html)) add("外部のリソースを参照するタグがある");
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const href = (tag.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    if (/(stylesheet|preload|prefetch|modulepreload|manifest|apple-touch-icon)/i.test(rel)) add(`外部のリソースを参照する link がある (${rel})`);
    if (/\bicon\b/i.test(rel) && !href.startsWith("data:")) add("ファビコンが data URI ではない");
  }
  if (/@import|url\(\s*["']?(?!data:)/i.test(html)) add("CSS が外部のリソースを参照している");

  // リンク
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/g)) {
    const href = m[1];
    if (href === "" || href === "#") { add(`href が空または # (${JSON.stringify(href)})`); continue; }
    if (/^(https?:\/\/|mailto:)/.test(href)) continue;
    const [path, frag] = href.startsWith("#") ? [pagePath, href.slice(1)] : href.split("#");
    if (!(href.startsWith("#") || href.startsWith("/"))) { add(`想定外の形式のリンク: ${href}`); continue; }
    const target = path === "" ? "/" : path;
    if (!ctx.urlPaths.has(target)) { add(`存在しないページへのリンク: ${href}`); continue; }
    if (frag && !ctx.ids.get(target)?.has(frag)) add(`存在しない id へのリンク: ${href}`);
  }

  // 必須の項目
  if (!/<html lang="[a-z-]+"/.test(html)) add("html に lang がない");
  if (!/<title>[^<]+<\/title>/.test(html)) add("title がない");
  if (!/<meta name="description" content="[^"]+"/.test(html)) add("meta description がない");
  if (!/<meta name="viewport" content="[^"]+"/.test(html)) add("meta viewport がない");
  if ((html.match(/<meta name="theme-color"/g) || []).length < 2) add("theme-color がライトとダークの 2 つない");
  if (!/<meta property="og:title" content="[^"]+"/.test(html)) add("og:title がない");
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (name === "404.html") { if (canonical) add("404 に canonical がある"); }
  else if (canonical !== `${ctx.origin}${pagePath === "/" ? "/" : pagePath}`) add(`canonical が想定と異なる: ${canonical}`);

  // noindex: 非公開の間は全ページ。404 は常に
  const noindex = /<meta name="robots" content="noindex">/.test(html);
  const expectNoindex = !ctx.indexable || name === "404.html";
  if (noindex !== expectNoindex) add(`noindex が想定と異なる (想定: ${expectNoindex ? "あり" : "なし"})`);

  // メールアドレスは、書き換えを受けないよう、email_off で囲む
  const stripped = html.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, "").replace(/<script\b[\s\S]*?<\/script>/g, "");
  if (/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(stripped)) add("email_off で囲まれていないメールアドレスがある");

  // SVG のパスデータ
  for (const m of html.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)) {
    const bad = badPathData(m[1]);
    if (bad) add(`SVG のパスデータが壊れている (${bad})`);
  }
  return p;
}

export function checkSite(distDir) {
  const problems = [];
  const required = ["index.html", "404.html", "sitemap.xml", "robots.txt", "llms.txt"];
  for (const f of required) if (!existsSync(join(distDir, f))) problems.push(`${f}: ファイルがない`);
  if (problems.length) return { problems, sizes: [] };

  const htmlNames = readdirSync(distDir).filter((f) => f.endsWith(".html")).sort();
  const pages = new Map(htmlNames.map((n) => [n, readFileSync(join(distDir, n), "utf8")]));
  const robots = readFileSync(join(distDir, "robots.txt"), "utf8");
  const indexable = !/^Disallow:\s*\/\s*$/m.test(robots);
  const origin = ((readFileSync(join(distDir, "sitemap.xml"), "utf8").match(/<loc>(https?:\/\/[^/<]+)/) || [])[1]) || "";

  const urlPaths = new Set();
  const ids = new Map();
  for (const [n, html] of pages) {
    const path = n === "index.html" ? "/" : `/${n.replace(/\.html$/, "")}`;
    urlPaths.add(path);
    ids.set(path, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])));
  }
  const ctx = { origin, indexable, urlPaths, ids };
  const sizes = [];
  for (const [n, html] of pages) {
    problems.push(...checkPage(n, html, ctx));
    sizes.push([n, Buffer.byteLength(html), brSize(html)]);
  }
  // sitemap は、404 を除く全ページを、絶対 URL で載せる
  const sitemap = readFileSync(join(distDir, "sitemap.xml"), "utf8");
  for (const n of htmlNames.filter((x) => x !== "404.html")) {
    const loc = `${origin}${n === "index.html" ? "/" : "/" + n.replace(/\.html$/, "")}`;
    if (!sitemap.includes(`<loc>${loc}</loc>`)) problems.push(`sitemap.xml: ${loc} がない`);
  }
  if (sitemap.includes("404")) problems.push("sitemap.xml: 404 を含む");
  return { problems, sizes, indexable };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] || join(root, "dist");
  const { problems, sizes, indexable } = checkSite(dist);
  for (const [n, raw, br] of sizes) console.log(`${n.padEnd(34)} ${String(raw).padStart(6)} B  Brotli ${String(br).padStart(5)} B`);
  console.log(`indexable: ${indexable}`);
  if (problems.length) {
    console.error(`\n問題が ${problems.length} 件あります:`);
    for (const x of problems) console.error(`- ${x}`);
    process.exitCode = 1;
  } else console.log(`\n検査に問題はありません (${sizes.length} ページ)`);
}
