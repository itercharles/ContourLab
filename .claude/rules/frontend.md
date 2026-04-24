---
paths:
  - "apps/client/**"
---

# Frontend Rules (apps/client)

## Stack
- React 18 + TypeScript 5.7, Vite 6, Tailwind CSS 3
- DICOM rendering: `@cornerstonejs/core`, `@cornerstonejs/tools`, `@cornerstonejs/dicom-image-loader`
- State: Zustand 5 stores in `src/stores/`
- Routing: React Router 7
- Tests: Vitest 2 + React Testing Library, colocated as `*.test.tsx`

## Conventions
- No inline styles — use Tailwind utilities only
- No `rounded-xl` or larger, no drop shadows, no gradient backgrounds
- Dark theme: `bg-gray-950` base, `bg-gray-900` surfaces, `bg-gray-800` panels, `border-gray-700` borders
- Text sizes: `text-xs` for panel content, `text-sm` max inside workspace panels
- Viewport overlays: `pointer-events-none`, `text-xs font-mono text-orange-200 opacity-75`
- Active viewport: `ring-2 ring-blue-500`
- Structure list rows: 28px tall, color swatch + name + volume + icons

## Testing
- Unit tests must be colocated with their component (`Component.test.tsx` next to `Component.tsx`)
- Run: `pnpm --filter @webtps/client test`
- Typecheck: `pnpm --filter @webtps/client typecheck`
- Lint: `pnpm --filter @webtps/client lint`

## DICOMweb
- Vite proxy at `/dicom-web` → Orthanc at `http://127.0.0.1:8042`
- Use `@cornerstonejs/dicom-image-loader` for image loading, not raw fetch
