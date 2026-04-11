# Web TPS (Treatment Planning System) — Plan Specification

## Document Purpose

This specification defines the architecture, phased roadmap, and feature set for building a **web-based radiation therapy Treatment Planning System (Web TPS)**. It is designed to serve as a code-generation blueprint — each section maps to implementable modules with clear interfaces.

---

## 1. Repository Analysis — MonacoRE 2

### 1.1 Codebase Overview

The MonacoRE 2 repository is a C++23 application built on a **plugin-based architecture** using ImGui for immediate-mode rendering, OpenGL for graphics, and Emscripten for WebAssembly compilation. Key architectural takeaways:

| Aspect | Detail |
|--------|--------|
| Language | C++23, compiled to WebAssembly via Emscripten |
| UI Framework | ImGui (Immediate Mode GUI) with GLFW |
| Graphics | OpenGL 3.3+ / WebGL 2.0 |
| Architecture | Plugin-based with dependency inversion via `libimhex` |
| Build System | CMake 3.20+ with WASM presets |
| Web Output | 21 MB `.wasm` binary + JS bindings + Web Worker |

### 1.2 Architecture Patterns Worth Adopting

1. **Plugin/Extension System**: The `ContentRegistry` pattern — a central registry where modules register views, tools, providers, and event handlers — is ideal for a TPS where contouring tools, dose algorithms, and review modules must be independently extensible.

2. **Provider Abstraction**: The `Provider` base class decouples data access from UI. For a TPS, this maps to abstracting DICOM data sources (local, cloud, PACS) behind a unified interface.

3. **Event-Driven Communication**: The `EventManager` decouples modules. In a TPS context, contouring changes trigger dose recalculation events, structure modifications propagate to DVH updates, etc.

4. **Task Manager (Async Processing)**: Long-running tasks (dose calculation, auto-segmentation) require background processing with progress reporting — exactly what the existing `TaskManager` pattern provides.

5. **WebAssembly Deployment**: The repo already proves C++/OpenGL can be compiled to WASM and run in-browser with touch support, WebGL context management, and progress-tracked loading.

### 1.3 Gaps to Address for Web TPS

- **3D Volume Rendering**: ImGui is 2D-oriented; the TPS needs true 3D volume rendering (VTK.js, Three.js, or custom WebGL shaders).
- **Medical Image I/O**: No DICOM parsing. Need dcmjs / cornerstone3D for medical image handling.
- **Collaboration**: Single-user desktop model. Web TPS needs multi-user real-time collaboration.
- **Compute Backend**: WASM alone insufficient for Monte Carlo dose calculation. Need server-side GPU compute or cloud offload.

---

## 2. Mainstream TPS Analysis

### 2.1 Commercial TPS Landscape

| System | Vendor | Dose Engine | Key Differentiator |
|--------|--------|-------------|-------------------|
| Monaco | Elekta | Monte Carlo (XVMC) | Gold-standard MC accuracy, segment-based optimization |
| Eclipse | Varian | AAA / AcurosXB | Tight linac integration, RapidPlan knowledge-based planning |
| RayStation | RaySearch | Collapsed Cone / MC | Multi-modality (photon, proton, carbon ion), Plan Explorer |
| Pinnacle | Philips | Collapsed Cone | Auto-planning, adaptive workflow |
| Desargues Cloud TPS | MedMind | GPU-accelerated | Cloud-native, browser/server architecture, auto-planning |

### 2.2 Standard TPS Workflow

```
Image Import → Registration → Contouring → Prescription → Beam Setup
     → Optimization → Dose Calculation → Plan Evaluation → Approval → Export
```

### 2.3 Key Capabilities by Phase

**Image Management**: CT/MRI/PET import via DICOM, multi-modality rigid and deformable image registration, 4D CT support for motion management.

**Contouring**: Manual drawing tools (brush, polygon, interpolation), atlas-based auto-segmentation, AI/deep-learning auto-contouring (e.g., Limbus AI, MVision), margin expansion/contraction (CTV→PTV), Boolean operations on structures.

**Planning**: Beam geometry setup (gantry, collimator, couch angles), MLC modeling, inverse optimization (IMRT/VMAT), forward planning, dose calculation engines (pencil beam, collapsed cone, Monte Carlo).

**Review/Evaluation**: Dose Volume Histogram (DVH), dose statistics per structure, isodose overlay on CT slices, plan comparison (side-by-side or composite), conformity and homogeneity indices, QUANTEC/protocol compliance checking.

**Export**: DICOM-RT export (RT Plan, RT Dose, RT Structure Set), integration with OIS (Oncology Information Systems).

### 2.4 Modern Trends (2024-2026)

- **Cloud-native TPS**: Desargues Cloud TPS demonstrates 14x speedup via cloud GPU, with plan quality equivalent to Eclipse.
- **AI Auto-Contouring**: Deep learning models achieving sub-millimeter accuracy for OARs, reducing contouring time from hours to minutes.
- **Web-based Access**: OHIF Viewer + Cornerstone3D proving that diagnostic-quality medical image viewing is viable in-browser.
- **Adaptive Planning**: Online adaptive replanning during treatment fractions using CBCT.
- **Knowledge-Based Planning**: RapidPlan (Varian), learning from historical plan databases to predict achievable DVH.

---

