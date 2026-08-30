# Tutor Session Trace — visual thesis

## Direction: a working botanical field guide

A coding lesson is closer to field observation than classroom administration: a tutor notices an attempt, labels what happened, and leaves the next specimen to examine. The interface borrows the calm utility of a naturalist's pocket notebook—cream paper, ink rules, small taxonomy labels, clipped specimens—without imitating an antique or turning the task into decoration. Timeline entries are “observations”; outcomes read as field marks; the recap is a clean specimen sheet a student can actually use.

The product is deliberately single-mode, with an explicitly painted warm paper background. A dark treatment would weaken the paper-and-ink metaphor and add visual variability to shared recaps; contrast is verified in this treatment.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#F4F0E5` | page background |
| Leaf paper | `#E8E8D5` | quiet panels |
| Linen | `#FFFCF4` | writing surfaces |
| Ink | `#18251F` | primary text |
| Moss | `#315A43` | primary action, focus |
| Fern | `#477A58` | supporting accents |
| Clay | `#A54E32` | attempt / warning |
| Gold | `#8A6419` | partial outcome |
| Berry | `#9A3843` | error / destructive |
| Slate | `#53615A` | secondary text |

Ink on paper is 13.1:1; slate on paper is 5.7:1; linen on moss is 7.3:1. Color is always paired with a word, icon, border treatment, or shape.

## Type and spacing

- Display and editorial labels: Georgia, Cambria, `Times New Roman`, serif. Its broad, human forms evoke marginal notes without adding a font download.
- Interface and code: system UI stack; code uses ui-monospace. No network fonts or font files.
- Scale: 14 / 16 / 19 / 24 / 34 / 48 px. Body never drops below 16 px; small 14 px is metadata only.
- Spacing follows a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64. Reading measure caps at 72 characters.

## Layout and interaction grammar

The desktop workspace is a split field notebook: a narrow session index and a wide observation page. On phones, the index becomes a top “Sessions” drawer and the capture bar stacks before the timeline. A fine left stem connects timestamped observations, with shape-coded outcome markers. Controls resemble stamped field labels: squared corners with a slight 2 px radius, ink borders, and restrained shadow. Primary actions are filled moss; secondary actions remain paper.

Each mutation confirms itself in a polite live region. New observations appear at their timeline origin; delete is confirmed with the exact item name. Every target is at least 44 px. The capture form is reachable in document order and `Ctrl/Cmd + Enter` records an observation when focus is within it. Invalid attachment input stays in place, moves focus to the field, and exposes a linked live error.

## Motion

Only causal motion is used: an inserted observation rises 6 px and fades in over 180 ms; drawers move from their attached edge over 220 ms; save confirmation gently fades. Nothing loops. Under `prefers-reduced-motion: reduce`, transforms and transitions are removed and state changes are instantaneous.

## Original asset plan and provenance

The landing/empty-state illustration is an original AI-generated overhead botanical study sheet: fern sprigs frame a tutor's observation notebook, with tiny abstract code-like marks (never legible text), one copper pencil, pressed leaves, warm window light, matte paper texture, and no people. It explains the product's “observe, label, continue” model rather than advertising an unsupported feature.

Prompt sheet: “Overhead editorial still life, botanical field research desk adapted for a coding tutor, open cream field notebook with blank timeline rules and tiny abstract non-readable code marks, pressed fern specimens and seed pods, one dark green fountain pen and copper pencil, subtle graph-paper scraps, warm north-window light, tactile matte paper, restrained forest green, parchment, clay and brass palette, generous negative space, refined natural-history museum catalog photography, 50mm lens, realistic but slightly illustrative. No people, no hands, no readable text, no letters, no logos, no brands, no screens, no watermark, no neon, no gradients, no fantasy plants.”

Generated with the factory image deployment through `/opt/fleet/lib/gen-image.sh` on 2026-08-27. The selected source and its prompt sidecar are kept in `assets/src/`; WebP derivatives are produced for the app. The generated work is original to this product. UI icons are original inline SVG strokes authored for Tutor Session Trace.

The PWA and Apple touch icons are raster exports of the original hand-authored
fern-stem favicon in `frontend/public/favicon.svg`. The social preview is a
1200 × 630 crop of the generated field-notebook source. These derivatives
were produced locally on 2026-08-30 and add no third-party assets.

The demo follows the same notebook grammar but uses its own olive banner to
make the storage boundary persistent and unmistakable. Its realistic sample
is stored under a separate `demo:` namespace.

## Accessibility and content policy

The illustration has descriptive alt text when it carries the empty-state concept and is absent from the working session view. Focus uses a 3 px moss outline plus paper offset. Each route has one job-focused `<h1>`; workspace section labels begin at `<h2>`. Student recaps use plain language and never expose tutor-only notes. Print media removes the entire tutor-only moment rather than hiding only its label. Consent is unchecked by default and sharing is unavailable until the tutor records it.
