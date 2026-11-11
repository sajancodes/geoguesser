import type {
  BuildingFootprintENU,
  ENUCoordinate,
  RoadSegmentENU,
  StreetPropENU,
} from '../shared-types';

export interface CapsuleState {
  east: number;
  north: number;
  up: number;
  velEast: number;
  velNorth: number;
  yawRad: number; // 0 = looking North (-Z in Three.js)
  pitchRad: number;
  walkCyclePhase: number;
  collidingWithId: string | null;
}

export interface CapsuleInputState {
  moveForward: number; // -1..1
  moveRight: number; // -1..1
  sprintHeld: boolean;
  yawDeltaRad: number;
  pitchDeltaRad: number;
}

export const CAPSULE_EYE_HEIGHT_METERS = 1.68;
export const CAPSULE_RADIUS_METERS = 0.42;
export const WALK_SPEED_MPS = 4.6;
export const SPRINT_SPEED_MPS = 7.8;
export const WORLD_BOUNDARY_LIMIT_METERS = 54.0;

/**
 * Determine ground surface elevation at local ENU (east, north) coordinate.
 * Road ribbons sit at 0.00m; sidewalks/curbs outside roads have a subtle +0.08m curb step
 * with smooth ramp transitions so the player never floats or falls through terrain.
 */
export function getGroundHeightAtENU(
  east: number,
  north: number,
  roads: RoadSegmentENU[]
): number {
  for (const road of roads) {
    const dx = road.endEast - road.startEast;
    const dy = road.endNorth - road.startNorth;
    const lenSq = dx * dx + dy * dy;
    let distToCenterline = Math.hypot(east - road.startEast, north - road.startNorth);
    if (lenSq > 0.0001) {
      const t = Math.max(
        0,
        Math.min(1, ((east - road.startEast) * dx + (north - road.startNorth) * dy) / lenSq)
      );
      const projEast = road.startEast + t * dx;
      const projNorth = road.startNorth + t * dy;
      distToCenterline = Math.hypot(east - projEast, north - projNorth);
    }
    const halfWidth = road.widthMeters * 0.5;
    if (distToCenterline <= halfWidth) {
      return 0.0;
    }
    if (distToCenterline <= halfWidth + 0.35) {
      const curbT = (distToCenterline - halfWidth) / 0.35;
      return curbT * 0.07;
    }
  }
  return 0.07;
}

/**
 * Push a 2D circle (capsule horizontal cross-section) out of an axis-aligned bounding box (building).
 */
function resolveCircleAABB(
  east: number,
  north: number,
  radius: number,
  bld: BuildingFootprintENU
): { east: number; north: number; hit: boolean } {
  const halfW = bld.widthEast * 0.5;
  const halfD = bld.depthNorth * 0.5;
  const minX = bld.centerEast - halfW;
  const maxX = bld.centerEast + halfW;
  const minZ = bld.centerNorth - halfD;
  const maxZ = bld.centerNorth + halfD;

  const closestX = Math.max(minX, Math.min(east, maxX));
  const closestZ = Math.max(minZ, Math.min(north, maxZ));

  const dx = east - closestX;
  const dz = north - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) {
    return { east, north, hit: false };
  }

  // If center is strictly inside the box, push out along minimum penetration axis
  if (distSq < 1e-8) {
    const leftPen = Math.abs(east - minX);
    const rightPen = Math.abs(maxX - east);
    const southPen = Math.abs(north - minZ);
    const northPen = Math.abs(maxZ - north);
    const minPen = Math.min(leftPen, rightPen, southPen, northPen);

    if (minPen === leftPen) return { east: minX - radius, north, hit: true };
    if (minPen === rightPen) return { east: maxX + radius, north, hit: true };
    if (minPen === southPen) return { east, north: minZ - radius, hit: true };
    return { east, north: maxZ + radius, hit: true };
  }

  const dist = Math.sqrt(distSq);
  const overlap = radius - dist;
  return {
    east: east + (dx / dist) * overlap,
    north: north + (dz / dist) * overlap,
    hit: true,
  };
}

/**
 * Advance the first-person capsule controller by a clamped timestep `rawDt` (clamped to <= 0.05s).
 * Resolves collisions against all building footprints, street props, and outer survey perimeter.
 */