## 3. Web TPS Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Contouring   │  │   Review     │  │   Planning    │  │
│  │   Module      │  │   Module     │  │   Module      │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                  │                   │          │
│  ┌──────┴──────────────────┴───────────────────┴───────┐ │
│  │              Core Rendering Engine                   │ │
│  │   Cornerstone3D / VTK.js / Custom WebGL Shaders     │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                 │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │                  State Manager                       │ │
│  │   DICOM Data Store / Structure Store / Plan Store    │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          │ REST / WebSocket / gRPC-Web
┌─────────────────────────┼────────────────────────────────┐
│                    SERVER (Backend)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  DICOM       │  │  AI Auto-    │  │   Dose        │   │
│  │  Service     │  │  Contour     │  │   Engine      │   │
│  │  (DICOMweb)  │  │  Service     │  │   Service     │   │
│  └──────────────┘  └──────────────┘  └───────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  Auth &      │  │  Collab      │  │   Export      │   │
│  │  RBAC        │  │  Service     │  │   Service     │   │
│  └──────────────┘  └──────────────┘  └───────────────┘   │
│                         │                                  │
│  ┌──────────────────────┴──────────────────────────────┐  │
│  │          Storage (Object Store + DB)                  │ │
│  │   PostgreSQL / MinIO (DICOM) / Redis (sessions)      │ │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend Framework | React 18+ with TypeScript | Component model, ecosystem, OHIF compatibility |
| Medical Image Rendering | Cornerstone3D | GPU-accelerated, DICOM-native, RT struct support |
| 3D Visualization | VTK.js | Volume rendering, isosurface extraction, beam geometry |
| State Management | Zustand + Immer | Lightweight, immutable updates for large structure state |
| UI Components | Radix UI + Tailwind CSS | Accessible, composable, medical-grade UI |
| Backend | ASP.NET Core (API Gateway) + Python (Compute) | ASP.NET Core for API orchestration, Python for scientific compute |
| Dose Calculation | C++/CUDA compiled to WASM (client) + GPU server | Hybrid: simple calcs in browser, MC on server |
| DICOM Services | Orthanc (development PACS) + DICOMweb integration | Open-source local DICOMweb server with standards-based production path |
| Database | PostgreSQL + PostGIS | Spatial queries for structure data |
| Real-time Collaboration | WebSocket (Socket.io) + CRDT | Conflict-free concurrent editing |
| AI/ML Inference | ONNX Runtime (server) or TensorFlow.js (client) | Auto-contouring models |
| Auth | Keycloak / Auth0 | HIPAA-compliant identity management |
| Storage | MinIO (S3-compatible) | DICOM object storage |

### 3.3 Core Data Model

```typescript
// Patient and Study
interface Patient {
  id: string;
  mrn: string;
  name: { given: string; family: string };
  dateOfBirth: string;
  studies: Study[];
}

interface Study {
  studyInstanceUID: string;
  studyDate: string;
  series: Series[];
}

interface Series {
  seriesInstanceUID: string;
  modality: 'CT' | 'MR' | 'PT' | 'RTSS' | 'RTPLAN' | 'RTDOSE';
  instances: Instance[];
}

// 3D Volume (loaded from DICOM series)
interface Volume {
  seriesUID: string;
  dimensions: [number, number, number];       // voxels [x, y, z]
  spacing: [number, number, number];           // mm
  origin: [number, number, number];            // mm (DICOM patient coords)
  directionCosines: number[];                  // 9-element matrix
  pixelData: Float32Array | Int16Array;        // HU values for CT
  windowCenter: number;
  windowWidth: number;
}

// Structure Set (Contours)
interface StructureSet {
  id: string;
  label: string;
  referencedSeriesUID: string;
  structures: Structure[];
  version: number;                             // for collaborative editing
}

interface Structure {
  id: string;
  name: string;                                // e.g., "PTV", "Liver", "SpinalCord"
  type: 'GTV' | 'CTV' | 'PTV' | 'OAR' | 'EXTERNAL' | 'AVOIDANCE' | 'SUPPORT';
  color: [number, number, number];             // RGB 0-255
  contours: ContourSlice[];                    // per-slice contour data
  meshData?: Float32Array;                     // 3D surface mesh (for 3D view)
  volume_cc?: number;                          // computed volume
}

interface ContourSlice {
  referencedSOPInstanceUID: string;
  slicePosition: number;                       // z-position in mm
  points: Float32Array;                        // [x1,y1,z1, x2,y2,z2, ...] in mm
  isClosed: boolean;
}

// Treatment Plan
interface TreatmentPlan {
  id: string;
  label: string;
  referencedStructureSetId: string;
  prescription: Prescription;
  beams: Beam[];
  optimization?: OptimizationConfig;
  doseGrid?: DoseGrid;
  status: 'draft' | 'optimizing' | 'calculated' | 'approved';
}

interface Prescription {
  targetStructureId: string;
  dosePerFraction_cGy: number;
  numberOfFractions: number;
  totalDose_cGy: number;
  normalization: { type: 'point' | 'volume'; value: number };
}

interface Beam {
  id: string;
  name: string;
  type: 'STATIC' | 'ARC' | 'VMAT';
  energy_MV: number;
  gantryAngle: number;                        // degrees
  gantryStopAngle?: number;                   // for arcs
  collimatorAngle: number;
  couchAngle: number;
  isocenter: [number, number, number];         // mm
  fieldSize: { x: number; y: number };         // mm at iso
  mlcLeafPositions?: Float32Array;             // MLC leaf positions per control point
  weight: number;                              // beam weight / MU
}

interface DoseGrid {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  doseData: Float32Array;                      // dose values in cGy
  doseUnit: 'cGy' | 'Gy';
  maxDose: number;
}

// Plan Evaluation
interface DVHPoint { dose: number; volume: number; }
interface DVHCurve {
  structureId: string;
  type: 'cumulative' | 'differential';
  points: DVHPoint[];
}

interface DoseStatistics {
  structureId: string;
  minDose: number;
  maxDose: number;
  meanDose: number;
  D95: number;       // dose covering 95% of volume
  D2: number;        // near-max dose
  V100: number;      // volume receiving 100% of Rx
  conformityIndex: number;
  homogeneityIndex: number;
}
```

---

## 4. Phased Development Roadmap

### Overview

```
Phase 1: CONTOURING APP         Phase 2: REVIEW APP            Phase 3: PLANNING APP
(Months 1-4)                    (Months 5-7)                    (Months 8-14)
─────────────────────────────────────────────────────────────────────────────────
 DICOM import/view               DVH computation                 Beam geometry editor
 Manual contour tools             Dose overlay rendering          Optimization engine
 AI auto-segmentation             Plan comparison                 Dose calculation
 Structure management             Protocol compliance             MLC modeling
 Collaborative editing            Report generation               DICOM-RT export
```

---

## 5. Phase 1 — Contouring Application (Months 1-4)

### 5.1 Core Features

#### 5.1.1 DICOM Image Viewer

**Description**: Multi-planar reconstruction (MPR) viewer supporting axial, sagittal, and coronal views with synchronized crosshairs.

**Features**:
- Load CT/MRI/PET via DICOMweb (QIDO-RS + WADO-RS) from a connected repository
- Window/level adjustment (presets for CT: lung, bone, soft tissue, brain)
- Zoom, pan, scroll through slices
- Measurement tools (distance, angle, area, HU probe)
- Multi-modality fusion overlay (CT+MRI, CT+PET) with adjustable opacity
- Cine mode for 4D CT

