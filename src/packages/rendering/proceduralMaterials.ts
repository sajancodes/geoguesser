import * as THREE from 'three';
import type {
  BuildingFootprintENU,
  RoadSegmentENU,
  StreetPropENU,
  StreetSignClue,
} from '../shared-types';

/**
 * Generates a tileable grayscale procedural bump/roughness CanvasTexture.
 */
export function createSurfaceMicroReliefTexture(
  kind: 'asphalt' | 'cobblestone' | 'flagstone' | 'gravel' | 'masonry',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);

    if (kind === 'cobblestone' || kind === 'flagstone') {
      const rows = kind === 'cobblestone' ? 8 : 4;
      const cols = kind === 'cobblestone' ? 8 : 4;
      const cw = 128 / cols;
      const ch = 128 / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const offset = (r % 2) * (cw * 0.5);
          const x = (c * cw + offset) % 128;
          const y = r * ch;
          const tone = 115 + ((r * 17 + c * 31) % 35);
          ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
          ctx.strokeStyle = '#404040';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        }
      }
    } else {
      for (let i = 0; i < 900; i++) {
        const x = (i * 73) % 128;
        const y = (i * 41) % 128;
        const v = 100 + ((i * 29) % 56);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates a razor-sharp procedural street sign texture (`SRGBColorSpace` + max anisotropy).
 */
function createStreetSignTexture(
  sign: StreetSignClue,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = sign.backgroundColorHex;
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = sign.borderColorHex;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 172);

    ctx.fillStyle = sign.textColorHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 36px "IBM Plex Sans", sans-serif';
    ctx.fillText(sign.primaryText, 256, 76, 460);

    ctx.font = '400 24px "IBM Plex Mono", monospace';
    ctx.fillText(sign.secondaryText, 256, 134, 460);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds a composite 5-to-9 part `THREE.Group` architectural structure for a building footprint.
 * Pivot is anchored at bottom-center (y = 0) flush with the ground.
 * Varies roughness/metalness across plinth, wall facade, window frames, glass, and roof tiers.
 */
export function buildCompositeBuildingGroup(
  bld: BuildingFootprintENU,
  reliefTex: THREE.CanvasTexture,
  enableShadows: boolean,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const group = new THREE.Group();
  group.name = `building:${bld.id}`;
  group.position.set(bld.centerEast, 0, -bld.centerNorth);

  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d42,
    roughness: 0.9,
    metalness: 0.05,
    bumpMap: reliefTex,
    bumpScale: 0.015,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bld.wallColorHex),
    roughness: 0.78,
    metalness: 0.08,
    bumpMap: reliefTex,
    bumpScale: 0.02,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bld.trimColorHex),
    roughness: 0.5,
    metalness: 0.22,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bld.roofColorHex),
    roughness: 0.42,
    metalness: 0.35,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.14,
    metalness: 0.82,
  });

  disposables.push(plinthMat, wallMat, trimMat, roofMat, glassMat);

  // Part 1: Stone foundation plinth (y = 0..0.45m)
  const plinthGeo = new THREE.BoxGeometry(bld.widthEast + 0.24, 0.45, bld.depthNorth + 0.24);
  disposables.push(plinthGeo);
  const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
  plinthMesh.position.y = 0.225;
  plinthMesh.castShadow = enableShadows;
  plinthMesh.receiveShadow = enableShadows;
  group.add(plinthMesh);

  // Part 2: Primary structural hull
  const bodyHeight = Math.max(2.5, bld.heightMeters - 0.45);
  const bodyGeo = new THREE.BoxGeometry(bld.widthEast, bodyHeight, bld.depthNorth);
  disposables.push(bodyGeo);
  const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
  bodyMesh.position.y = 0.45 + bodyHeight * 0.5;
  bodyMesh.castShadow = enableShadows;
  bodyMesh.receiveShadow = enableShadows;
  group.add(bodyMesh);

  // Part 3: Story cornice bands & vertical timber/pilaster mullions
  const storyCount = Math.max(1, Math.min(6, bld.stories));
  const storyStep = bodyHeight / storyCount;
  for (let s = 1; s <= storyCount; s++) {
    const bandGeo = new THREE.BoxGeometry(bld.widthEast + 0.32, 0.22, bld.depthNorth + 0.32);
    disposables.push(bandGeo);
    const bandMesh = new THREE.Mesh(bandGeo, trimMat);
    bandMesh.position.y = 0.45 + s * storyStep;
    group.add(bandMesh);
  }

  // Part 4: Recessed glass window bays on street-facing sides
  const windowCols = Math.max(2, Math.floor(bld.depthNorth / 3.5));
  const winGeo = new THREE.BoxGeometry(bld.widthEast + 0.12, 1.15, 1.3);
  disposables.push(winGeo);
  for (let s = 0; s < Math.min(storyCount, 3); s++) {
    const wy = 1.6 + s * storyStep;
    if (wy + 0.8 > bld.heightMeters) continue;
    for (let c = 0; c < windowCols; c++) {
      const wz = -bld.depthNorth * 0.35 + (c / Math.max(1, windowCols - 1)) * (bld.depthNorth * 0.7);
      const winMesh = new THREE.Mesh(winGeo, glassMat);
      winMesh.position.set(0, wy, wz);
      group.add(winMesh);
    }
  }

  // Part 5+: Architectural roof assembly according to regional typology
  if (bld.roofStyle === 'gable_tile' && bld.stories >= 4) {
    // Multi-tiered pagoda eaves + spire finial (Kyoto Hokan-ji style)
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const scale = 1 - t * 0.13;
      const eaveGeo = new THREE.ConeGeometry(
        bld.widthEast * 0.78 * scale,
        1.5,
        4
      );
      disposables.push(eaveGeo);
      const eave = new THREE.Mesh(eaveGeo, roofMat);
      eave.rotation.y = Math.PI / 4;
      eave.position.y = 5.5 + t * 4.4;
      group.add(eave);
    }
    const sorinGeo = new THREE.CylinderGeometry(0.12, 0.28, 4.8, 8);
    disposables.push(sorinGeo);
    const sorin = new THREE.Mesh(sorinGeo, trimMat);
    sorin.position.y = bld.heightMeters + 2.4;
    group.add(sorin);
  } else if (bld.roofStyle === 'stepped_terrace') {
    // Stepped basalt-column monument expressionist tower (Hallgrimskirkja style)
    const stepCount = 4;
    for (let i = 1; i <= stepCount; i++) {
      const w = bld.widthEast * (1 - i * 0.18);
      const h = bld.heightMeters + i * 3.2;
      const colGeo = new THREE.BoxGeometry(w, h, bld.depthNorth * 0.65);
      disposables.push(colGeo);
      const colMesh = new THREE.Mesh(colGeo, wallMat);
      colMesh.position.y = h * 0.5;
      group.add(colMesh);
    }
    const spireGeo = new THREE.ConeGeometry(2.2, 6.5, 4);
    disposables.push(spireGeo);
    const spireMesh = new THREE.Mesh(spireGeo, roofMat);
    spireMesh.rotation.y = Math.PI / 4;
    spireMesh.position.y = bld.heightMeters + stepCount * 3.2 + 3.2;
    group.add(spireMesh);
  } else if (bld.roofStyle === 'flat_parapet') {
    // Parapet wall + crenellated crown / lantern cupola (Marrakech Medina style)
    const parapetGeo = new THREE.BoxGeometry(bld.widthEast + 0.4, 0.85, bld.depthNorth + 0.4);
    disposables.push(parapetGeo);
    const parapet = new THREE.Mesh(parapetGeo, roofMat);
    parapet.position.y = bld.heightMeters + 0.42;
    group.add(parapet);

    if (bld.stories >= 5) {
      const lanternGeo = new THREE.BoxGeometry(bld.widthEast * 0.48, 5.2, bld.depthNorth * 0.48);
      const domeGeo = new THREE.SphereGeometry(bld.widthEast * 0.24, 12, 10);
      disposables.push(lanternGeo, domeGeo);
      const lantern = new THREE.Mesh(lanternGeo, wallMat);
      lantern.position.y = bld.heightMeters + 2.8;
      const dome = new THREE.Mesh(domeGeo, trimMat);
      dome.position.y = bld.heightMeters + 5.6;
      group.add(lantern, dome);
    }
  } else {
    // Pitched or gabled roof scaled to match exact rectangular building footprint
    const roofHeight = 2.3;
    const baseRadius = Math.SQRT1_2; // unit square diagonal half-length so side length === 1.0
    const roofGeo = new THREE.ConeGeometry(baseRadius, roofHeight, 4);
    disposables.push(roofGeo);
    const roofContainer = new THREE.Group();
    roofContainer.position.y = bld.heightMeters + roofHeight * 0.5;
    roofContainer.scale.set(bld.widthEast + 0.65, 1, bld.depthNorth + 0.65);

    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = enableShadows;
    roofContainer.add(roofMesh);
    group.add(roofContainer);
  }

  return group;
}

