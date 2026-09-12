import type { Slot } from './types';
import { AGE_LAYOUTS } from './data/layouts';

/* ------------------------------------------------------------------
 * 牌阵解析
 *
 * 规则：一张卡可拿取，当且仅当压在它上面的卡都已被取走。
 * 在本 ASCII 表达中，位于第 N 行的卡被第 N+1 行的卡压住；
 * 相邻关系由字符位置决定 —— 第 N+1 行位置 p 的卡，压住第 N 行
 * 位置 p-1 与 p+1 的卡。
 * ------------------------------------------------------------------ */

export interface LayoutSlot {
  index: number;
  /** 所属行（0 为最上） */
  row: number;
  /** 行内字符位置 */
  col: number;
  /** 是否被正面朝下摆放 */
  faceDown: boolean;
  /** 需要被取走才可拿取的上层卡位 */
  requires: number[];
}

export function parseLayout(age: 1 | 2 | 3): LayoutSlot[] {
  const lines = AGE_LAYOUTS[age].split('\n');
  const slots: LayoutSlot[] = [];
  let prev: Map<number, number> = new Map(); // 字符位置 -> 卡位索引
  let cardIndex = 0;

  lines.forEach((line, rowIdx) => {
    const curr = new Map<number, number>();
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== '[') continue;
      const idx = cardIndex++;
      curr.set(col, idx);
      // 偶数列（rowIdx 从 0 起，故 rowIdx % 2 === 1 对应第 2、4…行）正面朝下
      const faceDown = rowIdx % 2 === 1;
      slots.push({ index: idx, row: rowIdx, col, faceDown, requires: [] });
    }

    // 本行的卡压住上一行相邻位置的卡
    for (const [col, idx] of curr) {
      const left = prev.get(col + 1);
      if (left !== undefined) slots[left].requires.push(idx);
      const right = prev.get(col - 1);
      if (right !== undefined) slots[right].requires.push(idx);
    }
    prev = curr;
  });

  return slots;
}

export function buildSlots(age: 1 | 2 | 3): Slot[] {
  return parseLayout(age).map((s) => ({
    index: s.index,
    cardId: null,
    faceUp: !s.faceDown,
    taken: false,
    requires: s.requires,
    row: s.row,
    col: s.col,
  }));
}

/** 某个槽位当前是否可拿取 */
export function isSlotAccessible(slots: Slot[], index: number): boolean {
  const slot = slots[index];
  if (!slot || slot.taken || slot.cardId === null) return false;
  return slot.requires.every((r) => slots[r].taken);
}

export function accessibleSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => isSlotAccessible(slots, s.index));
}
