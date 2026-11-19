/**
 * The severity lights. News is a pillar of light rising from its location, with a bright
 * core, a soft outer glow and a glowing spot on the ground. A natural disaster is a symbol
 * instead (./hazard-icons.ts): a glass disc with a severity-coloured rim and halo, floating on
 * a thin stem of light above the same glowing spot, so the two read differently at a glance.
 * Both grow and pulse faster with severity (see ../severity.ts); globe.gl's ring layer adds
 * outward rings for high and critical events (see globe.ts). News older than the last 3 days of a
 * longer window is only a still dot (owner, 19 Nov 2026): overlapping glow made 14 days
 * slow, and what is new should stand out (../clusters.ts, isOlder). The dot is smaller for
 * every day of age. Low-severity markers on a shore or an island, or on the night side, get a
 * clear look (a soft disc with a faint dark edge), so their blue doesn't vanish into blue coast
 * lines or bright city lights (owner, 19 Nov 2026; ./shore.ts).
 *
 * Drawn with instancing: all pillars (or symbols) of one severity share one mesh per part, so a
 * thousand events cost a couple of dozen draw calls. Clicking and hovering use a separate invisible column per
 * event, handed to globe.gl's custom layer (hidden objects are still hit-tested, and the
 * globe itself blocks events on its far side).
 */

import {
  AddEquation,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { SEVERITY_STYLES } from '../severity';
import { clusterDaysOld, isOlder, type Cluster } from '../clusters';
import { SEVERITIES, type Severity } from '../types';
import { ATLAS_COLUMNS, ATLAS_ROWS, ICON_FILL, drawAtlas, iconIndex } from './hazard-icons';

/** World units; the globe's radius is 100. */
const BASE_HEIGHT = 8;
const CORE_RADIUS = 0.36;
const GLOW_RADIUS = 1.7;
const SPOT_SIZE = 5.2;
const HIT_RADIUS = 2.6;
/** A pillar's click area is this much wider than its glowing spot: about a fingertip on a
 * phone, and still narrower than the spacing of fanned-out markers (FAN_SPACING_PX). */
const HIT_WIDENING = 1.5;
/** The globe's radius in world units. */
const GLOBE_RADIUS = 100;
/** Camera height above the surface at which markers have their base size. */
const REFERENCE_HEIGHT = 250;
/**
 * Below that height markers shrink almost as fast as the camera comes down, so they keep about
 * the same size on screen (growing only gently). Sized by the distance to the centre instead,
 * they grew about 5 times on screen at the closest zoom and covered each other (fixed 18 Nov
 * 2026).
 */
const CLOSE_GROWTH = 0.85;
/** Below this camera height (altitude 1) pillars also get shorter, down to SHORTEST of their
 * height at the closest zoom: short beacons can't lean over their neighbours, so each marker
 * in a fan stays clickable. */
const SHORTEN_BELOW = 100;
const SHORTEST = 0.3;
const SELECTED_SCALE = 1.35;
/** A disaster symbol's quad side for a low-severity event (the disc fills DISC_RADIUS of it). */
const SYMBOL_SIZE = 7;
/** The disc's radius as a fraction of the quad's half side. */
const DISC_RADIUS = 0.62;
/** How high a symbol's centre floats, in disc radii: just enough to clear the ground, so the
 * disc covers its own foot (a higher float shows the foot as a second dot beside it when the
 * globe is seen at an angle). */
const SYMBOL_LIFT = 1.2;
/** The symbol's stem is this much of a pillar's width, its ground spot this much of a pillar's
 * spot (small and soft, so it doesn't read as a second marker beside the disc). */
const STEM_WIDTH = 0.42;
const SYMBOL_SPOT = 0.5;
/** An older news dot is this much of a pillar's ground spot: the full size 3 days old, one
 * step smaller for each further day, the smallest from 13 days (owner, 19 Nov 2026: one size
 * per day). Its click column is this many world units tall per unit of width. */
const NEWEST_DOT = 1;
const OLDEST_DOT = 0.6;
const FIRST_DOT_DAY = 3;
const LAST_DOT_DAY = 13;
const OLDER_HIT_HEIGHT = 1.5;

/** An older dot's size (share of a pillar's ground spot) for whole days of age. */
export function olderDotScale(days: number): number {
  const step = Math.min(LAST_DOT_DAY, Math.max(FIRST_DOT_DAY, days)) - FIRST_DOT_DAY;
  return NEWEST_DOT - ((NEWEST_DOT - OLDEST_DOT) * step) / (LAST_DOT_DAY - FIRST_DOT_DAY);
}

/** Pillar height in world units for a severity: grows faster than the size. */
export function pillarHeight(severity: Severity): number {
  return BASE_HEIGHT * SEVERITY_STYLES[severity].size ** 1.6;
}

// Additive light on a transparent canvas: colour and alpha both add up.
/** Premultiplied colour (the clear look): alpha 0 adds light, alpha 1 covers what's beneath. */
const clearBlending = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
} as const;

