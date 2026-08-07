import RAPIER from './vendor/rapier3d-compat-0.19.3.mjs';

// paper-fold-model.js is a UMD module loaded as a classic <script> in the
// browser (exposing globalThis.paperFoldModel) but required as CommonJS in
// Node tests. This ESM module can't `require()` directly, so it prefers the
// browser global and falls back to a require() obtained via a top-level
// await of node:module — resolved once at load time so later synchronous
// callers (makeColliderVertices) can use it without becoming async.
let paperFoldModel = globalThis.paperFoldModel || null;
if (!paperFoldModel && typeof process !== 'undefined' && process.versions?.node) {
  const { createRequire } = await import('node:module');
  paperFoldModel = createRequire(import.meta.url)('./paper-fold-model.js');
}

export const FIXED_HZ = 120;
export const FIXED_DT = 1 / FIXED_HZ;
const GRAVITY = 21;
const BASE_SPEED = 22;
const REQUIRED_PROFILE_FIELDS = [
  'liftScale', 'dragScale', 'stallSpeed', 'stability',
  'rollBias', 'pitchBias', 'span', 'chord'
];

const finite = value => Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = v => Math.hypot(v.x, v.y, v.z);
const normalize = v => {
  const magnitude = length(v);
  return magnitude > 1e-9 ? scale(v, 1 / magnitude) : { x: 0, y: 0, z: 0 };
};

function quaternionFromUnitY(direction) {
  const unit = normalize(direction);
  if (unit.y < -0.999999) return { x: 1, y: 0, z: 0, w: 0 };
  const quaternion = { x: unit.z, y: 0, z: -unit.x, w: 1 + unit.y };
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {
    x: quaternion.x / magnitude,
    y: quaternion.y / magnitude,
    z: quaternion.z / magnitude,
    w: quaternion.w / magnitude
  };
}

function ellipsoidHull(radii) {
  const vertices = [];
  const push = (x, y, z) => vertices.push(x, y, z);
  push(radii.x, 0, 0); push(-radii.x, 0, 0);
  push(0, radii.y, 0); push(0, -radii.y, 0);
  push(0, 0, radii.z); push(0, 0, -radii.z);
  const corner = 1 / Math.sqrt(3);
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    push(x * radii.x * corner, y * radii.y * corner, z * radii.z * corner);
  }
  return new Float32Array(vertices);
}

function ellipticCylinderHull(radii, halfHeight, sides = 12) {
  const vertices = [];
  for (const y of [-halfHeight, halfHeight]) {
    for (let index = 0; index < sides; index++) {
      const angle = index / sides * Math.PI * 2;
      vertices.push(Math.cos(angle) * radii.x, y, Math.sin(angle) * radii.z);
    }
  }
  return new Float32Array(vertices);
}

function rotateVector(vector, quaternion) {
  const { x, y, z, w } = quaternion;
  const tx = 2 * (y * vector.z - z * vector.y);
  const ty = 2 * (z * vector.x - x * vector.z);
  const tz = 2 * (x * vector.y - y * vector.x);
  return {
    x: vector.x + w * tx + (y * tz - z * ty),
    y: vector.y + w * ty + (z * tx - x * tz),
    z: vector.z + w * tz + (x * ty - y * tx)
  };
}

function sanitizeProfile(profile) {
  if (!profile || !REQUIRED_PROFILE_FIELDS.every(field => finite(profile[field]))) {
    throw new TypeError('A finite server-validated aerodynamic profile is required');
  }
  return {
    ...profile,
    liftScale: clamp(profile.liftScale, .08, 2.2),
    dragScale: clamp(profile.dragScale, .2, 2.5),
    stallSpeed: clamp(profile.stallSpeed, 4, 50),
    stability: clamp(profile.stability, .1, 1.5),
    rollBias: clamp(profile.rollBias, -.8, .8),
    pitchBias: clamp(profile.pitchBias, -.8, .8),
    span: clamp(profile.span, .1, 4),
    chord: clamp(profile.chord, .1, 4)
  };
}

