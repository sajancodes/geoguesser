# Respond to user interactions and events in a Google Street View

## Overview

When users navigate between Street View panoramas or change the camera
orientation, the `google.maps.StreetViewPanorama` object dispatches events
indicating state changes. You can attach event listeners to a
`StreetViewPanorama` instance using its `addListener()` method to respond to
changes in the panorama ID, geographic coordinates, camera point-of-view (POV),
navigation links, and visibility.

## Prerequisites

Before attaching Street View event listeners, ensure you have fulfilled the
prerequisite:

-   **Add a configurable, interactive Google Street View to a web page or mobile
    app.** (Either as a standalone `StreetViewPanorama` in a dedicated DOM
    container or retrieved from a `google.maps.Map` instance via
    `map.getStreetView()`).

--------------------------------------------------------------------------------

## Supported Street View Events

You can monitor the following state-change events on a `StreetViewPanorama`
instance:

| Event Name         | Description                | Key Considerations &       |
:                    :                            : Nuances                    :
| :----------------- | :------------------------- | :------------------------- |
| `pano_changed`     | Fires whenever the         | Does **not** guarantee     |
:                    : individual panorama ID     : that associated data (such :
:                    : changes.                   : as links) has finished     :
:                    :                            : updating when fired. Pano  :
:                    :                            : IDs are only stable within :
:                    :                            : the current browser        :
:                    :                            : session.                   :
| `position_changed` | Fires whenever the         | Rotating the camera does   |
:                    : underlying `LatLng`        : **not** trigger this       :
:                    : position of the panorama   : event. Note that changing  :
:                    : changes.                   : the underlying position    :
:                    :                            : might not change the       :
:                    :                            : associated pano ID if the  :
:                    :                            : API snaps to the same      :
:                    :                            : nearest panorama.          :
| `pov_changed`      | Fires whenever the         | Frequently fires while     |
:                    : `StreetViewPov` (`heading` : `position` and `pano` ID   :
:                    : or `pitch`) changes.       : remain unchanged as the    :
:                    :                            : user looks around.         :
| `links_changed`    | Fires whenever the         | Fires **asynchronously**   |
:                    : panorama's navigation      : after a change in the pano :
:                    : links (`StreetViewLink[]`) : ID indicated by            :
:                    : change.                    : `pano_changed`.            :
| `visible_changed`  | Fires whenever the Street  | May fire asynchronously    |
:                    : View panorama's visibility : after a `pano_changed`     :
:                    : toggles (`true` /          : event.                     :
:                    : `false`).                  :                            :

--------------------------------------------------------------------------------

## Implementation Workflow

### 1. Attach Event Listeners to a Panorama

Use `panorama.addListener(eventName, handler)` to inspect state properties using
the corresponding getter methods:

-   `panorama.getPano()`: Returns the current panorama ID `string`.
-   `panorama.getPosition()`: Returns the current `google.maps.LatLng` object.
-   `panorama.getPov()`: Returns the current `google.maps.StreetViewPov`
    (`{ heading: number, pitch: number }`).
-   `panorama.getLinks()`: Returns an array of `google.maps.StreetViewLink`
    objects (`{ description, heading, pano }`).
-   `panorama.getVisible()`: Returns a `boolean` indicating whether the panorama
    is visible.

#### Code Example: Monitoring Street View State Changes

The following example initializes a Street View panorama and listens to
`pano_changed`, `links_changed`, `position_changed`, and `pov_changed` to update
a UI panel in real time.