/**
 * Builds a composite street sign Group (post, mounting bracket, sign plate, and contact shadow).
 */
export function buildStreetSignGroup(
  sign: StreetSignClue,
  maxAnisotropy: number,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const group = new THREE.Group();
  group.name = `sign:${sign.id}`;
  group.position.set(sign.east, 0, -sign.north);
  group.rotation.y = (-sign.yawDeg * Math.PI) / 180;

  const postMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.35,
    metalness: 0.78,
  });
  const signTex = createStreetSignTexture(sign, maxAnisotropy);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: signTex,
    roughness: 0.28,
    metalness: 0.12,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.5,
    metalness: 0.5,
  });
  disposables.push(postMat, signTex, plateMat, backMat);

  // Post
  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, sign.up + 0.35, 10);
  // Base flange
  const flangeGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.12, 10);
  // Sign board
  const boardGeo = new THREE.BoxGeometry(1.75, 0.66, 0.06);
  disposables.push(postGeo, flangeGeo, boardGeo);

  const postMesh = new THREE.Mesh(postGeo, postMat);
  postMesh.position.y = (sign.up + 0.35) * 0.5;
  const flangeMesh = new THREE.Mesh(flangeGeo, postMat);
  flangeMesh.position.y = 0.06;

  const boardMesh = new THREE.Mesh(boardGeo, [
    backMat,
    backMat,
    backMat,
    backMat,
    plateMat,
    plateMat,
  ]);
  boardMesh.position.set(0, sign.up, 0.05);

  group.add(postMesh, flangeMesh, boardMesh);
  return group;
}

