# DESIGN.md

Design style guide for RecritCRM — an AI-powered recruitment CRM built with Next.js 15, Tailwind CSS 4, and shadcn/ui.

---

## Overall Design Philosophy

The application follows a **clean, modern SaaS dashboard** aesthetic. The visual language prioritizes data density without clutter, using generous whitespace, a restrained color palette, and clear typographic hierarchy. AI-originated actions are visually distinguished from human actions via a dedicated purple accent.

**Core Principles:**

1. **Minimal & Professional** — White card surfaces on a light slate (`#f8fafc`) page background. Borders are subtle (`slate-200`), shadows are small (`shadow-sm`). No gratuitous decoration.
2. **Semantic Color** — Color communicates meaning, not decoration. Blue = primary action, purple = AI, green = success/active, amber = warning/in-progress, red = danger/rejected.
3. **Data-First** — Large stat numbers, compact card layouts, and badge-based status indicators let users scan information quickly.
4. **Progressive Disclosure** — Collapsible sidebar, filters that refine in-place, hover states that reveal secondary info.

---

## Color System

### Theme Tokens (`globals.css` via `@theme`)

| Token                  | Value     | Usage                            |
|------------------------|-----------|----------------------------------|
| `--color-primary`      | `#2563EB` | Buttons, links, active nav, focus rings |
| `--color-primary-foreground` | `#ffffff` | Text on primary surfaces       |
| `--color-secondary`    | `#f1f5f9` | Secondary buttons, subtle backgrounds |
| `--color-secondary-foreground` | `#0f172a` | Text on secondary surfaces   |
| `--color-ai`           | `#7C3AED` | AI agent badges, AI activity icons, AI nav highlight |
| `--color-ai-foreground`| `#ffffff` | Text on AI surfaces              |
| `--color-destructive`  | `#dc2626` | Delete actions, error states     |
| `--color-border`       | `#e2e8f0` | Card borders, dividers, input borders |
| `--color-ring`         | `#2563EB` | Focus ring (matches primary)     |
| `--color-background`   | `#ffffff` | Card/popover surfaces            |
| `--color-foreground`   | `#0f172a` | Primary body text                |
| `--color-muted-foreground` | `#64748b` | Secondary/descriptive text   |
| Body background        | `#f8fafc` | Page-level background (slate-50) |

### Semantic Color Mapping

**Pipeline stages** use a warm-to-cool progression:

| Stage      | Solid (column headers)  | Badge (light variant)                        |
|------------|------------------------|----------------------------------------------|
| Applied    | `bg-slate-500`         | `bg-slate-100 text-slate-700 border-slate-300` |
| Screened   | `bg-blue-500`          | `bg-blue-100 text-blue-700 border-blue-300`    |
| Interview  | `bg-amber-500`         | `bg-amber-100 text-amber-700 border-amber-300` |
| Offer      | `bg-purple-500`        | `bg-purple-100 text-purple-700 border-purple-300` |
| Placed     | `bg-green-500`         | `bg-green-100 text-green-700 border-green-300` |
| Rejected   | `bg-red-500`           | `bg-red-100 text-red-700 border-red-300`       |
| Withdrawn  | `bg-gray-400`          | `bg-gray-100 text-gray-700 border-gray-300`    |

**Priority:** low=slate, medium=blue, high=amber, urgent=red (all `100`/`600` pairs).

**Status:** active=green, draft=slate, paused=amber, closed=gray, filled=blue, placed=green.

### Avatar Color Palette

Avatars cycle through 8 colors based on index/hash: `blue-500`, `emerald-500`, `amber-500`, `purple-500`, `rose-500`, `cyan-500`, `indigo-500`, `teal-500` (or `orange-500` on some pages). White text on colored circle.

---

## Typography

**Font stack:** System fonts — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

| Role             | Size           | Weight     | Color         |
|------------------|----------------|------------|---------------|
| Page title       | `text-2xl`     | `bold`     | `slate-900`   |
| Section header   | `text-base`    | `semibold` | `slate-900`   |
| Card title       | `text-sm`      | `semibold` or `medium` | `slate-900` |
| Body text        | `text-sm`      | normal     | `slate-600`–`slate-700` |
| Caption/metadata | `text-xs`      | normal     | `slate-400`–`slate-500` |
| Stat value       | `text-3xl`     | `bold`     | `slate-900`   |
| Badge text       | `text-xs` or `text-[11px]` | `medium`–`semibold` | contextual |

**Text color hierarchy:** `slate-900` (primary) → `slate-700` (secondary) → `slate-500` (tertiary) → `slate-400` (faint/disabled).

---

## Spacing & Layout

### Border Radius Tokens

| Token          | Value     | Usage                      |
|----------------|-----------|----------------------------|
| `--radius-sm`  | `0.375rem` (6px) | Small pills, dots    |
| `--radius-md`  | `0.5rem` (8px)   | Inputs, small components |
| `--radius-lg`  | `0.75rem` (12px) | Buttons, standard UI   |
| `--radius-xl`  | `1rem` (16px)    | Cards, containers      |

