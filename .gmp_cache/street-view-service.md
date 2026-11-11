# Return a Google Street View Panorama for a Specific Location

## Overview

The Maps JavaScript API provides a Street View service for obtaining and
manipulating panoramic 360-degree imagery. You can render Street View panoramas
using the `google.maps.StreetViewPanorama` viewer—either connected to a
`google.maps.Map` instance (using the Pegman control) or within a standalone DOM
container—and programmatically query panorama metadata and availability using
`google.maps.StreetViewService`.

> **Billing Note:** Only Street View panoramas generated with the
> `StreetViewPanorama` object are billed. The built-in Street View experience
> based on the Street View Pegman control on a map, as well as queries to
> `StreetViewService`, are not billed.

--------------------------------------------------------------------------------

## Implementation Patterns

### 1. Split Map and Street View Panorama

You can display a `StreetViewPanorama` in a separate DOM element (recommended
minimum size of 200px by 200px) and link it to a `Map` instance using
`map.setStreetView(panorama)`. Dragging the Pegman on the map automatically
updates the linked panorama.

#### Orientation and Point-of-View (`StreetViewPov`)

The camera orientation is defined by a `StreetViewPov` object:

-   **`heading`** (default `0`): Rotation angle around the camera locus in
    degrees clockwise from true north (`90` is true east).
-   **`pitch`** (default `0`): Angle variance "up" (`+90` straight up) or "down"
    (`-90` straight down) from the camera's initial default pitch.

#### JavaScript / TypeScript

```javascript
async function initialize() {
  const { Map } = await google.maps.importLibrary("maps");
  const { StreetViewPanorama } = await google.maps.importLibrary("streetView");

  const fenway = { lat: 42.345573, lng: -71.098326 };

  const map = new Map(document.getElementById("map"), {
    center: fenway,
    zoom: 14,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const panorama = new StreetViewPanorama(
    document.getElementById("pano"),
    {
      position: fenway,
      pov: {
        heading: 34,
        pitch: 10,
      },
    }
  );

  // Bind the custom panorama viewer to the map's Pegman control
  map.setStreetView(panorama);
}

initialize();
```

#### HTML & CSS

```html
<style>
  html, body {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  #map, #pano {
    float: left;
    height: 100%;
    width: 50%;
    min-width: 200px;
    min-height: 200px;
  }
</style>
<div id="map"></div>
<div id="pano"></div>
```

--------------------------------------------------------------------------------

### 2. Directly Accessing Street View Data (`StreetViewService`)

Before displaying a panorama for an arbitrary coordinate, you can
programmatically verify whether Street View imagery exists at that location
using `google.maps.StreetViewService`.

#### Request Types

1.  **`StreetViewLocationRequest`**: Searches for panorama data near a
    coordinate.
    -   `location`: `LatLng` or `LatLngLiteral` to search around.
    -   `radius`: Search radius in meters (defaults to `50`). When `radius` is
        50 meters or less, `getPanorama` returns the nearest panorama.
    -   `preference`: `google.maps.StreetViewPreference.NEAREST` or `BEST`.
    -   `source`: `google.maps.StreetViewSource.DEFAULT` or `OUTDOOR` (limits
        searches to outdoor collections).
2.  **`StreetViewPanoRequest`**: Fetches panorama metadata using a specific
    `pano` ID string.

#### Response (`StreetViewPanoramaData` & `StreetViewStatus`)

Calling `sv.getPanorama(request)` returns a Promise resolving to `{ data:
StreetViewPanoramaData }` (or accepts a callback returning `(data, status)`).

-   **`data.location.pano`**: The panorama ID string, which you can pass to
    `panorama.setPano()`.
-   **`data.location.latLng`**: The exact `LatLng` of the camera locus.
-   **`data.location.description`**: Text description of the location.
-   **Status Codes**: `OK`, `ZERO_RESULTS`, or `UNKNOWN_ERROR`.

#### JavaScript

```javascript
let map;
let panorama;

async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");
  const { StreetViewPanorama, StreetViewService } = await google.maps.importLibrary("streetView");
  const { Marker } = await google.maps.importLibrary("marker");

  const berkeley = { lat: 37.869085, lng: -122.254775 };
  const sv = new StreetViewService();

  panorama = new StreetViewPanorama(document.getElementById("pano"));

  map = new Map(document.getElementById("map"), {
    center: berkeley,
    zoom: 16,
    streetViewControl: false,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // Set the initial Street View camera to the center of the map
  sv.getPanorama({ location: berkeley, radius: 50 })
    .then(({ data }) => processSVData(data, Marker))
    .catch((e) => console.error("Initial Street View data not found.", e));

  // Look for a nearby Street View panorama when the map is clicked
  map.addListener("click", (event) => {
    sv.getPanorama({ location: event.latLng, radius: 50 })
      .then(({ data }) => processSVData(data, Marker))
      .catch(() => {
        console.error("Street View data not found for this location.");
      });
  });
}

function processSVData(data, Marker) {
  const location = data.location;
  const marker = new Marker({
    position: location.latLng,
    map,
    title: location.description,
  });

  panorama.setPano(location.pano);
  panorama.setPov({
    heading: 270,
    pitch: 0,
  });
  panorama.setVisible(true);

  marker.addListener("click", () => {
    panorama.setPano(location.pano);
    panorama.setPov({
      heading: 270,
      pitch: 0,
    });
    panorama.setVisible(true);
  });
}

initMap();
```

--------------------------------------------------------------------------------

### 3. Using Default Map Panorama and Overlays

Every `google.maps.Map` (including `<gmp-map>`) has a built-in default
`StreetViewPanorama` accessible via `map.getStreetView()`. Any `Marker`,
`InfoWindow`, or custom `OverlayView` attached to the map is automatically
shared with the default Street View panorama when it becomes visible.