Source:
[samples/streetview-events/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/streetview-events/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
async function initPano(): Promise<void> {
  const { StreetViewPanorama } = await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;

  const panorama = new StreetViewPanorama(
    document.getElementById("pano") as HTMLElement,
    {
      position: { lat: 37.869, lng: -122.255 },
      pov: {
        heading: 270,
        pitch: 0,
      },
      visible: true,
    }
  );

  // 1. Listen for Panorama ID changes
  panorama.addListener("pano_changed", () => {
    const panoCell = document.getElementById("pano-cell") as HTMLElement;
    panoCell.textContent = panorama.getPano();
  });

  // 2. Listen for asynchronous Navigation Link changes
  panorama.addListener("links_changed", () => {
    const linksTable = document.getElementById("links_table") as HTMLElement;

    while (linksTable.hasChildNodes()) {
      linksTable.removeChild(linksTable.lastChild as ChildNode);
    }

    const links = panorama.getLinks();

    for (const i in links) {
      if (links[i]) {
        const row = document.createElement("tr");
        linksTable.appendChild(row);

        const labelCell = document.createElement("td");
        labelCell.innerHTML = `<b>Link: ${i}</b>`;

        const valueCell = document.createElement("td");
        valueCell.textContent = links[i]?.description || "";

        row.appendChild(labelCell);
        row.appendChild(valueCell);
      }
    }
  });

  // 3. Listen for geographic LatLng position changes
  panorama.addListener("position_changed", () => {
    const positionCell = document.getElementById("position-cell") as HTMLElement;
    positionCell.textContent = `${panorama.getPosition()}`;
  });

  // 4. Listen for camera Point-of-View (heading and pitch) changes
  panorama.addListener("pov_changed", () => {
    const headingCell = document.getElementById("heading-cell") as HTMLElement;
    const pitchCell = document.getElementById("pitch-cell") as HTMLElement;

    const pov = panorama.getPov();
    headingCell.textContent = `${pov.heading}`;
    pitchCell.textContent = `${pov.pitch}`;
  });
}

initPano();
```

--------------------------------------------------------------------------------

### 2. Modify Navigation Links Dynamically on `links_changed`

Because `links_changed` fires asynchronously after a panorama loads its default
links, it is the required hook for injecting custom navigation arrows
(`StreetViewLink`) that connect Google's default Street View imagery to custom
panoramas or specific adjacent panoramas.

```typescript
// Add a custom navigation link when a specific panorama is active
panorama.addListener("links_changed", () => {
  if (panorama.getPano() === targetOutsidePanoId) {
    const links = panorama.getLinks();
    if (links) {
      links.push({
        description: "Enter Building Reception",
        heading: 25,
        pano: "custom_reception_pano_id",
      });
    }
  }
});
```

--------------------------------------------------------------------------------

### 3. Coordinate Map Interactions with Street View (`StreetViewService`)

To update a `StreetViewPanorama` in response to user clicks on a
`google.maps.Map` or `google.maps.Marker`, combine Map click listeners with
`google.maps.StreetViewService` to query for valid panorama data before updating
the viewer.

```typescript
async function initInteractiveMapAndPano(): Promise<void> {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
  const { StreetViewPanorama, StreetViewService } = await google.maps.importLibrary("streetView") as google.maps.StreetViewLibrary;
  const { Marker } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

  const berkeley = { lat: 37.869085, lng: -122.254775 };
  const svService = new StreetViewService();

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: berkeley,
    zoom: 16,
    streetViewControl: false,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const panorama = new StreetViewPanorama(
    document.getElementById("pano") as HTMLElement
  );

  function processSVData({ data }: google.maps.StreetViewResponse) {
    const location = data.location!;

    const marker = new Marker({
      position: location.latLng,
      map,
      title: location.description,
    });

    panorama.setPano(location.pano as string);
    panorama.setPov({ heading: 270, pitch: 0 });
    panorama.setVisible(true);

    // Respond to marker clicks to restore this panorama
    marker.addListener("click", () => {
      panorama.setPano(location.pano as string);
      panorama.setPov({ heading: 270, pitch: 0 });
      panorama.setVisible(true);
    });
  }

  // Load initial panorama
  svService.getPanorama({ location: berkeley, radius: 50 }).then(processSVData);

  // Respond to map clicks by searching for a panorama within 50 meters
  map.addListener("click", (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;

    svService
      .getPanorama({ location: event.latLng, radius: 50 })
      .then(processSVData)
      .catch(() => {
        console.error("Street View data not found for this location.");
      });
  });
}

initInteractiveMapAndPano();
```

--------------------------------------------------------------------------------

### 4. Event Listener Cleanup & Lifecycle Management

`panorama.addListener()` returns a `google.maps.MapsEventListener` object. When
building Single Page Applications (SPAs) or dynamically mounting/unmounting
Street View components, store the listener reference and call `.remove()` during
component teardown to prevent memory leaks.

```typescript
const povListener = panorama.addListener("pov_changed", () => {
  const { heading, pitch } = panorama.getPov();
  console.log(`Heading: ${heading}, Pitch: ${pitch}`);
});

// When cleaning up the component or view:
povListener.remove();
// Or remove all listeners from the panorama instance:
// google.maps.event.clearInstanceListeners(panorama);
```
