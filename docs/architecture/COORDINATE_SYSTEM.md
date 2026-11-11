# Coordinate System Architecture — Earth Uncovered

## 1. Why Three Coordinate Systems Are Required

Rendering directly in global geocentric coordinates (`ECEF`, where `X, Y, Z ~ 6,378,137 m`) using 32-bit GPU floating-point numbers (`float32` has 24 bits of mantissa, giving `~0.5 m` precision at Earth's surface) causes severe vertex jitter and broken collision physics during street-level walking.

Earth Uncovered enforces a three-tier coordinate pipeline:

1. **WGS84 Geodetic (`lat`, `lon`, `elevation`)**:
   - Used for coverage databases, H3 indexing, Google Maps guess markers, and Vincenty geodesic distance scoring.
   - Reference ellipsoid: Semi-major axis `a = 6378137.0 m`, flattening `f = 1 / 298.257223563`, first eccentricity squared `e^2 = 2f - f^2`.

2. **ECEF Geocentric (`X`, `Y`, `Z` in meters)**:
   - Intermediate global Cartesian frame with origin at Earth's center of mass.
   - Prime vertical radius of curvature:
     `N(lat) = a / sqrt(1 - e^2 * sin^2(lat))`
   - Forward transform:
     - `X = (N + h) * cos(lat) * cos(lon)`
     - `Y = (N + h) * cos(lat) * sin(lon)`
     - `Z = (N * (1 - e^2) + h) * sin(lat)`

3. **Local East-North-Up (`ENU` -> Three.js Right-Handed Scene Frame)**:
   - Every playable location defines a high-precision 64-bit `originWGS84` (`lat0, lon0, h0`).
   - All chunk meshes, Gaussian Splats, and capsule physics operate in local meters relative to `(lat0, lon0, h0)`:
     - `+X` = **East** (`meters`)
     - `+Y` = **Up** (`elevation offset in meters`)
     - `-Z` = **North** (`+Z` = **South**, matching Three.js right-handed `+X right, +Y up, -Z forward` convention)
   - At `100 m` from the local origin, 32-bit float precision is `< 0.00001 m` (`10 micrometers`), eliminating camera and vertex jitter completely.