const lightBlending = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneFactor,
  transparent: true,
  depthWrite: false,
} as const;

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;

  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mv = modelViewMatrix * local;
    vec3 viewNormal = normalize(normalMatrix * n);
    // 1 where the surface faces the camera (the beam's middle), 0 at its edges.
    vFacing = abs(dot(viewNormal, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float time;
  uniform float period;

  varying vec2 vUv;
  varying float vFacing;

  void main() {
    // Brightest at the ground, fading upwards; soft edges.
    float fade = pow(1.0 - vUv.y, 1.4);
    float body = pow(vFacing, 1.4);
    float pulse = period > 0.0 ? 0.8 + 0.2 * sin(6.2831853 * time / period) : 1.0;
    // Bands of light flowing upwards on pulsing pillars (none with reduced motion).
    float flow = period > 0.0 ? 0.78 + 0.22 * sin(vUv.y * 26.0 - time * 5.0 / period) : 1.0;
    vec3 light = color * strength * fade * body * pulse * flow;
    // A white-hot base where the pillar meets the ground.
    light += vec3(1.0) * pow(1.0 - vUv.y, 10.0) * body * strength * 0.35;
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

const spotVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

// A pillar's glowing ground spot; d is 0 at its centre and 1 at its edge.
const spotLight = /* glsl */ `
  vec3 spotLight(vec3 color, float d, float time, float period) {
    float swell = period > 0.0 ? 0.5 + 0.5 * sin(6.2831853 * time / period) : 0.0;
    float spot = pow(max(1.0 - d, 0.0), 2.4);
    float halo = pow(max(1.0 - d, 0.0), 1.2) * (0.25 + 0.2 * swell);
    return color * (spot * 1.3 + halo) + vec3(1.0) * pow(max(1.0 - d * 3.0, 0.0), 2.0) * 0.8;
  }
`;

const spotFragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  uniform float period;

  varying vec2 vUv;

  ${spotLight}

  void main() {
    vec3 light = spotLight(color, length(vUv - 0.5) * 2.0, time, period);
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

// An older news dot's glow: still (no pulse, no halo), so it is cheap to paint.
const dotLight = /* glsl */ `
  vec3 dotLight(vec3 color, float d) {
    float glow = pow(max(1.0 - d, 0.0), 1.6);
    return color * glow * 1.2 + vec3(1.0) * pow(max(1.0 - d * 2.5, 0.0), 2.0) * 0.6;
  }
`;

const dotFragment = /* glsl */ `
  uniform vec3 color;

  varying vec2 vUv;

  ${dotLight}

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 light = dotLight(color, d);
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

// The clear look, for low severity only: on a shore or an island (aShore, ./shore.ts) or on
// the night side, a soft disc in the severity colour inside a faint dark edge is painted over
// what lies beneath (coast lines, city lights); elsewhere the usual glow is added as before.
// Output is premultiplied: alpha 0 adds light, alpha 1 covers.
const clearVertex = /* glsl */ `
  attribute float aShore;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying float vClear;

  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec4 centre = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      centre = instanceMatrix * centre;
    #endif
    vec3 up = normalize((modelMatrix * centre).xyz);
    float night = smoothstep(0.1, -0.1, dot(up, sunDirection));
    vClear = max(aShore, night);
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const clearDisc = /* glsl */ `
  vec4 clearDisc(vec3 color, float d) {
    float fill = (1.0 - smoothstep(0.25, 0.55, d)) * 0.85;
    float edge = (1.0 - smoothstep(0.55, 0.95, d)) * 0.4;
    vec3 light = color * (0.9 + 0.4 * pow(max(1.0 - d * 3.0, 0.0), 1.5));
    return vec4(light * fill, max(fill, edge));
  }
`;

const clearDotFragment = /* glsl */ `
  uniform vec3 color;

  varying vec2 vUv;
  varying float vClear;

  ${dotLight}
  ${clearDisc}

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec4 disc = clearDisc(color, d);
    float cover = disc.a * vClear;
    gl_FragColor = vec4(disc.rgb * vClear + dotLight(color, d) * (1.0 - cover), cover);
  }
`;

// A pillar's ground spot: the disc covers its bright middle, the halo still glows around it.
const clearSpotFragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  uniform float period;

  varying vec2 vUv;
  varying float vClear;

  ${spotLight}
  ${clearDisc}

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    vec4 disc = clearDisc(color, d * 1.5);
    float cover = disc.a * vClear;
    vec3 glow = spotLight(color, d, time, period);
    gl_FragColor = vec4(disc.rgb * vClear + glow * (1.0 - cover), cover);
  }
`;

const discVertex = /* glsl */ `
  attribute float aIcon;
  uniform vec2 cells;
  varying vec2 vP;
  varying vec2 vCell;

  void main() {
    // A quad that always faces the camera, centred on the top of its stem.
    vP = position.xy * 2.0;
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 1.0, 0.0, 1.0);
    float side = length(instanceMatrix[0].xyz);
    centre.xy += position.xy * side;
    gl_Position = projectionMatrix * centre;
    vCell = vec2(mod(aIcon, cells.x), floor(aIcon / cells.x));
  }
`;

const discFragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  uniform float period;
  uniform sampler2D atlas;
  uniform vec2 cells;
  uniform float discRadius;
  uniform float iconFill;

  varying vec2 vP;
  varying vec2 vCell;

  void main() {
    float d = length(vP);
    float aa = fwidth(d) * 1.2;
    float R = discRadius;
    float swell = period > 0.0 ? 0.5 + 0.5 * sin(6.2831853 * time / period) : 0.0;

    // Dark glass, a little lighter towards the top.
    float disc = 1.0 - smoothstep(R - aa, R + aa, d);
    vec3 glass = mix(vec3(0.010, 0.014, 0.020), vec3(0.045, 0.055, 0.075), clamp(0.5 + vP.y, 0.0, 1.0));
    glass += color * 0.10 * (1.0 - d / R);

    // The symbol: the 24-unit grid spans 2 * 0.70 * R of the quad.
    vec2 iconUv = vP / (2.0 * 0.70 * R) + 0.5;
    vec2 local = (iconUv - 0.5) * iconFill + 0.5;
    vec2 atlasUv = vec2((vCell.x + local.x) / cells.x, 1.0 - (vCell.y + 1.0 - local.y) / cells.y);
    vec2 inside = step(vec2(0.0), iconUv) * step(iconUv, vec2(1.0));
    vec2 mask = texture2D(atlas, atlasUv).rg * inside.x * inside.y;
    vec3 mainColor = mix(vec3(1.0), color, 0.12);
    vec3 accent = mix(color, vec3(1.0), 0.18);
    vec3 c = mix(glass, accent, mask.g);
    c = mix(c, mainColor, mask.r);

    // A crisp rim in the severity colour, then a soft halo outside it that swells with the pulse.
    float rim = 1.0 - smoothstep(0.035, 0.035 + aa, abs(d - R));
    c = mix(c, mix(color, vec3(1.0), 0.15), rim);
    float halo = (1.0 - disc) * pow(clamp((1.0 - d) / (1.0 - R), 0.0, 1.0), 1.8) * (0.30 + 0.35 * swell);

    vec3 outColor = mix(color, c, max(disc, rim));
    float alpha = max(max(disc * 0.95, rim), halo);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(outColor, alpha);
    #include <colorspace_fragment>
  }
`;

let atlasTexture: CanvasTexture | null = null;

/** The symbols' texture atlas, drawn once on first use. */
function symbolAtlas(): CanvasTexture {
  if (atlasTexture) return atlasTexture;
  const canvas = document.createElement('canvas');
  drawAtlas(canvas);
  atlasTexture = new CanvasTexture(canvas);
  atlasTexture.colorSpace = NoColorSpace;
  atlasTexture.minFilter = LinearMipmapLinearFilter;
  atlasTexture.generateMipmaps = true;
  return atlasTexture;
}

function uniformsFor(severity: Severity, strength: number) {
  return {
    color: { value: new Color(SEVERITY_STYLES[severity].color) },
    strength: { value: strength },
    time: { value: 0 },
    period: { value: SEVERITY_STYLES[severity].pulseSeconds ?? 0 },
  };
}

// Shared geometries, built standing on the ground (y = 0) and 1 unit tall, so scaling y
// sets the height.
const coreGeometry = new CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 0.6, 1, 10, 1, true).translate(
  0,
  0.5,
  0,
);
const glowGeometry = new CylinderGeometry(
  GLOW_RADIUS * 0.55,
  GLOW_RADIUS,
  1,
  20,
  1,
  true,
).translate(0, 0.5, 0);
const spotGeometry = new PlaneGeometry(SPOT_SIZE, SPOT_SIZE)
  .rotateX(-Math.PI / 2)
  .translate(0, 0.05, 0);
const hitGeometry = new CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1, 8).translate(0, 0.5, 0);
const discGeometry = new PlaneGeometry(1, 1);
const hitMaterial = new MeshBasicMaterial();

