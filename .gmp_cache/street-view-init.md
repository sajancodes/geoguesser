# Add a Configurable, Interactive Google Street View

This guide covers how to integrate, configure, and interact with 360-degree
Google Street View panoramas using the Maps JavaScript API (`StreetViewPanorama`
and `StreetViewService`).

## Prerequisites & Billing Note

*   **API Key**: Requires a Google Maps Platform API key with the **Maps
    JavaScript API** enabled.
*   **Billing**: Only panoramas explicitly instantiated with the
    `StreetViewPanorama` object are billed (under the Dynamic Street View SKU).
    The built-in Street View experience triggered by the map's Pegman control
    and programmatic lookups via `StreetViewService` are **not** billed.
*   **Container Sizing**: For optimal display of Street View imagery, the target
    DOM container should have a minimum size of **200px by 200px** and an
    explicit height defined in CSS.

--------------------------------------------------------------------------------

## Core Implementation Patterns

### 1. Split Map and Street View (Linked Panorama)

To display a map alongside a synchronized Street View container, instantiate
both `google.maps.Map` and `google.maps.StreetViewPanorama`, then link them
using `map.setStreetView(panorama)`. Dragging the Pegman control on the map will
automatically update the linked panorama container.

```html
<div id="map" style="float: left; width: 50%; height: 100vh;"></div>
<div id="pano" style="float: left; width: 50%; height: 100vh;"></div>
```

```typescript
async function initMap(): Promise<void> {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
  const { StreetViewPanorama } = await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;

  const fenway = { lat: 42.345573, lng: -71.098326 };

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: fenway,
    zoom: 14,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const panorama = new StreetViewPanorama(
    document.getElementById("pano") as HTMLElement,
    {
      position: fenway,
      pov: {
        heading: 34, // Rotation angle in degrees clockwise from true north (90 is east)
        pitch: 10,   // Angle variance up (+90) or down (-90) from default pitch
      },
    }
  );

  // Connect the map's Pegman control to the custom panorama container
  map.setStreetView(panorama);
}

initMap();
```

### 2. Standalone Street View with Custom Controls & Mobile Motion Tracking

You can render a `StreetViewPanorama` inside a DOM element without a map,
customize which UI controls appear, and configure device orientation tracking on
mobile devices.

```typescript
async function initStandalonePano(): Promise<void> {
  const { StreetViewPanorama } = await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;

  const panorama = new StreetViewPanorama(
    document.getElementById("pano") as HTMLElement,
    {
      position: { lat: 37.86926, lng: -122.254811 },
      pov: { heading: 165, pitch: 0 },
      visible: true,
      // UI Control Configurations
      addressControl: true,
      addressControlOptions: {
        position: google.maps.ControlPosition.BOTTOM_CENTER,
      },
      linksControl: false,       // Hides guide arrows to adjacent panoramas
      panControl: false,         // Hides the compass/pan control
      zoomControl: true,
      fullscreenControl: true,
      enableCloseButton: false,  // Hides the 'X' close button
      // Mobile Device Motion Tracking Configurations
      motionTracking: false,     // Disables automatic device rotation tracking by default
      motionTrackingControl: true, // Leaves control visible so the user can opt-in
      motionTrackingControlOptions: {
        position: google.maps.ControlPosition.LEFT_BOTTOM,
      },
    }
  );
}

initStandalonePano();
```

--------------------------------------------------------------------------------

## Programmatic Panorama Lookup (`StreetViewService`)

Before displaying a panorama—or when responding to dynamic user clicks—use
`StreetViewService` to check if Street View imagery exists near a coordinate and
retrieve its metadata (`StreetViewPanoramaData`).

### Request Parameters (`StreetViewLocationRequest`)

*   `location`: The `LatLng` or `LatLngLiteral` to search around.
*   `radius`: Search radius in meters (defaults to `50`). When `50` meters or
    less, returns the nearest panorama.
*   `preference`: `google.maps.StreetViewPreference.NEAREST` or `BEST`.
*   `source`: `google.maps.StreetViewSource.DEFAULT` (all sources) or `OUTDOOR`
    (limits search to outdoor collections).

```typescript
let map: google.maps.Map;
let panorama: google.maps.StreetViewPanorama;

async function initServiceExample(): Promise<void> {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
  const { StreetViewPanorama, StreetViewService, StreetViewSource } =
    await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;
  const { Marker } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

  const berkeley = { lat: 37.869085, lng: -122.254775 };
  const sv = new StreetViewService();

  panorama = new StreetViewPanorama(document.getElementById("pano") as HTMLElement);

  map = new Map(document.getElementById("map") as HTMLElement, {
    center: berkeley,
    zoom: 16,
    streetViewControl: false,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const processSVData = ({ data }: google.maps.StreetViewResponse) => {
    const location = data.location!;

    const marker = new Marker({
      position: location.latLng,
      map,
      title: location.description,
    });

    panorama.setPano(location.pano);
    panorama.setPov({ heading: 270, pitch: 0 });
    panorama.setVisible(true);

    marker.addListener("click", () => {
      panorama.setPano(location.pano);
      panorama.setPov({ heading: 270, pitch: 0 });
      panorama.setVisible(true);
    });
  };

  // Initial lookup
  sv.getPanorama({
    location: berkeley,
    radius: 50,
    source: StreetViewSource.DEFAULT,
  }).then(processSVData).catch((e) => console.error("Initial panorama not found:", e));

  // Dynamic lookup on map click
  map.addListener("click", (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    sv.getPanorama({ location: event.latLng, radius: 50 })
      .then(processSVData)
      .catch(() => console.warn("Street View data not found for this location."));
  });
}

initServiceExample();
```

--------------------------------------------------------------------------------

## Overlays Within Street View