### Spacing Scale

Follows Tailwind's 4px grid. Commonly used values:

- `gap-1` / `space-y-1` (4px) — tight icon+text pairs
- `gap-2` / `p-2` (8px) — list items, card internal rows
- `gap-3` / `p-3` (12px) — filter bar gaps, column padding
- `gap-4` / `p-4` (16px) — grid gaps between cards
- `gap-6` / `p-6` / `space-y-6` (24px) — major section spacing, card padding, page padding

### Shell Layout

```
┌──────────┬─────────────────────────────────┐
│          │  Header (h-16, sticky, z-30)    │
│ Sidebar  ├─────────────────────────────────┤
│ w-60     │                                 │
│ fixed    │  Main Content (p-6)             │
│ z-40     │                                 │
│          │                                 │
│ (w-16    │                                 │
│ collapsed)│                                │
└──────────┴─────────────────────────────────┘
```

- Sidebar: `fixed left-0 top-0 h-screen w-60` (collapsible to `w-16`)
- Content area: `pl-60 flex-1` (adjusts with sidebar)
- Header: `sticky top-0 h-16 z-30`
- Page content: `p-6 space-y-6`

### Responsive Grid Patterns

- **Stat cards:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`
- **Content cards (Contacts, Jobs):** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` with `gap-4`
- **Dashboard panels:** `grid-cols-1 lg:grid-cols-3` (2:1 split) or `grid-cols-1 lg:grid-cols-2`

---

## Component Patterns

### Cards

Standard card: `rounded-xl border border-slate-200 bg-white shadow-sm`. Hover state: `hover:shadow-md hover:border-slate-300 transition-all`. Padding: `p-5` or `p-6`.

Cards are the primary content container across all pages — contact cards, company cards, job cards, stat cards, and dashboard panels all use this pattern.

### Badges

Pill-shaped status indicators: `rounded-full px-2 py-0.5 text-xs font-medium` (or `rounded-md border` for stage badges). Always use light background + darker text (e.g., `bg-blue-100 text-blue-700`). Never use solid/dark badges for inline status.

### Buttons

Via shadcn/ui `Button` component with variants:

| Variant     | Style                                          |
|-------------|------------------------------------------------|
| Default     | Blue bg, white text, shadow                    |
| Secondary   | Slate bg, dark text                            |
| Outline     | Border, transparent bg, hover highlight        |
| Ghost       | No bg, hover highlight                         |
| Destructive | Red bg, white text                             |
| Link        | Text-only with underline on hover              |

Sizes: `sm` (h-8), `default` (h-9), `lg` (h-10), `icon` (h-9 w-9 square).

### Avatars

Circular (`rounded-full`), `h-8 w-8` or `h-9 w-9`. Colored background from the avatar palette with white initials (`text-xs font-medium text-white`). Company logos use `rounded-lg` instead.

### Search & Filter Bars

Horizontal flex layout (`flex flex-wrap gap-3`), stacking vertically on mobile (`flex-col sm:flex-row`). Search input has a left-positioned `Search` icon. Dropdowns use native `<select>` with a custom chevron overlay. Focus: `focus:border-blue-300 focus:ring-2 focus:ring-blue-100`.

### Empty States

Centered box with dashed border (`border-dashed border-slate-200/300`), a large muted icon (`h-10 w-10 text-slate-300`), a title, and a description. Generous vertical padding (`py-16`).

---

## Contacts Page

### Layout

Full-width card grid with a tabbed interface switching between **Contacts** and **Companies** views.

```
┌─ Page Header ─────────────────────────────────────┐
│  "Contacts"  (title)          [+ Add Contact]     │
│  subtitle text                                     │
├─ Tabs ────────────────────────────────────────────┤
│  [👤 Contacts (8)]  [🏢 Companies (5)]            │
├─ Filters ─────────────────────────────────────────┤
│  [🔍 Search...]   [Type ▾]                        │
├─ Card Grid ───────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ Contact │  │ Contact │  │ Contact │           │
│  │  Card   │  │  Card   │  │  Card   │           │
│  └─────────┘  └─────────┘  └─────────┘           │
│  (grid-cols-1 → md:2 → xl:3)                      │
└───────────────────────────────────────────────────┘
```

### Contact Card Anatomy

```
┌──────────────────────────────────┐
│  [Avatar]  Name          [Badge] │
│            Job Title             │
│            🏢 Company            │
│            ✉️  Email              │
│            📞 Phone              │
│──────────────────────────────────│
│  Last contacted: 2 days ago      │
└──────────────────────────────────┘
```

- Avatar: circular, colored background with initials (`h-11 w-11`)
- Badge: contact type (hiring_manager=blue, client=emerald, reference=amber, vendor=purple)
- Metadata row separated by a top border (`border-slate-100`)
- Icon+text pairs use `h-3.5 w-3.5` icons in `slate-400`

### Company Card Anatomy

