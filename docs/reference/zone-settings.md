# Cloudflare のゾーン設定

a11v.dev が、実行される JavaScript 0 件、リクエスト 1 件、圧縮後の本体 10,240 B 未満、再訪問時の 304 という目標を満たすために必要な、Cloudflare のゾーン設定を定義します。ビルドと配備の手順は README にあります。配備後の確認手順は [配備後の確認](../how-to/verify-after-release.md) にあります。用語は [用語集](../glossary.md) にあります。

## 必要な設定

| 番号 | 場所 | 設定 | 値 | 設定が崩れたときの症状 |
| --- | --- | --- | --- | --- |
| 1 | Rules > Configuration Rules。条件は Hostname equals `a11v.dev` | Real User Monitoring | 無効 | 全ページの末尾に Web Analytics のビーコン (`beacon.min.js`) が注入される。実行される JavaScript が 1 件、リクエストが 2 件になる |
| 2 | 同上 | Email Obfuscation | オフ | Cloudflare の公式の資料が、弱い ETag が除かれる要因として挙げている機能。有効だと、圧縮と 304 の両立が崩れるおそれがある |
| 3 | 同上 | Rocket Loader | オフ | Cloudflare の公式の資料が、弱い ETag が除かれる要因として挙げている機能。有効だと、圧縮と 304 の両立が崩れるおそれがある |
| 4 | 同上 | Automatic HTTPS Rewrites | オフ | Cloudflare の公式の資料が、弱い ETag が除かれる要因として挙げている機能。有効だと、圧縮と 304 の両立が崩れるおそれがある |
| 5 | ゾーン全体。Security > Settings、または Scrape Shield | Replace insecure JavaScript libraries | オフ | Cloudflare の公式の資料が、弱い ETag が除かれる要因として挙げている機能。有効だと、圧縮と 304 の両立が崩れるおそれがある |
| 6 | ゾーン全体。SSL/TLS > Edge Certificates | Always Use HTTPS | オン | http の要求が https へ転送されず、http と https の 2 つの URL が同じ内容で応答する |

番号 2 から 5 は、HTML を書き換える機能です。a11v.dev の応答で、圧縮と 304 が両立した状態は、これら 4 つを無効にしたあとに得られました。4 つのうち、ETag を除いていた設定は、個別に切り分けていません。

ルール名は `a11v.dev: no HTML injection` を使います。Configuration Rule は、ホスト名が a11v.dev の応答にだけ作用します。

## 設定してはいけない項目

| 場所 | 設定 | 理由 |
| --- | --- | --- |
| Caching > Cache Rules | Respect Strong ETags | 強い ETag は保たれるが、Cloudflare が圧縮をやめる。`/` の転送量が 6,672 B から 20,703 B になる |
| 配信元の応答ヘッダー | `Cache-Control` の `no-transform` | Cloudflare が圧縮をやめる |

## 期待する応答

| 項目 | 値 |
| --- | --- |
| 圧縮 | `accept-encoding` に応じて br、gzip、zstd |
| ETag | 弱い ETag (`W/"…"`) |
| `Cache-Control` | `public, max-age=0, must-revalidate` |
| 条件付きリクエスト (`If-None-Match`) | 304、本体 0 B |
| `/robots.txt` | 公開用ビルドでは `Allow: /` と sitemap の場所 |

## www.a11v.dev の転送

`www.a11v.dev` は `a11v.dev` へ 301 で転送します。

| 項目 | 値 |
| --- | --- |
| DNS レコード | 種別 AAAA、名前 `www`、値 `100::`、Proxy status は Proxied |
| Redirect Rule の条件 | Hostname equals `www.a11v.dev` |
| Redirect Rule の転送先 | Dynamic、式 `concat("https://a11v.dev", http.request.uri.path)` |
| ステータスコード | 301 |
| クエリ文字列 | 保持する |

## 配信の設定

Worker のコードは持ちません。`site/wrangler.jsonc` が、Workers の静的アセットとカスタムドメインを定義します。

| 項目 | 値 |
| --- | --- |
| `assets.directory` | `./dist` |
| `assets.not_found_handling` | `404-page` |
| `workers_dev` | `false` |
| `preview_urls` | `false` |
| `routes` | `a11v.dev` をカスタムドメインとして指定 |

カスタムドメインを削除するときは、証明書が自動では消えないため、ダッシュボードで削除します。
