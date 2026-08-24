---
name: html-ppt-zhangzara-broadside
description: |
  Broadside — Dark editorial canvas with a single fire orange accent and bilingual Latin/Chinese type stack. Anything that should land like a broadside newspaper headline: brand manifestos, magazine and cultural pitches, design talks, bilingual EN/CN decks, founder vision statements.
triggers:
  - "broadside"
  - "zhangzara-broadside"
  - "editorial"
  - "dramatic"
  - "graphic"
  - "punchy"
  - "brand manifesto"
  - "founder vision deck"
  - "html deck"
  - "html slides"
  - "zhangzara"
od:
  mode: deck
  scenario: marketing
  upstream: "https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/broadside"
  upstream_license: MIT
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: false
  animations: false
---

# Broadside

> Dark editorial canvas with a single fire orange accent and bilingual Latin/Chinese type stack.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

## At a glance

- **Scheme:** dark
- **Formality:** medium-high
- **Density:** medium
- **Slides in demo:** 16

## Best for

Anything that should land like a broadside newspaper headline: brand manifestos, magazine and cultural pitches, design talks, bilingual EN/CN decks, founder vision statements. Also a striking pick for tech, research, or business decks that want a dramatic single-accent editorial feel.

## Avoid for

Decks that need to feel quiet, warm, or institutionally traditional — the dark canvas with fire-orange accent commits to drama.

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
<artifact identifier="zhangzara-broadside" type="text/html" title="Deck Title">
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
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/broadside).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](./LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.
