import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeodesicScore,
  evaluateGuessAgainstLocation,
  selectFairPlayableLocation,
} from './scoring';
import { COVERAGE_DATABASE, getEligiblePlayableLocations } from '../coverage/coverageDatabase';
import { stepCapsulePhysics, type CapsuleState } from '../physics/capsuleController';

test('calculateGeodesicScore follows S = 5000 * exp(-d/k) and awards 5000 within 25m', () => {
  assert.equal(calculateGeodesicScore(0.01, 2000), 5000);
  // At d === k, score is round(5000 * exp(-1)) = round(1839.4) = 1839
  assert.equal(calculateGeodesicScore(2000, 2000), 1839);
  assert.ok(calculateGeodesicScore(500, 2000) > calculateGeodesicScore(1500, 2000));
});

test('CoverageEligibilityService excludes incomplete locations from playable selection', () => {
  const eligible = getEligiblePlayableLocations(null);
  assert.ok(eligible.length >= 6);
  assert.equal(
    eligible.some((l) => l.locationId === 'cairo-al-muizz-draft'),
    false
  );
  assert.equal(
    eligible.some((l) => l.locationId === 'anchorage-turnagain-draft'),
    false
  );

  // Deterministic seed code selects identical location for Duel Seed mode
  const locA = selectFairPlayableLocation([], null, 'DUEL-ALPHA-9');
  const locB = selectFairPlayableLocation(['kyoto-higashiyama'], null, 'DUEL-ALPHA-9');
  assert.equal(locA.locationId, locB.locationId);

  // City filter selects locations within that specific city
  const parisLoc = selectFairPlayableLocation([], null, null, 'Paris');
  assert.equal(parisLoc.cityName, 'Paris');
});

test('stepCapsulePhysics prevents walking through buildings and locks movement in No Movement mode', () => {
  const kyoto = COVERAGE_DATABASE[0];
  const initialState: CapsuleState = {
    east: -5.2, // just East of bld-kyoto-w1 (which spans east -14.5..-5.5)
    north: -12,
    up: 0,
    velEast: 0,
    velNorth: 0,
    yawRad: -Math.PI / 2, // facing West directly into building wall
    pitchRad: 0,
    walkCyclePhase: 0,
    collidingWithId: null,
  };

  let state = initialState;
  for (let i = 0; i < 40; i++) {
    state = stepCapsulePhysics(
      state,
      { moveForward: 1, moveRight: 0, sprintHeld: true, yawDeltaRad: 0, pitchDeltaRad: 0 },
      0.03,
      true,
      kyoto.buildings,
      kyoto.props,
      kyoto.roads
    );
  }

  // Building east wall is at -10 + 4.5 = -5.5; capsule radius is 0.42 -> east must stay >= -5.08
  assert.ok(state.east >= -5.09, `Expected capsule east (${state.east}) to be stopped by wall at -5.08`);
  assert.equal(state.collidingWithId, 'bld-kyoto-w1');

  // Verify No Movement mode locks position while permitting camera look
  const locked = stepCapsulePhysics(
    initialState,
    { moveForward: 1, moveRight: 1, sprintHeld: true, yawDeltaRad: 0.5, pitchDeltaRad: 0.1 },
    0.03,
    false,
    kyoto.buildings,
    kyoto.props,
    kyoto.roads
  );
  assert.equal(locked.east, initialState.east);
  assert.equal(locked.north, initialState.north);
  assert.notEqual(locked.yawRad, initialState.yawRad);

  // Verify evaluateGuessAgainstLocation returns accurate result
  const evalRes = evaluateGuessAgainstLocation(
    'sess-1',
    1,
    kyoto.originWGS84.lat,
    kyoto.originWGS84.lon,
    kyoto,
    false
  );
  assert.equal(evalRes.score, 5000);
  assert.equal(evalRes.distanceMeters, 0);
});
