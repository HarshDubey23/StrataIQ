---
name: StrataIQ
description: A fire atlas redrawn for one address, so a founder can test a location before signing the lease.
colors:
  atlas: "#1d4f91"
  atlas-deep: "#163e75"
  atlas-park: "#2a5c9e"
  brick: "#e98f86"
  you: "#f2c94c"
  you-deep: "#e3b52f"
  stone: "#a9c4e4"
  moss: "#9fcba8"
  ok: "#1e7a46"
  danger: "#b3261e"
  night: "#0f1f3d"
  paper: "#f7f8fa"
  ink-900: "#ffffff"
  ink-950: "#eef2f6"
  ink-800: "#e4e9f0"
  ink-600: "#b9c4d2"
  ink-500: "#68758a"
  ink-400: "#53617a"
  ink-300: "#38465f"
  observed: "#a23e30"
  userdata: "#7a5c00"
  field: "#2f7a43"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Public Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(3rem, 1.5rem + 6vw, 7rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Barlow Semi Condensed, Public Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.5rem, 1.6rem + 2.8vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Barlow Semi Condensed, Public Sans, ui-sans-serif, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.012em"
  figure:
    fontFamily: "Barlow Semi Condensed, Public Sans, ui-sans-serif, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  evidence:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
rounded:
  xs: "0px"
  md: "2px"
spacing:
  control-gap: "8px"
  sheet: "12px"
  sheet-roomy: "16px"
  gutter-sm: "20px"
  gutter-md: "40px"
  gutter-lg: "56px"
  section: "96px"
components:
  button-next:
    backgroundColor: "{colors.you}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
    typography: "{typography.label}"
    padding: "0 18px"
    height: "40px"
  button-next-hover:
    backgroundColor: "{colors.you-deep}"
  button-primary:
    backgroundColor: "{colors.atlas}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.xs}"
    padding: "0 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.atlas-deep}"
  button-secondary:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
    padding: "0 18px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-800}"
  input:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
    padding: "0 12px"
    height: "40px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
    padding: "{spacing.sheet}"
  card:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
  strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    rounded: "{rounded.xs}"
    typography: "{typography.display}"
  evidence-measured:
    backgroundColor: "{colors.brick}"
    textColor: "{colors.night}"
    typography: "{typography.evidence}"
    padding: "1px 6px"
  evidence-yours:
    backgroundColor: "{colors.you}"
    textColor: "{colors.night}"
    typography: "{typography.evidence}"
    padding: "1px 6px"
  evidence-estimated:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.night}"
    typography: "{typography.evidence}"
    padding: "1px 6px"
  verdict-ok:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ink-900}"
    padding: "24px"
  verdict-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink-900}"
    padding: "24px"
  verdict-neutral:
    backgroundColor: "{colors.night}"
    textColor: "{colors.ink-900}"
    padding: "24px"
---

# Design System: StrataIQ

## Overview

**Creative North Star: "The Fire Atlas"**

American fire insurance atlases mapped every block to answer one question: is this building a good risk? StrataIQ prints that same sheet for one address. The ground is deep atlas blue, content sits on cool white map sheets, and everything is a flat fill with a thin ink outline, as if printed rather than rendered.

Color is a legend here, not decoration. A founder with no data background can read where any number came from by its color, and a printed key says so on the map. The real city is the hero: real buildings and streets in atlas colors, with the words printed straight onto it as label strips.

Public pages move a lot and tie that motion to the scroll, on one uninterrupted camera shot. Signed-in screens are denser and calmer, with the same materials on a cooler page. The system rejects the SaaS hero with a floating dashboard, and dark dashboards with glowing charts.

**Key Characteristics:**
- Atlas blue ground, cool white map sheets, flat fills, 1px ink outlines, square corners.
- A fixed color key for evidence: pink measured, yellow yours, stone estimated.
- Verdict colors kept apart from the key: green, red and ink.
- Exactly one yellow next step on a screen.
- Headlines printed as strips on the live map.
- One continuous camera shot under the landing story.

## Colors

A saturated blue field and white paper carry the page, and four flat key colors carry meaning.

