import * as THREE from 'three';

const textureCache = new Map();
const atlasTiles = new Set();
const ATLAS_COLUMNS = 3;
const ATLAS_ROWS = 2;

function seededNoise(x, y, seed = 1) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function canvasTexture(key, size, painter) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  painter(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function atlasTexture() {
  if (textureCache.has('material-atlas-source')) return textureCache.get('material-atlas-source');
  const texture = new THREE.TextureLoader().load('./assets/material-atlas/biome-material-atlas.png', loaded => {
    atlasTiles.forEach(tile => {
      tile.source = loaded.source;
      tile.needsUpdate = true;
    });
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textureCache.set('material-atlas-source', texture);
  return texture;
}

export function atlasTileTexture(index) {
  const tileIndex = Math.max(0, Math.min(ATLAS_COLUMNS * ATLAS_ROWS - 1, Number(index) || 0));
  const key = `material-atlas-tile-${tileIndex}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const texture = atlasTexture().clone();
  const column = tileIndex % ATLAS_COLUMNS;
  const rowFromTop = Math.floor(tileIndex / ATLAS_COLUMNS);
  const insetX = .5 / 3072;
  const insetY = .5 / 2048;
  texture.repeat.set(1 / ATLAS_COLUMNS - insetX * 2, 1 / ATLAS_ROWS - insetY * 2);
  texture.offset.set(
    column / ATLAS_COLUMNS + insetX,
    (ATLAS_ROWS - rowFromTop - 1) / ATLAS_ROWS + insetY
  );
  texture.needsUpdate = true;
  atlasTiles.add(texture);
  textureCache.set(key, texture);
  return texture;
}

export function biomeSurfaceTexture(biomeIndex) {
  return atlasTileTexture(Math.max(0, Math.min(4, Number(biomeIndex) || 0)));
}

export function applyTriplanarAtlas(surface, texture, scale = .045) {
  if (!surface?.isMeshStandardMaterial || !texture) return surface;
  surface.map = texture;
  surface.userData.triplanarAtlas = true;
  surface.userData.triplanarScale = scale;
  surface.onBeforeCompile = shader => {
    shader.uniforms.uAtlasOffset = { value: texture.offset.clone() };
    shader.uniforms.uAtlasRepeat = { value: texture.repeat.clone() };
    shader.uniforms.uAtlasScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vAtlasSurfacePosition;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 atlasSurfacePosition = transformed;
#ifdef USE_INSTANCING
  atlasSurfacePosition = (instanceMatrix * vec4(atlasSurfacePosition, 1.0)).xyz;
#endif
vAtlasSurfacePosition = atlasSurfacePosition;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vAtlasSurfacePosition;
uniform vec2 uAtlasOffset;
uniform vec2 uAtlasRepeat;
uniform float uAtlasScale;

vec2 atlasTileUv(vec2 worldUv) {
  vec2 repeated = fract(worldUv * uAtlasScale);
  return uAtlasOffset + repeated * uAtlasRepeat;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec3 axisWeight = abs(normalize(cross(dFdx(vAtlasSurfacePosition), dFdy(vAtlasSurfacePosition))));
  axisWeight = pow(max(axisWeight, vec3(0.0001)), vec3(5.0));
  axisWeight /= dot(axisWeight, vec3(1.0));
  vec4 atlasX = texture2D(map, atlasTileUv(vAtlasSurfacePosition.zy));
  vec4 atlasY = texture2D(map, atlasTileUv(vAtlasSurfacePosition.xz));
  vec4 atlasZ = texture2D(map, atlasTileUv(vAtlasSurfacePosition.xy));
  diffuseColor *= atlasX * axisWeight.x + atlasY * axisWeight.y + atlasZ * axisWeight.z;
#endif`
      );
  };
  surface.customProgramCacheKey = () => `triplanar-atlas-${texture.offset.x}-${texture.offset.y}-${scale}`;
  surface.needsUpdate = true;
  return surface;
}

export function paperFiberTexture() {
  return atlasTileTexture(5);
}

export function exhibitFloorTexture() {
  return canvasTexture('exhibit-floor', 1024, (context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * .62);
    gradient.addColorStop(0, '#23395b');
    gradient.addColorStop(.52, '#101c31');
    gradient.addColorStop(1, '#07101e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    context.translate(size / 2, size / 2);
    [112, 188, 292, 414].forEach((radius, index) => {
      context.strokeStyle = index === 1 ? 'rgba(111,224,237,.56)' : 'rgba(127,164,193,.18)';
      context.lineWidth = index === 1 ? 4 : 2;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
    });
    context.strokeStyle = 'rgba(244,205,108,.34)';
    context.lineWidth = 3;
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 310, Math.sin(angle) * 310);
      context.lineTo(Math.cos(angle) * 445, Math.sin(angle) * 445);
      context.stroke();
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
  });
}

export function applyPaperSurface(root) {
  const map = paperFiberTexture();
  root?.traverse?.(object => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach(surface => {
      if (!surface?.isMeshStandardMaterial || surface.userData?.skipPaperFiber) return;
      surface.map = map;
      surface.roughnessMap = map;
      surface.roughness = Math.max(.62, surface.roughness ?? .7);
      surface.needsUpdate = true;
    });
  });
  return root;
}

export function disposeShowroomTextures() {
  textureCache.forEach(texture => texture.dispose());
  textureCache.clear();
}