interface Anchor {
  cluster: Cluster;
  position: Vector3;
  turn: Quaternion;
  /** Groups of several events are a little wider (at most +60%). */
  widen: number;
  /** The disaster symbol's atlas index (./hazard-icons.ts), or null for a pillar. */
  icon: number | null;
  /** An older dot's size for its age (`olderDotScale`); 1 for everything else. */
  dot: number;
}

/** What the clear look needs (see clearVertex): the shore test and the sun's direction (the
 * day-night material's own vector, kept up to date by globe.ts). */
export interface ClearLook {
  nearShore(lat: number, lng: number): boolean;
  sunDirection: Vector3;
}

type PartKind = 'beam' | 'spot' | 'stem' | 'disc' | 'dot';

/** How much wider a group's pillar is than a single event's. */
export function groupWidening(count: number): number {
  return count > 1 ? 1 + Math.min(0.6, Math.log10(count) * 0.45) : 1;
}

interface Level {
  severity: Severity;
  /** Pillars of light (news) or disaster symbols. */
  symbols: boolean;
  /** Older news, drawn as small dots. */
  older: boolean;
  anchors: Anchor[];
  parts: { mesh: InstancedMesh; kind: PartKind }[];
  materials: ShaderMaterial[];
}

const UP = new Vector3(0, 1, 0);
const matrix = new Matrix4();
const scale = new Vector3();