export function makeColliderVertices(model) {
  const geometry = paperFoldModel.computeFoldedGeometry(model);
  const points = [];
  const seen = new Set();
  for (const face of geometry?.faces || []) {
    for (const vertex of face?.vertices3 || []) {
      if (!Array.isArray(vertex) || !finite(vertex[0]) || !finite(vertex[1]) || !finite(vertex[2])) continue;
      const x = vertex[0] * 1.35;
      const y = vertex[1] * 1.35;
      const z = vertex[2] * 1.35;
      const key = `${x.toFixed(6)}:${y.toFixed(6)}:${z.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(x, y - .035, z, x, y + .035, z);
    }
  }
  return new Float32Array(points);
}

export class PaperFlightPhysics {
  constructor(rapier = RAPIER) {
    this.RAPIER = rapier;
    this.world = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
    this.world.numSolverIterations = 8;
    this.accumulator = 0;
    this.profile = null;
    this.staticColliders = [];
    this.body = this.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setLinearDamping(.018)
        .setAngularDamping(.34)
        .setCanSleep(false)
    );
    this.collider = null;
  }

  configure(profile, colliderVertices = null) {
    this.profile = sanitizeProfile(profile);
    if (this.collider) this.world.removeCollider(this.collider, true);
    let descriptor = colliderVertices?.length >= 24
      ? this.RAPIER.ColliderDesc.convexHull(colliderVertices)
      : null;
    if (!descriptor) {
      descriptor = this.RAPIER.ColliderDesc.cuboid(
        Math.max(.1, this.profile.span * .675),
        .035,
        Math.max(.1, this.profile.chord * .675)
      );
    }
    descriptor.setMass(1).setFriction(.45).setRestitution(.05);
    this.collider = this.world.createCollider(descriptor, this.body);
    this.body.recomputeMassPropertiesFromColliders();
  }

  reset({ position, rotation, velocity }) {
    this.body.setTranslation(position, true);
    this.body.setRotation(rotation, true);
    this.body.setLinvel(velocity, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.accumulator = 0;
  }

  setPosition(position) {
    this.body.setTranslation(position, true);
  }

  scaleVelocity(multiplier) {
    const velocity = this.body.linvel();
    this.body.setLinvel(scale(velocity, multiplier), true);
  }

  boostSpeed(delta) {
    const velocity = this.body.linvel();
    this.body.setLinvel(add(velocity, scale(normalize(velocity), delta)), true);
  }

  addAngularVelocity(delta) {
    this.body.setAngvel(add(this.body.angvel(), delta), true);
  }

  setMapColliders({ colliders = [], spires = [], rocks = [], platforms = [] } = {}) {
    for (const collider of this.staticColliders) this.world.removeCollider(collider, true);
    this.staticColliders = [];
    const addStatic = (descriptor, position) => {
      descriptor.setTranslation(position.x, position.y, position.z);
      this.staticColliders.push(this.world.createCollider(descriptor));
    };
    addStatic(this.RAPIER.ColliderDesc.cuboid(4000, 1, 4000), { x: 0, y: -1, z: 0 });
    if (colliders.length) {
      for (const shape of colliders) {
        let descriptor = null;
        let position = shape.center;
        let rotation = shape.rotation;
        if (shape.type === 'tapered-segment') {
          let start = shape.start;
          let end = shape.end;
          let radius0 = shape.radius0;
          let radius1 = shape.radius1;
          if (radius1 > radius0) {
            [start, end] = [end, start];
            [radius0, radius1] = [radius1, radius0];
          }
          const direction = {
            x: end.x - start.x,
            y: end.y - start.y,
            z: end.z - start.z
          };
          const segmentLength = Math.max(.01, length(direction));
          position = {
            x: (start.x + end.x) * .5,
            y: (start.y + end.y) * .5,
            z: (start.z + end.z) * .5
          };
          rotation = quaternionFromUnitY(direction);
          descriptor = radius1 <= radius0 * .16
            ? this.RAPIER.ColliderDesc.cone(segmentLength * .5, Math.max(.1, radius0))
            : this.RAPIER.ColliderDesc.cylinder(segmentLength * .5, Math.max(.1, (radius0 + radius1) * .5));
        } else if (shape.type === 'ellipsoid') {
          descriptor = this.RAPIER.ColliderDesc.convexHull(ellipsoidHull(shape.radii));
        } else if (shape.type === 'elliptic-cylinder') {
          descriptor = this.RAPIER.ColliderDesc.convexHull(ellipticCylinderHull(shape.radii, shape.halfHeight));
        } else if (shape.type === 'box') {
          descriptor = this.RAPIER.ColliderDesc.cuboid(shape.half.x, shape.half.y, shape.half.z);
        }
        if (!descriptor || !position) continue;
        if (rotation) descriptor.setRotation(rotation);
        addStatic(descriptor, position);
      }
      return;
    }
    for (const spire of spires) {
      addStatic(
        this.RAPIER.ColliderDesc.cone(Math.max(1, spire.h / 2), Math.max(.2, spire.r)),
        { x: spire.x, y: spire.h / 2, z: spire.z }
      );
    }
    for (const rock of rocks) {
      addStatic(this.RAPIER.ColliderDesc.ball(Math.max(.2, rock.r)), rock.p);
    }
    for (const platform of platforms) {
      const descriptor = this.RAPIER.ColliderDesc.cuboid(
        Math.max(.2, platform.w / 2),
        Math.max(.2, platform.h / 2),
        Math.max(.2, platform.d / 2)
      );
      const halfYaw = (platform.rotation || 0) / 2;
      descriptor.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) });
      addStatic(descriptor, platform);
    }
  }

  _step(input) {
    if (!this.profile) return;
    const velocity = this.body.linvel();
    const speed = Math.max(.001, length(velocity));
    const velocityDirection = normalize(velocity);
    const rotation = this.body.rotation();
    const wingUp = rotateVector({ x: 0, y: 1, z: 0 }, rotation);
    const right = rotateVector({ x: 1, y: 0, z: 0 }, rotation);
    const forward = rotateVector({ x: 0, y: 0, z: -1 }, rotation);
    const liftDirection = normalize(add(wingUp, scale(velocityDirection, -dot(wingUp, velocityDirection))));
    const stallRatio = clamp(speed / this.profile.stallSpeed, 0, 1);
    const liftMagnitude = GRAVITY * this.profile.liftScale
      * Math.pow(speed / BASE_SPEED, 2)
      * (.18 + .82 * stallRatio * stallRatio);
    const dragMagnitude = .0038 * this.profile.dragScale * speed * speed;
    const thermalForce = Math.max(0, Number(input.thermalLift) || 0);
    const force = add(
      add(scale(liftDirection, liftMagnitude), scale(velocityDirection, -dragMagnitude)),
      { x: 0, y: thermalForce, z: 0 }
    );

    const pitchInput = clamp(Number(input.pitch) || 0, -1, 1);
    const rollInput = clamp(Number(input.roll) || 0, -1, 1);
    const controlAuthority = clamp(1.35 - this.profile.stability * .25, .9, 1.3);
    let torque = scale(right, pitchInput * 4.8 * controlAuthority + this.profile.pitchBias * 1.9);
    torque = add(torque, scale(
      forward,
      -(rollInput * 5.8 * controlAuthority + this.profile.rollBias * 2.2)
    ));
    if (speed < this.profile.stallSpeed) {
      torque = add(torque, scale(right, -(this.profile.stallSpeed - speed) * .14));
    }

    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.body.addForce(force, true);
    this.body.addTorque(torque, true);
    this.world.step();
  }

  advance(frameDelta, input = {}) {
    if (!finite(frameDelta) || frameDelta < 0) throw new TypeError('frameDelta must be finite and non-negative');
    this.accumulator += Math.min(frameDelta, .1);
    let steps = 0;
    while (this.accumulator + 1e-12 >= FIXED_DT && steps < 12) {
      this._step(input);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    const position = this.body.translation();
    const rotation = this.body.rotation();
    const velocity = this.body.linvel();
    return {
      steps,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      speed: length(velocity)
    };
  }

  free() {
    this.world.free();
  }
}

let initPromise;
export async function createPaperFlightPhysics() {
  initPromise ||= RAPIER.init();
  await initPromise;
  return new PaperFlightPhysics(RAPIER);
}
