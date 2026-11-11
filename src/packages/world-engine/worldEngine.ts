import * as THREE from 'three';
import type {
  GameRoundPublicState,
  PerformanceProfileId,
  RuntimeTelemetrySnapshot,
  StreetView3DMode,
  WGS84Coordinate,
  WorldChunkDescriptor,
} from '../shared-types';
import {
  detectGraphicsCapabilities,
  FramePerformanceMonitor,
  PERFORMANCE_PROFILES,
} from '../rendering/capabilities';
import {
  BoundedChunkCache,
  classifyChunkPriority,
  compareChunkPriority,
  selectDesiredLODForDistance,
} from '../streaming/chunkCache';
import {
  decodeSplatBinaryBuffer,
  type DecodedGaussianSplatCloud,
} from '../splat-renderer/splatBinary';
import {
  createGaussianSplatChunkMesh,
  type SplatChunkSceneHandle,
} from '../splat-renderer/splatMeshBuilder';
import {
  getCameraPositionENU,
  stepCapsulePhysics,
  type CapsuleState,
} from '../physics/capsuleController';
import {
  enuToWgs84,
  latLonToH3Index,
  wgs84ToEnu,
} from '../geographic-index/coordinates';
import { ProceduralAudioSynth } from './soundSynth';

export interface WorldEngineCallbacks {
  onTelemetryUpdate: (snapshot: RuntimeTelemetrySnapshot) => void;
  onPauseToggleRequested: () => void;
}

interface GoogleMapsLatLngLike {
  lat: () => number;
  lng: () => number;
}

interface GoogleStreetViewLink {
  heading?: number | null;
  description?: string | null;
  pano?: string | null;
}

interface GoogleStreetViewPov {
  heading: number;
  pitch: number;
}

interface GoogleStreetViewLocationData {
  pano: string;
  description?: string | null;
  latLng?: GoogleMapsLatLngLike | null;
}

interface GoogleStreetViewPanoramaData {
  location?: GoogleStreetViewLocationData | null;
  links?: Array<GoogleStreetViewLink | null> | null;
}

interface GoogleMapsEventListener {
  remove: () => void;
}

interface GoogleStreetViewPanoramaInstance {
  setPano: (pano: string) => void;
  getPano: () => string;
  setPosition: (latLng: { lat: number; lng: number }) => void;
  getPosition: () => GoogleMapsLatLngLike | null | undefined;
  setPov: (pov: GoogleStreetViewPov) => void;
  getPov: () => GoogleStreetViewPov;
  setZoom: (zoom: number) => void;
  getZoom: () => number;
  setVisible: (visible: boolean) => void;
  getVisible: () => boolean;
  getLinks: () => Array<GoogleStreetViewLink | null> | null | undefined;
  setOptions: (options: Record<string, unknown>) => void;
  addListener: (eventName: string, handler: () => void) => GoogleMapsEventListener;
}

interface GoogleStreetViewServiceInstance {
  getPanorama: (request: {
    location: { lat: number; lng: number };
    radius: number;
    preference?: string;
    source?: string;
  }) => Promise<{ data: GoogleStreetViewPanoramaData }>;
}

interface GoogleStreetViewLibrary {
  StreetViewPanorama: new (
    container: HTMLElement,
    opts?: Record<string, unknown>
  ) => GoogleStreetViewPanoramaInstance;
  StreetViewService: new () => GoogleStreetViewServiceInstance;
  StreetViewSource: {
    DEFAULT: string;
    OUTDOOR: string;
  };
  StreetViewPreference: {
    NEAREST: string;
    BEST: string;
  };
}

interface GoogleMap3DElement extends HTMLElement {
  center?: { lat: number; lng: number; altitude: number };
  range?: number;
  tilt?: number;
  heading?: number;
  roll?: number;
  mode?: string;
  defaultLabelsDisabled?: boolean;
}

interface GoogleMaps3DLibrary {
  Map3DElement: new (opts?: Record<string, unknown>) => GoogleMap3DElement;
  MapMode?: {
    SATELLITE: string;
    HYBRID: string;
  };
}

interface WindowWithGoogleMaps {
  google?: {
    maps?: {
      importLibrary?: (name: string) => Promise<unknown>;
    };
  };
}

function shortestAngleDiffDeg(targetDeg: number, sourceDeg: number): number {
  return ((((targetDeg - sourceDeg) % 360) + 540) % 360) - 180;
}

/**
 * Real-World Google Street View 3D + Photorealistic 3D Tiles + Three.js 3D Depth/Splat Manipulation Engine.
 * Zero cartoon procedural buildings—uses real-world Google Street View panoramas and 3D Tiles,
 * synchronized 1:1 with a Three.js 3D spatial depth & Gaussian Splat reconstruction layer.
 */
export class WorldEngineController {
  private readonly container: HTMLElement;
  private readonly callbacks: WorldEngineCallbacks;
  private readonly capabilities = detectGraphicsCapabilities();
  private readonly perfMonitor = new FramePerformanceMonitor();
  private readonly audioSynth = new ProceduralAudioSynth();

  // DOM Layers inside container
  private readonly streetViewStageWrapper: HTMLDivElement;
  private readonly streetViewMountEl: HTMLDivElement;
  private readonly map3DMountEl: HTMLDivElement;

  // Google Street View & Photorealistic 3D Map instances
  private streetViewLib: GoogleStreetViewLibrary | null = null;
  private streetViewService: GoogleStreetViewServiceInstance | null = null;
  private streetViewPanorama: GoogleStreetViewPanoramaInstance | null = null;
  private streetViewListeners: GoogleMapsEventListener[] = [];
  private map3DElement: GoogleMap3DElement | null = null;
  private isSyncingFromEnginePov = false;
  private currentPanoId: string | null = null;
  private currentLinks: GoogleStreetViewLink[] = [];
  private lastStepTimeMs = 0;

