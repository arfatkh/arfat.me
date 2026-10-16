# arfat.me

Personal site of Muhammad Arfat. Live at [arfat.me](https://arfat.me).

A static multi-page site: every route is a real HTML document (good for search and
link previews), and [swup](https://swup.js.org) swaps `<main>` in place on click so
navigation feels instant. Without JavaScript it is still a plain, fully working site.

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/` | One HTML fragment per route |
| `src/routes.json` | Route list: path, title, description (single source for SEO + sitemap) |
| `src/layout.html`, `src/partials/` | Shared page shell: head, nav, footer |
| `assets/site.css` | Styles, inlined into every page at build time |
| `assets/site.js` | Router setup and small enhancements (TOC, lightbox, `g` + key shortcuts) |
| `assets/vendor/swup/` | Vendored swup bundles (versions in `VERSIONS.txt`, MIT) |
| `media/` | Fonts, images, PDFs |
| `og/` | Source for the `og.png` social card |
| `.well-known/security.txt` | Security contact (RFC 9116) |
| `build.mjs` | Zero-dependency build: stamps `src/` into `dist/` |
| `serve.mjs` | Local static server for `dist/` (real 404s, no SPA fallback) |
| `_headers` | Cloudflare Pages security and cache headers, copied into `dist/` |

## Develop

Node only, no `npm install` needed.

```bash
npm run build       # build dist/
npm test            # build + assertion tests over dist/
npm run serve       # serve dist/ at http://localhost:8787
```

Serve over HTTP rather than opening files directly, so routes like `/work/` resolve the
way they do in production, unknown paths get the styled `404.html`, and the headers from
`_headers` (including the Content-Security-Policy) are applied like on Cloudflare.

To change the social card, edit `og/og.html`, run `node og/render.mjs` (needs a local
Chrome; set `CHROME=...` to use another binary) and commit the new `og.png`.

## Deploy

Hosted on Cloudflare Pages as a Direct Upload project, so pushing to GitHub does not
deploy. Build, then upload `dist/`:

```bash
npm run build
npx wrangler pages deploy dist --project-name=arfat --branch=v2
```

`_headers` ships with the build and sets the security and cache headers. The build fills
the CSP's script hashes from the inline scripts it emits, so the policy never drifts from
the pages.

`.well-known/security.txt` expires one year after it was last updated; a test fails once
it has expired. Bump its `Expires` date (at most a year ahead) and redeploy.
