import React, { useState } from 'react';
import { ArrowRight, Compass, Cpu, RotateCcw } from 'lucide-react';
import type { GuessEvaluationResult } from '../packages/shared-types';
import { WorldGuessMap } from './WorldGuessMap';

export interface RoundResultsModalProps {
  result: GuessEvaluationResult;
  totalRounds: number;
  cumulativeScore: number;
  quotaExceeded: boolean;
  onNextRound: () => void;
  onReturnToTitle: () => void;
}

export const RoundResultsModal: React.FC<RoundResultsModalProps> = ({
  result,
  totalRounds,
  cumulativeScore,
  quotaExceeded,
  onNextRound,
  onReturnToTitle,
}) => {
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isFinalRound = result.roundNumber >= totalRounds;

  const handleRequestHighThinkingAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/geospatial/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: result.locationId,
          guessLat: result.guessWGS84.lat,
          guessLon: result.guessWGS84.lon,
        }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok || data.error) {
        setAnalysisError(data.error ?? `Request failed (${res.status})`);
      } else {
        setAnalysisText(data.analysis ?? 'No analysis available.');
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Network error calling analysis API.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Round Geodesic Evaluation Results"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#111315]/85"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col border border-[#262a30] bg-[#111315] rounded-[4px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#262a30] bg-[#181b1f]">
          <div className="flex items-center gap-2.5">
            <Compass className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-[#f3f4f6]">
              Round {result.roundNumber} of {totalRounds} — Geodesic Verification Report
            </h2>
          </div>
          <span className="font-mono text-xs text-[#9ca3af]">
            Session Total: {cumulativeScore.toLocaleString()} pts
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Primary Tabular Numerals Readout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#262a30] border border-[#262a30] bg-[#181b1f] rounded-[4px]">
            <div className="p-3.5">
              <div className="text-[11px] font-semibold uppercase text-[#9ca3af]">Round Score</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#f3f4f6] mt-0.5">
                {result.score.toLocaleString()}{' '}
                <span className="text-xs font-normal text-[#9ca3af]">/ {result.maxScore}</span>
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] font-semibold uppercase text-[#9ca3af]">
                Vincenty Geodesic Error
              </div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#f3f4f6] mt-0.5">
                {result.distanceKm < 1
                  ? `${result.distanceMeters} m`
                  : `${result.distanceKm.toLocaleString()} km`}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] font-semibold uppercase text-[#9ca3af]">
                Verified Sector
              </div>
              <div className="text-sm font-semibold text-[#f3f4f6] mt-1">
                {result.locationTitle}
              </div>
              <div className="text-xs text-[#9ca3af]">
                {result.regionName}, {result.countryName}
              </div>
            </div>
          </div>

          {/* Geodesic Verification Map */}
          <WorldGuessMap
            guessCoord={result.guessWGS84}
            actualCoord={result.actualWGS84}
            onSelectGuessCoord={() => {}}
            readOnly={true}
            quotaExceeded={quotaExceeded}
            heightClass="h-52"
          />

          {/* Coordinate & Architectural Clue Breakdown */}
          <div className="border border-[#262a30] bg-[#181b1f] p-3.5 rounded-[4px] space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#9ca3af] pb-2 border-b border-[#262a30]">
              <span>
                Actual WGS84: {result.actualWGS84.lat.toFixed(4)}°, {result.actualWGS84.lon.toFixed(4)}° (
                {result.actualWGS84.elevation}m)
              </span>
              <span>
                Guessed WGS84: {result.guessWGS84.lat.toFixed(4)}°, {result.guessWGS84.lon.toFixed(4)}° ·
                Azimuth {result.initialBearingDeg}°
              </span>
            </div>

            <div className="font-semibold text-[#f3f4f6]">Field Survey & Architectural Clues:</div>
            <ul className="list-disc list-inside space-y-1 text-[#9ca3af]">
              {result.architecturalNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>

            <div className="pt-2 border-t border-[#262a30] font-mono text-[11px] text-[#9ca3af]">
              Dataset: {result.dataSource} · License: {result.license} · Capture: {result.captureDate}
            </div>
          </div>

          {/* High-Thinking Geospatial Analysis (gemini-4-carbon) */}
          <div className="border border-[#262a30] bg-[#181b1f] p-3.5 rounded-[4px] space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-[#f3f4f6]">
                <Cpu className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
                <span>Deep Geospatial Clue Reasoning (Gemini 4 Carbon · High Thinking)</span>
              </div>
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={handleRequestHighThinkingAnalysis}
                className="px-2.5 py-1 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] disabled:opacity-50 text-[#f3f4f6] font-semibold rounded-[4px] cursor-pointer"
              >
                {isAnalyzing ? 'Running High-Thinking Analysis...' : 'Analyze Diagnostic Clues'}
              </button>
            </div>

            {analysisError && (
              <div className="p-2.5 border border-[#262a30] bg-[#111315] rounded-[4px] flex items-center gap-2 text-[#9ca3af]">
                <span className="inline-block w-2 h-2 rounded-full bg-[#d97706] shrink-0" />
                <span>{analysisError}</span>
              </div>
            )}

            {analysisText && (
              <div className="p-3 border border-[#262a30] bg-[#111315] rounded-[4px] text-[#f3f4f6] whitespace-pre-line leading-relaxed">
                {analysisText}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#262a30] bg-[#181b1f]">
          <button
            type="button"
            onClick={onReturnToTitle}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Return to Title</span>
          </button>

          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onNextRound();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
          >
            <span>{isFinalRound ? 'Start New 5-Round Survey' : `Advance to Round ${result.roundNumber + 1}`}</span>
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};