/**
 * Builds composite 3-to-7 part street furniture, trees, and vehicles with radial contact shadows.
 */
export function buildStreetPropGroup(
  prop: StreetPropENU,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const group = new THREE.Group();
  group.name = `prop:${prop.id}`;
  group.position.set(prop.east, 0, -prop.north);
  group.rotation.y = (-prop.yawDeg * Math.PI) / 180;
  group.scale.setScalar(prop.scale);

  // Soft radial contact shadow disc at y = 0.018m (preventing Z-fighting)
  const shadowGeo = new THREE.CircleGeometry(Math.max(0.5, prop.colliderRadius * 1.35), 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x090a0c,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  disposables.push(shadowGeo, shadowMat);
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.018;
  group.add(shadowDisc);

  if (prop.kind === 'tree') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.88, metalness: 0.04 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.65, metalness: 0.08 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3a6b33, roughness: 0.6, metalness: 0.08 });
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x64686e, roughness: 0.85, metalness: 0.1 });
    disposables.push(trunkMat, leafMat1, leafMat2, planterMat);

    const planterGeo = new THREE.BoxGeometry(1.2, 0.24, 1.2);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.5, 8);
    const c1Geo = new THREE.DodecahedronGeometry(1.45, 1);
    const c2Geo = new THREE.DodecahedronGeometry(1.15, 1);
    const c3Geo = new THREE.DodecahedronGeometry(0.95, 1);
    disposables.push(planterGeo, trunkGeo, c1Geo, c2Geo, c3Geo);

    const planter = new THREE.Mesh(planterGeo, planterMat);
    planter.position.y = 0.12;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.25;
    const c1 = new THREE.Mesh(c1Geo, leafMat1);
    c1.position.set(0, 3.1, 0);
    const c2 = new THREE.Mesh(c2Geo, leafMat2);
    c2.position.set(0.65, 3.8, 0.35);
    const c3 = new THREE.Mesh(c3Geo, leafMat1);
    c3.position.set(-0.55, 4.1, -0.3);

    group.add(planter, trunk, c1, c2, c3);
  } else if (prop.kind === 'lantern') {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x686c73, roughness: 0.82, metalness: 0.12 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2d3138, roughness: 0.5, metalness: 0.35 });
    disposables.push(stoneMat, lampMat, capMat);

    const baseGeo = new THREE.BoxGeometry(0.68, 0.32, 0.68);
    const shaftGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.65, 8);
    const chamberGeo = new THREE.BoxGeometry(0.46, 0.52, 0.46);
    const roofGeo = new THREE.ConeGeometry(0.56, 0.44, 4);
    disposables.push(baseGeo, shaftGeo, chamberGeo, roofGeo);

    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.16;
    const shaft = new THREE.Mesh(shaftGeo, stoneMat);
    shaft.position.y = 1.14;
    const chamber = new THREE.Mesh(chamberGeo, lampMat);
    chamber.position.y = 2.2;
    const roof = new THREE.Mesh(roofGeo, capMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 2.66;

    group.add(base, shaft, chamber, roof);
  } else if (prop.kind === 'vehicle') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.26, metalness: 0.65 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.85 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.15 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.4 });
    disposables.push(bodyMat, cabinMat, wheelMat, lightMat);

    const hullGeo = new THREE.BoxGeometry(1.75, 0.68, 3.8);
    const cabinGeo = new THREE.BoxGeometry(1.52, 0.58, 2.0);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12);
    const headGeo = new THREE.BoxGeometry(0.28, 0.16, 0.08);
    disposables.push(hullGeo, cabinGeo, wheelGeo, headGeo);

    const hull = new THREE.Mesh(hullGeo, bodyMat);
    hull.position.y = 0.62;
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.22, -0.2);

    const wheelOffsets: Array<[number, number]> = [
      [-0.85, 1.15],
      [0.85, 1.15],
      [-0.85, -1.15],
      [0.85, -1.15],
    ];
    wheelOffsets.forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.32, wz);
      group.add(w);
    });

    const hlLeft = new THREE.Mesh(headGeo, lightMat);
    hlLeft.position.set(-0.58, 0.68, 1.91);
    const hlRight = new THREE.Mesh(headGeo, lightMat);
    hlRight.position.set(0.58, 0.68, 1.91);

    group.add(hull, cabin, hlLeft, hlRight);
  } else if (prop.kind === 'utility_pole') {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.85, metalness: 0.1 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
    disposables.push(poleMat, barMat);

    const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 7.4, 8);
    const armGeo = new THREE.BoxGeometry(1.6, 0.1, 0.1);
    const boxGeo = new THREE.BoxGeometry(0.42, 0.65, 0.35);
    disposables.push(poleGeo, armGeo, boxGeo);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3.7;
    const arm1 = new THREE.Mesh(armGeo, barMat);
    arm1.position.set(0, 6.6, 0);
    const arm2 = new THREE.Mesh(armGeo, barMat);
    arm2.position.set(0, 6.0, 0);
    const xfBox = new THREE.Mesh(boxGeo, barMat);
    xfBox.position.set(0.28, 4.9, 0);

    group.add(pole, arm1, arm2, xfBox);
  } else {
    // Bollard or street bench
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.75 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.2 });
    disposables.push(ironMat, topMat);

    if (prop.kind === 'bench') {
      const seatGeo = new THREE.BoxGeometry(1.6, 0.1, 0.55);
      const backGeo = new THREE.BoxGeometry(1.6, 0.48, 0.08);
      const legGeo = new THREE.BoxGeometry(0.1, 0.45, 0.5);
      disposables.push(seatGeo, backGeo, legGeo);

      const seat = new THREE.Mesh(seatGeo, topMat);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(backGeo, topMat);
      back.position.set(0, 0.72, -0.24);
      const legL = new THREE.Mesh(legGeo, ironMat);
      legL.position.set(-0.68, 0.225, 0);
      const legR = new THREE.Mesh(legGeo, ironMat);
      legR.position.set(0.68, 0.225, 0);
      group.add(seat, back, legL, legR);
    } else {
      const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.85, 10);
      const bandGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.12, 10);
      const capGeo = new THREE.SphereGeometry(0.12, 10, 8);
      disposables.push(postGeo, bandGeo, capGeo);

      const post = new THREE.Mesh(postGeo, ironMat);
      post.position.y = 0.425;
      const band = new THREE.Mesh(bandGeo, topMat);
      band.position.y = 0.68;
      const cap = new THREE.Mesh(capGeo, ironMat);
      cap.position.y = 0.85;
      group.add(post, band, cap);
    }
  }

  return group;
}

