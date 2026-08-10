---
name: html-ppt-zhangzara-pink-script
description: |
  Pink Script — After Hours — Black canvas, hot pink accent, pearl-cream paper, Instrument Serif headlines: late-night editorial luxury. Anything that should feel nocturnal, intentional, and a little luxe: fashion brand decks, creator personal brands, after-hours / nightlife / spirits launches, luxury product reveals, editorial features.
triggers:
  - "pink-script"
  - "zhangzara-pink-script"
  - "Pink Script — After Hours"
  - "nocturnal"
  - "moody"
  - "literary"
  - "sultry"
  - "fashion brand deck"
  - "creator personal brand"
  - "html deck"
  - "html slides"
  - "zhangzara"
od:
  mode: deck
  scenario: marketing
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pink-script"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
---

# Pink Script — After Hours

> Black canvas, hot pink accent, pearl-cream paper, Instrument Serif headlines: late-night editorial luxury.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** medium-high
- **Density:** low
- **Slides in demo:** 9

## Best for

Anything that should feel nocturnal, intentional, and a little luxe: fashion brand decks, creator personal brands, after-hours / nightlife / spirits launches, luxury product reveals, editorial features. Also a striking unexpected pick for a tech keynote, research synthesis, or business pitch that wants to land with magnetic confidence.

## Avoid for

Daytime corporate-professional and traditional B2B contexts where the dark canvas with hot-pink accent reads as too styled or too expressive.

## Workflow

> **Teamver / API mode:** there is no filesystem clone step. Reproduce this
> template with compact inline HTML (and one short body `<style>` / font
> `@import` if needed). Match the `:root` tokens / visual identity from
> `example.html` (palette, fonts, borders, motif density). Emit
> `<artifact type="deck" identifier="deck">` — never `type="text/html"`.
> Do **not** fall back to a sparse Neutral Modern / slate `#0f172a` cover.

1. **Clone `example.html` AND the `assets/` folder** into the user's workspace.
   This template ships an `assets/deck-stage.js` runtime (keyboard navigation,
   stage rendering); the HTML references it as `assets/deck-stage.js`, so the
   file must sit next to the cloned HTML or that path will 404 in the generated
   artifact and navigation will silently break. Inlining the JS into a single
   `<script>` block in the HTML is an acceptable alternative when a single
   self-contained file is preferred.
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
<artifact identifier="zhangzara-pink-script" type="text/html" title="Deck Title">
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
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/pink-script).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
