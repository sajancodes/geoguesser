# Customize the Controls on a Google Street View

This guide explains how to configure the user interface controls on a Google
Street View panorama and customize the Pegman control on a standard Google Map
using the Maps JavaScript API.

## Overview

When displaying a `StreetViewPanorama`, several built-in UI controls appear by
default to allow users to rotate, zoom, navigate to adjacent panoramas, view the
address, and toggle fullscreen or motion tracking. You can customize the
visibility and screen position of these controls using
`StreetViewPanoramaOptions` during initialization or dynamically via
`setOptions()`.

Additionally, if your Street View is linked to a `google.maps.Map` instance, you
can configure the visibility and placement of the Street View *Pegman* control
on the map using `MapOptions`.

## Prerequisites

-   **Add a configurable, interactive Google Street View to a web page or mobile
    app**: You must have the Maps JavaScript API loaded and a container DOM
    element (such as `<div id="pano"></div>`) sized via CSS (minimum recommended
    size is 200px by 200px).

## Street View Panorama Controls Reference

You can toggle controls by setting their boolean properties in
`StreetViewPanoramaOptions` to `true` or `false`, and adjust their placement
using their corresponding `*ControlOptions` object and
`google.maps.ControlPosition` constants.

Control Property        | Options Property               | Options Interface                 | Default Behavior & Description
:---------------------- | :----------------------------- | :-------------------------------- | :-----------------------------
`panControl`            | `panControlOptions`            | `PanControlOptions`               | **Enabled by default.** Provides a compass and pan control to rotate the panorama.
`zoomControl`           | `zoomControlOptions`           | `ZoomControlOptions`              | **Enabled by default.** Appears near the bottom right to zoom in/out of the image.
`addressControl`        | `addressControlOptions`        | `StreetViewAddressControlOptions` | **Enabled by default.** Displays a textual overlay of the location's address and a link to open in Google Maps.
`fullscreenControl`     | `fullscreenControlOptions`     | `FullscreenControlOptions`        | **Enabled by default.** Allows opening Street View in fullscreen mode.
`linksControl`          | *(None)*                       | *(None)*                          | **Enabled by default.** Displays guide arrows on the panorama for traveling to adjacent panorama images.
`enableCloseButton`     | *(None)*                       | *(None)*                          | **Disabled by default on standalone panoramas.** Displays a Close button allowing the user to close the Street View viewer.
`motionTracking`        | *(None)*                       | *(None)*                          | **Enabled by default on supported mobile devices.** Allows users to change the point of view by moving/rotating their device.
`motionTrackingControl` | `motionTrackingControlOptions` | `MotionTrackingControlOptions`    | **Enabled by default on supported mobile devices** (at `RIGHT_BOTTOM`). Allows users to tap to toggle motion tracking on or off. Never appears if the device does not support orientation events.

## Implementation Workflows

### 1. Customize Controls on a Standalone Street View Panorama

To customize controls on a standalone `StreetViewPanorama`, pass your desired
boolean flags and `ControlPosition` settings inside the
`StreetViewPanoramaOptions` object when constructing the panorama.

This example repositions the address control to the bottom center and disables
the links, pan, and close controls:

```typescript
/**
 * Reference: https://github.com/googlemaps/js-samples/blob/HEAD/samples/streetview-controls/index.ts?utm_campaign=gmp_git_agentskills_v1
 */
function initPano(): void {
  // Note: constructed panorama objects have visible: true set by default.
  const panorama = new google.maps.StreetViewPanorama(
    document.getElementById("pano") as HTMLElement,
    {
      position: { lat: 42.345573, lng: -71.098326 },
      addressControlOptions: {
        position: google.maps.ControlPosition.BOTTOM_CENTER,
      },
      linksControl: false,
      panControl: false,
      enableCloseButton: false,
      fullscreenControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_BOTTOM,
      },
    }
  );
}

declare global {
  interface Window {
    initPano: () => void;
  }
}
window.initPano = initPano;
export {};
```

### 2. Configure Mobile Motion Tracking Controls

On mobile devices that support device orientation events, users can look around
by physically moving their device. You can control whether motion tracking is
active initially, whether the toggle button is visible to the user, and where
that button is positioned.

-   **Disable initial motion tracking, but leave the control visible** (users
    can still tap the control to turn it on):

    ```javascript
    const panorama = new google.maps.StreetViewPanorama(
      document.getElementById("pano"),
      {
        position: { lat: 37.86926, lng: -122.254811 },
        pov: { heading: 165, pitch: 0 },
        motionTracking: false,
      }
    );
    ```

-   **Disable both motion tracking and the motion tracking control** (users
    cannot turn motion tracking on):

    ```javascript
    const panorama = new google.maps.StreetViewPanorama(
      document.getElementById("pano"),
      {
        position: { lat: 37.86926, lng: -122.254811 },
        pov: { heading: 165, pitch: 0 },
        motionTracking: false,
        motionTrackingControl: false,
      }
    );
    ```

-   **Reposition the motion tracking control** (defaults to `RIGHT_BOTTOM`):

    ```javascript
    const panorama = new google.maps.StreetViewPanorama(
      document.getElementById("pano"),
      {
        position: { lat: 37.86926, lng: -122.254811 },
        pov: { heading: 165, pitch: 0 },
        motionTrackingControlOptions: {
          position: google.maps.ControlPosition.LEFT_BOTTOM,
        },
      }
    );
    ```

### 3. Customize the Street View Pegman Control on a Map

When using a `google.maps.Map`, the Street View *Pegman* control is enabled by
default and integrated with the map's default `StreetViewPanorama` (retrieved
via `map.getStreetView()`).

You can hide or reposition the Pegman control on the map using
`streetViewControl` and `streetViewControlOptions` in `MapOptions`, and
customize the controls of the map's underlying default panorama:

```typescript
let map: google.maps.Map;

async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const astorPlace = { lat: 40.729884, lng: -73.990988 };

  map = new Map(document.getElementById("map") as HTMLElement, {
    center: astorPlace,
    zoom: 16,
    // Ensure Pegman is visible and move it to the left top of the map
    streetViewControl: true,
    streetViewControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP,
    },
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // Retrieve the map's default StreetViewPanorama to customize its internal controls
  const defaultPanorama = map.getStreetView();
  defaultPanorama.setOptions({
    addressControl: false,
    linksControl: true,
    enableCloseButton: true, // Allow users to exit back to the 2D map
  });
}

void initMap();
export {};
```

> **Billing Note:** Only Street View panoramas generated directly with the `new
> google.maps.StreetViewPanorama()` constructor are billed under the Dynamic
> Street View SKU. The built-in Street View experience triggered via the map's
> Pegman control (`map.getStreetView()`) and `StreetViewService` queries are not
> billed as standalone `StreetViewPanorama` instantiations.