/**
 * Builds the physical road and curb ribbons with disjoint Y offsets (>= 0.02m) so coplanar faces never Z-fight.
 */
export function buildRoadNetworkGroup(
  roads: RoadSegmentENU[],
  reliefTex: THREE.CanvasTexture,
  enableShadows: boolean,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'road-network';

  for (const road of roads) {
    const dx = road.endEast - road.startEast;
    const dz = -(road.endNorth - road.startNorth);
    const length = Math.hypot(dx, dz);
    const midEast = (road.startEast + road.endEast) * 0.5;
    const midZ = -((road.startNorth + road.endNorth) * 0.5);
    const angle = Math.atan2(dx, dz);

    const roadColor =
      road.surfaceType === 'asphalt'
        ? 0x2c3036
        : road.surfaceType === 'cobblestone'
          ? 0x4a4742
          : 0x524e48;

    const roadMat = new THREE.MeshStandardMaterial({
      color: roadColor,
      roughness: 0.86,
      metalness: 0.06,
      bumpMap: reliefTex,
      bumpScale: 0.025,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x6e737b,
      roughness: 0.8,
      metalness: 0.08,
    });
    disposables.push(roadMat, curbMat);

    const roadGeo = new THREE.BoxGeometry(road.widthMeters, 0.04, length);
    const curbGeo = new THREE.BoxGeometry(0.45, 0.14, length);
    disposables.push(roadGeo, curbGeo);

    const segGroup = new THREE.Group();
    segGroup.position.set(midEast, 0, midZ);
    segGroup.rotation.y = angle;

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.y = 0.01;
    roadMesh.receiveShadow = enableShadows;
    segGroup.add(roadMesh);

    const leftCurb = new THREE.Mesh(curbGeo, curbMat);
    leftCurb.position.set(-road.widthMeters * 0.5 - 0.22, 0.07, 0);
    const rightCurb = new THREE.Mesh(curbGeo, curbMat);
    rightCurb.position.set(road.widthMeters * 0.5 + 0.22, 0.07, 0);
    segGroup.add(leftCurb, rightCurb);

    if (road.hasCenterLine) {
      const lineMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(road.centerLineColorHex),
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const dashGeo = new THREE.PlaneGeometry(0.16, 2.6);
      disposables.push(lineMat, dashGeo);

      const dashCount = Math.floor(length / 5.5);
      for (let d = 0; d < dashCount; d++) {
        const dash = new THREE.Mesh(dashGeo, lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.036, -length * 0.45 + d * 5.5);
        segGroup.add(dash);
      }
    }

    group.add(segGroup);
  }

  return group;
}
