---
name: html-ppt-zhangzara-8-bit-orbit
description: |
  8-Bit Orbit — Pixel-art neon arcade aesthetic on a deep navy void. Anything that should feel like a CRT screen at 2am: cyberpunk, gaming, web3, indie dev tools, hackathon demos.
triggers:
  - "8-bit-orbit"
  - "zhangzara-8-bit-orbit"
  - "8-Bit Orbit"
  - "retro-tech"
  - "playful"
  - "geeky"
  - "neon"
  - "gaming pitch"
  - "hackathon demo"
  - "html deck"
  - "html slides"
  - "zhangzara"
od:
  mode: deck
  scenario: marketing
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/8-bit-orbit"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
---

# 8-Bit Orbit

> Pixel-art neon arcade aesthetic on a deep navy void.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** low
- **Density:** medium
- **Slides in demo:** 10

## Best for

Anything that should feel like a CRT screen at 2am: cyberpunk, gaming, web3, indie dev tools, hackathon demos. Just as good for a tech talk that wants to lean into nostalgic-digital craft, a synthwave brand deck, or a creative review that wants to feel like a console.

## Avoid for

Contexts where the dark neon palette would actively work against the message — quiet institutional finance disclosures, healthcare patient-facing materials, traditional luxury.

## Workflow

> **Teamver / API mode:** there is no filesystem clone step. Reproduce this
> template with compact inline HTML (and one short body `<style>` / font
> `@import` if needed). Match the `:root` tokens / visual identity from
> `example.html` (palette, fonts, borders, motif density). Emit
> `<artifact type="deck" identifier="deck">` — never `type="text/html"`.
> Do **not** fall back to a sparse Neutral Modern / slate `#0f172a` cover.

1. **Clone `example.html`** into the user's workspace as the working file
   (daemon / local skill runs with tools). In Teamver API mode, skip clone —
   bind the visual kit tokens instead.
2. **Replace placeholder content** with the user's real headlines, body copy,
   numbers, names, dates, and section labels. Match existing dimensions when
   swapping image placeholders.
3. **Preserve the design system.** Never substitute fonts, recolor the palette,
   restructure the layout grid, or strip decorative elements (corner brackets,
   paper grain, geometric shapes, illustrated SVGs). They are part of the
   identity.
4. **Adjust deck length by duplicating layouts.** If the user has more content
   than the demo holds, duplicate an existing slide of the most appropriate
   layout. If less, drop slides from the bottom. Update page-number labels.
5. **Designing missing layouts:** if a slide needs a layout the template
   doesn't have, design it from scratch using the same fonts, palette,
   decorative vocabulary, spacing rhythm, and component grammar — never bail
   to a different template.
6. **Keep the navigation runtime as shipped.** If the deck ships an
   `assets/deck-stage.js` or inline keyboard handler, leave it intact.

## Output contract

Emit between `<artifact>` tags:

```
<!-- Daemon / local skill runs may use type="text/html". -->
<artifact identifier="zhangzara-8-bit-orbit" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

Teamver slide-only API runs must use:

```
<artifact type="deck" identifier="deck">
<!doctype html>
<html lang="ko"><body>…filled slides matching this template's visual kit…</body></html>
</artifact>
```


## Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/8-bit-orbit).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
