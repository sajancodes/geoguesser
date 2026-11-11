# System Architecture Overview — Earth Uncovered

## 1. Architectural Principles

Earth Uncovered is engineered around four strict boundaries:
1. **Hybrid 3-Layer World Representation**:
   - **Layer A (Photorealistic Reconstruction)**: Instanced 3D Gaussian Splat clouds (`.splat` / compressed splat buffers) paired with high-detail architectural and street-furniture meshes that reproduce surface micro-texture, foliage, road markings, and signage.
   - **Layer B (Physical Geometry)**: Invisible and structural collision proxies (walkable road ribbons, curb heightfields, building AABB/polygon bounds, bollards, and street obstacles) queried by the capsule physics solver.
   - **Layer C (Geographic Structure)**: WGS84 geodetic metadata, road vectors, building footprints, elevation contours, and directional landmarks anchored to a local East-North-Up (ENU) origin.
2. **Decoupled 60 FPS Simulation & Rendering**:
   - The 3D engine (`WorldEngine`) owns its own `WebGLRenderer`, scene graph, `ChunkStreamingManager`, and `FirstPersonController`.
   - React never manages per-frame state. Telemetry updates are throttled to `4 Hz` (`250 ms`) or written via direct DOM refs.
3. **Bounded Streaming & Resource Discipline**:
   - The world is partitioned into hierarchical Quadtree chunks (`LOD 0` high detail within `35 m`, `LOD 1` medium detail `35–85 m`, `LOD 2` coarse detail `85–180 m`).
   - Every chunk request uses an `AbortController` so rapid camera rotation or directional changes cancel in-flight network transfers immediately.
   - Evicted chunks invoke deterministic `.dispose()` calls on all GPU geometries and materials.
4. **Server-Authoritative Gameplay & Secret Coordinates**:
   - During active guessing rounds, the backend issues an anonymized `roundId` and streams chunk geometry in local ENU meters without exposing the global WGS84 latitude/longitude in network payloads until the player submits a guess to `/api/game/guess`.

## 2. Monorepo Module Layout

```text
/
├── server.ts                                 # Express API: chunk streaming, coverage DB, session & geodesic scoring
├── src/
│   ├── packages/
│   │   ├── shared-types/                     # Strict TypeScript interfaces across engine, API, and UI
│   │   ├── geographic-index/                 # WGS84 <-> ECEF <-> ENU math, Vincenty geodesic, Quadtree & H3 indexing
│   │   ├── coverage/                         # Coverage registry, 6-layer tracking, and Eligibility Validation Service
│   │   ├── streaming/                        # 12-step Quadtree chunk streamer, priority queue (P0-P4), LRU GPU cache
│   │   ├── splat-renderer/                   # Instanced 3D Gaussian Splat shader, binary .splat/.ply parser & generator
│   │   ├── physics/                          # Capsule first-person controller, ground heightfield & obstacle solver
│   │   ├── rendering/                        # Capability detector (WebGPU/WebGL2/SoftwareGL), PBR scene builder, adaptive governor
│   │   ├── world-engine/                     # Unified 3D engine lifecycle, living environment simulation, audio synth
│   │   └── game-logic/                       # Round state machine, modes (Classic, Explorer, No-Move, Country, Duel)
│   └── components/                           # Restrained dark-neutral engineering UI (Title, HUD, GuessMap, Results, Inspector)
└── docs/                                     # Architecture, streaming, coordinate system, pipeline, and benchmark docs
```
