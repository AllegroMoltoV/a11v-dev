// 外部リンクの実在の確認 (dist/ の HTML から、http(s) のリンクを集めて、HEAD で確かめる)。curl は使わず、Node の fetch を使う。
// ボット対策で 403 や 429 を返すサイトや、GET に対応しない窓口 (405) があるため、これらは「不確定」として分ける。check には含めない (npm run check:links で別に実行する)。
// 終了コード: 404 や 410 、接続の失敗が 1 件でもあれば 1。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.argv[2] || join(root, "dist");
const urls = new Map(); // url -> 載っているページ
for (const f of readdirSync(dist).filter((x) => x.endsWith(".html"))) {
  for (const m of readFileSync(join(dist, f), "utf8").matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g)) {
    if (!urls.has(m[1])) urls.set(m[1], new Set());
    urls.get(m[1]).add(f);
  }
}

async function probe(url) {
  const opts = { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "a11v-dev-link-check/0.1 (+https://a11v.dev/)" } };
  try {
    let r = await fetch(url, { ...opts, method: "HEAD" });
    if ([403, 405, 501].includes(r.status)) r = await fetch(url, { ...opts, method: "GET" });
    return { status: r.status };
  } catch (e) {
    return { error: String(e.cause?.code || e.name || e.message) };
  }
}

const list = [...urls.keys()];
const results = new Map();
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < list.length) {
    const u = list[next++];
    results.set(u, await probe(u));
  }
}));

const groups = { ok: [], uncertain: [], broken: [] };
for (const [u, r] of results) {
  if (r.error) groups.broken.push([u, r.error]);
  else if (r.status >= 200 && r.status < 400) groups.ok.push([u, r.status]);
  else if ([403, 405, 429].includes(r.status) || r.status >= 500) groups.uncertain.push([u, r.status]);  // 405: 窓口は存在するが、GET に対応しない (MCP の窓口は POST 専用)
  else groups.broken.push([u, r.status]);
}
console.log(`確認した外部リンク: ${list.length} 件。到達できた: ${groups.ok.length}、不確定 (403・429・5xx): ${groups.uncertain.length}、到達できない: ${groups.broken.length}`);
for (const [u, s] of groups.uncertain) console.log(`  不確定 ${s} ${u}  (${[...urls.get(u)].join(", ")})`);
for (const [u, s] of groups.broken) console.log(`  到達できない ${s} ${u}  (${[...urls.get(u)].join(", ")})`);
process.exitCode = groups.broken.length ? 1 : 0;
