// 検査 (src/check.mjs) が、公開してはならない状態を検出できること。検出できなくなると、壊れたページが公開される。
// 加えて、実際のビルド結果が検査を通ること (非公開と公開の両方)。正常な書き方の網羅は目的にしない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { build } from "../src/build.mjs";
import { checkPage, checkSite } from "../src/check.mjs";

const ctx = {
  origin: "https://a11v.example",
  indexable: false,
  urlPaths: new Set(["/", "/plugin-a"]),
  ids: new Map([["/", new Set(["main", "f-agent-first"])], ["/plugin-a", new Set()]]),
};

const page = (body = "<p>ok</p>", head = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>t</title><meta name="description" content="d"><meta name="robots" content="noindex">
<meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="https://a11v.example/"><meta property="og:title" content="t">
<link rel="icon" href="data:image/svg+xml,x">${head}</head><body><main id="main">${body}</main></body></html>`;

const problems = (html, name = "index.html", c = ctx) => checkPage(name, html, c);

test("基準となるページは、問題なしと判定される", () => {
  assert.deepEqual(problems(page()), []);
});

// 検出できなければならない状態の表: [名前, ページ, 問題の文言の一部]
const bad = [
  ["本体が 10 KB 以上", page(`<p>${randomBytes(30000).toString("base64")}</p>`), "Brotli"],
  ["実行される script", page("<p>x</p><script>alert(1)</script>"), "実行される script"],
  ["外部の script", page('<script src="/a.js"></script>'), "実行される script"],
  ["Cloudflare の注入", page('<p>x</p><script src="/cdn-cgi/scripts/email-decode.min.js"></script>'), "/cdn-cgi/"],
  ["外部の stylesheet", page("<p>x</p>", '<link rel="stylesheet" href="/s.css">'), "外部のリソース"],
  ["外部の画像", page('<img src="/a.png" alt="">'), "外部のリソース"],
  ["href が #", page('<a href="#">x</a>'), "href が空または #"],
  ["href が空", page('<a href="">x</a>'), "href が空または #"],
  ["存在しないページへのリンク", page('<a href="/missing">x</a>'), "存在しないページ"],
  ["存在しない id へのリンク", page('<a href="/#nope">x</a>'), "存在しない id"],
  ["email_off の外のメールアドレス", page("<p>allegromoltov@a11v.example</p>"), "email_off"],
  ["SVG のパスデータが壊れている", page('<svg><path d="M58.5 0.3Q57.9 0.3 57.50Q57.1-0.4 57.2-1.1"/></svg>'), "SVG"],
  ["非公開なのに noindex がない", page().replace('<meta name="robots" content="noindex">', ""), "noindex"],
];
for (const [name, html, expected] of bad) {
  test(`検出する: ${name}`, () => {
    const found = problems(html);
    assert.ok(found.some((x) => x.includes(expected)), `想定の問題 (${expected}) が見つからない: ${JSON.stringify(found)}`);
  });
}

test("email_off で囲んだメールアドレスは、問題にしない", () => {
  assert.deepEqual(problems(page("<p><!--email_off-->allegromoltov@a11v.example<!--/email_off--></p>")), []);
});

test("実際のビルド結果が検査を通る (非公開と公開)", () => {
  for (const indexable of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), "a11v-site-"));
    try {
      build({ outDir: dir, indexable, contact: "contact@a11v.example" });
      const r = checkSite(dir);
      assert.deepEqual(r.problems, [], `indexable=${indexable}`);
      assert.equal(r.indexable, indexable);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
