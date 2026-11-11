# Engineering Roadmap & Phase Status — Earth Uncovered

## Phase 0 — Repository Inspection & Architecture Planning (Completed)
- Audited existing Vite + React + TypeScript + Express setup.
- Evaluated rendering engines (Three.js vs. PlayCanvas vs. CesiumJS), 3D Gaussian Splatting pipelines, and spatial indexing systems (Quadtree + H3).
- Documented technology decisions, coordinate transformations, and streaming architecture under `/docs/`.

## Phase 1 — Real 3D Prototype (Completed)
- Built hybrid 3D scene engine combining instanced 3D Gaussian Splat clouds (`.splat` binary buffers) and Studio PBR architectural/street-level geometry with `RoomEnvironment` reflections and `ACESFilmicToneMapping`.
- Implemented capsule-based first-person controller with WASD + Sprint, Pointer Lock + drag mouse look, mobile virtual joystick + touch look, ground heightfield tracking, and obstacle/building collision resolution.
- Implemented live `.splat` / `.ply` binary ingestion inspector so external photogrammetry captures can be validated and explored in real time.

## Phase 2 — World Streaming Engine (Completed)
- Built hierarchical Quadtree chunk manager with Screen-Space Error (SSE) LOD (`LOD 0`, `LOD 1`, `LOD 2`), `P0..P4` priority queue, `AbortController` request cancellation, asynchronous binary decoding, and bounded LRU GPU memory cache.

## Phase 3 — Geographic Foundation & Coverage Eligibility (Completed)
- Implemented WGS84 <-> ECEF <-> Local ENU coordinate transformations, deterministic H3 cell indexing, and the 6-layer Coverage Database with `CoverageEligibilityService` validation.

## Phase 4 — Single-Player Game Modes & Server-Authoritative Geodesic Scoring (Completed)
- Implemented Classic Mode (timed), Explorer Mode (unlimited with live coordinate & chunk telemetry), No Movement Mode (locked position, pan-only), and Country Challenge.
- Built server-authoritative session and guess evaluation (`/api/game/session`, `/api/game/guess`) keeping target coordinates secret until guess submission, using Vincenty ellipsoid geodesic distance and `S = 5000 * exp(-d/k)`.
- Integrated Google Maps Platform (`@vis.gl/react-google-maps` with `AdvancedMarker`) and an offline-resilient interactive geodesic world map fallback.

## Phase 5 & 6 — Living Environment & Multiplayer Foundation (Initial Subsystem Active / Scoped)
- Deterministic lightweight ambient simulation (wind-driven foliage, procedural street audio synth, dynamic sun elevation lighting) is integrated into the world engine with a reduced-effects toggle.
- Server-synchronized Duel Seed mode allows two players to share a deterministic round seed code for head-to-head comparison; persistent PostgreSQL/PostGIS + Redis cluster deployment is documented for multi-region production scaling.
