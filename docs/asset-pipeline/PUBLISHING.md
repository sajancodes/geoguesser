# Asset Publishing & Manifest Specification — Earth Uncovered

## 1. Chunk Manifest Format

Published world chunks are served via `/api/world/chunks/:locationId/:chunkId` alongside a strongly typed JSON manifest:

```json
{
  "chunkId": "kyoto-higashiyama:L0:X0:Z0",
  "locationId": "kyoto-higashiyama",
  "lodLevel": 0,
  "assetVersion": "1.2.0",
  "compression": "splat-32b",
  "splatCount": 2400,
  "byteLength": 76800,
  "boundingBoxENU": {
    "minEast": -25,
    "maxEast": 25,
    "minNorth": -25,
    "maxNorth": 25,
    "minUp": -1,
    "maxUp": 18
  },
  "qualityMetadata": {
    "visualCompleteness": 94,
    "navigationCompleteness": 96,
    "captureDate": "2026-04-18",
    "license": "CC-BY-4.0 / ODbL Surveyed Hybrid"
  }
}
```

## 2. Versioning, Caching & CDN Delivery

- **Immutable Asset Keys**: Cache entries are indexed by `${chunkId}@${assetVersion}`.
- **Bounded Memory Eviction**: The browser cache enforces hard byte limits (`64 MB` in `PERFORMANCE`, `160 MB` in `BALANCED`, `320 MB` in `QUALITY`) and evicts least-recently-used non-visible chunks first.
- **License & Source Attribution**: Every location manifest records its data source (`OpenStreetMap ODbL`, `Copernicus DEM`, and surveyed photogrammetric/splat capture metadata) and blocks any location lacking valid license metadata from entering playable game rounds.
