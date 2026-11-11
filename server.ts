import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import {
  COVERAGE_DATABASE,
  buildQuadtreeChunksForLocation,
  evaluateLocationEligibility,
} from './src/packages/coverage/coverageDatabase';
import {
  evaluateGuessAgainstLocation,
  selectFairPlayableLocation,
} from './src/packages/game-logic/scoring';
import { generateChunkSplatBinaryBuffer } from './src/packages/splat-renderer/splatBinary';
import type {
  GameModeId,
  GameRoundPublicState,
  GuessSubmissionRequest,
  LocationCoverageRecord,
  WorldChunkDescriptor,
} from './src/packages/shared-types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerSessionRecord {
  sessionId: string;
  sessionLocationToken: string;
  roundNumber: number;
  totalRounds: number;
  mode: GameModeId;
  countryFilter: string | null;
  seedCode: string;
  location: LocationCoverageRecord;
  chunksByAnonId: Record<string, WorldChunkDescriptor>;
  recentLocationIds: string[];
  createdAtMs: number;
}

const activeSessions: Record<string, ServerSessionRecord> = {};
const tokenToSessionId: Record<string, string> = {};

function makeRandomId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${rand}${time}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // 1. Coverage Registry & Eligibility Endpoint
  app.get('/api/coverage', (_req, res) => {
    const entries = COVERAGE_DATABASE.map((rec) => {
      const eligibility = evaluateLocationEligibility(rec);
      return {
        locationId: rec.locationId,
        title: rec.title,
        countryCode: rec.countryCode,
        countryName: rec.countryName,
        regionName: rec.regionName,
        originWGS84: rec.originWGS84,
        h3Index: rec.h3Index,
        coverageLayers: rec.coverageLayers,
        captureDate: rec.captureDate,
        assetVersion: rec.assetVersion,
        dataSource: rec.dataSource,
        license: rec.license,
        visualQualityScore: rec.visualQualityScore,
        navigationQualityScore: rec.navigationQualityScore,
        eligibility,
      };
    });

    res.json({
      totalLocations: entries.length,
      eligibleCount: entries.filter((e) => e.eligibility.eligible).length,
      locations: entries,
    });
  });

  // 2. Game Session & Round Creation (Server-Authoritative Secret Coordinates)
  app.post('/api/game/session', (req, res) => {
    const body = req.body as {
      mode?: GameModeId;
      countryFilter?: string | null;
      seedCode?: string | null;
      locationId?: string | null;
      roundNumber?: number;
      totalRounds?: number;
      recentLocationIds?: string[];
    };

    const mode: GameModeId = body.mode ?? 'classic';
    const countryFilter = body.countryFilter ?? null;
    const roundNumber = Math.max(1, Number(body.roundNumber) || 1);
    const totalRounds = mode === 'explorer' ? 1 : Math.max(1, Number(body.totalRounds) || 5);
    const recentIds = Array.isArray(body.recentLocationIds) ? body.recentLocationIds : [];
    const seedCode =
      typeof body.seedCode === 'string' && body.seedCode.trim().length > 0
        ? body.seedCode.trim().toUpperCase()
        : makeRandomId('SEED').toUpperCase().replace('_', '-');

    let selectedLocation: LocationCoverageRecord | undefined;
    if (body.locationId) {
      const candidate = COVERAGE_DATABASE.find((c) => c.locationId === body.locationId);
      if (candidate && evaluateLocationEligibility(candidate).eligible) {
        selectedLocation = candidate;
      }
    }
    if (!selectedLocation) {
      selectedLocation = selectFairPlayableLocation(
        recentIds,
        countryFilter,
        mode === 'duel_seed' ? seedCode : null
      );
    }

    const sessionId = makeRandomId('sess');
    const sessionLocationToken = makeRandomId('loc');
    const rawChunks = buildQuadtreeChunksForLocation(selectedLocation);
    const chunksByAnonId: Record<string, WorldChunkDescriptor> = {};

    // Anonymize chunk IDs and strip global WGS84 bounds during competitive modes
    const isExplorer = mode === 'explorer';
    const publicChunks: WorldChunkDescriptor[] = rawChunks.map((chunk, index) => {
      const anonChunkId = isExplorer
        ? chunk.chunkId
        : `chunk_L${chunk.lodLevel}_idx${index}`;
      chunksByAnonId[anonChunkId] = chunk;

      return {
        ...chunk,
        chunkId: anonChunkId,
        locationId: isExplorer ? selectedLocation.locationId : sessionLocationToken,
        h3Index: isExplorer ? chunk.h3Index : 'SESSION-HIDDEN',
        boundsWGS84: isExplorer
          ? chunk.boundsWGS84
          : { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
        assetManifest: {
          ...chunk.assetManifest,
          splatUrl: `/api/world/chunks/${encodeURIComponent(sessionLocationToken)}/${encodeURIComponent(anonChunkId)}.splat`,
        },
      };
    });

    activeSessions[sessionId] = {
      sessionId,
      sessionLocationToken,
      roundNumber,
      totalRounds,
      mode,
      countryFilter,
      seedCode,
      location: selectedLocation,
      chunksByAnonId,
      recentLocationIds: [...recentIds, selectedLocation.locationId],
      createdAtMs: Date.now(),
    };
    tokenToSessionId[sessionLocationToken] = sessionId;

    const publicState: GameRoundPublicState = {
      sessionId,
      roundNumber,
      totalRounds,
      mode,
      countryFilter,
      seedCode,
      timeLimitSeconds: mode === 'classic' || mode === 'duel_seed' ? 120 : null,
      startedAtIso: new Date().toISOString(),
      allowMovement: mode !== 'no_movement',
      sceneBootstrap: {
        sessionLocationToken,
        streetViewTarget: {
          lat: selectedLocation.originWGS84.lat,
          lon: selectedLocation.originWGS84.lon,
          elevation: selectedLocation.originWGS84.elevation,
          headingDeg: selectedLocation.spawnPointENU.yawDeg,
          pitchDeg: 2,
        },
        spawnPointENU: selectedLocation.spawnPointENU,
        sunAzimuthDeg: selectedLocation.sunAzimuthDeg,
        sunElevationDeg: selectedLocation.sunElevationDeg,
        skyHorizonHex: selectedLocation.skyHorizonHex,
        skyZenithHex: selectedLocation.skyZenithHex,
        groundTintHex: selectedLocation.groundTintHex,
        buildings: selectedLocation.buildings,
        roads: selectedLocation.roads,
        signs: selectedLocation.signs,
        props: selectedLocation.props,
        chunks: publicChunks,
        explorerMetadata: isExplorer
          ? {
              locationId: selectedLocation.locationId,
              title: selectedLocation.title,
              countryName: selectedLocation.countryName,
              regionName: selectedLocation.regionName,
              originWGS84: selectedLocation.originWGS84,
              h3Index: selectedLocation.h3Index,
            }
          : null,
      },
    };

    res.json(publicState);
  });

  // 3. Binary 3D Gaussian Splat Chunk Streaming Endpoint
  app.get('/api/world/chunks/:locationToken/:chunkFile', (req, res) => {
    const { locationToken, chunkFile } = req.params;
    const cleanChunkId = chunkFile.replace(/\.splat$/i, '');

    let location: LocationCoverageRecord | undefined;
    let chunkDescriptor: WorldChunkDescriptor | undefined;

    const sessionId = tokenToSessionId[locationToken];
    if (sessionId && activeSessions[sessionId]) {
      const sess = activeSessions[sessionId];
      location = sess.location;
      chunkDescriptor = sess.chunksByAnonId[cleanChunkId];
    } else {
      location = COVERAGE_DATABASE.find((c) => c.locationId === locationToken);
      if (location) {
        const allChunks = buildQuadtreeChunksForLocation(location);
        chunkDescriptor = allChunks.find((c) => c.chunkId === cleanChunkId) ?? allChunks[0];
      }
    }

    if (!location || !chunkDescriptor) {
      res.status(404).json({ error: 'Requested world chunk not found in active session or coverage registry.' });
      return;
    }

    const binaryBuffer = generateChunkSplatBinaryBuffer(location, chunkDescriptor);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(binaryBuffer.buffer, binaryBuffer.byteOffset, binaryBuffer.byteLength));
  });

  // 4. Server-Authoritative Guess Submission & Vincenty Geodesic Scoring
  app.post('/api/game/guess', (req, res) => {
    const body = req.body as Partial<GuessSubmissionRequest>;
    if (
      !body.sessionId ||
      typeof body.guessLat !== 'number' ||
      typeof body.guessLon !== 'number' ||
      !Number.isFinite(body.guessLat) ||
      !Number.isFinite(body.guessLon)
    ) {
      res.status(400).json({ error: 'Invalid guess coordinates or missing sessionId.' });
      return;
    }

    const session = activeSessions[body.sessionId];
    if (!session) {
      res.status(404).json({ error: 'Game session expired or not found.' });
      return;
    }

    const evaluation = evaluateGuessAgainstLocation(
      session.sessionId,
      session.roundNumber,
      body.guessLat,
      body.guessLon,
      session.location,
      session.mode === 'country_challenge'
    );

    res.json(evaluation);
  });

  // 5. High-Thinking Geospatial & Architectural Analysis via Gemini 4 Carbon
  app.post('/api/geospatial/analyze', async (req, res) => {
    const { locationId, guessLat, guessLon } = req.body as {
      locationId?: string;
      guessLat?: number;
      guessLon?: number;
    };

    const record = COVERAGE_DATABASE.find((c) => c.locationId === locationId);
    if (!record) {
      res.status(404).json({ error: 'Location not found in coverage database.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in Settings > Secrets. Configure a paid API key to run Gemini 4 Carbon high-thinking geospatial analysis.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        `Perform a concise, rigorous geospatial field analysis for "${record.title}" in ${record.regionName}, ${record.countryName} (${record.originWGS84.lat.toFixed(4)}, ${record.originWGS84.lon.toFixed(4)}, elevation ${record.originWGS84.elevation}m).`,
        typeof guessLat === 'number' && typeof guessLon === 'number'
          ? `The player guessed (${guessLat.toFixed(4)}, ${guessLon.toFixed(4)}).`
          : '',
        `Observed architectural clues: ${record.architecturalNotes.join(' ')}`,
        `Explain in 3 short paragraphs: (1) Diagnostic street-level and architectural indicators, (2) Solar geometry and road/signage conventions, and (3) How to distinguish this location from look-alike regions.`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-carbon',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });

      res.json({
        model: 'gemini-4-carbon',
        thinkingLevel: 'HIGH',
        analysis: response.text ?? 'No analysis returned.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini API call failed.';
      res.status(502).json({
        error: `Geospatial analysis unavailable: ${message}. Check your API key in Settings > Secrets.`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Earth Uncovered server listening on http://localhost:${PORT}`);
  });
}

startServer();
