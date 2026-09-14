import { useEffect, useRef, useState } from 'react';
import { CARD_BY_ID } from '../../core/data/index';
import { CARD_TYPE_LABEL } from '../../core/types';
import type { ReadableState } from '../../core/types';
import { sfx } from '../audio';
import { CardView } from './CardView';

const CARD_W = 92;
const CARD_H = 128;
const CHAR_W = CARD_W / 2; // '[]' 占两个字符位
const ROW_H = 62;

export function CardStructure({
  state,
  selectableSlots,
  selectedSlot,
  onPick,
  focusedSlot,
  onFocusSlot,
}: {
  state: ReadableState;
  selectableSlots: Set<number>;
  selectedSlot: number | null;
  onPick: (slot: number) => void;
  /** 键盘走位落点（N2）：高亮 + 可聚焦 */
  focusedSlot?: number | null;
  onFocusSlot?: (slot: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 各槽位 DOM 的引用，供键盘移动焦点时对准 */
  const slotEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const [fitScale, setFitScale] = useState(1);
  /** 窄屏缩到适应尺寸后卡面文字偏小，提供「原始尺寸 + 横向滚动」开关 */
  const [zoomed, setZoomed] = useState(false);
  const [flipping, setFlipping] = useState<Set<number>>(new Set());
  const [entering, setEntering] = useState(false);
  const prevFaceUp = useRef<Map<number, boolean>>(new Map());
  const prevAge = useRef(state.age);

  /* 未取走的槽位都要占位。publicView 会把暗牌 cardId 剥成 null，
     若再要求 s.cardId，中间层整排消失，金字塔叠不起来。 */
  const live = state.slots.filter((s) => !s.taken);

  /* 键盘焦点落点变化时，把焦点交给对应的槽位并滚入视野 */
  useEffect(() => {
    if (focusedSlot == null) return;
    const el = slotEls.current.get(focusedSlot);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [focusedSlot]);

  const maxRow = live.length ? Math.max(...live.map((s) => s.row)) : 0;
  const maxCol = live.length ? Math.max(...live.map((s) => s.col)) : 0;
  const width = maxCol * CHAR_W + CARD_W;
  const height = maxRow * ROW_H + CARD_H;

  /* 自适应缩放：窄屏把整副牌阵等比缩小，而不是让它横向溢出 */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || width === 0) return;
    const measure = () => {
      const avail = el.clientWidth;
      if (avail > 0) setFitScale(Math.min(1, Math.max(0.45, avail / width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const scale = zoomed ? 1 : fitScale;
  const needsZoomToggle = fitScale < 0.95;

  /* 翻牌动画：只在「之前是暗牌、现在翻开」时触发一次 */
  useEffect(() => {
    const now = new Set<number>();
    for (const s of state.slots) {
      if (!s.taken && s.cardId && s.faceUp && prevFaceUp.current.get(s.index) === false) {
        now.add(s.index);
      }
      prevFaceUp.current.set(s.index, s.faceUp);
    }
    if (now.size === 0) return;
    setFlipping(now);
    const t = setTimeout(() => setFlipping(new Set()), 460);
    return () => clearTimeout(t);
  }, [state.slots]);

  /* 换时代时整副牌阵错峰淡入 */
  useEffect(() => {
    if (prevAge.current !== state.age) {
      prevAge.current = state.age;
      setEntering(true);
      const t = setTimeout(() => setEntering(false), 900);
      return () => clearTimeout(t);
    }
  }, [state.age]);

  return (
    <div className="panel structure">
      <h3>
        时代 {state.age} 牌阵 · 剩余 {state.structureRemaining} 张
        {scale < 0.999 && <span className="scale-tip">已缩放至 {Math.round(scale * 100)}%</span>}
        {needsZoomToggle && (
          <button
            className="btn tiny"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setZoomed((v) => !v);
              sfx.play('click');
            }}
            title={zoomed ? '缩回适应屏幕' : '放大到原始尺寸，可左右滑动查看'}
          >
            {zoomed ? '适应屏幕' : '放大查看'}
          </button>
        )}
      </h3>
      <div className={`structure-wrap${zoomed ? ' zoomed' : ''}`} ref={wrapRef}>
        {live.length === 0 ? (
          <div className="empty">本时代牌已取完</div>
        ) : (
          <div
            className="structure-stage"
            style={{ width: width * scale, height: height * scale }}
          >
            <div
              className="structure-inner"
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {live.map((slot) => {
                const pickable = selectableSlots.has(slot.index);
                const card = slot.faceUp ? CARD_BY_ID[slot.cardId!] : null;
                const aria =
                  slot.faceUp && card
                    ? `${card.zh}，${CARD_TYPE_LABEL[card.type] ?? ''}${pickable ? '，可建造或弃牌换金币' : '，当前不可取'}`
                    : '暗牌，需要先取走上方的牌才会翻开';
                return (
                  <div
                    key={slot.index}
                    ref={(el) => {
                      if (el) slotEls.current.set(slot.index, el);
                      else slotEls.current.delete(slot.index);
                    }}
                    className={[
                      'slot',
                      flipping.has(slot.index) ? 'flipping' : '',
                      entering ? 'entering' : '',
                      focusedSlot === slot.index ? 'focused' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      left: slot.col * CHAR_W,
                      top: slot.row * ROW_H,
                      width: CARD_W,
                      height: CARD_H,
                      zIndex: slot.row,
                      animationDelay: entering ? `${slot.row * 60}ms` : undefined,
                    }}
                    role={pickable ? 'button' : undefined}
                    tabIndex={pickable ? 0 : -1}
                    aria-label={aria}
                    aria-disabled={pickable ? undefined : true}
                    onFocus={() => onFocusSlot?.(slot.index)}
                  >
                    <CardView
                      cardId={slot.cardId}
                      faceUp={slot.faceUp}
                      selectable={pickable}
                      selected={selectedSlot === slot.index}
                      dim={selectableSlots.size > 0 && !pickable}
                      onClick={pickable ? () => onPick(slot.index) : undefined}
                      title={
                        slot.faceUp
                          ? `${CARD_BY_ID[slot.cardId!]?.zh}：${CARD_BY_ID[slot.cardId!]?.text}`
                          : '暗牌：取走上方的牌后翻开'
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
