/* ------------------------------------------------------------------
 * 三个时代的牌阵拓扑
 *
 * 直接采用官方规则书最后一页的摆牌示意图，以 ASCII 描述：
 *   - 每一行是一排卡牌，'[]' 为一个卡位，空格仅用于定位
 *   - 越靠下的行越先可拿取（最下一行即开局可拿取的牌）
 *   - 奇数列（第 1、3、5…行）正面朝上，偶数列正面朝下
 * 与 7wd-io/engine 的 ASCII 布局完全一致。
 * ------------------------------------------------------------------ */

export const AGE_LAYOUTS: Record<1 | 2 | 3, string> = {
  1: [
    '    [][]',
    '   [][][]',
    '  [][][][]',
    ' [][][][][]',
    '[][][][][][]',
  ].join('\n'),
  2: [
    '[][][][][][]',
    ' [][][][][]',
    '  [][][][]',
    '   [][][]',
    '    [][]',
  ].join('\n'),
  3: [
    '  [][]',
    ' [][][]',
    '[][][][]',
    ' []  []',
    '[][][][]',
    ' [][][]',
    '  [][]',
  ].join('\n'),
};

/**
 * Agora 扩展的牌阵拓扑（官方 Agora 规则书 p.8「Preparation of the Structure」）：
 *   - Age I：3-4-5-6-7（25 格）；Age II：7-6-5-4-3（25 格）；
 *     Age III：2-3-4-5-4-3-2（23 格，菱形）。
 * 与牌库数学严格咬合：基础牌堆每时代移除 3 张后加入参议员
 * （I/II 各 5 张、III 3 张）正好填满（23-3+5=25 / 20+3行会-3+3=23）。
 * 明暗行交替规则与基础版一致（偶数行正面朝下）。
 */
export const AGORA_AGE_LAYOUTS: Record<1 | 2 | 3, string> = {
  1: [
    '      [][][]',
    '     [][][][]',
    '    [][][][][]',
    '   [][][][][][]',
    '  [][][][][][][]',
  ].join('\n'),
  2: [
    '[][][][][][][]',
    ' [][][][][][]',
    '  [][][][][]',
    '   [][][][]',
    '    [][][]',
  ].join('\n'),
  3: [
    '      [][]',
    '     [][][]',
    '    [][][][]',
    '   [][][][][]',
    '    [][][][]',
    '     [][][]',
    '      [][]',
  ].join('\n'),
};

/** 军事轨道：距中心的格数 → 区块。首都位于 9 */
export const CAPITAL_POS = 9;

export interface TrackZone {
  startPos: number;
  points: number;
  /** 首次进入该区块时对手损失的金币 */
  fine: number;
  label: string;
}

export const TRACK_ZONES: TrackZone[] = [
  { startPos: 6, points: 10, fine: 5, label: '深入腹地' },
  { startPos: 3, points: 5, fine: 2, label: '兵临城下' },
  { startPos: 1, points: 2, fine: 0, label: '边境摩擦' },
  { startPos: 0, points: 0, fine: 0, label: '均势' },
];

export function zoneOf(pos: number): TrackZone {
  for (const z of TRACK_ZONES) {
    if (pos >= z.startPos) return z;
  }
  return TRACK_ZONES[TRACK_ZONES.length - 1];
}

/** 区块索引：0 均势 / 1 边境 / 2 兵临 / 3 深入（用于「只触发一次罚金」） */
export function zoneIndex(pos: number): number {
  if (pos >= 6) return 3;
  if (pos >= 3) return 2;
  if (pos >= 1) return 1;
  return 0;
}

/** 首次进入某区块时对手需支付的金币（按区块索引） */
export const ZONE_FINES = [0, 0, 2, 5];