/** Every pillar and disaster symbol on the globe, drawn in a handful of instanced meshes. */
export class PillarField {
  readonly group = new Group();
  private readonly levels: Level[] = [];
  /** How many low-severity markers stand on a shore or an island (the clear look). */
  shoreCount = 0;
  /** Copies of shared geometries made for this field (freed with it). */
  private readonly ownGeometries: BufferGeometry[] = [];
  private readonly hits = new Map<string, Mesh>();
  private lastZoom = -1;
  private fanLines: LineSegments | null = null;
  private lastSelected: string | null = null;
  /** How many groups are drawn as older dots. */
  readonly olderCount: number;

  /** One pillar, symbol or dot per group (see ../clusters.ts); `coords` turns latitude and
   * longitude into a point on the globe's surface; news groups wholly older than `recentFrom`
   * are dots (null: none); `clear` gives low-severity markers the clear look (null: never). */
  constructor(
    clusters: Cluster[],
    coords: (lat: number, lng: number) => { x: number; y: number; z: number },
    recentFrom: number | null = null,
    private readonly clear: ClearLook | null = null,
  ) {
    let olderCount = 0;
    this.group.name = 'pillars';
    this.addFanLines(clusters, coords);
    for (const severity of SEVERITIES) {
      const all: Anchor[] = clusters
        .filter((c) => c.severity === severity)
        .map((cluster) => {
          const p = coords(cluster.lat, cluster.lng);
          const position = new Vector3(p.x, p.y, p.z);
          return {
            cluster,
            position,
            turn: new Quaternion().setFromUnitVectors(UP, position.clone().normalize()),
            widen: groupWidening(cluster.events.length),
            icon: iconIndex(cluster.lead),
            dot: 1,
          };
        });
      const news = all.filter((a) => a.icon === null);
      const older = news.filter((a) => isOlder(a.cluster, recentFrom));
      for (const anchor of older) {
        anchor.dot = olderDotScale(clusterDaysOld(anchor.cluster, recentFrom!));
      }
      const pillars = news.filter((a) => !older.includes(a));
      const symbols = all.filter((a) => a.icon !== null);
      if (pillars.length) this.levels.push(this.pillarLevel(severity, pillars));
      if (older.length) this.levels.push(this.dotLevel(severity, older));
      if (symbols.length) this.levels.push(this.symbolLevel(severity, symbols));
      olderCount += older.length;
    }
    this.olderCount = olderCount;
  }

