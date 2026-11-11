# Add an Interactive, Photorealistic 3D Map to a Web Page

This workflow guides you through adding an interactive, photorealistic 3D map to
a web page using the Maps JavaScript API's `maps3d` library. You can implement
3D maps declaratively using the `<gmp-map-3d>` custom HTML web component, or in
React using `@vis.gl/react-google-maps`.

## Prerequisites

-   A Google Cloud project with the **Maps JavaScript API** enabled.
-   A valid **Google Maps API Key** with appropriate domain restrictions.

--------------------------------------------------------------------------------

## Option 1: Vanilla HTML & JavaScript (`<gmp-map-3d>`)

The simplest way to add a 3D map is using the `<gmp-map-3d>` custom web
component.

### 1. Load the Maps JavaScript API with the `maps3d` Library

Include the script tag in your HTML `<head>`, specifying `loading=async`, your
API key, and `libraries=maps3d`.

### 2. Add the `<gmp-map-3d>` Element and Styling

Ensure the map container and parent elements (`html`, `body`) have explicit
dimensions so the 3D viewport renders visibly. Configure the starting camera
position using attributes such as `center` (`lat,lng,altitude`), `tilt`, and
`mode`.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Photorealistic 3D Map</title>
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
        padding: 0;
      }
      gmp-map-3d {
        display: block;
        height: 100%;
        width: 100%;
      }
    </style>
    <script
      async
      src="https://maps.googleapis.com/maps/api/js?loading=async&key=YOUR_API_KEY&libraries=maps3d"
    ></script>
  </head>
  <body>
    <gmp-map-3d
      center="37.7704,-122.3985,500"
      tilt="67.5"
      mode="hybrid"
      internal-usage-attribution-ids="gmp_git_agentskills_v1"
    ></gmp-map-3d>
  </body>
</html>
```

### Key `<gmp-map-3d>` Attributes

Attribute | Description                                                                              | Example
:-------- | :--------------------------------------------------------------------------------------- | :------
`center`  | Starting camera target coordinates formatted as `lat,lng,altitude` (altitude in meters). | `"37.7704,-122.3985,500"`
`tilt`    | Camera viewing angle in degrees (`0` is straight down, `90` is horizontal).              | `"67.5"`
`heading` | Camera compass direction in degrees clockwise from North.                                | `"0"`
`range`   | Distance in meters from the camera to the `center` target.                               | `"1733"`
`roll`    | Camera roll angle in degrees.                                                            | `"0"`
`mode`    | Map rendering mode (`"hybrid"` or `"satellite"`).                                        | `"hybrid"`

--------------------------------------------------------------------------------

## Option 2: React (`@vis.gl/react-google-maps`)

For React applications, `@vis.gl/react-google-maps` provides a `<Map3D>`
component and 3D marker/model utilities via `@vis.gl/react-google-maps/3d`.

### 1. Install Dependencies

```bash
npm install @vis.gl/react-google-maps
```

### 2. Render `<Map3D>` Inside `<APIProvider>`

Ensure you pass `libraries={['maps3d', 'marker']}` to `<APIProvider>` so the
underlying 3D web components are registered.

Source:
[examples/map-3d-markers/src/app.tsx](https://github.com/visgl/react-google-maps/blob/HEAD/examples/map-3d-markers/src/app.tsx?utm_campaign=gmp_git_agentskills_v1)

```tsx
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AltitudeMode, APIProvider, Pin } from '@vis.gl/react-google-maps';
import { Map3D, MapMode, Marker3D, Popover } from '@vis.gl/react-google-maps/3d';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY as string;

const INITIAL_VIEW_PROPS = {
  defaultCenter: { lat: 40.7093, lng: -73.9968, altitude: 32 },
  defaultRange: 1733,
  defaultHeading: 5,
  defaultTilt: 70,
  defaultRoll: 0
};

const App = () => {
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [interactiveMarker, setInteractiveMarker] =
    useState<google.maps.maps3d.Marker3DInteractiveElement | null>(null);

  const handleInteractiveMarkerRef = useCallback(
    (
      marker:
        | google.maps.maps3d.Marker3DElement
        | google.maps.maps3d.Marker3DInteractiveElement
        | null
    ) => {
      setInteractiveMarker(
        marker instanceof google.maps.maps3d.Marker3DInteractiveElement
          ? marker
          : null
      );
    },
    []
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <APIProvider apiKey={API_KEY} libraries={['maps3d', 'marker']}>
        <Map3D
          mode={MapMode.SATELLITE}
          {...INITIAL_VIEW_PROPS}
          defaultLabelsDisabled
          internalUsageAttributionIds={['gmp_git_agentskills_v1']}
        >
          {/* Basic extruded 3D marker */}
          <Marker3D
            position={{ lat: 40.704118, lng: -73.994371, altitude: 150 }}
            altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
            extruded
          />

          {/* Interactive 3D marker with custom Pin and Popover */}
          <Marker3D
            ref={handleInteractiveMarkerRef}
            position={{ lat: 40.705666, lng: -73.996382, altitude: 50 }}
            altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
            onClick={() => setOpenPopoverId('colored-pin')}
            title="Click to see details"
          >
            <Pin borderColor="#0D652D" background="#34A853" glyphColor="white" />
          </Marker3D>

          {openPopoverId === 'colored-pin' && (
            <Popover
              open
              anchor={interactiveMarker}
              onClose={() => setOpenPopoverId(null)}
            >
              <div style={{ padding: '12px', maxWidth: '200px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                  Custom Pin Marker
                </h3>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  An interactive marker with custom pin colors.
                </p>
              </div>
            </Popover>
          )}
        </Map3D>
      </APIProvider>
    </div>
  );
};

export default App;
```

--------------------------------------------------------------------------------

## Troubleshooting & Best Practices

1.  **Blank or Collapsed Map**: `<gmp-map-3d>` requires explicit CSS height and
    width on both the custom element and its parent containers (`html`, `body`,
    or wrapper `div`).
2.  **Missing `mode` Attribute**: Always specify `mode="hybrid"` or
    `mode="satellite"` (`MapMode.HYBRID` / `MapMode.SATELLITE` in React) to
    ensure map tiles and labels render as expected.
3.  **Library Loading**: Ensure `libraries=maps3d` is included in the script
    loader URL or passed to `<APIProvider libraries={['maps3d']}>`. Without it,
    `<gmp-map-3d>` remains an unupgraded HTML element.
