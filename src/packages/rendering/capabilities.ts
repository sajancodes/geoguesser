import type {
  GraphicsCapabilityReport,
  PerformanceProfileConfig,
  PerformanceProfileId,
} from '../shared-types';

export const PERFORMANCE_PROFILES: Record<PerformanceProfileId, PerformanceProfileConfig> = {
  PERFORMANCE: {
    id: 'PERFORMANCE',
    label: 'Performance (Integrated / Mobile)',
    streamingRadiusMeters: 68,
    maxPixelRatio: 1.0,
    maxActiveSplats: 12000,
    memoryBudgetBytes: 64 * 1024 * 1024,
    enableShadows: false,
    enableAmbientSimulation: false,
  },
  BALANCED: {
    id: 'BALANCED',
    label: 'Balanced (Default)',
    streamingRadiusMeters: 115,
    maxPixelRatio: 1.5,
    maxActiveSplats: 32000,
    memoryBudgetBytes: 160 * 1024 * 1024,
    enableShadows: true,
    enableAmbientSimulation: true,
  },
  QUALITY: {
    id: 'QUALITY',
    label: 'Quality (Dedicated GPU)',
    streamingRadiusMeters: 165,
    maxPixelRatio: 2.0,
    maxActiveSplats: 64000,
    memoryBudgetBytes: 320 * 1024 * 1024,
    enableShadows: true,
    enableAmbientSimulation: true,
  },
};

interface NavigatorWithMemory {
  deviceMemory?: number;
}

/**
 * Detect browser graphics capabilities (WebGPU, WebGL2, software rasterizer status).
 * Frees the temporary probe context immediately via WEBGL_lose_context.
 */
export function detectGraphicsCapabilities(): GraphicsCapabilityReport {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      backend: 'unsupported',
      rendererString: 'SSR',
      isSoftwareRenderer: true,
      maxTextureSize: 2048,
      maxAnisotropy: 1,
      supportsWebGPU: false,
      supportsOffscreenCanvas: false,
      deviceMemoryGB: null,
    };
  }

  const nav = window.navigator as Navigator & NavigatorWithMemory;
  const supportsWebGPU = 'gpu' in nav && Boolean(nav.gpu);
  const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return {
      backend: 'unsupported',
      rendererString: 'WebGL2 Unavailable',
      isSoftwareRenderer: true,
      maxTextureSize: 0,
      maxAnisotropy: 1,
      supportsWebGPU,
      supportsOffscreenCanvas,
      deviceMemoryGB,
    };
  }

  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererParam = debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const rendererString = String(gl.getParameter(rendererParam) || 'WebGL2 Generic');
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;

  const anisoExt =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const maxAnisotropy = anisoExt
    ? Number(gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 4
    : 1;

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const isSoftwareRenderer =
    /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererString);

  return {
    backend: isSoftwareRenderer
      ? 'software-webgl'
      : supportsWebGPU
        ? 'webgpu'
        : 'webgl2',
    rendererString,
    isSoftwareRenderer,
    maxTextureSize,
    maxAnisotropy,
    supportsWebGPU,
    supportsOffscreenCanvas,
    deviceMemoryGB,
  };
}

/**
 * Rolling Frame-Time & Percentile Monitor with Automatic Quality Downgrade Governor.
 */
export class FramePerformanceMonitor {
  private readonly samplesMs = new Float32Array(120);
  private readonly sortScratch = new Float32Array(120);
  private writeIndex = 0;
  private sampleCount = 0;
  private consecutiveSlowFrames = 0;

  public recordFrameDeltaMs(dtMs: number): void {
    const clamped = Math.max(0.5, Math.min(250, dtMs));
    this.samplesMs[this.writeIndex] = clamped;
    this.writeIndex = (this.writeIndex + 1) % this.samplesMs.length;
    if (this.sampleCount < this.samplesMs.length) {
      this.sampleCount++;
    }

    if (clamped > 38.0) {
      this.consecutiveSlowFrames++;
    } else {
      this.consecutiveSlowFrames = Math.max(0, this.consecutiveSlowFrames - 1);
    }
  }

  public shouldTriggerAutoDowngrade(): boolean {
    if (this.consecutiveSlowFrames >= 45) {
      this.consecutiveSlowFrames = 0;
      return true;
    }
    return false;
  }

  public getMetrics(): { fps: number; p50Ms: number; p95Ms: number; p99Ms: number } {
    if (this.sampleCount === 0) {
      return { fps: 60, p50Ms: 16.6, p95Ms: 16.6, p99Ms: 16.6 };
    }

    let sum = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      const v = this.samplesMs[i];
      this.sortScratch[i] = v;
      sum += v;
    }

    const activeSlice = this.sortScratch.subarray(0, this.sampleCount);
    activeSlice.sort();

    const avgMs = sum / this.sampleCount;
    const fps = Math.min(120, Math.max(1, Math.round(1000 / avgMs)));
    const p50Ms = Number(activeSlice[Math.floor(this.sampleCount * 0.5)]?.toFixed(1) ?? 16.6);
    const p95Ms = Number(activeSlice[Math.floor(this.sampleCount * 0.95)]?.toFixed(1) ?? 16.6);
    const p99Ms = Number(activeSlice[Math.floor(this.sampleCount * 0.99)]?.toFixed(1) ?? 16.6);

    return { fps, p50Ms, p95Ms, p99Ms };
  }
}