  private mesh(
    geometry: BufferGeometry,
    material: ShaderMaterial,
    count: number,
    order: number,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }

  /** The ground spot or dot material: the clear look for low severity, else plain glow. */
  private groundPart(
    severity: Severity,
    anchors: Anchor[],
    kind: 'spot' | 'dot',
  ): { mesh: InstancedMesh; kind: PartKind; material: ShaderMaterial } {
    const clear = severity === 'low' ? this.clear : null;
    if (!clear) {
      const material = new ShaderMaterial({
        uniforms: uniformsFor(severity, 1),
        vertexShader: spotVertex,
        fragmentShader: kind === 'spot' ? spotFragment : dotFragment,
        side: DoubleSide,
        ...lightBlending,
      });
      return { mesh: this.mesh(spotGeometry, material, anchors.length, 2), kind, material };
    }
    const material = new ShaderMaterial({
      uniforms: { ...uniformsFor(severity, 1), sunDirection: { value: clear.sunDirection } },
      vertexShader: clearVertex,
      fragmentShader: kind === 'spot' ? clearSpotFragment : clearDotFragment,
      side: DoubleSide,
      ...clearBlending,
    });
    // Its own copy of the quad, carrying which markers stand on a shore.
    const quad = spotGeometry.clone();
    const shore = anchors.map((a) => (clear.nearShore(a.cluster.lat, a.cluster.lng) ? 1 : 0));
    quad.setAttribute('aShore', new InstancedBufferAttribute(new Float32Array(shore), 1));
    this.shoreCount += shore.filter(Boolean).length;
    this.ownGeometries.push(quad);
    return { mesh: this.mesh(quad, material, anchors.length, 2), kind, material };
  }

