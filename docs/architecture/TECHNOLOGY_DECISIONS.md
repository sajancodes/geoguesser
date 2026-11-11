# Technology Decisions — Earth Uncovered

## 1. Architecture Selection Comparison

Before selecting the core rendering and streaming stack for **Earth Uncovered**, three primary architectural candidates were evaluated against our non-negotiable requirements: browser-first accessibility on integrated GPUs and mobile devices, hybrid 3D Gaussian Splat + physical collision representation, bounded memory budgets, and progressive spatial streaming.

### Approach A: Three.js + Custom Geographic Streaming + Custom Gaussian Splat & PBR Hybrid Renderer (Selected)
- **Overview**: Uses Three.js (`r187`) with WebGPU capability detection and WebGL2 fallback, paired with a dedicated local East-North-Up (ENU) coordinate origin per scene, a custom instanced 3D Gaussian Splat shader pipeline, simplified physical collision meshes, and a hierarchical Quadtree + H3 geographic chunk streamer.
- **Pros**:
  - Complete control over GPU memory budgets, buffer disposal (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`), and draw-call batching.
  - Native support for instanced covariance-projected Gaussian Splat rendering alongside standard PBR geometry (`MeshStandardMaterial` with `RoomEnvironment` PMREM lighting) in a single shared depth buffer.
  - Zero floating-point jitter because all local rendering and capsule collision run in local ENU meters centered on the active chunk origin rather than raw ECEF (`~6.37e6` m) coordinates.
  - Small bundle footprint and deterministic performance scaling across `PERFORMANCE`, `BALANCED`, and `QUALITY` profiles, including software-WebGL (`SwiftShader`/`llvmpipe`) headless environments.
- **Cons**:
  - Requires custom implementation of WGS84 <-> ECEF <-> ENU projection math, Quadtree SSE (Screen-Space Error) traversal, and binary `.splat`/`.ply` chunk decoding.

### Approach B: PlayCanvas Engine + SuperSplat-Based Rendering + Custom Geographic Streaming
- **Overview**: Uses the PlayCanvas runtime and its compressed Gaussian Splat container formats (SOG / `.ply`), layered with a custom geographic tile loader.
- **Pros**:
  - PlayCanvas has strong built-in Gaussian Splat sorting and SOG compression tooling (`SuperSplat`).
- **Cons**:
  - PlayCanvas is a full scene-graph game engine with its own asset registry lifecycle that is less idiomatic to embed inside a modular TypeScript monorepo alongside custom geospatial quadtree streaming and React UI overlays without introducing dual lifecycle state.

### Approach C: CesiumJS + OGC 3D Tiles + Custom Street-Level Renderer
- **Overview**: Uses CesiumJS for global WGS84 ellipsoid rendering and OGC 3D Tiles streaming, augmented with a street-level first-person controller.
- **Pros**:
  - Built-in WGS84 globe, ECEF coordinate handling, and OGC 3D Tiles (`tileset.json`) hierarchical LOD traversal.
- **Cons**:
  - Heavy runtime footprint (`>3 MB` workers and shaders) designed primarily for orbital-to-aerial visualization rather than 60 FPS street-level first-person capsule navigation on integrated laptops and mobile browsers.
  - Gaussian Splatting (`KHR_gaussian_splatting` / custom splat primitives) and tight street-level capsule collision proxies require awkward dual-engine synchronization or heavy overrides of Cesium's frustum/depth planes.

---

## 2. Selected Technology Stack

| Subsystem | Selected Technology | License | Reason for Selection |
| :--- | :--- | :--- | :--- |
| **3D Rendering Engine** | `three` (`^0.187.0`) with WebGPU detection & WebGL2 renderer | MIT | Lightweight, deterministic GPU resource disposal, shared depth buffer between instanced 3D Gaussian Splats and physical collision/PBR geometry. |
| **Gaussian Splat Layer** | Custom Instanced 3D Gaussian Splat Shader + `.splat` / `.ply` Binary Decoder | MIT | Renders anisotropic 3D Gaussians sorted/blended with screen-space covariance projection and supports streaming chunk load/unload and user file ingestion. |
| **Spatial Indexing** | Hierarchical Quadtree (rendering LOD) + H3 Hexagonal Grid (coverage management) | Apache-2.0 / MIT | Quadtrees align naturally with frustum culling and Screen-Space Error (SSE) LOD; H3 cells organize coverage density and eligibility scoring. |
| **Coordinate Reference** | WGS84 (Global) -> ECEF (Geocentric) -> Local ENU (Scene & Physics) | Standard | Eliminates 32-bit float precision jitter on the GPU while preserving sub-centimeter geodetic accuracy. |
| **First-Person Physics** | Custom Capsule Controller + AABB / Cylinder / Ground Heightfield Solver | MIT | Zero WASM startup overhead, deterministic frame-rate-independent movement (`Math.min(dt, 0.05)`), prevents wall clipping and ground floating. |
| **World Guess Map** | `@vis.gl/react-google-maps` + Maps JavaScript API (`AdvancedMarker`) + Offline Geodesic Fallback Canvas | Apache-2.0 | Official modern React SDK for Google Maps Platform with zero legacy APIs and offline/headless resilience. |
| **Backend & Scoring** | Node.js + Express (`server.ts`) + Vincenty Ellipsoid Geodesic Distance | MIT | Server-authoritative round state keeps target coordinates hidden until guess submission and validates scores (`S = 5000 * exp(-d/k)`). |
| **Deep Geospatial Analysis** | `@google/genai` (`gemini-4-carbon` with `ThinkingLevel.HIGH`) | Apache-2.0 | Server-side post-round architectural, botanical, and geomorphological clue analysis. |

---

## 3. Known Limitations & Honest Platform Boundaries

1. **Photorealistic Coverage Scope**: The entire planet is not pre-reconstructed in street-level 3D Gaussian Splats. The Coverage Database tracks exact per-location coverage across 6 layers (Geographic, Terrain, Road, Building, Photorealistic Splat, Collision). Only locations passing the `CoverageEligibilityService` threshold (`visualQuality >= 80`, `navigationQuality >= 85`, verified spawn point and collision proxies) enter playable game rounds.
2. **External Raw Capture Datasets**: Because multi-gigabyte raw COLMAP/Nerfstudio `.ply` captures cannot be bundled inside a lightweight git repository, Earth Uncovered ships with:
   - **Geographically surveyed multi-chunk hybrid reconstructions** (combining real WGS84 coordinates, real local street topology, real local road signage/markings, PBR architectural facades, and procedural/surveyed binary Gaussian Splat chunk streams served from `/api/world/chunks/:locationId/:chunkId.splat`).
   - **Live `.splat` / `.ply` Binary Asset Ingestion**: Users and geospatial engineers can load standard `.splat` (32 bytes/splat) or `.ply` Gaussian Splat files directly into the engine at runtime via the Ingestion Inspector.
3. **Browser Compatibility & GPU Memory Measurement**: Browsers do not expose exact VRAM counters across all vendors. The `PerformanceGovernor` measures rolling frame-time percentiles (`p50`, `p95`, `p99`) and tracks exact allocated buffer/texture byte counts against conservative profile budgets (`PERFORMANCE`: 64 MB, `BALANCED`: 160 MB, `QUALITY`: 320 MB), automatically downgrading resolution scale and splat density when frame times exceed budget.
