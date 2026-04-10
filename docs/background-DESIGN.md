# LightArk.ai Background Design

## Scope
This document reconstructs the **background color system and background treatment language** used on the current public LightArk.ai site and its visible product visuals. It is intended as a practical design spec for recreating the same feel in web UI, landing pages, product shots, and marketing sections.

**Important note:** this is a **visual design reconstruction**, not a dump of the site’s source CSS. The values below are inferred from the current public LightArk branding and on-page product imagery.

---

## 1. Overall Background Direction

LightArk’s background scheme is not a dark, high-contrast cyberpunk system. It is a **light enterprise-tech visual language** built from:

- **Clean white and off-white base surfaces**
- **Cool blue-tinted structural panels**
- **Electric blue and violet accent gradients**
- **Soft neon halo/glow around featured product mockups**
- **Deep slate/navy brand contrast for typographic anchoring**

The result is a look that feels:

- enterprise-safe
- AI-native
- modern but not aggressive
- clean, open, and “deployable”
- more **cloud platform / productivity AI** than “hacker AI”

---

## 2. Core Background Layers

### A. Global Canvas Background
Use a **very light neutral or cool-neutral base** for the page background.

**Recommended base tokens**

- `--bg-page: #FFFFFF`
- `--bg-page-soft: #F7F7F8`
- `--bg-page-cool: #F5F6FC`

**Usage**
- Main landing page canvas
- Large content sections
- White-space-dominant areas
- Neutral backdrop behind product content

**Effect**
This creates the clean, enterprise, trustworthy base that LightArk consistently communicates.

---

### B. Structural Shell / Window-Chrome Background
A repeated visual motif in LightArk product imagery is a **soft powder-blue shell**, especially in top bars and frame chrome.

**Recommended token**

- `--bg-shell: #D7E4FA`

**Closest supporting tones**
- `#D6E4FA`
- `#DDE8FB`
- `#E7F0FF`

**Usage**
- Mock browser/app window header strips
- Framing containers
- Hero mockup shells
- Light system chrome

**Effect**
This gives the product presentation a cloud-platform quality and separates the shell from the white inner work area.

---

### C. Content Surface Background
Inside frames and cards, LightArk relies on **white to ultra-light cool gray** rather than saturated backgrounds.

**Recommended tokens**

- `--bg-surface: #FFFFFF`
- `--bg-surface-soft: #F7F7F8`
- `--bg-surface-cool: #F4F5FB`

**Usage**
- App interiors
- Cards
- Section containers
- Form surfaces
- Dialogue and dashboard content panes

**Effect**
Keeps the UI open, readable, and businesslike while leaving room for accent color to do the signaling.

---

### D. Accent Gradient Background
The brand accent system is driven by **electric blue to violet / purple**. This is used in logos, buttons, selected tabs, chips, and floating callouts.

**Recommended gradient**

```css
linear-gradient(135deg, #3B84E2 0%, #2F63E1 45%, #9154FD 100%)
```

**Alternative lighter gradient**

```css
linear-gradient(135deg, #3CB1F7 0%, #4C91F0 50%, #A58CFA 100%)
```

**Core accent colors**

- `--accent-blue: #3B84E2`
- `--accent-blue-bright: #3CB1F7`
- `--accent-blue-deep: #2F63E1`
- `--accent-violet: #9154FD`
- `--accent-violet-soft: #A58CFA`

**Usage**
- CTA buttons
- Active navigation states
- Selected chips/tabs
- Gradient brand marks
- Floating hero tags
- Feature highlights

**Effect**
This is the part of the system that says “AI” and “advanced platform” without making the whole site visually heavy.

---

### E. Halo / Glow Background Treatment
A distinctive LightArk motif is the **multi-ring neon outer glow** around product mockups. The glow is usually blue-led, with slight purple mixing.

**Recommended glow recipe**

```css
box-shadow:
  0 0 0 1px rgba(59, 132, 226, 0.35),
  0 0 24px rgba(60, 177, 247, 0.30),
  0 0 56px rgba(59, 132, 226, 0.22),
  0 0 96px rgba(145, 84, 253, 0.14);
```

**Usage**
- Hero mockup outer frame
- Floating cards
- Product demo callouts
- Key visual objects on marketing pages

**Effect**
This adds the “intelligent energy field” feeling, but only around focal objects. It should not be applied to the entire page.

---

## 3. Brand Contrast Colors

The logo and major contrast anchors rely on a **deep slate-navy**, not pure black.

**Recommended token**

- `--ink-brand: #33465B`

**Supporting darks**
- `#46556A`
- `#1A1A1A` for occasional hard text emphasis only