export function stepCapsulePhysics(
  state: CapsuleState,
  input: CapsuleInputState,
  rawDt: number,
  allowMovement: boolean,
  buildings: BuildingFootprintENU[],
  props: StreetPropENU[],
  roads: RoadSegmentENU[]
): CapsuleState {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

  const nextYaw = state.yawRad + input.yawDeltaRad;
  const maxPitch = (82 * Math.PI) / 180;
  const nextPitch = Math.max(-maxPitch, Math.min(maxPitch, state.pitchRad + input.pitchDeltaRad));

  if (!allowMovement) {
    const groundUp = getGroundHeightAtENU(state.east, state.north, roads);
    return {
      ...state,
      up: groundUp,
      velEast: 0,
      velNorth: 0,
      yawRad: nextYaw,
      pitchRad: nextPitch,
      collidingWithId: null,
    };
  }

  // Forward unit vector in ENU: yaw = 0 points North (+north, 0 east); yaw = +PI/2 points East (+east, 0 north)
  const sinYaw = Math.sin(nextYaw);
  const cosYaw = Math.cos(nextYaw);

  const forwardEast = sinYaw;
  const forwardNorth = cosYaw;
  const rightEast = cosYaw;
  const rightNorth = -sinYaw;

  let wishEast = forwardEast * input.moveForward + rightEast * input.moveRight;
  let wishNorth = forwardNorth * input.moveForward + rightNorth * input.moveRight;
  const wishMag = Math.hypot(wishEast, wishNorth);
  if (wishMag > 1.0) {
    wishEast /= wishMag;
    wishNorth /= wishMag;
  }

  const targetSpeed = input.sprintHeld ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
  const targetVelEast = wishEast * targetSpeed;
  const targetVelNorth = wishNorth * targetSpeed;

  // Exponential velocity smoothing (frame-rate independent)
  const smoothing = 1 - Math.exp(-14.0 * dt);
  const velEast = state.velEast + (targetVelEast - state.velEast) * smoothing;
  const velNorth = state.velNorth + (targetVelNorth - state.velNorth) * smoothing;

  let nextEast = state.east + velEast * dt;
  let nextNorth = state.north + velNorth * dt;
  let collidingWithId: string | null = null;

  // 1. Resolve building AABB collisions
  for (const bld of buildings) {
    const res = resolveCircleAABB(nextEast, nextNorth, CAPSULE_RADIUS_METERS, bld);
    if (res.hit) {
      nextEast = res.east;
      nextNorth = res.north;
      collidingWithId = bld.id;
    }
  }

  // 2. Resolve solid street prop cylindrical collisions
  for (const prop of props) {
    if (prop.colliderRadius <= 0) continue;
    const minDist = CAPSULE_RADIUS_METERS + prop.colliderRadius;
    const dx = nextEast - prop.east;
    const dz = nextNorth - prop.north;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.001;
      const push = minDist - dist;
      nextEast += (dx / dist) * push;
      nextNorth += (dz / dist) * push;
      collidingWithId = prop.id;
    }
  }

  // 3. Clamp to survey chunk perimeter
  nextEast = Math.max(-WORLD_BOUNDARY_LIMIT_METERS, Math.min(WORLD_BOUNDARY_LIMIT_METERS, nextEast));
  nextNorth = Math.max(-WORLD_BOUNDARY_LIMIT_METERS, Math.min(WORLD_BOUNDARY_LIMIT_METERS, nextNorth));

  const distanceTraveled = Math.hypot(nextEast - state.east, nextNorth - state.north);
  const walkCyclePhase = (state.walkCyclePhase + distanceTraveled * 2.3) % (Math.PI * 2);
  const groundUp = getGroundHeightAtENU(nextEast, nextNorth, roads);

  return {
    east: nextEast,
    north: nextNorth,
    up: groundUp,
    velEast,
    velNorth,
    yawRad: nextYaw,
    pitchRad: nextPitch,
    walkCyclePhase,
    collidingWithId,
  };
}

export function getCameraPositionENU(state: CapsuleState, reducedEffects: boolean): ENUCoordinate {
  const speed = Math.hypot(state.velEast, state.velNorth);
  const bobOffset =
    reducedEffects || speed < 0.25 ? 0 : Math.sin(state.walkCyclePhase) * 0.028 * Math.min(1, speed / WALK_SPEED_MPS);
  return {
    east: state.east,
    north: state.north,
    up: state.up + CAPSULE_EYE_HEIGHT_METERS + bobOffset,
  };
}