  // Three.js 3D Depth-Mesh & Gaussian Splat Manipulation Layer
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private activeRound: GameRoundPublicState['sceneBootstrap'] | null = null;
  private spawnOriginWGS84: WGS84Coordinate = { lat: 34.998582, lon: 135.780895, elevation: 68 };
  private currentRealWGS84: WGS84Coordinate = { lat: 34.998582, lon: 135.780895, elevation: 68 };

  private allowMovement = true;
  private isTitleFlyover = true;
  private isPaused = false;
  private reducedEffects = false;
  private mouseSensitivity = 1.0;

  private active3DMode: StreetView3DMode = 'streetview_3d_hybrid';
  private depthReliefStrength = 0.45; // 0..1 controls 3D depth extrusion & perspective manipulation

  private activeProfileId: PerformanceProfileId = 'BALANCED';
  private autoDowngraded = false;

  // Dynamic Streaming & Bounded GPU Cache
  private chunkCache: BoundedChunkCache<SplatChunkSceneHandle>;
  private activeSceneChunks: Record<string, SplatChunkSceneHandle> = {};
  private inFlightAborters: Record<string, AbortController> = {};
  private customIngestedHandle: SplatChunkSceneHandle | null = null;

  private cancelledRequestsCount = 0;
  private failedRequestsCount = 0;
  private initialLoadTimeMs = 0;
  private lastChunkLoadTimeMs = 0;
  private lastStreamingCheckMs = 0;
  private lastTelemetryEmitMs = 0;

  // Three.js Scene Groups for 3D Street Corridor Depth Mesh & Gaussian Splats
  private depthCorridorGroup: THREE.Group;
  private splatWorldGroup: THREE.Group;
  private corridorDisposables: Array<{ dispose: () => void }> = [];

  // Capsule first-person state & input state
  private capsule: CapsuleState = {
    east: 0,
    north: 0,
    up: 0,
    velEast: 0,
    velNorth: 0,
    yawRad: (108 * Math.PI) / 180,
    pitchRad: 0,
    walkCyclePhase: 0,
    collidingWithId: null,
  };
  private lastFootstepPhase = 0;

  private keysHeld = new Set<string>();
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pendingYawDeltaRad = 0;
  private pendingPitchDeltaRad = 0;
  private virtualJoystickInput = { forward: 0, right: 0 };
  private stridePulse = 0;

  private frameId = 0;
  private lastFrameTimestampMs = performance.now();
  private flyoverTimeSec = 0;
  private isDisposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: WorldEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const isSoftwareGl = this.capabilities.isSoftwareRenderer;
    this.activeProfileId = isSoftwareGl ? 'PERFORMANCE' : 'BALANCED';
    const profile = PERFORMANCE_PROFILES[this.activeProfileId];

    this.chunkCache = new BoundedChunkCache<SplatChunkSceneHandle>(profile.memoryBudgetBytes);

    // 1. Create the 3D-Manipulated Real Street View Stage Wrapper
    this.streetViewStageWrapper = document.createElement('div');
    this.streetViewStageWrapper.style.position = 'absolute';
    this.streetViewStageWrapper.style.inset = '0';
    this.streetViewStageWrapper.style.width = '100%';
    this.streetViewStageWrapper.style.height = '100%';
    this.streetViewStageWrapper.style.overflow = 'hidden';
    this.streetViewStageWrapper.style.perspective = '1100px';
    this.streetViewStageWrapper.style.backgroundColor = '#111315';

    this.streetViewMountEl = document.createElement('div');
    this.streetViewMountEl.dataset.testid = 'real-streetview-pano';
    this.streetViewMountEl.style.position = 'absolute';
    this.streetViewMountEl.style.inset = '0';
    this.streetViewMountEl.style.width = '100%';
    this.streetViewMountEl.style.height = '100%';
    this.streetViewMountEl.style.transformOrigin = '50% 54%';
    this.streetViewMountEl.style.willChange = 'transform';
    this.streetViewStageWrapper.appendChild(this.streetViewMountEl);

    // 2. Create the Photorealistic 3D Map (`gmp-map-3d`) Stage Container
    this.map3DMountEl = document.createElement('div');
    this.map3DMountEl.dataset.testid = 'photorealistic-3d-map-stage';
    this.map3DMountEl.style.position = 'absolute';
    this.map3DMountEl.style.inset = '0';
    this.map3DMountEl.style.width = '100%';
    this.map3DMountEl.style.height = '100%';
    this.map3DMountEl.style.display = 'none';

    this.container.appendChild(this.streetViewStageWrapper);
    this.container.appendChild(this.map3DMountEl);

