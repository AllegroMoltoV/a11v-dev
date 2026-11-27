# a11v lab (a11v.dev)

## 目的

a11v lab の Web サイト (https://a11v.dev) のソースです。a11v lab は、AllegroMoltoV が運営する、ソフトウェアの個人の研究開発ブランドです。ソフトウェアに関する問いを立て、実際に作って探求し、成果と知見を公開します。

## 背景

サイト自体を、開発思想の実践例にします。次の目標を、検査で守ります。

* 実行される JavaScript は 0 件
* リクエストは 1 件で、CSS・ロゴ・ファビコンは HTML に埋め込む
* 圧縮後の本体は、1 ページあたり 10 KB 未満
* 再訪問は、本体を再転送しない

## 内容物

| パス | 内容 |
| --- | --- |
| `site/` | サイトのソースと、生成・検査の仕組み |
| `site/data/site.json` | 掲載する内容。問い、成果、記事、リンク |
| `site/assets/` | ロゴとファビコン |
| `site/src/build.mjs` | `site/dist/` に、HTML・sitemap.xml・robots.txt・llms.txt・404.html を生成する |
| `site/src/check.mjs` | 生成物の検査。サイズ、script、外部リソース、リンク、メタ情報、noindex、メールアドレスの書き方を確かめる |
| `site/src/check-links.mjs` | 外部リンクの実在の確認。ネットワークに依存するため、検査とは分けている |
| `site/test/` | 検査が、公開してはならない状態を検出できることのテスト |
| `site/wrangler.jsonc` | Cloudflare Workers の静的アセットによる配信の設定 |

## 使い方

Node.js 22 以上が必要です。

```bash
cd site
npm install
echo "contact@example.com" > data/contact.local.txt   # 窓口のアドレス。git 管理外。環境変数 A11V_CONTACT でも指定できる
npm run build        # dist/ に生成する。既定は非公開 (noindex)
npm run check        # 生成物を検査する
npm test             # 検査のテストを実行する
npm run check:links  # 外部リンクの実在を確認する
npm run dev          # ローカルで配信する
```

`npm run build` は、全ページに noindex を付け、robots.txt で全体を拒否する、非公開の状態で生成します。検索エンジンへの登録を許す公開の状態は、`npm run build:release` で生成します。`npm run release` は、公開用のビルド、検査、配備を、この順に実行します。検査が失敗すると、配備しません。

窓口のメールアドレスは、収集を避けるためリポジトリに置きません。`site/data/contact.local.txt` か環境変数 `A11V_CONTACT` に指定します。指定がないとビルドは失敗します。

配備は `npm run release` で行います。Cloudflare アカウントへの `wrangler login` が必要です。ゾーンの設定 (Web Analytics の自動挿入の無効化など) に依存するため、設定を誤ると上の目標を満たせません。

## ライセンス

コードは MIT です (`LICENSE`)。`site/data/site.json` の本文と、`site/assets/` のロゴ・ファビコンは、権利を留保します。詳細と第三者の出典は `NOTICE` にあります。

## 更新情報

### v0.1.1

* 窓口のメールアドレスを、リポジトリの外から読むようにした
* LICENSE・NOTICE・Dependabot・CI を追加した

### v0.1.0

* サイトのソースを整備した。モックから、生成処理・検査・テストを分離した
* https://a11v.dev に配備した。www.a11v.dev は a11v.dev へ 301 で転送する