**Technical Implementation**:
```
Frontend:
  - Cornerstone3D for DICOM decoding and GPU rendering
  - @cornerstonejs/streaming-image-volume-loader for progressive loading
  - Custom React components wrapping Cornerstone viewports
  - Repository panel for query, upload, and series selection
  
Backend:
  - Orthanc DICOM server with DICOMweb plugin for development
  - Standards-based DICOMweb integration target for production PACS/VNA
  - ASP.NET Core API for structure persistence and future orchestration
```

**Key Files to Generate**:
```
src/
  core/
    dicom/
      DicomLoader.ts           — DICOM fetch & parse via dcmjs
      VolumeBuilder.ts         — Assemble slices into 3D volume
      DicomMetadataStore.ts    — Patient/study/series metadata cache
    rendering/
      ViewportManager.ts       — Manages Cornerstone3D rendering engine
      MPRController.ts         — Synchronized axial/sagittal/coronal
      WindowLevelPresets.ts    — CT window/level presets
  components/
    viewer/
      ImageViewer.tsx          — Main MPR viewer component
      ViewportPanel.tsx        — Single viewport (axial/sag/cor)
      Toolbar.tsx              — WL, zoom, pan, scroll tools
      SliceSlider.tsx          — Slice navigation
      FusionControls.tsx       — Multi-modality overlay controls
```

#### 5.1.2 Manual Contouring Tools

**Description**: Full set of 2D contour drawing tools operating on axial/sagittal/coronal slices with real-time 3D mesh generation.

**Tools**:

| Tool | Description | Implementation |
|------|-------------|----------------|
| Freehand Draw | Draw contour by mouse/touch dragging | Canvas path tracking → point simplification (Ramer-Douglas-Peucker) |
| Polygon | Click-to-place vertices, close on first point | Vertex array → polygon closure detection |
| Brush/Paint | Circle brush paints on mask | Binary mask per slice → marching squares for contour |
| Eraser | Remove portions of existing contour | Boolean subtraction on mask |
| Smart Contour | Edge-snapping using image gradients | Livewire/intelligent scissors algorithm |
| Threshold | Auto-fill regions within HU range | Region growing with HU bounds |
| Interpolation | Auto-generate contours on intermediate slices | Shape-based interpolation between key slices |
| Margin Tool | Expand/contract structure by uniform/anisotropic margin | Distance transform → isosurface extraction |
| Boolean Ops | Union, intersection, subtraction of structures | Mask-level boolean operations |
| Copy/Paste | Duplicate contour to adjacent slices | Slice-relative point offset |

**Technical Implementation**:
```
Frontend:
  - Cornerstone3D Segmentation tools for mask-based editing
  - Custom contour representation: both mask (Uint8Array per slice)
    and polygon (Float32Array point lists) kept in sync
  - Undo/redo stack (command pattern, 50-level deep)
  - Real-time 3D mesh via marching cubes (run in Web Worker)
  
Data Flow:
  User draws on slice → Update mask buffer → Extract contour points
  → Update ContourSlice in StructureSet → Trigger 3D mesh rebuild
  → Broadcast changes via WebSocket (collaborative mode)
```

**Key Files to Generate**:
```
src/
  core/
    contouring/
      ContourEngine.ts          — Core contour manipulation logic
      MaskToContour.ts          — Marching squares: mask → polygon
      ContourToMask.ts          — Scanline fill: polygon → mask
      InterpolationEngine.ts    — Shape-based slice interpolation
      MarginExpander.ts         — Distance transform margin tool
      BooleanOps.ts             — Structure boolean operations
      UndoRedoManager.ts        — Command pattern undo/redo stack
      LivewireEngine.ts         — Intelligent scissors edge detection
    algorithms/
      MarchingCubes.ts          — 3D mesh generation (Web Worker)
      RamerDouglasPeucker.ts    — Point simplification
      DistanceTransform.ts      — Euclidean distance transform
      RegionGrowing.ts          — Threshold-based segmentation
  components/
    contouring/
      ContouringToolbar.tsx     — Tool selection and settings
      BrushSettings.tsx         — Brush size, shape controls
      StructurePanel.tsx        — Structure list, colors, visibility
      ContourCanvas.tsx         — Drawing overlay on viewport
      MarginDialog.tsx          — Margin expansion UI
      InterpolationControls.tsx — Interpolation trigger and preview
```

#### 5.1.3 AI Auto-Segmentation

**Description**: Deep learning-based automatic organ contouring for common OARs and target volumes.

**Capabilities**:
- Pre-trained models for head-and-neck, thorax, abdomen, pelvis OARs
- One-click auto-segmentation of full structure set
- Interactive refinement (AI suggests, user corrects)
- Model inference via ONNX Runtime on server (GPU) or TensorFlow.js in browser (CPU fallback)

**Technical Implementation**:
```
Server:
  - ONNX Runtime with CUDA execution provider
  - Pre/post-processing pipeline:
    1. Resample CT to model input resolution (e.g., 1x1x2.5mm)
    2. HU normalization and windowing
    3. Run 3D U-Net / nnU-Net inference (patch-based for memory)
    4. Post-process: connected components, hole filling, smoothing
    5. Convert mask → contour points per slice
    6. Return as StructureSet JSON

  API:
    POST /api/ai/auto-contour
    Body: { seriesUID, modelId, structureNames[] }
    Response: Server-Sent Events (SSE) streaming progress + final contours

Client:
  - Progress indicator per structure
  - Preview mode: overlay AI contours before accepting
  - Per-structure accept/reject/edit
```

**Key Files to Generate**:
```
src/
  core/
    ai/
      AutoContourClient.ts     — API client for auto-segmentation
      ModelRegistry.ts         — Available models and capabilities
      ContourPostProcessor.ts  — Client-side smoothing/cleanup
  components/
    ai/
      AutoContourPanel.tsx     — Model selection, trigger, progress
      ContourPreview.tsx       — Overlay preview with accept/reject
      
server/
  services/
    ai/
      auto_contour_service.py  — Orchestrates inference pipeline
      preprocessing.py         — CT resampling, normalization
      inference.py             — ONNX Runtime model execution
      postprocessing.py        — Mask cleanup, contour extraction
    models/
      model_registry.py        — Model metadata and versioning
```

#### 5.1.4 Structure Management

**Description**: Manage the structure set — naming, colors, types, ordering, and metadata.

