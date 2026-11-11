# Performance Benchmarks & Targets — Earth Uncovered

## 1. Hardware Targets & Profiles

| Profile | Target Hardware | Pixel Ratio Cap | Streaming Radius | Max Active Splats | Memory Budget | Target FPS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PERFORMANCE** | Integrated GPU laptops, smartphones, or software WebGL | `1.0x` | `65 m` | `12,000` | `64 MB` | `30–60 FPS` |
| **BALANCED** | Mainstream laptops & modern mobile browsers | `1.5x` | `110 m` | `32,000` | `160 MB` | `45–60 FPS` |
| **QUALITY** | Dedicated GPU desktops | `2.0x` | `160 m` | `64,000` | `320 MB` | `60 FPS` |

## 2. Measured Runtime Telemetry

The `PerformanceMonitor` (`src/packages/rendering/performanceMonitor.ts`) continuously records:
- Rolling 120-frame average FPS and frame-time percentiles (`p50`, `p95`, `p99` in milliseconds).
- Initial scene bootstrap duration and average chunk download + decode latency (`ms`).
- Active loaded chunks, evicted chunks, cancelled in-flight requests, and failed requests.
- Estimated GPU buffer + texture memory usage (`MB`).
- **Automatic Frame-Time Downgrade**: When `p95` frame time exceeds `38 ms` (`< 26 FPS`) for 3 consecutive seconds, the `PerformanceGovernor` automatically steps down from `QUALITY` -> `BALANCED` -> `PERFORMANCE` and logs the transition in the telemetry bar.
