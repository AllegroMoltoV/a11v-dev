# 配備後の確認

配備したサイトが、実行される JavaScript 0 件、圧縮、弱い ETag、304 という目標を満たしていることを、実環境の応答で確認します。ゾーン設定が変わると目標が崩れるため、配備のたびと、Cloudflare の設定を変更したあとに実施します。設定の定義は [ゾーン設定](../reference/zone-settings.md) にあります。

## 前提

* Node.js 22 以上
* Lighthouse の測定には、インストール済みの Chrome が必要
* 転送量を測るため、Node の `https` モジュールを使う。`fetch` は応答を自動で展開するため、圧縮後のバイト数を測れない

## 応答を確認する

ブラウザーの開発者ツールではなく、Node で応答を取得します。ブラウザーの拡張機能やキャッシュの影響を除くためです。

1. 次のスクリプトを、`verify.mjs` として保存します。リポジトリには含めません。

```js
// 使い方: node verify.mjs https://a11v.dev
import { request } from "node:https";
import { brotliDecompressSync } from "node:zlib";

const origin = new URL(process.argv[2] ?? "https://a11v.dev");
const get = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    request({ host: origin.host, path, headers: { "accept-encoding": "br", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks) }));
    })
      .on("error", reject)
      .end();
  });

const decode = (r) => (r.headers["content-encoding"] === "br" ? brotliDecompressSync(r.raw) : r.raw).toString();

const sitemap = decode(await get("/sitemap.xml"));
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

for (const path of urls) {
  const r = await get(path);
  const html = decode(r);
  const scripts = (html.match(/<script\b(?![^>]*application\/ld\+json)/g) ?? []).length;
  const etag = r.headers.etag ?? "";
  const cond = await get(path, { "if-none-match": etag });
  console.log(path, JSON.stringify({
    status: r.status,
    encoding: r.headers["content-encoding"] ?? null,
    bytes: r.raw.length,
    scripts,
    cdnCgi: html.includes("/cdn-cgi/"),
    weakEtag: etag.startsWith("W/"),
    revisit: cond.status,
    revisitBytes: cond.raw.length,
  }));
}
```

2. 次のコマンドを実行します。

```bash
node verify.mjs https://a11v.dev
```

3. 各ページの出力を、次の基準と照合します。

| 項目 | 期待する値 |
| --- | --- |
| `status` | 200 |
| `encoding` | `br` |
| `bytes` | 10,240 未満 |
| `scripts` | 0 |
| `cdnCgi` | `false` |
| `weakEtag` | `true` |
| `revisit` | 304 |
| `revisitBytes` | 0 |

## 結果が基準を満たさないとき

| 症状 | 確認する設定 |
| --- | --- |
| `scripts` が 1、`cdnCgi` が `true` | Configuration Rule の Real User Monitoring が無効であること |
| `encoding` が `null`、`bytes` が約 3 倍 | Cache Rules の Respect Strong ETags を有効にしていないこと。配信元の `Cache-Control` に `no-transform` がないこと |
| `weakEtag` が `false`、`revisit` が 304 でない | Configuration Rule の Email Obfuscation、Rocket Loader、Automatic HTTPS Rewrites がオフであること。ゾーンの Replace insecure JavaScript libraries がオフであること |

## Lighthouse で確認する

ブラウザーでの表示の指標は、Lighthouse で測ります。

1. 次のコマンドを実行します。`<URL>` には、測定するページの URL を指定します。

```bash
npx lighthouse@12.8.2 <URL> --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./lighthouse.json --quiet
```

2. 同じ URL で 3 回測定し、中央値を採用します。デスクトップの指標は、`--preset=desktop` を付けて測定します。

3. 次の基準と照合します。

| 項目 | 基準 |
| --- | --- |
| 性能、アクセシビリティ、ベストプラクティス、SEO | 100 |
| CLS | 0 |
| リクエスト数 | 1 |

TBT は、モバイルで 0 ms から 32 ms になるページがあります。[既知の制約](../reference/known-constraints.md) を参照してください。
