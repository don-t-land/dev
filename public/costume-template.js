(function exposeCostumeTemplates(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.costumeTemplates = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const TYPES = Object.freeze({ HEAD: 'head', NOSE: 'nose', WING: 'wing' });
  const SLOTS = Object.freeze({ HEAD: 'hat', NOSE: 'nose', WING: 'wings' });
  const LAYOUTS = Object.freeze(['flight', 'standing']);

  function point(name, position, rotation, scale) {
    return Object.freeze({
      name,
      position: Object.freeze(position),
      rotation: Object.freeze(rotation),
      scale
    });
  }

  /*
   * 타입별 부착점 템플릿.
   * flight는 실제 비행 자세, standing은 메인 화면과 코스튬 쇼룸의 세워진 자세다.
   * rotation은 라디안 [x, y, z]이며, position/scale과 함께 화면별로 독립 조정한다.
   */
  const ATTACHMENT_TEMPLATES = Object.freeze({
    [TYPES.HEAD]: Object.freeze({
      flight: Object.freeze([point('center', [0, .18, .46], [0, 0, 0], .72)]),
      // 세워진 마스코트의 종이 면은 XY, 표면 바깥쪽은 +Z다.
      // 모자 자체의 높이축(+Y)을 +Z로 돌려 종이 표면에 수직으로 장착한다.
      standing: Object.freeze([point('center', [0, -.96, .76], [Math.PI / 2, 0, 0], .82)])
    }),
    [TYPES.NOSE]: Object.freeze({
      flight: Object.freeze([point('center', [0, .02, -1.96], [0, 0, 0], 1)]),
      standing: Object.freeze([point('center', [0, 3.52, -.2], [0, 0, 0], 1.18)])
    }),
    [TYPES.WING]: Object.freeze({
      flight: Object.freeze([
        point('left', [-.76, -.06, .48], [0, 0, 0], 1),
        point('right', [.76, -.06, .48], [0, 0, 0], 1)
      ]),
      standing: Object.freeze([
        point('left', [-1.16, -.18, .34], [Math.PI / 2, 0, 0], 1.12),
        point('right', [1.16, -.18, .34], [Math.PI / 2, 0, 0], 1.12)
      ])
    })
  });

  function adjustment(position = [0, 0, 0], rotation = [0, 0, 0], scale = 1) {
    return Object.freeze({
      position: Object.freeze(position),
      rotation: Object.freeze(rotation),
      scale
    });
  }

  function item(id, slot, type, mesh, transforms = {}) {
    return Object.freeze({
      id,
      slot,
      type,
      mesh,
      transforms: Object.freeze(Object.fromEntries(LAYOUTS.map(layout => [
        layout,
        transforms[layout] || adjustment()
      ])))
    });
  }

  /*
   * 아이템 카탈로그. 새 코스튬은 이곳에 slot/type/mesh와 자세별 보정값만 추가한다.
   * 보정값은 타입 부착점에 더해지므로 같은 타입의 기본 위치를 모든 아이템이 공유한다.
   */
  const ITEMS = Object.freeze({
    santa: item('santa', SLOTS.HEAD, TYPES.HEAD, 'santa'),
    magic: item('magic', SLOTS.HEAD, TYPES.HEAD, 'magic'),
    police: item('police', SLOTS.HEAD, TYPES.HEAD, 'police', {
      standing: adjustment([0, 0, .03], [0, 0, 0], .9)
    }),
    rudolph: item('rudolph', SLOTS.NOSE, TYPES.NOSE, 'rudolph'),
    'twin-jets': item('twin-jets', SLOTS.WING, TYPES.WING, 'jet')
  });

  const SLOT_ORDER = Object.freeze([SLOTS.HEAD, SLOTS.NOSE, SLOTS.WING]);
  const OPTIONS_BY_SLOT = Object.freeze(Object.fromEntries(SLOT_ORDER.map(slot => [
    slot,
    Object.freeze(['none', ...Object.values(ITEMS).filter(entry => entry.slot === slot).map(entry => entry.id)])
  ])));
  const DEFAULT_COSTUME = Object.freeze(Object.fromEntries(SLOT_ORDER.map(slot => [slot, 'none'])));

  function resolveAttachments(itemId, layout = 'flight') {
    const entry = ITEMS[itemId];
    const safeLayout = LAYOUTS.includes(layout) ? layout : 'flight';
    if (!entry) return [];
    const offset = entry.transforms[safeLayout];
    return ATTACHMENT_TEMPLATES[entry.type][safeLayout].map(anchor => ({
      name: anchor.name,
      position: anchor.position.map((value, index) => value + offset.position[index]),
      rotation: anchor.rotation.map((value, index) => value + offset.rotation[index]),
      scale: anchor.scale * offset.scale
    }));
  }

  function selectionForItem(itemId) {
    const entry = ITEMS[itemId];
    return entry ? { ...DEFAULT_COSTUME, [entry.slot]: entry.id } : { ...DEFAULT_COSTUME };
  }

  return {
    TYPES,
    SLOTS,
    LAYOUTS,
    SLOT_ORDER,
    ATTACHMENT_TEMPLATES,
    ITEMS,
    OPTIONS_BY_SLOT,
    DEFAULT_COSTUME,
    resolveAttachments,
    selectionForItem
  };
});
