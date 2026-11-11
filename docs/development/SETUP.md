# Development Setup & Verification — Earth Uncovered

## 1. Local Development

```bash
# Start full-stack Express + Vite server on port 3000
npm run dev

# Run deterministic unit test suite (Coordinate math, Quadtree streaming, Geodesic scoring, Splat binary parser)
npx --yes tsx --test src/packages/geographic-index/coordinates.test.ts
npx --yes tsx --test src/packages/game-logic/scoring.test.ts
npx --yes tsx --test src/packages/streaming/chunkCache.test.ts
npx --yes tsx --test src/packages/splat-renderer/splatBinary.test.ts

# Typecheck & production build
npm run lint
npm run build
```

## 2. Repeatable Testing Procedure

1. **Unit & Geodesic Math Verification**: Run the `node:test` suites to verify WGS84 <-> ECEF <-> ENU round-trip accuracy (`< 1 mm` error), Vincenty geodesic distance against known reference geodesics, LRU cache byte-budget eviction, and `.splat` binary serialization/deserialization.
2. **WebGPU / WebGL2 / Software-WebGL Fallback**: Verify that `detectGraphicsCapabilities()` cleanly detects WebGPU, WebGL2, and headless software rasterizers (`SwiftShader` / `llvmpipe`) and configures frame pacing accordingly.
3. **Request Cancellation & Offline Resilience**: Move rapidly across chunk boundaries or trigger simulated network interruption in the Streaming Inspector to verify `AbortController` cancellation and graceful fallback to cached coarse LOD chunks.