```
┌──────────────────────────────────┐
│  [Logo]  Company Name    [Badge] │
│          🏆 Industry             │
│          👥 Size                  │
│          📍 Location             │
│──────────────────────────────────│
│  💼 8 open jobs   📈 14 placed   │
└──────────────────────────────────┘
```

- Logo: rounded-square placeholder with first letter (`rounded-lg`)
- Footer metrics use semantic icon colors (`blue-500` for jobs, `emerald-500` for placements)

### Tab Design

Custom tab bar with icon + label + count badge. Active tab: `text-blue-600` with a `h-0.5` blue underline indicator. Inactive: `text-slate-500`.

---

## Pipeline Page

### Layout

Horizontal Kanban board with fixed-width columns, each representing a pipeline stage.

```
┌─ Page Header ─────────────────────────────────────┐
│  "Pipeline"  (title)                               │
│  subtitle text                                     │
├─ Filters ─────────────────────────────────────────┤
│  [🔍 Search...]  [Job ▾]  [Recruiter ▾]  [Date ▾] │
├─ Kanban Board (overflow-x-auto) ──────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ...     │
│  │Applied│  │Screen│  │Inter │  │Offer │          │
│  │ ████ │  │ ████ │  │ ████ │  │ ████ │          │
│  │[Card]│  │[Card]│  │[Card]│  │[Card]│          │
│  │[Card]│  │[Card]│  │      │  │      │          │
│  │[Card]│  │      │  │      │  │      │          │
│  └──────┘  └──────┘  └──────┘  └──────┘          │
└───────────────────────────────────────────────────┘
```

### Column Design

- Fixed width: `w-72` (288px), `flex-shrink-0`
- **Colored top stripe:** `h-1.5` bar using the stage's solid color (e.g., `bg-amber-500` for Interview)
- **Header:** stage name + candidate count badge (`rounded-full bg-slate-200 text-xs`)
- **Scrollable body:** `overflow-y-auto`, `max-height: calc(100vh - 260px)`
- **Background:** `bg-slate-50` for the column body, `bg-slate-100` for the board container
- **Empty state:** dashed border placeholder (`border-dashed border-slate-300`)

### Pipeline Card Anatomy

```
┌────────────────────────────────┐
│  [Avatar]  Name    [AI: 85%]  │
│            Job Title           │
│  💼 Job Name                   │
│  ●●●●○  rating    3d in stage │
└────────────────────────────────┘
```

- Avatar: `h-8 w-8` with initials
- AI Score badge: conditional color — green (80+), amber (60–79), red (<60)
- Rating dots: `h-1.5 w-1.5 rounded-full`, filled=`amber-400`, empty=`slate-200`
- Days in stage: `text-xs text-slate-400`

### Drag-and-Drop

Full HTML5 drag-and-drop implementation:
- Cards: `draggable="true"`, cursor changes to `grab`/`grabbing`
- Drop zones: columns highlight with `border-2 border-dashed border-blue-400 bg-blue-50/50`
- Smooth transitions via `transition-colors`
- On drop: stage is updated, `daysInStage` resets to 0

---

## Icons

All icons from `lucide-react`. Common sizes:

| Size          | Usage                                |
|---------------|--------------------------------------|
| `h-3.5 w-3.5`| Inline metadata icons (mail, phone)  |
| `h-4 w-4`    | Button icons, nav icons, search icon |
| `h-5 w-5`    | Nav items, medium UI elements        |
| `h-8 w-8`    | Activity feed timeline icons         |
| `h-10 w-10`  | Empty state illustrations            |
| `h-12 w-12`  | Stat card icon containers            |

Icons always use `shrink-0` in flex layouts. Color is typically `slate-400` for decorative/metadata icons, matching the parent color for interactive icons.

---

## Interaction States

| State        | Pattern                                                    |
|--------------|------------------------------------------------------------|
| Hover (card) | `hover:shadow-md hover:border-slate-300 transition-all`    |
| Hover (text) | Name links → `text-blue-600` on card hover                 |
| Focus        | `focus:border-blue-300 focus:ring-2 focus:ring-blue-100`   |
| Active nav   | `bg-blue-50 text-blue-600`                                 |
| Active tab   | `text-blue-600` + `h-0.5` blue underline bar              |
| Drag over    | `border-2 border-dashed border-blue-400 bg-blue-50/50`    |
| Dragging     | `cursor-grabbing`, shadow lift                             |

---

## AI Visual Distinction

AI-originated elements use purple throughout:
- `--color-ai: #7C3AED` theme token
- AI Agent nav item: `text-purple-600` icon
- Activity feed AI actions: `bg-purple-100 text-purple-600` timeline icon + `bg-purple-50 text-purple-600` badge
- AI score badges on pipeline cards use green/amber/red (not purple) since they represent data, not AI agency

---

## Scrollbar

Custom webkit scrollbar styling:
- Width/height: `6px`
- Track: transparent
- Thumb: `#cbd5e1` (slate-300), `border-radius: 3px`
- Thumb hover: `#94a3b8` (slate-400)