**Usage**
- Logo dark segment
- Primary headings
- Iconography
- High-confidence enterprise text

**Effect**
This keeps the interface refined and less harsh than black.

---

## 4. Practical Background Hierarchy

For a page or screen built in the LightArk style, use this hierarchy:

### Layer 1 — Page Canvas
- White or cool-white
- Large quiet areas
- Minimal noise

### Layer 2 — Section or Frame Shell
- Powder-blue top strip or subtle cool shell tone
- Used sparingly to frame product modules

### Layer 3 — Surface Panels
- White cards and work areas
- Thin borders
- Slight cool-gray separation

### Layer 4 — Accent Background Moments
- Blue-violet gradients for CTAs, selected states, and badges
- Not for large reading surfaces

### Layer 5 — Glow Treatment
- Only around hero product frames or priority callouts
- Use as emphasis, not ambient wallpaper

---

## 5. Background Composition Ratio

A good LightArk-style composition target:

- **75–85%** white / off-white / cool-neutral background
- **8–15%** pale blue structural shell or framing
- **3–7%** saturated blue-violet accent areas
- **<3%** glow effect and luminous halo

This ratio is important. If the accent or glow is overused, the design stops feeling enterprise and starts feeling promotional or overly “Web3”.

---

## 6. Recommended CSS Tokens

```css
:root {
  --bg-page: #FFFFFF;
  --bg-page-soft: #F7F7F8;
  --bg-page-cool: #F5F6FC;

  --bg-shell: #D7E4FA;
  --bg-shell-soft: #E7F0FF;

  --bg-surface: #FFFFFF;
  --bg-surface-soft: #F7F7F8;
  --bg-surface-cool: #F4F5FB;

  --ink-brand: #33465B;
  --ink-muted: #46556A;

  --accent-blue: #3B84E2;
  --accent-blue-bright: #3CB1F7;
  --accent-blue-deep: #2F63E1;
  --accent-violet: #9154FD;
  --accent-violet-soft: #A58CFA;

  --gradient-primary: linear-gradient(135deg, #3B84E2 0%, #2F63E1 45%, #9154FD 100%);
  --gradient-soft: linear-gradient(135deg, #3CB1F7 0%, #4C91F0 50%, #A58CFA 100%);
}
```

---

## 7. Example Background Implementation

### Page Background
```css
.page {
  background:
    radial-gradient(circle at 20% 0%, rgba(231, 240, 255, 0.65), transparent 28%),
    linear-gradient(180deg, #FFFFFF 0%, #F7F7F8 100%);
}
```

### Hero Product Frame
```css
.hero-frame {
  background: #FFFFFF;
  border: 1px solid rgba(59, 132, 226, 0.18);
  border-radius: 28px;
  box-shadow:
    0 0 0 1px rgba(59, 132, 226, 0.30),
    0 0 24px rgba(60, 177, 247, 0.28),
    0 0 56px rgba(59, 132, 226, 0.20),
    0 0 96px rgba(145, 84, 253, 0.12);
}
```

### Top Chrome Strip
```css
.window-chrome {
  background: #D7E4FA;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
}
```

### CTA or Active State
```css
.cta,
.is-active {
  background: linear-gradient(135deg, #3B84E2 0%, #2F63E1 45%, #9154FD 100%);
  color: white;
}
```

---

## 8. What Makes the Scheme Feel “Like LightArk”

To stay on-brand, preserve these decisions:

1. **Keep the page mostly light.**
   The AI feeling comes from accent and glow, not from a dark background.

2. **Use blue as the dominant signal color.**
   Purple is secondary, used to add lift and intelligence.

3. **Use very soft cool backgrounds, not gray-heavy enterprise beige.**
   The tone should feel digital and cloud-native.

4. **Use glow only around product showcases.**
   The halo is a focal device, not a site-wide atmosphere.

5. **Use slate navy instead of black for brand weight.**
   This keeps the system cleaner and more premium.

---

## 9. Design Do / Don’t

### Do
- Use white and cool-white generously
- Use powder-blue shell framing
- Add blue-violet gradients to key actions
- Use subtle luminous rings around featured mockups
- Keep overall contrast crisp and spacious

### Don’t
- Don’t turn the whole page into a dark gradient background
- Don’t use saturated purple as the main canvas color
- Don’t over-texture the background
- Don’t overuse glassmorphism
- Don’t replace the slate-navy tone with harsh black everywhere

---

## 10. Short Spec Summary

If you need the shortest possible version:

> **LightArk background design = white/cool-white enterprise canvas + powder-blue structural chrome + blue-to-violet accent gradients + soft neon blue halo around hero mockups + slate-navy brand contrast.**

