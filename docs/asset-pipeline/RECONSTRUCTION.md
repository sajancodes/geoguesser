# Asset Reconstruction & Ingestion Pipeline — Earth Uncovered

## 1. Offline Processing Infrastructure Pipeline

Photogrammetric and Gaussian Splat reconstruction is executed offline on GPU processing nodes, never inside the player's browser.

```text
[Raw Capture: Multi-View Images / 360 Frames + RTK-GPS EXIF]
       │
       ▼
[1. Camera Calibration & Structure-from-Motion (COLMAP)]
   - Intrinsic calibration, feature extraction, sparse bundle adjustment
   - Georeferencing sparse point cloud to WGS84 / Local ENU via GPS control points
       │
       ▼
[2. Hybrid 3D Reconstruction]
   ├─► Layer A: 3D Gaussian Splatting (gsplat / Nerfstudio Splatfacto)
   │     - Optimizes anisotropic 3D Gaussians (position, covariance scale/quat, SH0 RGB, opacity)
   └─► Layer B: Proxy Mesh & Collision Extraction
         - Poisson surface reconstruction + ground plane segmentation + AABB building hulls
       │
       ▼
[3. Optimization & Spatial Chunking]
   - Outlier & floater removal (opacity < 0.05 or Mahalanobis distance filter)
   - Quadtree spatial partitioning into 40m x 40m ENU chunks across LOD 0, 1, 2
   - Quantization to 32-byte `.splat` binary records or SOG-compressed textures
```

## 2. Browser Runtime Ingestion & Validation (`SplatBinaryParser`)

Earth Uncovered includes a strict client-side binary validator and loader (`src/packages/splat-renderer/splatBinary.ts`) supporting:
1. **Standard `.splat` Binary Stream (32 bytes per Gaussian)**:
   - Bytes `0..11`: `float32 x 3` (`x, y, z` in local ENU meters)
   - Bytes `12..23`: `float32 x 3` (`scaleX, scaleY, scaleZ` in meters)
   - Bytes `24..27`: `uint8 x 4` (`R, G, B, A` color and opacity)
   - Bytes `28..31`: `uint8 x 4` (`qx, qy, qz, qw` normalized rotation quaternion encoded as `(q * 128) + 128`)
2. **ASCII / Binary `.ply` Point & Splat Clouds**:
   - Validates `ply` magic header, parses `element vertex <count>`, extracts coordinates, colors, and scale attributes, and rejects malformed or oversized payloads before GPU upload.