**Features**:
- Structure list with color-coded visibility toggles
- Drag-and-drop reordering
- Standard naming conventions (TG-263 compliant)
- Structure type assignment (GTV, CTV, PTV, OAR, etc.)
- Volume statistics (automatic calculation in cm3)
- Structure templates (load predefined sets per treatment site)
- Lock structures to prevent accidental editing

**Key Files to Generate**:
```
src/
  core/
    structures/
      StructureSetManager.ts   — CRUD operations on structures
      NamingConventions.ts     — TG-263 standard name mapping
      VolumeCalculator.ts      — Compute structure volume from contours
      TemplateManager.ts       — Site-specific structure templates
  components/
    structures/
      StructureList.tsx        — Main structure panel
      StructureRow.tsx         — Individual structure with controls
      StructureEditor.tsx      — Edit name, type, color
      TemplateSelector.tsx     — Load structure templates
```

#### 5.1.5 Collaborative Editing

**Description**: Multiple users (e.g., physician + dosimetrist) can view and edit contours simultaneously.

**Technical Implementation**:
```
  - WebSocket connection per session
  - CRDT (Conflict-free Replicated Data Type) for contour edits
  - Operational Transform for structure metadata changes
  - User presence indicators (cursor position, active structure)
  - Edit locking: per-structure or per-slice granularity
  - Change history with user attribution
```

**Key Files to Generate**:
```
src/
  core/
    collaboration/
      CollaborationClient.ts   — WebSocket connection manager
      ContourCRDT.ts           — CRDT for contour point sets
      PresenceManager.ts       — Track active users and cursors
      ConflictResolver.ts      — Handle concurrent edits
  
server/
  services/
    collaboration/
      session_manager.py       — Room/session management
      websocket_handler.py     — WebSocket message routing
      change_log.py            — Persistent change history
```

### 5.2 Phase 1 Architecture

```
┌─────────────────────────────────────────────────┐
│                Browser Client                     │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │           React Application Shell          │   │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────┐ │   │
│  │  │ Patient  │ │ Structure│ │  AI Panel  │ │   │
│  │  │ Browser  │ │  Panel   │ │            │ │   │
│  │  └────┬────┘ └────┬─────┘ └─────┬──────┘ │   │
│  │       │            │              │        │   │
│  │  ┌────┴────────────┴──────────────┴──────┐ │  │
│  │  │        MPR Viewer (Cornerstone3D)      │ │  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────────┐ │ │  │
│  │  │  │ Axial  │ │Sagittal│ │  Coronal   │ │ │  │
│  │  │  └────────┘ └────────┘ └────────────┘ │ │  │
│  │  └─────────────────┬──────────────────────┘ │  │
│  │                    │                         │  │
│  │  ┌─────────────────┴──────────────────────┐ │  │
│  │  │  ContourEngine  │  UndoRedoManager     │ │  │
│  │  │  MaskBuffer     │  CollaborationClient │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘ │
│                         │                          │
│  ┌──────────────────────┴──────────────────────┐  │
│  │           Zustand State Store                │  │
│  │  volumes[] │ structureSets[] │ uiState       │  │
│  └──────────────────────┬──────────────────────┘  │
└─────────────────────────┼─────────────────────────┘
                          │  DICOMweb / REST / WS
┌─────────────────────────┼─────────────────────────┐
│                   Backend Services                  │
│  ┌────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  Orthanc   │  │  API      │  │  AI Contour  │  │
│  │  DICOM     │  │  Gateway  │  │  Service     │  │
│  │  Server    │  │  (Node)   │  │  (Python+GPU)│  │
│  └────────────┘  └───────────┘  └──────────────┘  │
│  ┌────────────┐  ┌───────────┐                     │
│  │  Auth      │  │  Collab   │                     │
│  │  Service   │  │  Service  │                     │
│  └────────────┘  └───────────┘                     │
└────────────────────────────────────────────────────┘
```

### 5.3 Phase 1 API Endpoints

```
DICOM:
  GET    /api/dicom/patients                           — List patients
  GET    /api/dicom/studies/{studyUID}                  — Study details
  GET    /api/dicom/series/{seriesUID}/instances        — List instances
  GET    /api/dicom/wado-rs/studies/{uid}/series/{uid}  — Retrieve images

Structures:
  IndexedDB local draft auto-save                       — Browser-local editable structure draft
  STOW-RS /dicom-web/studies                            — Upload RTSTRUCT to DICOM repository
  POST   /api/structures/{structureSetId}/interpolate   — Trigger interpolation
  
AI:
  GET    /api/ai/models                                 — List available models
  POST   /api/ai/auto-contour                           — Run auto-segmentation (SSE)
  
Collaboration:
  WS     /ws/session/{sessionId}                        — WebSocket for real-time sync
  GET    /api/sessions/{sessionId}/history               — Change history
```

### 5.4 Phase 1 Deliverables Checklist

- [ ] DICOM viewer with MPR (axial, sagittal, coronal)
- [ ] Window/level presets and measurement tools
- [ ] Freehand, polygon, brush, eraser contour tools
- [ ] Smart contour (livewire) tool
- [ ] Slice interpolation
- [ ] Margin expansion tool
- [ ] Boolean operations on structures
- [ ] Undo/redo (50 levels)
- [ ] AI auto-segmentation integration
- [ ] Structure management panel (TG-263)
- [ ] Structure templates per treatment site
- [ ] Real-time collaboration (WebSocket + CRDT)
- [ ] DICOM import/export of RT Structure Set
- [ ] Patient browser

---

## 6. Phase 2 — Review Application (Months 5-7)

### 6.1 Core Features

#### 6.1.1 Dose Visualization

**Description**: Overlay calculated dose distributions on CT images with configurable isodose lines and colorwash.

**Features**:
- Isodose lines (customizable levels: 20%, 50%, 80%, 95%, 100%, 105%, 110%)
- Colorwash overlay with adjustable opacity and color map (rainbow, hot-cold, custom)
- Dose display in absolute (cGy/Gy) or relative (% of prescription)
- Dose profile along arbitrary line
- Point dose readout on hover
- 3D dose cloud rendering

**Technical Implementation**:
```
Frontend:
  - Load dose grid (DICOM RT Dose or computed) as Float32 volume
  - GPU-accelerated isodose rendering via Cornerstone3D segmentation overlay
  - Colorwash: custom fragment shader mapping dose values to colormap
  - Dose profile: sample dose along line → Recharts line chart
  
Key algorithms:
  - Trilinear interpolation for dose at arbitrary points
  - Marching squares for isodose contour extraction per slice
  - Transfer function editor for colorwash customization
```