```html
<gmp-map
  map-id="DEMO_MAP_ID"
  center="40.729884, -73.990988"
  zoom="18"
  internal-usage-attribution-ids="gmp_git_agentskills_v1">
  <input
    type="button"
    value="Toggle Street View"
    id="streetview-toggle-button"
    slot="control-block-start-inline-start" />
</gmp-map>
```

```javascript
let panorama;

async function init() {
  const [{ Marker }] = await Promise.all([
    google.maps.importLibrary("marker"),
    google.maps.importLibrary("maps"),
  ]);

  const astorPlace = { lat: 40.729884, lng: -73.990988 };
  const mapElement = document.querySelector("gmp-map");
  const innerMap = mapElement.innerMap;

  // Create a marker on the map; it will automatically appear in the default Street View
  new Marker({
    position: { lat: 40.730031, lng: -73.991428 },
    map: innerMap,
    title: "Cafe",
  });

  // Retrieve the map's default StreetViewPanorama instance
  panorama = innerMap.getStreetView();
  panorama.setPosition(astorPlace);
  panorama.setPov({
    heading: 265,
    pitch: 0,
  });

  document
    .getElementById("streetview-toggle-button")
    .addEventListener("click", () => {
      const isVisible = panorama.getVisible();
      panorama.setVisible(!isVisible);
    });
}

init();
```

--------------------------------------------------------------------------------

## Customizing Controls and Motion Tracking

You can customize the UI controls and mobile device orientation (motion
tracking) within `StreetViewPanoramaOptions`:

-   `addressControl` / `addressControlOptions`: Textual overlay showing the
    address.
-   `panControl` / `panControlOptions`: Compass and rotation control.
-   `zoomControl` / `zoomControlOptions`: Image zoom control.
-   `linksControl`: Guide arrows on the image for traveling to adjacent
    panoramas.
-   `fullscreenControl` / `fullscreenControlOptions`: Fullscreen toggle.
-   `enableCloseButton`: Close button to exit the Street View viewer.
-   `motionTracking` / `motionTrackingControl` / `motionTrackingControlOptions`:
    Controls device rotation tracking on supported mobile devices.

```javascript
const panorama = new google.maps.StreetViewPanorama(
  document.getElementById("pano"),
  {
    position: { lat: 42.345573, lng: -71.098326 },
    pov: { heading: 165, pitch: 0 },
    addressControlOptions: {
      position: google.maps.ControlPosition.BOTTOM_CENTER,
    },
    linksControl: false,
    panControl: false,
    enableCloseButton: false,
    motionTracking: false,
    motionTrackingControl: false,
  }
);
```

--------------------------------------------------------------------------------

## Street View Events

Monitor changes to the `StreetViewPanorama` state using
`panorama.addListener(eventName, handler)`:

Event Name         | Description
:----------------- | :----------
`pano_changed`     | Fires whenever the individual `pano` ID changes. Note that associated data (like links) may update asynchronously after this event.
`position_changed` | Fires whenever the underlying `LatLng` position changes (rotating the camera does not trigger this).
`pov_changed`      | Fires whenever the `StreetViewPov` (`heading` or `pitch`) changes.
`links_changed`    | Fires whenever the panorama's navigation links change.
`visible_changed`  | Fires whenever the Street View visibility state changes.

```javascript
panorama.addListener("pano_changed", () => {
  console.log("Current Pano ID:", panorama.getPano());
});

panorama.addListener("position_changed", () => {
  console.log("Current Position:", panorama.getPosition()?.toString());
});

panorama.addListener("pov_changed", () => {
  const { heading, pitch } = panorama.getPov();
  console.log(`Heading: ${heading}, Pitch: ${pitch}`);
});

panorama.addListener("links_changed", () => {
  const links = panorama.getLinks();
  links.forEach((link, idx) => {
    console.log(`Link ${idx}: ${link.description} (Pano: ${link.pano})`);
  });
});
```

--------------------------------------------------------------------------------

## Providing Custom Street View Panoramas

You can display custom 360-degree equirectangular (2:1 aspect ratio) panoramas
and link them to Google's standard Street View network.

> **Important:** Do **not** set `position` directly in
> `StreetViewPanoramaOptions` when initializing a custom panorama, as doing so
> instructs the service to request default Google Street View imagery near that
> coordinate. Instead, pass `{ pano: "custom_id" }`, call
> `panorama.registerPanoProvider()`, and define `location.latLng` inside the
> returned `StreetViewPanoramaData` object.

```javascript
function initCustomPano() {
  const panorama = new google.maps.StreetViewPanorama(
    document.getElementById("pano"),
    { pano: "reception", visible: true }
  );

  panorama.registerPanoProvider(getCustomPanorama);
}

function getCustomPanoramaTileUrl(pano, zoom, tileX, tileY) {
  return (
    "https://developers.google.com/maps/documentation/javascript/examples/full/images/" +
    `panoReception1024-${zoom}-${tileX}-${tileY}.jpg`
  );
}

function getCustomPanorama(pano) {
  if (pano === "reception") {
    return {
      location: {
        pano: "reception",
        description: "Google Sydney - Reception",
        latLng: new google.maps.LatLng(-33.86684, 151.19583),
      },
      links: [],
      copyright: "Imagery (c) 2010 Google",
      tiles: {
        tileSize: new google.maps.Size(1024, 512),
        worldSize: new google.maps.Size(2048, 1024),
        centerHeading: 105,
        getTileUrl: getCustomPanoramaTileUrl,
      },
    };
  }
  return null;
}
```
