// 公開用のビルド。検索エンジンへの登録を許す (noindex を付けず、robots.txt で許可する)。
// 環境変数に依存せず、どの OS でも同じ結果になるよう、indexable を直接指定する。
import { build } from "./build.mjs";

const r = build({ indexable: true });
console.log(`built ${r.files.length} files into ${r.outDir} (indexable: ${r.indexable})`);