A map's default `StreetViewPanorama` (retrieved via `map.getStreetView()`)
automatically shares `Marker` overlays created on the map. You can also attach
`Marker`, `InfoWindow`, and custom `OverlayView` instances directly to a
`StreetViewPanorama` by passing the panorama instance to `setMap(panorama)` or
`infoWindow.open(panorama)`.

> **Note:** Overriding the map's default panorama by explicitly setting
> `map.setStreetView(customPanorama)` disables automatic marker sharing. To
> share markers seamlessly, configure and toggle the default panorama retrieved
> from `map.getStreetView()`.

```html
<gmp-map map-id="DEMO_MAP_ID" center="40.729884, -73.990988" zoom="18" internal-usage-attribution-ids="gmp_git_agentskills_v1">
  <button id="streetview-toggle-button" slot="control-block-start-inline-start">
    Toggle Street View
  </button>
</gmp-map>
```

```typescript
async function initSharedOverlays(): Promise<void> {
  const [{ Marker }] = await Promise.all([
    google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
    google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
  ]);

  const astorPlace = { lat: 40.729884, lng: -73.990988 };
  const mapElement = document.querySelector("gmp-map") as google.maps.MapElement;
  const innerMap = mapElement.innerMap;

  // Markers added to innerMap will automatically render at street level in the default panorama
  new Marker({
    position: { lat: 40.730031, lng: -73.991428 },
    map: innerMap,
    title: "Cafe",
  });

  // Retrieve and configure the map's default built-in panorama
  const panorama = innerMap.getStreetView();
  panorama.setPosition(astorPlace);
  panorama.setPov({ heading: 265, pitch: 0 });

  document.getElementById("streetview-toggle-button")!.addEventListener("click", () => {
    panorama.setVisible(!panorama.getVisible());
  });
}

initSharedOverlays();
```

--------------------------------------------------------------------------------

## Listening to Street View Events

Monitor changes to the panorama's state using the following events:

Event Name         | Description
:----------------- | :----------
`pano_changed`     | Fires when the pano ID changes. Note: Associated data (like links) may update asynchronously after this event. Pano IDs are only guaranteed stable for the current browser session.
`position_changed` | Fires when the underlying `LatLng` position changes. Rotating the camera does not trigger this event.
`pov_changed`      | Fires when `heading` or `pitch` changes.
`links_changed`    | Fires when navigation links to adjacent panoramas change.
`visible_changed`  | Fires when the panorama visibility is toggled.

```typescript
panorama.addListener("pano_changed", () => {
  console.log("Current Pano ID:", panorama.getPano());
});

panorama.addListener("position_changed", () => {
  console.log("Camera LatLng:", panorama.getPosition()?.toString());
});

panorama.addListener("pov_changed", () => {
  const pov = panorama.getPov();
  console.log(`Heading: ${pov.heading}, Pitch: ${pov.pitch}`);
});

panorama.addListener("links_changed", () => {
  const links = panorama.getLinks();
  links?.forEach((link, idx) => {
    console.log(`Link ${idx}: ${link?.description} (Pano: ${link?.pano})`);
  });
});
```

--------------------------------------------------------------------------------

## Providing Custom Street View Panoramas

You can display custom 360-degree equirectangular (Plate Carrée projection, 2:1
aspect ratio) imagery and link it to Google's standard Street View network.

### Critical Rules for Custom Panoramas

1.  **Do NOT set `position` in `StreetViewPanoramaOptions`**: Setting `position`
    directly on the `StreetViewPanorama` constructor instructs the service to
    load default Google Street View imagery near that coordinate. Instead, pass
    `{ pano: 'custom_id' }` and define the `latLng` inside the
    `StreetViewPanoramaData.location` object returned by your provider.
2.  **Register a Provider**: Call `panorama.registerPanoProvider(providerFn)`
    which returns a `StreetViewPanoramaData` object matching the requested
    `pano` ID.

```typescript
async function initCustomPanorama(): Promise<void> {
  const { StreetViewPanorama } = await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;

  const panorama = new StreetViewPanorama(
    document.getElementById("pano") as HTMLElement,
    {
      pano: "reception", // Custom pano ID (do NOT set 'position' here)
      visible: true,
    }
  );

  panorama.registerPanoProvider((pano: string): google.maps.StreetViewPanoramaData => {
    if (pano === "reception") {
      return {
        location: {
          pano: "reception",
          description: "Google Sydney - Reception",
          latLng: new google.maps.LatLng(-33.86684, 151.19583),
        },
        links: [
          // Add navigation arrows to other custom or standard pano IDs
          // { heading: 195, description: "Exit", pano: "outside_pano_id" }
        ],
        copyright: "Imagery (c) 2010 Google",
        tiles: {
          tileSize: new google.maps.Size(1024, 512),
          worldSize: new google.maps.Size(2048, 1024),
          centerHeading: 105, // Heading in degrees at the origin of the tile set
          getTileUrl: (panoId: string, zoom: number, tileX: number, tileY: number): string => {
            return `https://developers.google.com/maps/documentation/javascript/examples/full/images/panoReception1024-${zoom}-${tileX}-${tileY}.jpg`;
          },
        },
      };
    }
    return null as unknown as google.maps.StreetViewPanoramaData;
  });
}

initCustomPanorama();
```

### Linking Standard Street View to Custom Panoramas

To add an entry arrow from an outdoor Google Street View panorama into your
custom panorama, listen to `links_changed` and push a custom link object into
`panorama.getLinks()` when the user is on the entry panorama:

```typescript
panorama.addListener("links_changed", () => {
  if (panorama.getPano() === entryGooglePanoId) {
    panorama.getLinks()?.push({
      description: "Enter Building",
      heading: 25,
      pano: "reception",
    });
  }
});
```
