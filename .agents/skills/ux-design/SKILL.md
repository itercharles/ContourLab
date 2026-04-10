---
name: ux-design
description: UX design guidance for WebTPS clinical imaging components — invoke before designing or polishing any UI
---

# WebTPS UX Design Skill

You are designing a clinical radiation therapy treatment planning system (TPS). Reference systems include OHIF Viewer, Eclipse (Varian), RayStation, and Pinnacle. Users are radiation oncologists, medical physicists, and dosimetrists — expert users who value precision, density of information, and keyboard efficiency over aesthetic minimalism.

## Core Design Principles

1. **Clinical dark theme** — dark backgrounds reduce eye fatigue in dim reading rooms. Base: `gray-950` (#0a0a0a), surfaces: `gray-900` (#111), panels: `gray-800` (#1f2937), borders: `gray-700` (#374151).
2. **Information density over whitespace** — pack meaningful data. No large empty areas. Small, tight typography (`text-xs`, `text-sm`).
3. **Viewport is king** — maximize viewport real estate. Sidebars collapse. Toolbars are compact. Overlays are non-intrusive.
4. **Keyboard-first** — every action should have a keyboard shortcut. Show shortcuts in tooltips.
5. **Immediate feedback** — WL values shown live, slice position shown, structure volume updates instantly.
6. **No modal dialogs** — use inline panels and popovers. Modals interrupt clinical workflow.

## Color System

```
Backgrounds:
  bg-viewport:   #000000  (pure black for image viewing)
  bg-base:       #0d0d0d  (app background)
  bg-surface:    #1a1a1a  (panels, sidebars)
  bg-elevated:   #242424  (cards, dropdowns)
  bg-interactive:#2e2e2e  (hover states)

Borders:
  border-subtle: #2a2a2a
  border-default:#3a3a3a
  border-strong: #4a4a4a

Text:
  text-primary:  #e5e5e5
  text-secondary:#a0a0a0
  text-muted:    #6b6b6b
  text-disabled: #404040

Accents:
  accent-blue:   #3b82f6  (active tool, selection, links)
  accent-green:  #22c55e  (success, visible structures)
  accent-yellow: #eab308  (warnings)
  accent-red:    #ef4444  (danger, locked)
  accent-orange: #f97316  (WL overlay, annotations)

Structure type colors (TG-263 standard):
  GTV: #ff0000   CTV: #ff8c00   PTV: #0000ff
  OAR: #00c800   EXTERNAL: #ffff00
```

## Typography

- Base font size: 12px (`text-xs`) for panel content, labels, metadata
- UI labels: `text-xs font-medium tracking-wider uppercase text-gray-400`
- Section headers: `text-xs font-semibold text-gray-300`
- Viewport overlays: `text-xs font-mono text-orange-300`
- Never use font sizes larger than `text-sm` inside workspace panels

## Viewport Chrome Conventions (OHIF-style)

Each viewport panel must show:
- **Top-left overlay**: Patient name, series description (small, `text-xs font-mono text-orange-200 opacity-75`)
- **Top-right overlay**: WL/WW values (e.g. "W:400 L:40")
- **Bottom-left overlay**: Slice position in mm (e.g. "z: -45.5 mm")
- **Bottom-right overlay**: Zoom level (e.g. "1.5×")
- **Viewport label**: AXIAL / SAGITTAL / CORONAL in top corner, small, colored border-left accent when active
- Active viewport: thin `ring-2 ring-blue-500` border
- All overlays: pointer-events-none, semi-transparent background for legibility

## Toolbar Design

- Height: 36px total (`h-9`)
- Tool buttons: 28px × 28px (`w-7 h-7`), `rounded`, icon + optional label
- Active tool: `bg-blue-600 text-white`
- Inactive tool: `bg-gray-700 text-gray-300 hover:bg-gray-600`
- Separator: `w-px h-5 bg-gray-600 mx-1`
- Group related tools (pan/zoom/scroll), then separator, then WL presets, then crosshairs, then right-aligned: undo/redo + panel toggle
- Tooltip: show on hover with keyboard shortcut (e.g. "Window/Level [W]")

## Sidebar Panels

- Width: 260px when open, 0 when collapsed (transition: `transition-all duration-200`)
- Section headers: `px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-gray-500 border-b border-gray-700`
- No rounded corners on panel items (clinical, not consumer)
- Row height: 28px for structure list items
- Hover: `hover:bg-gray-700/50`
- Selected: `bg-blue-900/40 border-l-2 border-blue-500`

## Structure List Item (per row, 28px tall)

```
[color swatch 10×10] [structure name text-xs] [vol_cc text-xs text-gray-400] [eye icon] [lock icon] [⋮ menu]
```
- Color swatch: `w-2.5 h-2.5 rounded-sm flex-shrink-0`
- Name: truncated with ellipsis, `max-w-[100px]`
- Volume: right-aligned, `text-[10px] text-gray-500`
- Icon buttons: `w-5 h-5`, visible on row hover or always if state is non-default

## File Drop Zone

- Dashed border `border-dashed border-gray-600`, `rounded`
- On drag-over: `border-blue-500 bg-blue-950/30`
- Compact: max height 80px, icon + one line of text
- No padding waste

## Loading States

- Use a thin progress bar at the top of the viewport area (not a spinner blocking content)
- Show series count and file count during loading: "Loading 3/124 files..."

## Error States

- Inline, below the relevant control
- `text-xs text-red-400`, no icons needed
- Never use alert() or confirm()

## Interaction Patterns

- **Right-click on viewport**: context menu (Reset WL, Reset Zoom, Set as Active)
- **Double-click on structure row**: rename inline
- **Drag structure row**: reorder
- **Scroll on viewport**: advance slices (not zoom)
- **Ctrl+scroll**: zoom
- **Keyboard shortcuts** (show in toolbar tooltips):
  - W: WindowLevel tool
  - Z: Zoom tool
  - P: Pan tool
  - S: Scroll tool
  - Ctrl+Z: Undo
  - Ctrl+Shift+Z: Redo
  - N: New structure
  - Delete: Delete contour on current slice

## Accessibility

- All interactive elements: `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`
- ARIA labels on icon-only buttons
- Sufficient contrast for overlaid text (use semi-transparent bg behind overlay text)

## What to Avoid

- ❌ Rounded corners larger than `rounded` (no `rounded-xl`, `rounded-2xl`)
- ❌ Drop shadows (use borders instead)
- ❌ Gradient backgrounds
- ❌ Animations longer than 150ms
- ❌ Color-only status indication (pair with icon or text)
- ❌ Padding > `p-3` inside workspace panels
- ❌ Light backgrounds inside the workspace area
- ❌ `text-base` or larger inside panels