**Key Files to Generate**:
```
src/
  core/
    dose/
      DoseVolumeLoader.ts       — Load/parse RT Dose DICOM
      DoseInterpolator.ts       — Trilinear interpolation in dose grid
      IsodoseExtractor.ts       — Marching squares for isodose lines
      ColorMapManager.ts        — Colorwash transfer functions
      DoseProfileSampler.ts     — Sample dose along arbitrary line
  components/
    dose/
      DoseOverlay.tsx           — Isodose/colorwash rendering controls
      IsodoseLevelEditor.tsx    — Configure isodose levels and colors
      DoseProfileChart.tsx      — Dose profile line chart
      DosePointReadout.tsx      — Hover dose display
      ColorMapEditor.tsx        — Transfer function editor
```

#### 6.1.2 DVH (Dose Volume Histogram)

**Description**: Compute and display cumulative and differential DVH curves for all structures.

**Features**:
- Cumulative DVH (standard clinical view)
- Differential DVH
- Interactive: hover to read Dx, Vx values
- DVH statistics table (Dmin, Dmax, Dmean, D95, D2, V100, etc.)
- Multi-plan DVH overlay for plan comparison
- DVH band (uncertainty visualization)
- Export DVH data as CSV

**Technical Implementation**:
```
  Computation (Web Worker):
    1. For each structure, iterate voxels in dose grid that fall within structure mask
    2. Build dose histogram (bin size: 0.1 cGy)
    3. Convert to cumulative DVH: cumsum from max dose downward
    4. Normalize volume axis to percentage
    5. Compute statistics from histogram
    
  Performance:
    - Structure mask stored as compressed run-length encoding
    - Dose grid sampling uses structure bounding box (skip empty regions)
    - Compute in Web Worker to keep UI responsive
    - Cache DVH until dose or structure changes
```

**Key Files to Generate**:
```
src/
  core/
    evaluation/
      DVHCalculator.ts          — DVH computation engine (Web Worker)
      DoseStatistics.ts         — Dx, Vx, min/max/mean calculations
      DVHComparator.ts          — Multi-plan DVH comparison
  components/
    evaluation/
      DVHChart.tsx              — Interactive DVH plot (Recharts/D3)
      DVHLegend.tsx             — Structure color legend
      DoseStatsTable.tsx        — Statistics table
      DVHExport.tsx             — CSV export button
```

#### 6.1.3 Plan Comparison

**Description**: Side-by-side or overlay comparison of multiple treatment plans.

**Features**:
- Side-by-side viewport layout (2-4 plans)
- Synchronized scroll/zoom/pan across plans
- Dose difference map (Plan A - Plan B)
- DVH overlay from multiple plans
- Statistics comparison table (delta values highlighted)
- Composite plan view (weighted sum of plans)

**Key Files to Generate**:
```
src/
  core/
    comparison/
      PlanComparator.ts         — Dose difference computation
      CompositePlanBuilder.ts   — Weighted plan summation
      SyncController.ts         — Viewport synchronization
  components/
    comparison/
      ComparisonLayout.tsx      — Multi-plan viewport grid
      DoseDifferenceOverlay.tsx — Dose subtraction visualization
      ComparisonTable.tsx       — Side-by-side statistics
      PlanSelector.tsx          — Choose plans to compare
```

#### 6.1.4 Protocol Compliance Checking

**Description**: Automated checking of dose constraints against clinical protocols (QUANTEC, institutional).

**Features**:
- Built-in protocol library (QUANTEC, RTOG, institutional templates)
- Custom protocol editor
- Traffic-light compliance display (pass/marginal/fail)
- Automatic constraint evaluation against DVH
- Protocol version tracking

**Key Files to Generate**:
```
src/
  core/
    protocols/
      ProtocolEngine.ts         — Evaluate dose vs. constraints
      ProtocolLibrary.ts        — Built-in protocol definitions
      ConstraintParser.ts       — Parse Dx < Y Gy, Vx < Y% format
  components/
    protocols/
      ProtocolPanel.tsx         — Protocol selection and results
      ConstraintRow.tsx         — Individual constraint with status
      ProtocolEditor.tsx        — Custom protocol creation
```

#### 6.1.5 Report Generation

**Description**: Generate clinical plan review reports as PDF or DOCX.

**Features**:
- Auto-populated plan summary (patient, prescription, beam config)
- DVH chart embedded in report
- Dose statistics table
- Isodose screenshots (axial, sagittal, coronal key slices)
- Protocol compliance summary
- Digital signature field for plan approval

**Key Files to Generate**:
```
src/
  core/
    reporting/
      ReportGenerator.ts        — Orchestrate report creation
      ScreenshotCapture.ts      — Capture viewport to PNG
      ReportTemplateEngine.ts   — Template system for reports
  components/
    reporting/
      ReportPreview.tsx         — Preview before export
      ReportSettings.tsx        — Configure report contents
```

### 6.2 Phase 2 Architecture Additions

```
New Frontend Modules:
  ┌───────────────────────────────────────────────┐
  │  ┌───────────┐ ┌──────────┐ ┌──────────────┐ │
  │  │   DVH     │ │  Plan    │ │  Protocol    │ │
  │  │   Engine  │ │  Compare │ │  Compliance  │ │
  │  │ (Worker)  │ │          │ │              │ │
  │  └───────────┘ └──────────┘ └──────────────┘ │
  │  ┌───────────┐ ┌──────────┐                   │
  │  │   Dose    │ │  Report  │                   │
  │  │   Render  │ │  Engine  │                   │
  │  └───────────┘ └──────────┘                   │
  └───────────────────────────────────────────────┘
  
New API Endpoints:
  GET    /api/plans/{planId}/dose          — Retrieve dose grid
  GET    /api/plans/{planId}/dvh           — Precomputed DVH (server cache)
  POST   /api/plans/compare               — Dose difference computation
  GET    /api/protocols                     — List available protocols
  POST   /api/reports/generate             — Generate PDF/DOCX report
```

### 6.3 Phase 2 Deliverables Checklist

- [ ] Dose colorwash overlay on MPR views
- [ ] Configurable isodose lines
- [ ] Dose profile tool
- [ ] Point dose readout
- [ ] Cumulative and differential DVH
- [ ] Interactive DVH (Dx, Vx readout)
- [ ] DVH statistics table
- [ ] Multi-plan DVH comparison
- [ ] Side-by-side plan comparison layout
- [ ] Dose difference map
- [ ] Protocol compliance engine (QUANTEC built-in)
- [ ] Custom protocol editor
- [ ] PDF/DOCX report generation
- [ ] Digital approval workflow

