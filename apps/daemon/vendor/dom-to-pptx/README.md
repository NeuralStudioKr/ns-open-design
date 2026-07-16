# Vendored: dom-to-pptx (browser UMD bundle)

`dom-to-pptx.bundle.js.gz` is the checked-in compressed browser UMD build of
[`dom-to-pptx`](https://github.com/atharva9167j/dom-to-pptx) (MIT), pinned at
the version below. The daemon injects it into the existing Playwright Chromium
page for editable PPTX export, so Teamver Design can produce native PowerPoint
shapes/text without installing the package's Node/Puppeteer path.

- Version: 2.0.1
- Source file: `dist/dom-to-pptx.bundle.js` from the npm package
- Global: exposes `window.domToPptx.exportToPptx(elementOrSelector, options)`

## Why vendor the compressed browser bundle?

The npm package declares `puppeteer` and `@puppeteer/browsers` for its Node/CLI
entry. We do not use that path. The hosted daemon already ships Playwright
Chromium for PDF/image export, so this bundle is injected into that page and
does not add another browser download or runtime.

## Updating

Re-copy `dist/dom-to-pptx.bundle.js` from the target npm version, regenerate
`dom-to-pptx.bundle.js.gz` with `gzip -n -c`, and bump the version above. Do not
edit the bundle by hand.
