// a11v.dev の静的サイトを生成する。依存は Node の標準機能だけ。入力は data/site.json と assets/、src/style.css。出力は dist/。
// 窓口のメールアドレスは、収集を避けるためリポジトリに置かない。環境変数 A11V_CONTACT か、git 管理外の data/contact.local.txt から読む。
// SITE_INDEXABLE=1 のときだけ、検索エンジンへの登録を許す (noindex を付けず、robots.txt で許可する)。既定は非公開 (noindex)。
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

const contactFile = join(root, "data/contact.local.txt");
function readContact() {
  const v = process.env.A11V_CONTACT || (existsSync(contactFile) ? readFileSync(contactFile, "utf8") : "");
  if (!v.trim()) throw new Error("窓口のメールアドレスがない。環境変数 A11V_CONTACT か site/data/contact.local.txt に書く");
  return v.trim();
}

export function build({ outDir = join(root, "dist"), indexable = process.env.SITE_INDEXABLE === "1", contact = readContact() } = {}) {
  const data = { ...JSON.parse(readFileSync(join(root, "data/site.json"), "utf8")), contact };
  const { origin } = data;
  const items = data.items;
  const rows = [
    ...items.map((x) => ({ name: x.name, group: x.group, questions: x.questions, what: x.summary, status: "", href: `/${x.slug}` })),
    ...data.listOnly.map((x) => ({ name: x.name, group: x.group, questions: x.questions, what: x.what, status: x.status, href: x.url })),
  ];

  // ロゴ (インライン。文字色に追従し、11 の上のスラーだけ第 2 のテーマ色) とファビコン (data URI)
  const logoSrc = readFileSync(join(root, "assets/logo.svg"), "utf8").trim();
  const vb = logoSrc.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  const logoH = 34;
  const logoW = Math.round((Number(vb[1]) * logoH) / Number(vb[2]));
  const logo = logoSrc.replace(' role="img" aria-label="a11v"', ' aria-hidden="true"').replace("<svg ", `<svg class="lg" width="${logoW}" height="${logoH}" `);
  const favUri = "data:image/svg+xml," + encodeURIComponent(readFileSync(join(root, "assets/favicon.svg"), "utf8").trim());

  // CSS (問いによる絞り込みは、問いの一覧から生成する)
  const filters = data.questions
    .map(({ id }) => `body:has(#f-${id}:target) tr[data-q]:not([data-q~=${id}]){display:none}body:has(#f-${id}:target) tbody:not(:has(tr[data-q~=${id}])){display:none}body:has(#f-${id}:target) nav a[href="#f-${id}"]{background:var(--fg);color:var(--bg);text-decoration:none}`)
    .join("");
  const css = readFileSync(join(root, "src/style.css"), "utf8").trim().replace("/*FILTERS*/", filters).replace("__COUNT__", String(rows.length));

  const page = ({ title, description, canonical, body, anchors = "", ld, noindex }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${escAttr(description)}">${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
${canonical ? `<link rel="canonical" href="${canonical}">\n<meta property="og:url" content="${canonical}">\n` : ""}<meta property="og:site_name" content="${data.name}"><meta property="og:title" content="${escAttr(title)}"><meta property="og:description" content="${escAttr(description)}"><meta property="og:type" content="website">
<link rel="icon" href="${favUri}">
<style>${css}</style>${ld ? `<script type="application/ld+json">${jsonLd(ld)}</script>` : ""}</head><body><a class="sk" href="#main">Skip to content</a>${anchors}
<main id="main">
${body}
</main>
<footer>&copy; 2026 ${data.footer.owner}. ${data.footer.links.map((l) => `<a href="${l.url}"${l.lang ? ` hreflang="${l.lang}"` : ""}>${esc(l.label)}</a>`).join(" ")}</footer></body></html>`;

  const head = `<h1 translate="no"><a href="/">${logo}<span class="nm">${data.name}</span></a></h1>`;
  const tagLinks = (qs, prefix) => qs.map((k) => `<a href="${prefix}#f-${k}">${k}</a>`).join(" ");

  const indexBody = `${head}
<p>${esc(data.tagline)}</p>
<p class="m">${esc(data.intro)}</p>
<h2>Work</h2>
<nav aria-label="Filter by question"><a href="#f-all">all</a> ${data.questions.map((q) => `<a href="#f-${q.id}">${q.id}</a>`).join(" ")}</nav>
<table><thead><tr><th scope="col">Name</th><th scope="col">Questions</th><th scope="col">What</th></tr></thead>
${data.groups.filter((g) => rows.some((r) => r.group === g.id)).map((g) => `<tbody><tr class="g"><th colspan="3" scope="colgroup">${esc(g.title)}<span class="m">${esc(g.note)}</span></th></tr>
${rows.filter((r) => r.group === g.id).map((r) => `<tr data-q="${r.questions.join(" ")}"><td data-l="Name">${r.href ? `<a href="${r.href}"><b translate="no">${esc(r.name)}</b></a>` : `<b translate="no">${esc(r.name)}</b>`}</td><td data-l="Questions">${tagLinks(r.questions, "")}</td><td data-l="What">${esc(r.what)}${r.status ? ` <span class="m">${esc(r.status)}</span>` : ""}</td></tr>`).join("\n")}
</tbody>`).join("\n")}
<tfoot><tr><td class="cnt" colspan="3"></td></tr></tfoot></table>
<h2>Questions</h2>
<dl>${data.questions.map((q) => `<dt id="q-${q.id}">${esc(q.title)}</dt><dd>${esc(q.question)} ${esc(q.state)} <a href="#f-${q.id}">Related work</a></dd>`).join("")}</dl>
<h2>Support</h2><p>${esc(data.support.before)}<a href="${data.support.href}">${esc(data.support.linkText)}</a>${esc(data.support.after)}</p>
<h2>Contact</h2><p><!--email_off-->${data.contact}<!--/email_off--></p>`;

  const detailBody = (x) => `<p><a href="/">All work</a></p>
${head}
<h2 translate="no">${esc(x.name)}</h2>
<dl class="k">
<dt>What</dt><dd>${esc(x.what)}</dd>
${x.why ? `<dt>Why</dt><dd>${esc(x.why)}</dd>` : ""}
<dt>For whom</dt><dd>${esc(x.forWhom)}</dd>
<dt>Questions</dt><dd>${tagLinks(x.questions, "/")}</dd>
<dt>Learned</dt><dd><ul>${x.learned.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></dd>
<dt>Status</dt><dd>${esc(x.state)}. Updated ${x.updated} (latest release ${esc(x.release.split(" ")[0])}).${x.note ? " " + esc(x.note) : ""}</dd>
<dt>Links</dt><dd>${x.links.map((l) => `<a href="${l.url}">${esc(l.label)}</a>`).join(" ")}</dd>
</dl>
${x.articles.length ? `<h2>Articles</h2><ul>${x.articles.map((a) => `<li><a href="${a.url}"${a.lang === "ja" ? ' lang="ja"' : ""} hreflang="${a.lang}">${esc(a.title)}</a> <span class="m">${a.lang === "ja" ? `Japanese, ${a.where}, ${a.date}. ${esc(a.desc)}` : `${a.where}, ${a.date}`}</span></li>`).join("")}</ul>` : ""}`;

  const anchors = `\n${data.questions.map((q) => `<span class="x" id="f-${q.id}"></span>`).join("")}<span class="x" id="f-all"></span>`;
  const files = new Map();
  files.set("index.html", page({
    title: data.name, description: `${data.tagline} ${data.intro}`, canonical: `${origin}/`, body: indexBody, anchors, noindex: !indexable,
    ld: { "@context": "https://schema.org", "@type": "Organization", name: data.name, url: `${origin}/`, description: data.intro, sameAs: data.footer.links.map((l) => l.url) },
  }));
  for (const x of items) {
    const source = x.links.find((l) => l.label === "Source");
    files.set(`${x.slug}.html`, page({
      title: `${x.name} - ${data.name}`, description: x.summary, canonical: `${origin}/${x.slug}`, body: detailBody(x), noindex: !indexable,
      ld: { "@context": "https://schema.org", "@type": "SoftwareApplication", name: x.name, description: x.summary, url: `${origin}/${x.slug}`, ...(source ? { sameAs: [source.url] } : {}) },
    }));
  }
  // 存在しない URL の応答。検索エンジンには常に登録させない。
  files.set("404.html", page({ title: `Page not found - ${data.name}`, description: "Page not found.", body: `${head}\n<p>Page not found.</p>\n<p><a href="/">All work</a></p>`, noindex: true }));

  const urls = ["/", ...items.map((x) => `/${x.slug}`)];
  files.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${origin}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  files.set("robots.txt", indexable ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` : `User-agent: *\nDisallow: /\n`);
  files.set("llms.txt", `# ${data.name}\n\n> ${data.intro}\n\n${data.tagline}\n\n## Questions\n\n${data.questions.map((q) => `- ${q.title}: ${q.question}`).join("\n")}\n\n## Work\n\n${[
    ...items.map((x) => `- [${x.name}](${origin}/${x.slug}): ${x.summary}`),
    ...data.listOnly.map((x) => `- [${x.name}](${x.url}): ${x.what}${x.status ? " " + x.status : ""}`),
  ].join("\n")}\n`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of files) writeFileSync(join(outDir, name), content);
  return { outDir, files: [...files.keys()], indexable };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = build();
  console.log(`built ${r.files.length} files into ${r.outDir} (indexable: ${r.indexable})`);
}