---

## 7. Phase 3 — Planning Application (Months 8-14)

### 7.1 Core Features

#### 7.1.1 Beam Geometry Editor

**Description**: Interactive 3D beam setup with BEV (Beam's Eye View) and room view.

**Features**:
- 3D room view showing patient, beams, gantry, couch
- BEV (Beam's Eye View) for each beam showing MLC, field aperture, structures
- Interactive gantry/collimator/couch angle adjustment (drag or numeric)
- Isocenter placement (click on CT or enter coordinates)
- Beam templates (common setups: 5-field, 7-field, 2-arc VMAT)
- SSD/depth display
- DRR (Digitally Reconstructed Radiograph) generation

**Technical Implementation**:
```
Frontend:
  - VTK.js for 3D scene rendering
  - Custom beam geometry actors (cone, MLC leaves, collimator jaws)
  - DRR: ray-casting through CT volume using WebGL compute shader
  - BEV: project structure contours along beam direction onto MLC plane
  
  Scene graph:
    Room → Gantry (rotatable) → Beam Head → MLC → Field
    Room → Couch (rotatable) → Patient Volume + Structures
    Room → Isocenter Marker
```

**Key Files to Generate**:
```
src/
  core/
    planning/
      BeamGeometry.ts           — Beam definition and transforms
      GantryModel.ts            — Gantry rotation math
      MLCModel.ts               — MLC leaf position calculations
      DRRGenerator.ts           — Ray-casting DRR engine
      IsocenterManager.ts       — Isocenter placement logic
      BeamTemplates.ts          — Common beam arrangement templates
  components/
    planning/
      RoomView3D.tsx            — 3D scene with VTK.js
      BeamEyeView.tsx           — BEV viewport
      BeamList.tsx              — Beam table with angle inputs
      BeamControls.tsx          — Gantry/coll/couch sliders
      MLCEditor.tsx             — Manual MLC leaf adjustment
```

#### 7.1.2 Optimization Engine

**Description**: Inverse treatment planning optimization for IMRT and VMAT.

**Features**:
- Objective function editor (dose objectives per structure)
- Constraint types: min/max dose, mean dose, DVH constraints, dose falloff
- Multi-criteria optimization (MCO) — explore Pareto-optimal trade-offs
- VMAT arc optimization (control point spacing, MLC constraints)
- Real-time DVH update during optimization
- Optimization presets per treatment site

**Technical Implementation**:
```
Server (GPU-accelerated):
  - Fluence map optimization:
    1. Initialize uniform fluence per beam
    2. Forward dose calculation (dose influence matrix)
    3. Compute objective function gradient
    4. L-BFGS-B or gradient descent update
    5. Project to deliverable MLC sequences
    6. Repeat until convergence
    
  - VMAT optimization:
    1. Direct aperture optimization (DAO)
    2. Simultaneous optimization of MLC positions + gantry speed + dose rate
    3. Deliverability constraints (max leaf speed, leaf gap)

Client:
  - Streaming optimization progress via SSE
  - Live DVH update every N iterations
  - Interactive objective weight adjustment (MCO sliders)
```

**Key Files to Generate**:
```
src/
  core/
    optimization/
      ObjectiveFunction.ts      — Objective/constraint definitions
      OptimizationClient.ts     — API client, progress streaming
      MCOExplorer.ts            — Multi-criteria Pareto navigation
  components/
    optimization/
      ObjectiveEditor.tsx       — Per-structure objective table
      OptimizationControls.tsx  — Start/stop, iteration display
      MCOSliders.tsx            — Pareto trade-off sliders
      ConvergencePlot.tsx       — Objective function vs. iteration
      
server/
  services/
    optimization/
      optimizer.py              — Main optimization loop
      objective_functions.py    — Objective/constraint math
      fluence_optimizer.py      — Fluence map optimization
      dao_optimizer.py          — Direct aperture optimization
      mlc_sequencer.py          — Fluence → MLC leaf sequence
      dose_influence_matrix.py  — Sparse dose influence computation
```

#### 7.1.3 Dose Calculation Engine

**Description**: Compute 3D dose distribution from beam configuration. Support multiple algorithms with accuracy/speed trade-offs.

**Algorithms**:

| Algorithm | Accuracy | Speed | Use Case |
|-----------|----------|-------|----------|
| Pencil Beam | Low-Medium | Fast (seconds) | Quick preview during planning |
| Collapsed Cone Convolution | Medium-High | Moderate (minutes) | Clinical standard for photon |
| Monte Carlo | Highest | Slow (minutes-hours) | Gold standard, required for heterogeneities |

**Technical Implementation**:
```
Hybrid approach:
  - Pencil Beam: Run in-browser via WASM for instant preview
  - Collapsed Cone: Server-side C++ with multithreading
  - Monte Carlo: Server-side C++/CUDA on GPU cluster
  
Pencil Beam (WASM):
  - Compile C kernel to WASM via Emscripten
  - Input: CT volume (electron density), beam geometry
  - Ray trace through volume, apply depth-dose + off-axis profiles
  - Output: 3D dose grid
  
Monte Carlo (Server):
  - Particle transport simulation (photon + electron)
  - GPU-accelerated using CUDA (millions of histories/second)
  - Variance reduction techniques (photon splitting, Russian roulette)
  - Statistical uncertainty target: <2% in high-dose region
  
API:
  POST /api/dose/calculate
  Body: { planId, algorithm: "pencil_beam" | "collapsed_cone" | "monte_carlo",
          doseGridSpacing: [2.5, 2.5, 2.5], uncertaintyTarget: 0.02 }
  Response: SSE streaming progress → final dose grid URL
```

**Key Files to Generate**:
```
src/
  core/
    dose_calc/
      DoseCalcClient.ts         — API client for dose calculation
      PencilBeamWASM.ts         — In-browser pencil beam via WASM
      DoseGridManager.ts        — Dose grid load/store/interpolate
  
server/
  services/
    dose_calculation/
      pencil_beam.cpp/.py       — Pencil beam algorithm
      collapsed_cone.cpp        — Collapsed cone convolution/superposition
      monte_carlo.cpp           — Monte Carlo transport engine
      ct_to_density.py          — CT HU → electron density conversion
      beam_model.py             — Machine beam model parameters
      dose_grid_manager.py      — Dose grid I/O and resampling
```

#### 7.1.4 MLC Modeling

**Description**: Accurate multi-leaf collimator modeling for plan deliverability.

**Features**:
- Support for common MLC types (Varian Millennium 120, Elekta Agility 160)
- Leaf position constraints (max travel, interdigitation rules, min gap)
- Tongue-and-groove effect modeling
- Rounded leaf-end transmission
- Leaf sequencing (sliding window, step-and-shoot)

**Key Files to Generate**:
```
src/
  core/
    mlc/
      MLCGeometry.ts            — MLC leaf geometry definitions
      LeafSequencer.ts          — Fluence → leaf sequence conversion
      DeliverabilityChecker.ts  — Validate against machine constraints
      
server/
  services/
    mlc/
      mlc_models.py             — MLC type definitions and constraints
      leaf_sequencer.py         — Sliding window / step-and-shoot
      deliverability.py         — Machine constraint validation
```

#### 7.1.5 DICOM-RT Export

**Description**: Export completed plans as DICOM-RT objects for delivery to the linac.

**Export Objects**:
- RT Structure Set (contours)
- RT Plan (beam geometry, MLC positions, MU)
- RT Dose (3D dose grid)
- RT Image (DRR)

**Technical Implementation**:
```
  - Generate DICOM objects using dcmjs (JavaScript) or pydicom (server)
  - Enforce DICOM conformance: proper UIDs, references, sequences
  - IHE-RO (Integrating the Healthcare Enterprise - Radiation Oncology) profile compliance
  - Export to file download or push to DICOM destination (C-STORE)
```

**Key Files to Generate**:
```
src/
  core/
    export/
      DicomRTExporter.ts        — Orchestrate DICOM-RT export
      RTStructWriter.ts         — Generate RT Structure Set
      RTPlanWriter.ts           — Generate RT Plan
      RTDoseWriter.ts           — Generate RT Dose
      DicomUIDGenerator.ts      — Generate DICOM UIDs
      
server/
  services/
    export/
      dicom_export_service.py   — Server-side DICOM generation
      dicom_send.py             — C-STORE to PACS/OIS
```

### 7.2 Phase 3 Architecture Additions

```
New compute tier:
  ┌──────────────────────────────────────────────┐
  │              GPU Compute Cluster               │
  │  ┌──────────────┐  ┌───────────────────────┐  │
  │  │ Monte Carlo  │  │  Optimization Engine  │  │
  │  │ Dose Engine  │  │  (Fluence + DAO)      │  │
  │  │ (CUDA)       │  │  (CUDA)               │  │
  │  └──────────────┘  └───────────────────────┘  │
  │  ┌──────────────┐  ┌───────────────────────┐  │
  │  │ Collapsed    │  │  Job Queue (Redis)    │  │
  │  │ Cone Engine  │  │  + Worker Pool        │  │
  │  └──────────────┘  └───────────────────────┘  │
  └──────────────────────────────────────────────┘

New API Endpoints:
  POST   /api/plans                        — Create new plan
  PUT    /api/plans/{planId}               — Update plan
  POST   /api/plans/{planId}/optimize      — Start optimization (SSE)
  POST   /api/plans/{planId}/calculate     — Start dose calc (SSE)
  GET    /api/plans/{planId}/status        — Optimization/calc status
  POST   /api/plans/{planId}/approve       — Approve plan (digital sig)
  POST   /api/export/dicom-rt             — Export DICOM-RT objects
  GET    /api/machines                     — Available linac models
  GET    /api/machines/{id}/beam-models    — Beam model parameters
```

### 7.3 Phase 3 Deliverables Checklist

- [ ] 3D room view with beam geometry
- [ ] Beam's Eye View (BEV) with MLC overlay
- [ ] Interactive beam setup (gantry/coll/couch angles)
- [ ] Beam arrangement templates
- [ ] DRR generation
- [ ] Objective function editor
- [ ] IMRT inverse optimization
- [ ] VMAT arc optimization
- [ ] Multi-criteria optimization (MCO)
- [ ] Pencil beam dose calc (in-browser WASM)
- [ ] Collapsed cone dose calc (server)
- [ ] Monte Carlo dose calc (GPU server)
- [ ] MLC modeling (Varian/Elekta)
- [ ] Leaf sequencing
- [ ] DICOM-RT export (RT SS, RT Plan, RT Dose)
- [ ] Plan approval workflow with digital signature

---

## 8. Cross-Cutting Concerns

### 8.1 Authentication and Authorization

```
  - HIPAA-compliant authentication (Keycloak / Auth0)
  - Role-Based Access Control:
      Physicist:     full access (plan, approve, export)
      Physician:     contour, review, approve
      Dosimetrist:   contour, plan (no approve)
      Resident:      view-only + contour (supervised)
  - Audit trail for all clinical actions
  - Session timeout and re-authentication for sensitive operations
```

### 8.2 Data Security

```
  - TLS 1.3 for all network communication
  - AES-256 encryption at rest for DICOM data
  - Patient data de-identification tools
  - DICOM Anonymization service
  - No PHI in browser localStorage/sessionStorage
  - Secure WebSocket (WSS) for collaboration
```

### 8.3 Performance Targets

| Operation | Target | Approach |
|-----------|--------|----------|
| CT volume load (512x512x200) | <5s | Progressive streaming, WebGL texture upload |
| Contour drawing latency | <16ms (60fps) | GPU-accelerated rendering, minimal state updates |
| Slice scroll | <50ms | Pre-decoded slice buffer (ahead/behind cursor) |
| DVH computation (20 structures) | <3s | Web Worker, RLE-compressed masks |
| Pencil beam dose calc | <30s | WASM in browser |
| Monte Carlo dose calc | <10min | GPU server cluster |
| Optimization (VMAT 2-arc) | <15min | GPU-accelerated, progressive DVH updates |

### 8.4 Testing Strategy

```
Unit Tests:
  - Core algorithms: contour interpolation, DVH calculation, dose interpolation
  - Data model: structure CRUD, plan validation
  - DICOM parsing: round-trip read/write of RT objects

Integration Tests:
  - Full workflow: import → contour → plan → calculate → export
  - Collaboration: concurrent editing conflict resolution
  - AI: auto-contour pipeline end-to-end

End-to-End Tests:
  - Cypress/Playwright browser tests for critical workflows
  - DICOM conformance testing against standard test datasets
  - Dose calculation benchmarking against published data (AAPM TG reports)
```

### 8.5 Project Structure

```
web-tps/
├── apps/
│   ├── client/                    — React frontend application
│   │   ├── src/
│   │   │   ├── core/             — Business logic (no UI dependencies)
│   │   │   │   ├── dicom/        — DICOM loading and parsing
│   │   │   │   ├── rendering/    — Viewport and rendering engine
│   │   │   │   ├── contouring/   — Contour manipulation algorithms
│   │   │   │   ├── structures/   — Structure set management
│   │   │   │   ├── ai/           — AI auto-contour client
│   │   │   │   ├── dose/         — Dose visualization
│   │   │   │   ├── evaluation/   — DVH, statistics, protocols
│   │   │   │   ├── planning/     — Beam geometry, optimization client
│   │   │   │   ├── comparison/   — Plan comparison
│   │   │   │   ├── export/       — DICOM-RT export
│   │   │   │   ├── collaboration/— Real-time sync
│   │   │   │   ├── mlc/          — MLC modeling
│   │   │   │   ├── dose_calc/    — In-browser dose calc (WASM)
│   │   │   │   ├── optimization/ — Optimization client
│   │   │   │   ├── protocols/    — Protocol compliance
│   │   │   │   ├── reporting/    — Report generation
│   │   │   │   └── store/        — Zustand state stores
│   │   │   ├── components/       — React UI components
│   │   │   │   ├── viewer/       — Image viewer components
│   │   │   │   ├── contouring/   — Contouring tool UI
│   │   │   │   ├── structures/   — Structure management UI
│   │   │   │   ├── ai/           — AI panel UI
│   │   │   │   ├── dose/         — Dose overlay UI
│   │   │   │   ├── evaluation/   — DVH and stats UI
│   │   │   │   ├── planning/     — Beam setup UI
│   │   │   │   ├── comparison/   — Plan comparison UI
│   │   │   │   ├── protocols/    — Protocol compliance UI
│   │   │   │   ├── reporting/    — Report UI
│   │   │   │   ├── optimization/ — Optimization UI
│   │   │   │   └── common/       — Shared UI components
│   │   │   ├── workers/          — Web Workers
│   │   │   │   ├── dvh.worker.ts
│   │   │   │   ├── mesh.worker.ts
│   │   │   │   └── dose.worker.ts
│   │   │   ├── wasm/             — WASM modules
│   │   │   │   ├── pencil_beam/
│   │   │   │   └── contour_ops/
│   │   │   └── App.tsx
│   │   ├── public/
│   │   └── package.json
│   │
│   └── server/                    — Backend services
│       ├── gateway/               — Node.js API gateway
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── websocket/
│       ├── services/
│       │   ├── ai/               — Python: auto-contour inference
│       │   ├── dose_calculation/ — C++/Python: dose engines
│       │   ├── optimization/     — C++/Python: plan optimization
│       │   ├── export/           — Python: DICOM-RT generation
│       │   ├── collaboration/    — Node.js: real-time sync
│       │   └── mlc/              — Python: MLC modeling
│       ├── models/               — Database models
│       ├── config/               — Server configuration
│       └── docker-compose.yml
│
├── packages/
│   ├── dicom-utils/              — Shared DICOM utilities
│   ├── math-utils/               — Shared math (interpolation, transforms)
│   └── types/                    — Shared TypeScript types
│
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
│
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   └── deployment.md
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 9. Implementation Priority Matrix

| Priority | Feature | Phase | Complexity | Dependencies |
|----------|---------|-------|------------|-------------|
| P0 | DICOM image viewer (MPR) | 1 | Medium | Cornerstone3D setup |
| P0 | Manual contour tools (draw, brush, polygon) | 1 | High | Viewer complete |
| P0 | Structure management | 1 | Low | Data model |
| P1 | Slice interpolation | 1 | Medium | Contour tools |
| P1 | AI auto-segmentation | 1 | High | Server GPU + model |
| P1 | Undo/redo | 1 | Medium | Contour engine |
| P2 | Collaboration | 1 | High | WebSocket infra |
| P0 | Dose overlay (isodose + colorwash) | 2 | Medium | Viewer + dose loader |
| P0 | DVH computation and display | 2 | Medium | Dose + structures |
| P1 | Plan comparison | 2 | Medium | DVH engine |
| P1 | Protocol compliance | 2 | Low | DVH statistics |
| P2 | Report generation | 2 | Medium | All review features |
| P0 | Beam geometry editor | 3 | High | VTK.js 3D scene |
| P0 | Dose calculation (pencil beam) | 3 | High | Beam model + WASM |
| P0 | IMRT optimization | 3 | Very High | Dose engine + GPU server |
| P1 | VMAT optimization | 3 | Very High | IMRT optimization |
| P1 | Monte Carlo dose | 3 | Very High | CUDA GPU cluster |
| P1 | MLC modeling | 3 | High | Machine models |
| P0 | DICOM-RT export | 3 | Medium | All plan data |
| P2 | Multi-criteria optimization | 3 | High | Optimization engine |

---

## 10. Research References

- [Treatment Planning Systems Overview — ITN Online](https://www.itnonline.com/article/treatment-planning-systems-overview)
- [Treatment Planning System Basics — OncologyMedicalPhysics.com](https://oncologymedicalphysics.com/introduction-to-treatment-planning-systems/)
- [Desargues Cloud TPS: Cloud-Based Automatic Radiation Treatment Planning — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12888112/)
- [Toward a Web-Based Real-Time Radiation Treatment Planning System in a Cloud Computing Environment — PubMed](https://pubmed.ncbi.nlm.nih.gov/24002571/)
- [OpenTPS: Open-Source TPS for Research in Proton Therapy — arXiv](https://arxiv.org/abs/2303.00365)
- [OHIF Viewer Documentation](https://docs.ohif.org/)
- [Cornerstone3D — cornerstonejs.org](https://www.cornerstonejs.org/)
- [OHIF Extension for DICOM-RT — npm](https://www.npmjs.com/package/@ohif/extension-cornerstone-dicom-rt)
- [PortPy: Open-Source Python for Cancer Radiation Treatment Planning — GitHub](https://github.com/PortPy-Project/PortPy)
- [Evaluating Monaco 6.2.2 in Complex Radiotherapy — Springer](https://link.springer.com/article/10.1007/s13246-025-01602-5)
