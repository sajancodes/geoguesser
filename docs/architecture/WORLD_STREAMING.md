# World Streaming Engine — Earth Uncovered

## 1. Hierarchical Geographic Chunking

Earth Uncovered never loads an entire city or planet into browser memory. Each reconstructable region is rooted at a local ENU origin and subdivided into a hierarchical **Quadtree** for rendering and indexed by **H3** cells for global coverage lookup.

Each `WorldChunkDescriptor` contains:
- `chunkId`: Deterministic hierarchical identifier (`<locationId>:L<lod>:X<qx>:Z<qz>`).
- `parentId` and `childIds`: Quadtree lineage links.
- `boundsWGS84`: `{ minLat, maxLat, minLon, maxLon }`.
- `boundingBoxENU`: `{ minEast, maxEast, minNorth, maxNorth, minUp, maxUp }` in local meters.
- `lodLevel`: `0` (street-level high density), `1` (intermediate block), `2` (horizon silhouette).
- `assetManifest`: URLs, byte sizes, compression flags (`SOG-quantized` / `raw-splat-32b`), SHA-256 version hashes, and quality scores.

## 2. The 12-Step Dynamic Streaming Sequence

On every movement tick (`>= 1.5 m` translation or `>= 8 deg` camera yaw delta), `ChunkStreamingManager.update()` executes:

1. **Detect Geographic Position**: Convert player ENU coordinates `(east, north, up)` to geodetic WGS84 `(lat, lon, elevation)`.
2. **Determine Camera Frustum**: Extract the 6 frustum planes from `camera.projectionMatrix * camera.matrixWorldInverse`.
3. **Identify Visible Chunks**: Test quadtree chunk AABBs against the view frustum.
4. **Identify Nearby & Predictive Chunks**: Compute player velocity vector and include chunks within the immediate radius and forward movement cone.
5. **Prioritize Assets (`P0` – `P4`)**:
   - `P0`: Current street chunk containing the player capsule (`dist < 25 m`).
   - `P1`: Immediately adjacent visible chunks (`dist < 55 m`, inside frustum).
   - `P2`: Chunks ahead in the player's movement velocity vector (`dot(vel, toChunk) > 0.35`).
   - `P3`: Visible distant environment chunks (`LOD 1` / `LOD 2`).
   - `P4`: Background prefetch chunks outside current frustum (`dist < 45 m`).
6. **Check Bounded Local Cache**: Query `BoundedChunkCache` (keyed by `chunkId@assetVersion`).
7. **Download Missing Assets**: Dispatch cancellable `fetch` requests with `AbortController`. If a chunk leaves priority range before download completes, `controller.abort()` terminates the transfer.
8. **Asynchronous Decoding**: Parse binary `.splat` records (position `3x float32`, scale `3x float32`, color `4x uint8`, rotation quaternion `4x uint8`) off the critical render path.
9. **Upload to GPU**: Populate `InstancedBufferGeometry` attributes and static collision meshes within the per-frame upload budget.
10. **Progressive LOD Replacement**: Calculate Screen-Space Error (`SSE = (geometricError * viewportHeight) / (distance * 2 * tan(fov/2))`) and swap coarse parent chunks for `LOD 0` child chunks seamlessly.
11. **Obsolete Resource Cleanup**: Detach out-of-range chunks from the scene graph.
12. **Bounded Cache Eviction**: Evict lowest-priority LRU entries when total memory exceeds the active profile's byte budget (`64 MB` / `160 MB` / `320 MB`), invoking `.dispose()` on all WebGL buffers.