  private pillarLevel(severity: Severity, anchors: Anchor[]): Level {
    const core = new ShaderMaterial({
      uniforms: uniformsFor(severity, 2.0),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const glow = new ShaderMaterial({
      uniforms: uniformsFor(severity, 0.7),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const spot = this.groundPart(severity, anchors, 'spot');
    return {
      severity,
      symbols: false,
      older: false,
      anchors,
      parts: [
        { mesh: spot.mesh, kind: 'spot' },
        { mesh: this.mesh(glowGeometry, glow, anchors.length, 2), kind: 'beam' },
        { mesh: this.mesh(coreGeometry, core, anchors.length, 2), kind: 'beam' },
      ],
      materials: [core, glow, spot.material],
    };
  }

  private dotLevel(severity: Severity, anchors: Anchor[]): Level {
    const dot = this.groundPart(severity, anchors, 'dot');
    return {
      severity,
      symbols: false,
      older: true,
      anchors,
      parts: [{ mesh: dot.mesh, kind: 'dot' }],
      materials: [dot.material],
    };
  }

  private symbolLevel(severity: Severity, anchors: Anchor[]): Level {
    const stem = new ShaderMaterial({
      uniforms: uniformsFor(severity, 0.8),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const spot = new ShaderMaterial({
      uniforms: uniformsFor(severity, 1),
      vertexShader: spotVertex,
      fragmentShader: spotFragment,
      side: DoubleSide,
      ...lightBlending,
    });
    const disc = new ShaderMaterial({
      uniforms: {
        ...uniformsFor(severity, 1),
        atlas: { value: symbolAtlas() },
        cells: { value: [ATLAS_COLUMNS, ATLAS_ROWS] },
        discRadius: { value: DISC_RADIUS },
        iconFill: { value: ICON_FILL },
      },
      vertexShader: discVertex,
      fragmentShader: discFragment,
      blending: NormalBlending,
      transparent: true,
      depthWrite: false,
    });
    // Each symbol mesh has its own copy of the quad, carrying which symbol each instance shows.
    const quad = discGeometry.clone();
    quad.setAttribute(
      'aIcon',
      new InstancedBufferAttribute(new Float32Array(anchors.map((a) => a.icon ?? 0)), 1),
    );
    return {
      severity,
      symbols: true,
      older: false,
      anchors,
      parts: [
        { mesh: this.mesh(spotGeometry, spot, anchors.length, 2), kind: 'spot' },
        { mesh: this.mesh(coreGeometry, stem, anchors.length, 2), kind: 'stem' },
        { mesh: this.mesh(quad, disc, anchors.length, 3), kind: 'disc' },
      ],
      materials: [stem, spot, disc],
    };
  }

  /** The invisible, easy-to-hit column for one group (for globe.gl's custom layer). */
  hitTarget(cluster: Cluster): Mesh {
    const hit = new Mesh(hitGeometry, hitMaterial);
    hit.visible = false;
    hit.name = `pillar:${cluster.id}`;
    this.hits.set(cluster.id, hit);
    this.lastZoom = -1; // size the new column on the next frame
    return hit;
  }

  /** A thin line from each fanned-out marker back to its true place (clusters.ts, fanOut). */
  private addFanLines(
    clusters: Cluster[],
    coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  ): void {
    const points = clusters.flatMap((cluster) => {
      if (!cluster.anchor) return [];
      const from = coords(cluster.anchor.lat, cluster.anchor.lng);
      const to = coords(cluster.lat, cluster.lng);
      return [from.x, from.y, from.z, to.x, to.y, to.z];
    });
    if (points.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    this.fanLines = new LineSegments(
      geometry,
      new LineBasicMaterial({ color: 0xd6dae0, transparent: true, opacity: 0.75 }),
    );
    this.fanLines.frustumCulled = false;
    this.group.add(this.fanLines);
  }

  /** Frees this field's GPU resources (the geometries are shared and kept). */
  dispose(): void {
    this.fanLines?.geometry.dispose();
    (this.fanLines?.material as LineBasicMaterial | undefined)?.dispose();
    for (const level of this.levels) {
      for (const part of level.parts) {
        part.mesh.dispose();
        if (part.kind === 'disc') part.mesh.geometry.dispose();
      }
      for (const material of level.materials) material.dispose();
    }
    for (const geometry of this.ownGeometries) geometry.dispose();
    this.group.removeFromParent();
  }

  /** Places an event's hit column on the surface, standing straight outwards. */
  placeHitTarget(hit: Mesh, position: { x: number; y: number; z: number }): void {
    hit.position.set(position.x, position.y, position.z);
    hit.quaternion.setFromUnitVectors(UP, hit.position.clone().normalize());
  }

  /** Advances the shared pulse; with reduced motion the pillars stay still. */
  pulse(seconds: number, reducedMotion: boolean): void {
    for (const level of this.levels) {
      const period = reducedMotion ? 0 : (SEVERITY_STYLES[level.severity].pulseSeconds ?? 0);
      for (const material of level.materials) {
        material.uniforms.time.value = seconds;
        material.uniforms.period.value = period;
      }
    }
  }

  /**
   * Sizes every marker for the camera's height (about the same size on screen at every zoom;
   * pillars shorter close up) and the selection. Only recomputed when either changes
   * noticeably.
   */
  update(cameraDistance: number, selectedId: string | null): void {
    const above = Math.max(1, cameraDistance - GLOBE_RADIUS);
    const zoom = Math.min(1.3, (above / REFERENCE_HEIGHT) ** CLOSE_GROWTH);
    if (Math.abs(zoom - this.lastZoom) < 0.005 && selectedId === this.lastSelected) return;
    this.lastZoom = zoom;
    this.lastSelected = selectedId;
    const shorten = Math.min(1, Math.max(SHORTEST, above / SHORTEN_BELOW));
    const heightZoom = Math.min(1.2, zoom) * shorten;
    for (const level of this.levels) {
      const style = SEVERITY_STYLES[level.severity];
      const size = Math.sqrt(style.size);
      level.anchors.forEach((anchor, index) => {
        const selected = anchor.cluster.id === selectedId ? SELECTED_SCALE : 1;
        const width = size * zoom * selected * anchor.widen;
        if (level.symbols) {
          const side = SYMBOL_SIZE * size * zoom * selected * anchor.widen;
          const radius = (side * DISC_RADIUS) / 2;
          const lift = radius * SYMBOL_LIFT;
          for (const part of level.parts) {
            if (part.kind === 'spot') scale.setScalar(width * SYMBOL_SPOT);
            else if (part.kind === 'stem') scale.set(width * STEM_WIDTH, lift, width * STEM_WIDTH);
            else scale.set(side, lift, side);
            matrix.compose(anchor.position, anchor.turn, scale);
            part.mesh.setMatrixAt(index, matrix);
          }
          const reach = radius / HIT_RADIUS;
          this.hits.get(anchor.cluster.id)?.scale.set(reach, lift + radius, reach);
          return;
        }
        if (level.older) {
          scale.setScalar(width * anchor.dot);
          matrix.compose(anchor.position, anchor.turn, scale);
          level.parts[0]!.mesh.setMatrixAt(index, matrix);
          const reach = width * HIT_WIDENING;
          this.hits.get(anchor.cluster.id)?.scale.set(reach, width * OLDER_HIT_HEIGHT, reach);
          return;
        }
        const height = pillarHeight(level.severity) * heightZoom * selected;
        for (const part of level.parts) {
          if (part.kind === 'spot') scale.setScalar(width);
          else scale.set(width, height, width);
          matrix.compose(anchor.position, anchor.turn, scale);
          part.mesh.setMatrixAt(index, matrix);
        }
        const reach = width * HIT_WIDENING;
        this.hits.get(anchor.cluster.id)?.scale.set(reach, height, reach);
      });
      for (const part of level.parts) part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