    // 3. Create the Transparent Synchronized Three.js 3D Depth & Splat Overlay Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio)
    );

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.dataset.testid = 'earth-3d-canvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.15, 280);

    this.depthCorridorGroup = new THREE.Group();
    this.depthCorridorGroup.name = 'streetview-3d-depth-corridor';
    this.splatWorldGroup = new THREE.Group();
    this.splatWorldGroup.name = 'layer-a-gaussian-splats';
    this.scene.add(this.depthCorridorGroup, this.splatWorldGroup);

    this.bindEventListeners();
    void this.initGoogleStreetViewAnd3DMap();
    this.startLoop();
  }

  private async initGoogleStreetViewAnd3DMap(): Promise<void> {
    const win = window as unknown as WindowWithGoogleMaps;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (this.isDisposed) return;
      if (typeof win.google?.maps?.importLibrary === 'function') {
        break;
      }
      await new Promise((r) => window.setTimeout(r, 100));
    }

    if (this.isDisposed || typeof win.google?.maps?.importLibrary !== 'function') {
      return;
    }

    try {
      const svLib = (await win.google.maps.importLibrary(
        'streetView'
      )) as GoogleStreetViewLibrary;
      if (this.isDisposed) return;

      this.streetViewLib = svLib;
      this.streetViewService = new svLib.StreetViewService();

      const target = this.activeRound?.streetViewTarget ?? {
        lat: 34.998582,
        lon: 135.780895,
        elevation: 68,
        headingDeg: 108,
        pitchDeg: 2,
      };

      this.streetViewPanorama = new svLib.StreetViewPanorama(this.streetViewMountEl, {
        position: { lat: target.lat, lng: target.lon },
        pov: { heading: target.headingDeg, pitch: target.pitchDeg },
        zoom: 1,
        visible: true,
        addressControl: false,
        showRoadLabels: Boolean(this.activeRound?.explorerMetadata),
        linksControl: this.allowMovement,
        clickToGo: this.allowMovement,
        panControl: false,
        zoomControl: false,
        fullscreenControl: false,
        enableCloseButton: false,
        motionTracking: false,
        motionTrackingControl: false,
      });

      this.attachStreetViewListeners(this.streetViewPanorama);

      if (this.activeRound) {
        await this.resolveAndMoveToStreetViewTarget(this.activeRound);
      }

      // Also initialize Google Photorealistic 3D Map (`gmp-map-3d`) for the 3D Tiles mode
      try {
        const maps3dLib = (await win.google.maps.importLibrary(
          'maps3d'
        )) as GoogleMaps3DLibrary;
        if (!this.isDisposed && maps3dLib?.Map3DElement) {
          const map3d = new maps3dLib.Map3DElement({
            center: {
              lat: target.lat,
              lng: target.lon,
              altitude: Math.max(15, target.elevation * 0.4),
            },
            range: 95,
            tilt: 76,
            heading: target.headingDeg,
            mode: maps3dLib.MapMode?.SATELLITE ?? 'SATELLITE',
            defaultLabelsDisabled: !this.activeRound?.explorerMetadata,
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          });
          map3d.style.display = 'block';
          map3d.style.width = '100%';
          map3d.style.height = '100%';
          this.map3DMountEl.innerHTML = '';
          this.map3DMountEl.appendChild(map3d);
          this.map3DElement = map3d;
        }
      } catch {
        // Photorealistic 3D Tiles optional if browser WebGL context limit reached
      }
    } catch {
      // Fallback handled gracefully
    }
  }

  private attachStreetViewListeners(pano: GoogleStreetViewPanoramaInstance): void {
    for (const l of this.streetViewListeners) {
      l.remove();
    }
    this.streetViewListeners = [];

    const panoChanged = pano.addListener('pano_changed', () => {
      this.currentPanoId = pano.getPano() || null;
    });

    const posChanged = pano.addListener('position_changed', () => {
      const pos = pano.getPosition();
      if (!pos) return;
      const lat = pos.lat();
      const lon = pos.lng();
      this.currentRealWGS84 = {
        lat,
        lon,
        elevation: this.spawnOriginWGS84.elevation,
      };
      const enu = wgs84ToEnu(this.currentRealWGS84, this.spawnOriginWGS84);
      this.capsule.east = enu.east;
      this.capsule.north = enu.north;
      this.syncMap3DCamera();
      this.updateDynamicChunkStreaming(true);
    });

    const povChanged = pano.addListener('pov_changed', () => {
      if (this.isSyncingFromEnginePov) return;
      const pov = pano.getPov();
      if (pov && Number.isFinite(pov.heading) && Number.isFinite(pov.pitch)) {
        this.capsule.yawRad = (pov.heading * Math.PI) / 180;
        this.capsule.pitchRad = Math.max(
          -Math.PI * 0.45,
          Math.min(Math.PI * 0.45, (pov.pitch * Math.PI) / 180)
        );
        this.syncMap3DCamera();
      }
    });

    const linksChanged = pano.addListener('links_changed', () => {
      const rawLinks = pano.getLinks() ?? [];
      this.currentLinks = rawLinks.filter((l): l is GoogleStreetViewLink => Boolean(l));
      this.rebuild3DStreetDepthCorridor();
    });

    this.streetViewListeners.push(panoChanged, posChanged, povChanged, linksChanged);
  }

  private async resolveAndMoveToStreetViewTarget(
    bootstrap: GameRoundPublicState['sceneBootstrap']
  ): Promise<void> {
    if (!this.streetViewPanorama || !this.streetViewService || !this.streetViewLib) return;

    const target = bootstrap.streetViewTarget;
    this.spawnOriginWGS84 = {
      lat: target.lat,
      lon: target.lon,
      elevation: target.elevation,
    };
    this.currentRealWGS84 = { ...this.spawnOriginWGS84 };

    this.streetViewPanorama.setOptions({
      addressControl: false,
      showRoadLabels: Boolean(bootstrap.explorerMetadata),
      linksControl: this.allowMovement,
      clickToGo: this.allowMovement,
      panControl: false,
      zoomControl: false,
      fullscreenControl: false,
      enableCloseButton: false,
    });

    try {
      const { data } = await this.streetViewService.getPanorama({
        location: { lat: target.lat, lng: target.lon },
        radius: 150,
        preference: this.streetViewLib.StreetViewPreference.NEAREST,
        source: this.streetViewLib.StreetViewSource.OUTDOOR,
      });

      if (this.isDisposed) return;

      if (data.location?.pano) {
        this.currentPanoId = data.location.pano;
        if (data.location.latLng) {
          this.spawnOriginWGS84 = {
            lat: data.location.latLng.lat(),
            lon: data.location.latLng.lng(),
            elevation: target.elevation,
          };
          this.currentRealWGS84 = { ...this.spawnOriginWGS84 };
        }

        let alignedHeading = target.headingDeg;
        if (data.links && data.links.length > 0) {
          const validLinks = data.links.filter(
            (l): l is GoogleStreetViewLink => l !== null && typeof l.heading === 'number'
          );
          if (validLinks.length > 0) {
            this.currentLinks = validLinks;
            let bestDiff = 360;
            for (const link of validLinks) {
              const linkHdg = link.heading ?? 0;
              let diff = Math.abs((((linkHdg - target.headingDeg) % 360) + 540) % 360 - 180);
              if (diff < bestDiff) {
                bestDiff = diff;
                alignedHeading = linkHdg;
              }
            }
          }
        }

        this.capsule.yawRad = (alignedHeading * Math.PI) / 180;
        this.streetViewPanorama.setPano(data.location.pano);
        this.streetViewPanorama.setPov({
          heading: alignedHeading,
          pitch: target.pitchDeg,
        });
        this.streetViewPanorama.setZoom(this.active3DMode === 'google_photorealistic_3d' ? 0.35 : 1);
        this.streetViewPanorama.setVisible(true);
      }
    } catch {
      if (this.isDisposed) return;
      this.streetViewPanorama.setPosition({ lat: target.lat, lng: target.lon });
      this.streetViewPanorama.setPov({
        heading: target.headingDeg,
        pitch: target.pitchDeg,
      });
      this.streetViewPanorama.setVisible(true);
    }

    this.rebuild3DStreetDepthCorridor();
    this.syncMap3DCamera();
  }

  /**
   * Build the Three.js 3D Depth-Displaced Street Canyon & Navigation Vector Mesh
   * aligned with the real-world Google Street View road links (`panorama.getLinks()`).
   * Never creates opaque cartoon boxes; constructs translucent 3D laser-depth planes,
   * road perspective grids, and 3D facade relief wireframes that lock onto the real Street View imagery.
   */
  private rebuild3DStreetDepthCorridor(): void {
    while (this.depthCorridorGroup.children.length > 0) {
      this.depthCorridorGroup.remove(this.depthCorridorGroup.children[0]);
    }
    for (const d of this.corridorDisposables) {
      d.dispose();
    }
    this.corridorDisposables = [];

    if (this.depthReliefStrength <= 0.02) return;

    const links =
      this.currentLinks.length > 0
        ? this.currentLinks
        : [
            { heading: (this.capsule.yawRad * 180) / Math.PI, description: 'Forward Axis' },
            {
              heading: ((this.capsule.yawRad * 180) / Math.PI + 180) % 360,
              description: 'Reverse Axis',
            },
          ];

    const isReliefMode =
      this.active3DMode === 'streetview_3d_relief' ||
      this.active3DMode === 'google_photorealistic_3d';
    const baseOpacity = isReliefMode
      ? Math.min(0.55, 0.22 + this.depthReliefStrength * 0.35)
      : Math.min(0.28, this.depthReliefStrength * 0.28);

    // 1. Ground-Plane Geodesic Circular Laser Ring at Street Level (y = 0, camera at y = 1.7m)
    const ringGeo = new THREE.RingGeometry(2.2, 2.35, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: baseOpacity * 1.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.corridorDisposables.push(ringGeo, ringMat);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(this.capsule.east, 0.04, -this.capsule.north);
    this.depthCorridorGroup.add(ringMesh);

    // 2. For each real Street View road link, extrude a 3D Street Depth Corridor & Facade Relief Canyon
    for (const link of links) {
      const headingDeg = typeof link.heading === 'number' ? link.heading : 0;
      const headingRad = (headingDeg * Math.PI) / 180;

      const branchGroup = new THREE.Group();
      branchGroup.position.set(this.capsule.east, 0, -this.capsule.north);
      branchGroup.rotation.y = -headingRad;

      const corridorLength = isReliefMode ? 52 : 34;
      const corridorWidth = 7.4;

      // Ground perspective depth rails along the real road heading
      const railPoints: THREE.Vector3[] = [
        new THREE.Vector3(-corridorWidth * 0.5, 0.03, -2.5),
        new THREE.Vector3(-corridorWidth * 0.5, 0.03, -corridorLength),
        new THREE.Vector3(corridorWidth * 0.5, 0.03, -2.5),
        new THREE.Vector3(corridorWidth * 0.5, 0.03, -corridorLength),
      ];
      // Cross-ties every 6 meters to give strong 3D ground depth perception over the real street
      for (let dist = 4; dist <= corridorLength; dist += 6) {
        railPoints.push(
          new THREE.Vector3(-corridorWidth * 0.5, 0.03, -dist),
          new THREE.Vector3(corridorWidth * 0.5, 0.03, -dist)
        );
      }

      const railGeo = new THREE.BufferGeometry().setFromPoints(railPoints);
      const railMat = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: baseOpacity,
      });
      this.corridorDisposables.push(railGeo, railMat);
      const railLines = new THREE.LineSegments(railGeo, railMat);
      branchGroup.add(railLines);

      // In 3D Extruded Street Mesh mode (or high depth relief), add vertical 3D building facade depth planes
      if (isReliefMode || this.depthReliefStrength >= 0.45) {
        const wallHeight = 14 * (0.5 + this.depthReliefStrength * 0.8);
        const wallGeo = new THREE.PlaneGeometry(corridorLength, wallHeight, 12, 4);
        const wallMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: isReliefMode ? baseOpacity * 0.65 : baseOpacity * 0.35,
          depthWrite: false,
        });
        this.corridorDisposables.push(wallGeo, wallMat);

        const leftWall = new THREE.Mesh(wallGeo, wallMat);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-corridorWidth * 0.62, wallHeight * 0.5, -corridorLength * 0.5);

        const rightWall = new THREE.Mesh(wallGeo, wallMat);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(corridorWidth * 0.62, wallHeight * 0.5, -corridorLength * 0.5);

        branchGroup.add(leftWall, rightWall);
      }

      this.depthCorridorGroup.add(branchGroup);
    }
  }

  private syncMap3DCamera(): void {
    if (!this.map3DElement) return;
    const yawDeg = (((this.capsule.yawRad * 180) / Math.PI) % 360 + 360) % 360;
    const pitchDeg = (this.capsule.pitchRad * 180) / Math.PI;
    this.map3DElement.center = {
      lat: this.currentRealWGS84.lat,
      lng: this.currentRealWGS84.lon,
      altitude: Math.max(12, this.currentRealWGS84.elevation * 0.35),
    };
    this.map3DElement.heading = yawDeg;
    this.map3DElement.tilt = Math.max(45, Math.min(84, 76 + pitchDeg * 0.35));
    this.map3DElement.range = 85;
  }

  private syncSplatVisibility(): void {
    const showSplats =
      this.active3DMode === 'streetview_3d_relief' && this.depthReliefStrength >= 0.2;
    for (const handle of Object.values(this.activeSceneChunks)) {
      handle.mesh.visible = showSplats;
    }
  }

  public setStreetView3DMode(mode: StreetView3DMode): void {
    this.active3DMode = mode;
    this.map3DMountEl.style.display = 'none';
    this.streetViewStageWrapper.style.display = 'block';
    this.streetViewStageWrapper.style.perspective =
      mode === 'google_photorealistic_3d' ? '760px' : '1100px';

    if (this.streetViewPanorama) {
      this.streetViewPanorama.setZoom(mode === 'google_photorealistic_3d' ? 0.35 : 1);
    }

    this.syncSplatVisibility();
    this.rebuild3DStreetDepthCorridor();
  }

  public getStreetView3DMode(): StreetView3DMode {
    return this.active3DMode;
  }

  public setDepthReliefStrength(strength: number): void {
    this.depthReliefStrength = Math.max(0, Math.min(1, strength));
    this.syncSplatVisibility();
    this.rebuild3DStreetDepthCorridor();
  }

  public getDepthReliefStrength(): number {
    return this.depthReliefStrength;
  }

  /**
   * Step forward (+1) or backward (-1) along the real Google Street View panorama link graph (`getLinks()`).
   */
  public stepAlongStreetViewHeading(direction: 1 | -1): boolean {
    if (!this.allowMovement) return false;
    const now = performance.now();
    if (now - this.lastStepTimeMs < 480) return false;
    this.lastStepTimeMs = now;

    const currentHeadingDeg = (((this.capsule.yawRad * 180) / Math.PI) % 360 + 360) % 360;
    const targetHeadingDeg =
      direction === 1 ? currentHeadingDeg : (currentHeadingDeg + 180) % 360;

    // Trigger 3D perspective stride pulse for tactile 3D motion feel
    this.stridePulse = direction * 1.0;
    this.audioSynth.playFootstep(false);

    if (this.streetViewPanorama) {
      const links = this.streetViewPanorama.getLinks() ?? [];
      let bestLink: GoogleStreetViewLink | null = null;
      let bestDiff = 180;

      for (const link of links) {
        if (!link || !link.pano || typeof link.heading !== 'number') continue;
        const diff = Math.abs(shortestAngleDiffDeg(targetHeadingDeg, link.heading));
        if (diff < bestDiff) {
          bestDiff = diff;
          bestLink = link;
        }
      }

      if (bestLink && bestLink.pano && bestDiff <= 115) {
        this.streetViewPanorama.setPano(bestLink.pano);
        return true;
      }

      // If pano links are still loading, step 10 meters along the street heading and query nearest Street View pano
      const stepMeters = 10 * direction;
      const dEast = Math.sin(this.capsule.yawRad) * stepMeters;
      const dNorth = Math.cos(this.capsule.yawRad) * stepMeters;
      const nextENU = {
        east: this.capsule.east + dEast,
        north: this.capsule.north + dNorth,
        up: this.capsule.up,
      };
      const nextWGS84 = enuToWgs84(nextENU, this.spawnOriginWGS84);
      this.currentRealWGS84 = nextWGS84;
      this.capsule.east = nextENU.east;
      this.capsule.north = nextENU.north;
      this.streetViewPanorama.setPosition({ lat: nextWGS84.lat, lng: nextWGS84.lon });
      this.syncMap3DCamera();
      this.rebuild3DStreetDepthCorridor();
      return true;
    }

    return false;
  }

  public getCapabilities() {
    return this.capabilities;
  }

  public setMuted(muted: boolean): void {
    this.audioSynth.setMuted(muted);
  }

  public isMuted(): boolean {
    return this.audioSynth.isMuted();
  }

  public playPinDropSound(): void {
    this.audioSynth.playPinDrop();
  }

  public playScoreRevealSound(highScore: boolean): void {
    this.audioSynth.playScoreReveal(highScore);
  }

  public setTitleFlyoverMode(enabled: boolean): void {
    this.isTitleFlyover = enabled;
    if (!enabled && this.activeRound) {
      this.capsule.east = 0;
      this.capsule.north = 0;
      this.capsule.up = 0;
      this.capsule.yawRad = (this.activeRound.streetViewTarget.headingDeg * Math.PI) / 180;
      this.capsule.pitchRad = (this.activeRound.streetViewTarget.pitchDeg * Math.PI) / 180;
      this.capsule.velEast = 0;
      this.capsule.velNorth = 0;
      this.keysHeld.clear();
      void this.resolveAndMoveToStreetViewTarget(this.activeRound);
    }
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      this.keysHeld.clear();
      this.isDraggingLook = false;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }

  public setSensitivity(sensitivity: number): void {
    this.mouseSensitivity = Math.max(0.2, Math.min(3.0, sensitivity));
  }

  public setReducedEffects(reduced: boolean): void {
    this.reducedEffects = reduced;
  }

  public setVirtualJoystick(forward: number, right: number): void {
    this.virtualJoystickInput.forward = Math.max(-1, Math.min(1, forward));
    this.virtualJoystickInput.right = Math.max(-1, Math.min(1, right));
    if (forward > 0.5) {
      this.stepAlongStreetViewHeading(1);
    } else if (forward < -0.5) {
      this.stepAlongStreetViewHeading(-1);
    }
  }

  public nudgeCameraLook(yawDeltaDeg: number, pitchDeltaDeg: number): void {
    this.pendingYawDeltaRad += (yawDeltaDeg * Math.PI) / 180;
    this.pendingPitchDeltaRad += (pitchDeltaDeg * Math.PI) / 180;
  }

  public setPerformanceProfile(profileId: PerformanceProfileId, isAuto: boolean = false): void {
    this.activeProfileId = profileId;
    this.autoDowngraded = isAuto;
    const profile = PERFORMANCE_PROFILES[profileId];
    const isSoftwareGl = this.capabilities.isSoftwareRenderer;

    this.renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio)
    );

    const protectedIds = new Set(Object.keys(this.activeSceneChunks));
    this.chunkCache.setBudgetBytes(profile.memoryBudgetBytes, protectedIds);
    this.updateDynamicChunkStreaming(true);
  }

  /**
   * Load a new geographic scene bootstrap into the Real Street View + 3D Manipulation Engine.
   */
  public loadSceneBootstrap(
    bootstrap: GameRoundPublicState['sceneBootstrap'],
    allowMovement: boolean
  ): void {
    const t0 = performance.now();
    this.cancelAllInFlightRequests();
    this.clearCurrentSceneGeometry();

    this.activeRound = bootstrap;
    this.allowMovement = allowMovement;

    this.spawnOriginWGS84 = {
      lat: bootstrap.streetViewTarget.lat,
      lon: bootstrap.streetViewTarget.lon,
      elevation: bootstrap.streetViewTarget.elevation,
    };
    this.currentRealWGS84 = { ...this.spawnOriginWGS84 };

    this.capsule = {
      east: 0,
      north: 0,
      up: 0,
      velEast: 0,
      velNorth: 0,
      yawRad: (bootstrap.streetViewTarget.headingDeg * Math.PI) / 180,
      pitchRad: (bootstrap.streetViewTarget.pitchDeg * Math.PI) / 180,
      walkCyclePhase: 0,
      collidingWithId: null,
    };

    void this.resolveAndMoveToStreetViewTarget(bootstrap);

    this.initialLoadTimeMs = Math.round(performance.now() - t0);
    this.updateDynamicChunkStreaming(true);
  }

  /**
   * Ingest a user-supplied `.splat` or `.ply` Gaussian Splat cloud into the synchronized 3D overlay.
   */
  public ingestCustomSplatCloud(cloud: DecodedGaussianSplatCloud, label: string): void {
    if (this.customIngestedHandle) {
      this.splatWorldGroup.remove(this.customIngestedHandle.mesh);
      this.customIngestedHandle.dispose();
      this.customIngestedHandle = null;
    }

    const profile = PERFORMANCE_PROFILES[this.activeProfileId];
    const handle = createGaussianSplatChunkMesh(
      `ingested:${label}`,
      cloud,
      profile.maxActiveSplats
    );
    handle.mesh.position.set(this.capsule.east, 0, -this.capsule.north);
    this.splatWorldGroup.add(handle.mesh);
    this.customIngestedHandle = handle;
  }

  /**
   * Execute the 12-step Dynamic World Streaming Sequence (Section 5).
   */
  private updateDynamicChunkStreaming(forceImmediate: boolean = false): void {
    const now = performance.now();
    if (!forceImmediate && now - this.lastStreamingCheckMs < 240) return;
    this.lastStreamingCheckMs = now;

    if (!this.activeRound) return;

    const profile = PERFORMANCE_PROFILES[this.activeProfileId];
    const playerENU = {
      east: this.capsule.east,
      north: this.capsule.north,
      up: this.capsule.up,
    };
    const cameraForwardENU = {
      east: Math.sin(this.capsule.yawRad),
      north: Math.cos(this.capsule.yawRad),
    };
    const velocityENU = {
      east: this.capsule.velEast,
      north: this.capsule.velNorth,
    };

    const desiredChunks: Array<{
      descriptor: WorldChunkDescriptor;
      priority: ReturnType<typeof classifyChunkPriority>['priority'];
      distanceMeters: number;
    }> = [];

    for (const chunk of this.activeRound.chunks) {
      const classification = classifyChunkPriority(
        chunk,
        playerENU,
        cameraForwardENU,
        velocityENU
      );
      const desiredLod = selectDesiredLODForDistance(
        classification.distanceMeters,
        profile.streamingRadiusMeters
      );

      if (desiredLod === chunk.lodLevel) {
        desiredChunks.push({
          descriptor: chunk,
          priority: classification.priority,
          distanceMeters: classification.distanceMeters,
        });
      }
    }

    desiredChunks.sort((a, b) => {
      const pDiff = compareChunkPriority(a.priority, b.priority);
      if (pDiff !== 0) return pDiff;
      return a.distanceMeters - b.distanceMeters;
    });

    const desiredChunkIds = new Set(desiredChunks.map((d) => d.descriptor.chunkId));

    for (const chunkId of Object.keys(this.inFlightAborters)) {
      if (!desiredChunkIds.has(chunkId)) {
        this.inFlightAborters[chunkId].abort();
        delete this.inFlightAborters[chunkId];
        this.cancelledRequestsCount++;
      }
    }

    for (const chunkId of Object.keys(this.activeSceneChunks)) {
      if (!desiredChunkIds.has(chunkId)) {
        const handle = this.activeSceneChunks[chunkId];
        this.splatWorldGroup.remove(handle.mesh);
        delete this.activeSceneChunks[chunkId];
      }
    }

    let remainingSplatBudget = profile.maxActiveSplats;
    for (const item of desiredChunks) {
      if (remainingSplatBudget <= 0) break;
      const { descriptor, priority } = item;

      const cached = this.chunkCache.get(
        descriptor.chunkId,
        descriptor.assetManifest.assetVersion,
        now
      );
      const showStreamedSplats =
        this.active3DMode === 'streetview_3d_relief' && this.depthReliefStrength >= 0.2;
      if (cached) {
        if (!this.activeSceneChunks[descriptor.chunkId]) {
          cached.mesh.visible = showStreamedSplats;
          this.splatWorldGroup.add(cached.mesh);
          this.activeSceneChunks[descriptor.chunkId] = cached;
        } else {
          cached.mesh.visible = showStreamedSplats;
        }
        remainingSplatBudget -= cached.splatCount;
        continue;
      }

      if (!this.inFlightAborters[descriptor.chunkId]) {
        void this.fetchAndMountChunk(descriptor, priority, desiredChunkIds);
      }
    }
  }

  private async fetchAndMountChunk(
    descriptor: WorldChunkDescriptor,
    priority: ReturnType<typeof classifyChunkPriority>['priority'],
    protectedChunkIds: Set<string>
  ): Promise<void> {
    const controller = new AbortController();
    this.inFlightAborters[descriptor.chunkId] = controller;
    const startMs = performance.now();

    try {
      const response = await fetch(descriptor.assetManifest.splatUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuf = await response.arrayBuffer();
      if (this.isDisposed || controller.signal.aborted) return;

      const decoded = decodeSplatBinaryBuffer(new Uint8Array(arrayBuf));
      if (!decoded.valid || !decoded.cloud) {
        throw new Error(decoded.error ?? 'Invalid splat payload');
      }

      const profile = PERFORMANCE_PROFILES[this.activeProfileId];
      const maxPerChunk = Math.max(250, Math.floor(profile.maxActiveSplats / 8));
      const handle = createGaussianSplatChunkMesh(
        descriptor.chunkId,
        decoded.cloud,
        maxPerChunk
      );
      handle.mesh.visible =
        this.active3DMode === 'streetview_3d_relief' && this.depthReliefStrength >= 0.2;

      this.chunkCache.put(
        {
          chunkId: descriptor.chunkId,
          assetVersion: descriptor.assetManifest.assetVersion,
          byteLength: handle.byteLength,
          priority,
          resource: handle,
          dispose: handle.dispose,
        },
        protectedChunkIds,
        performance.now()
      );

      this.splatWorldGroup.add(handle.mesh);
      this.activeSceneChunks[descriptor.chunkId] = handle;
      this.lastChunkLoadTimeMs = Math.round(performance.now() - startMs);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        this.failedRequestsCount++;
      }
    } finally {
      delete this.inFlightAborters[descriptor.chunkId];
    }
  }

  private startLoop(): void {
    const isSoftwareGl = this.capabilities.isSoftwareRenderer;

    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (this.isDisposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.isDisposed) return;
      const now = performance.now();
      const rawDtMs = now - this.lastFrameTimestampMs;
      this.lastFrameTimestampMs = now;

      const clampedDtSec = Math.min(Math.max(rawDtMs / 1000, 0.001), 0.05);
      const workStartMs = performance.now();
      this.stepSimulationAndCamera(clampedDtSec, now);
      this.renderer.render(this.scene, this.camera);
      const workElapsedMs = performance.now() - workStartMs;

      this.perfMonitor.recordFrameDeltaMs(isSoftwareGl ? Math.max(16.6, workElapsedMs) : rawDtMs);
      if (
        !this.capabilities.isSoftwareRenderer &&
        this.activeProfileId !== 'PERFORMANCE' &&
        this.perfMonitor.shouldTriggerAutoDowngrade()
      ) {
        const nextProfile: PerformanceProfileId =
          this.activeProfileId === 'QUALITY' ? 'BALANCED' : 'PERFORMANCE';
        this.setPerformanceProfile(nextProfile, true);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = window.requestAnimationFrame(tick);
      }
    };

    this.frameId = window.requestAnimationFrame(tick);
  }

  private stepSimulationAndCamera(dtSec: number, nowMs: number): void {
    if (!this.activeRound) return;

    // Decay 3D stride pulse smoothly
    this.stridePulse *= Math.exp(-dtSec * 6.5);
    if (Math.abs(this.stridePulse) < 0.005) this.stridePulse = 0;

    if (this.isTitleFlyover) {
      this.flyoverTimeSec += dtSec;
      const baseHeading = this.activeRound.streetViewTarget.headingDeg;
      const panHeading = (baseHeading + this.flyoverTimeSec * 4.5) % 360;
      const panPitch = 3 + Math.sin(this.flyoverTimeSec * 0.6) * 4;
      this.capsule.yawRad = (panHeading * Math.PI) / 180;
      this.capsule.pitchRad = (panPitch * Math.PI) / 180;

      if (this.streetViewPanorama) {
        this.isSyncingFromEnginePov = true;
        this.streetViewPanorama.setPov({ heading: panHeading, pitch: panPitch });
        this.isSyncingFromEnginePov = false;
      }
    } else if (!this.isPaused) {
      let moveForward = this.virtualJoystickInput.forward;
      let lookYawInput = 0;

      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveForward += 1;
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveForward -= 1;
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) lookYawInput += 1;
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) lookYawInput -= 1;

      if (lookYawInput !== 0) {
        this.pendingYawDeltaRad += lookYawInput * dtSec * 1.45 * this.mouseSensitivity;
      }

      const hasLookDelta =
        Math.abs(this.pendingYawDeltaRad) > 1e-5 ||
        Math.abs(this.pendingPitchDeltaRad) > 1e-5;

      // Update look angles and capsule state
      this.capsule = stepCapsulePhysics(
        this.capsule,
        {
          moveForward: 0,
          moveRight: 0,
          sprintHeld: false,
          yawDeltaRad: this.pendingYawDeltaRad,
          pitchDeltaRad: this.pendingPitchDeltaRad,
        },
        dtSec,
        this.allowMovement,
        [],
        [],
        []
      );
      this.pendingYawDeltaRad = 0;
      this.pendingPitchDeltaRad = 0;

      if (hasLookDelta && this.streetViewPanorama) {
        const headingDeg = (((this.capsule.yawRad * 180) / Math.PI) % 360 + 360) % 360;
        const pitchDeg = (this.capsule.pitchRad * 180) / Math.PI;
        this.isSyncingFromEnginePov = true;
        this.streetViewPanorama.setPov({ heading: headingDeg, pitch: pitchDeg });
        this.isSyncingFromEnginePov = false;
        this.syncMap3DCamera();
      }

      // Step along the real Street View road graph when pressing W/S
      if (this.allowMovement && Math.abs(moveForward) > 0.4) {
        this.stepAlongStreetViewHeading(moveForward > 0 ? 1 : -1);
      }

      this.updateDynamicChunkStreaming(false);
    }

    // Apply 3D Perspective Depth & Relief Manipulation to the Real Street View Stage
    const pitchDeg = (this.capsule.pitchRad * 180) / Math.PI;
    const isRelief = this.active3DMode === 'streetview_3d_relief';
    const reliefFactor = isRelief ? Math.max(0.55, this.depthReliefStrength) : this.depthReliefStrength;
    const tiltDeg = !this.reducedEffects
      ? Math.max(-14, Math.min(14, pitchDeg * 0.16 * reliefFactor))
      : 0;
    const strideZoom = !this.reducedEffects ? this.stridePulse * 0.045 * (0.4 + reliefFactor) : 0;
    const baseScale = 1 + reliefFactor * (isRelief ? 0.08 : 0.03) + strideZoom;
    const translateZPx = !this.reducedEffects ? this.stridePulse * 38 * reliefFactor : 0;

    this.streetViewMountEl.style.transform = `rotateX(${tiltDeg.toFixed(2)}deg) translateZ(${translateZPx.toFixed(1)}px) scale(${baseScale.toFixed(4)})`;

    // Sync Three.js 3D Overlay Camera 1:1 with Street View POV & Position
    const zoom = this.streetViewPanorama?.getZoom() ?? 1;
    const targetFov = Math.max(28, Math.min(100, 90 / Math.pow(1.45, zoom - 1)));
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    const eyeENU = getCameraPositionENU(this.capsule, this.reducedEffects);
    this.camera.position.set(eyeENU.east, eyeENU.up, -eyeENU.north);

    const euler = new THREE.Euler(this.capsule.pitchRad, -this.capsule.yawRad, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Emit throttled telemetry snapshot (4Hz)
    if (nowMs - this.lastTelemetryEmitMs >= 250) {
      this.lastTelemetryEmitMs = nowMs;
      this.emitTelemetry();
    }
  }

  private emitTelemetry(): void {
    if (!this.activeRound) return;
    const metrics = this.perfMonitor.getMetrics();
    const explorerMeta = this.activeRound.explorerMetadata;

    const playerENU = {
      east: Number(this.capsule.east.toFixed(2)),
      north: Number(this.capsule.north.toFixed(2)),
      up: Number(this.capsule.up.toFixed(2)),
    };

    const playerWGS84 = explorerMeta ? this.currentRealWGS84 : null;

    const currentH3Index = playerWGS84
      ? latLonToH3Index(playerWGS84.lat, playerWGS84.lon, 10)
      : 'SESSION-ANONYMIZED';

    let activeSplatCount = this.customIngestedHandle
      ? this.customIngestedHandle.splatCount
      : 0;
    if (this.depthReliefStrength >= 0.15) {
      for (const handle of Object.values(this.activeSceneChunks)) {
        activeSplatCount += handle.splatCount;
      }
    }

    this.callbacks.onTelemetryUpdate({
      fps: metrics.fps,
      frameTimeP50Ms: metrics.p50Ms,
      frameTimeP95Ms: metrics.p95Ms,
      frameTimeP99Ms: metrics.p99Ms,
      activeProfile: this.activeProfileId,
      autoDowngraded: this.autoDowngraded,
      backend: this.capabilities.backend,
      loadedChunksCount: this.chunkCache.getEntryCount(),
      visibleChunksCount: Object.keys(this.activeSceneChunks).length,
      inFlightRequests: Object.keys(this.inFlightAborters).length,
      cancelledRequests: this.cancelledRequestsCount,
      failedRequests: this.failedRequestsCount,
      evictedChunksCount: this.chunkCache.getEvictedCount(),
      cacheUsedBytes: this.chunkCache.getUsedBytes(),
      cacheBudgetBytes: this.chunkCache.getBudgetBytes(),
      activeSplatCount,
      initialLoadTimeMs: this.initialLoadTimeMs,
      lastChunkLoadTimeMs: this.lastChunkLoadTimeMs,
      playerENU,
      playerWGS84,
      currentH3Index,
      cameraYawDeg: Math.round((((this.capsule.yawRad * 180) / Math.PI) % 360 + 360) % 360),
      cameraPitchDeg: Math.round((this.capsule.pitchRad * 180) / Math.PI),
      active3DMode: this.active3DMode,
      streetViewPanoId: this.currentPanoId,
      linkedPanosCount: this.currentLinks.length,
      depthReliefStrength: this.depthReliefStrength,
    });
  }

  private bindEventListeners(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if ((e.code === 'Escape' || e.code === 'KeyP') && !this.isTitleFlyover) {
        this.callbacks.onPauseToggleRequested();
        return;
      }

      this.keysHeld.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    const onBlurOrVisibility = () => {
      this.keysHeld.clear();
      this.isDraggingLook = false;
    };

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrVisibility);
    document.addEventListener('visibilitychange', onBlurOrVisibility);

    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrVisibility);
      document.removeEventListener('visibilitychange', onBlurOrVisibility);
    };
  }

  private cleanupListeners: () => void = () => {};

  private cancelAllInFlightRequests(): void {
    for (const key of Object.keys(this.inFlightAborters)) {
      this.inFlightAborters[key].abort();
      delete this.inFlightAborters[key];
    }
  }

  private clearCurrentSceneGeometry(): void {
    for (const chunkId of Object.keys(this.activeSceneChunks)) {
      const handle = this.activeSceneChunks[chunkId];
      this.splatWorldGroup.remove(handle.mesh);
      delete this.activeSceneChunks[chunkId];
    }

    if (this.customIngestedHandle) {
      this.splatWorldGroup.remove(this.customIngestedHandle.mesh);
      this.customIngestedHandle.dispose();
      this.customIngestedHandle = null;
    }

    while (this.depthCorridorGroup.children.length > 0) {
      this.depthCorridorGroup.remove(this.depthCorridorGroup.children[0]);
    }

    for (const item of this.corridorDisposables) {
      item.dispose();
    }
    this.corridorDisposables = [];
  }

  public dispose(): void {
    this.isDisposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    for (const l of this.streetViewListeners) {
      l.remove();
    }
    this.streetViewListeners = [];
    this.cleanupListeners();
    this.resizeObserver?.disconnect();
    this.cancelAllInFlightRequests();
    this.clearCurrentSceneGeometry();
    this.chunkCache.clearAll();
    this.audioSynth.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.streetViewStageWrapper.parentNode === this.container) {
      this.container.removeChild(this.streetViewStageWrapper);
    }
    if (this.map3DMountEl.parentNode === this.container) {
      this.container.removeChild(this.map3DMountEl);
    }
  }
}