### Primary
- **Atlas Blue** (#1d4f91): The committed ground. The landing map field, app sidebar and mobile bar, dialog headers and scrims, full-width public sections, and the default action button.
- **Atlas Deep** (#163e75): Water on the map, and hover on anything atlas blue.
- **Atlas Park** (#2a5c9e): Parks and woods on the map only.

### Secondary
- **Brick Pink** (#e98f86): Measured. Rivals, Census columns, any number from a real source.
- **Frame Yellow** (#f2c94c): Yours. Your site, your entries, your next step. Hover deepens it to Frame Yellow Deep (#e3b52f).
- **Pale Stone** (#a9c4e4): Estimated. Anything from the model that a real quote should replace.
- **Street Moss** (#9fcba8): Checked on the street. The fourth evidence kind, for facts a field researcher collected. It is not the verdict green.

### Tertiary
- **Verdict Green** (#1e7a46): A verdict that can work, and positive deltas.
- **Verdict Red** (#b3261e): A verdict that loses money, negative deltas, errors and destructive actions.

### Neutral
- **Ink** (#0f1f3d): Every outline, primary text, tooltips, and the verdict band when there is no call to make. The project's `ink-` ramp runs inverted, so `ink-950` is the lightest.
- **Map Sheet** (#f7f8fa): The one container, and the fill of extruded buildings on the map.
- **White** (#ffffff): Cards, inputs and streets on the map.
- **Cool Page** (#eef2f6): The signed-in page behind sheets and cards, and the selected tab.
- **Pressed Grey** (#e4e9f0): Hover on white, skeletons.
- **Hairline** (#b9c4d2): Rules and card borders inside a sheet.
- **Slate Text** (#38465f secondary, #53617a tertiary, #68758a placeholder): Supporting text, stepping down in emphasis.
- **Evidence Text** (#a23e30 measured, #7a5c00 yours, #2f7a43 street-checked): Darker text companions, for when the key color itself would fail contrast as type.

### Named Rules
**The Atlas Key Rule.** Pink means measured, yellow means yours, stone means estimated, and these never carry other meanings. If a color is not saying where a number came from, it is the wrong color. The logo and drawn atlas plates may use all three, because they are drawings of the key.

**The One Yellow Step Rule.** A screen has exactly one yellow next step. Everything else clickable is atlas, white or a plain link. If a whole closing band is yellow, that band is the step and its button goes ink.

**The Separate Verdict Rule.** A verdict speaks only in green (#1e7a46), red (#b3261e) or ink (#0f1f3d). Verdict color never borrows from the key, and the key never signals good or bad.

## Typography

**Display Font:** Barlow Semi Condensed (with Public Sans, then a system sans)
**Body Font:** Public Sans (with a system sans)

**Character:** A compact, sign-painted condensed sans over a plain American civic sans. Together they read like map lettering above a clerk's notes: official, legible, and unfussy.

### Hierarchy
- **Display** (600, clamp(3rem, 1.5rem + 6vw, 7rem), 1.12): Story headlines printed on the map.
- **Headline** (600, clamp(2.5rem, 1.6rem + 2.8vw, 4.25rem), 1.02): Section headlines on public pages.
- **Title** (600, 17px to 24px): Card headers and panel titles.
- **Figure** (600, 28px, 1, tabular): Metric values. Every figure uses tabular numerals.
- **Body** (400, 16px to 18px, 1.5): Public reading text, capped at 40 to 62ch. App text runs 13px to 14px.
- **Label** (600, 13px): Field labels. Buttons and tabs use the same size range at 500 to 600.
- **Evidence** (500, 11px): The evidence chip on a number.

### Named Rules
**The Printed Strip Rule.** Headlines on the live map are printed strips: each line its own map-sheet band with an ink outline, stacked 1px over the last, sized to its text. The city stays visible between the words and every word stays readable. Never put display type on the moving map without its strip.

## Layout

The landing is a fixed full-bleed map with five story scenes pinned above it, scrolled by empty spacer sections. The first scene is one viewport tall and the rest are 135svh. Strips start upper left from 768px and dock to the bottom edge on phones, and the map pads 42% on the left from 1024px so the site stays in the open part. The printed key sits lower right and a numbered sheet index sits mid-right, both from 768px, and both stay put for the whole shot. The direction called for the headline on a lower-left sheet and a sheet number in the top corner; the shipped build chose top-left strips and the index rail, and the build stands.

After the story, opaque full-width bands alternate atlas and paper at 96px vertical padding, inside 1152px to 1280px containers, with gutters of 20px, 40px and 56px across breakpoints.

The signed-in app is a 224px atlas sidebar with a journey bar of steps across the top, collapsing to a 56px atlas bar on phones. The report prints on US Letter.

### Named Rules
**The One Shot Rule.** The landing story is one continuous camera shot over the real street. There are no cuts: the camera descends on load, then the scroll scrubs it through every scene, with a slow drift so the city is alive when the page is still. Words change, the map never reloads. Changing the address flies the same camera to the new street.

## Elevation & Depth

The system is flat. Sheets, cards, menus and dialogs have no shadows at rest or in any state; separation comes from the ink outline and the contrast between paper and blue. Real depth belongs to the map alone: extruded buildings and data columns, drawn with full ambient light so they read as printed color and not lit plastic. Pointer tilt and scroll perspective may move a flat sheet through space, and it stays solid paper.

### Named Rules
**The Flat Print Rule.** No shadows, and no gradient as a surface. A pattern that prints, like a hatch marking a zone on a chart, is ink and stays allowed.

## Shapes

Square corners throughout (0px), with a barely softened 2px on small badges. Forms are rectangles, like lots on a block. The one standing exception is the circle: a person on the map is a dot, so their dots in map legends and status dots are round. Outlines are 1px, ink on anything meeting the ground or carrying an action, hairline inside a sheet. Empty and demo states use a dashed outline.

## Components

### Buttons
Printed tabs: flat, square, and pressed down 1px when active.
- **Shape:** Square (0px), 32px, 40px or 48px tall.
- **Next step:** Frame Yellow fill, ink text and outline. Hover deepens. One per screen.
- **Primary:** Atlas Blue fill and outline, white text. Hover goes Atlas Deep.
- **Secondary:** White fill, ink outline and text. Hover goes Pressed Grey.
- **Ghost / Danger:** Ghost is slate text that fills Pressed Grey on hover. Danger is a red outline on white that fills red on hover.
- **Focus:** A 2px ink outline, offset 2px. Disabled is 50% opacity.

### Chips
- **Evidence chip:** Flat key color, 1px ink outline, 11px ink text, labelled Measured, Yours, Estimated or Checked on the street. Demo and Unknown are white, Demo with a dashed outline. Every number on screen should carry one.
- **Segmented choice:** White with an ink outline. The selected option fills atlas blue with white text.

### Cards / Containers
- **Map sheet:** The one container on the map and for menus and dialogs. Map Sheet fill, 1px ink outline, 12px to 16px padding.
- **Card:** White with a hairline outline, for grouping inside the signed-in page. Headers rule off with a hairline.
- **Dialog:** A map sheet with an atlas blue title bar, over an 80% atlas scrim.

### Inputs / Fields
- **Style:** White, 1px slate outline, square, 40px tall. On the landing sheet they become an underlined 2px ink rule on bare paper, 48px tall.
- **Focus:** Ink border and a 2px atlas outline.
- **Error / Disabled:** A Verdict Red message below the field.

### Navigation
Atlas blue bars with white text. Landing links roll their label up on hover. App steps slide a Cool Page tab under the active step, and the next step on the bar is the yellow one.

### Atlas Key
The printed legend on a sheet: a small outlined swatch per meaning, plus label. On the landing, the swatch of the scene's evidence grows wider and its label goes bold, so the key follows the story.

### Verdict Band
A full flat band in Verdict Green, Verdict Red or Ink, with white type, 24px padding and an ink outline. It says what to do before anything shows how it was computed.

### Atlas Map
Every map shares one recipe: blue field, Atlas Deep water, Atlas Park greens, white streets (75% on major roads, 32% on minor), extruded Map Sheet buildings with 1px ink footprints, flat lit. Base-style fills and labels are stripped on the landing. App maps keep white street names with a blue halo. Data columns are square, flat and ink-wired, in key colors: your site yellow, rivals and Census tracts pink. In the customer scene, chose-you is yellow, chose-a-rival white, stayed-home stone.

## Do's and Don'ts

### Do:
- **Do** let the real map stay visible, in atlas colors, wherever the story happens.
- **Do** mark every number with its evidence: pink measured, yellow yours, stone estimated.
- **Do** say what is illustrative where it appears, as the customer scene does.
- **Do** give every screen one yellow next step in plain words.
- **Do** tie landing motion to the scroll, and wipe strips in with cubic-bezier(0.76, 0, 0.24, 1).
- **Do** keep all content visible and still under reduced motion: no opening sheet, no tilt, strips shown in place.

### Don't:
- **Don't** use pink, yellow or stone for warnings, status, emphasis or chart decoration.
- **Don't** color a verdict with the key, or a key label with verdict colors.
- **Don't** add a second yellow action to a screen.
- **Don't** add shadows or gradient surfaces to sheets, cards or panels.
- **Don't** build a SaaS hero with a floating dashboard, or a dark dashboard with glowing charts.
- **Don't** cut the landing shot into separate map sections or swap the map for a screenshot.
- **Don't** set display type on the moving map without its strip.
