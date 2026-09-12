import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { costPlanForCard, costPlanForWonder, legalActions } from '../core/engine';
import { CARD_BY_ID, WONDER_BY_ID } from '../core/data/index';
import { RESOURCE_LABEL } from '../core/types';
import type { GameAction, PlayerId, Resource } from '../core/types';
import { DIFFICULTY_LABEL, type Difficulty } from '../ai/index';
import type { ReplaySource } from '../core/replay';
import { sfx } from './audio';
import { useLocalGame } from './sources/useLocalGame';
import { useOnlineGame } from './sources/useOnlineGame';
import { useSoloGame } from './sources/useSoloGame';
import type { GameMode } from './sources/types';
import {
  SOLO_LEADERS,
  soloPantheonLeaders,
  soloAgoraLeaders,
  type SoloLeaderDef,
} from '../core/solo/index';
import { CardStructure } from './components/CardStructure';
import { MilitaryTrack } from './components/MilitaryTrack';
import { PantheonBar } from './components/PantheonBar';
import { SenateBar } from './components/SenateBar';
import { SoloBar } from './components/SoloBar';
import { ChoiceOverlay, ResultOverlay } from './components/Overlays';
import { LogPanel, PlayerPanel, ProgressTray } from './components/PlayerPanel';
import { ReplayView } from './components/ReplayView';
import { RoomPanel } from './components/RoomPanel';
import { useIsNarrow } from './useMediaQuery';

const NAMES: [string, string] = ['玩家一', '玩家二'];
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

type Dir = 'left' | 'right' | 'up' | 'down';

/** 键盘方向键走位：同行左右、跨行选「横向最接近」的牌 */
function moveFocus(
  dir: Dir,
  current: number | null,
  order: number[],
  rc: Record<number, { row: number; col: number }>,
): number | null {
  if (order.length === 0) return null;
  if (current === null || rc[current] === undefined) return order[0];

  const cur = rc[current];
  if (dir === 'left' || dir === 'right') {
    const same = order.filter((i) => rc[i].row === cur.row);
    const pos = same.indexOf(current);
    if (pos < 0) return order[0];
    if (dir === 'left') return pos > 0 ? same[pos - 1] : current;
    return pos < same.length - 1 ? same[pos + 1] : current;
  }

  const rows = [...new Set(order.map((i) => rc[i].row))].sort((a, b) => a - b);
  const ri = rows.indexOf(cur.row);
  const target = rows[dir === 'up' ? ri - 1 : ri + 1];
  if (target === undefined) return current;
  let best = -1;
  let bestDist = Infinity;
  for (const i of order) {
    if (rc[i].row !== target) continue;
    const d = Math.abs(rc[i].col - cur.col);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best >= 0 ? best : current;
}

/** 弃牌收益 = 2 + 自己城中商业（黄）卡数量 */
function discardGain(view: { players: { city: string[] }[] }, p: PlayerId): number {
  const yellow = view.players[p].city.filter((id) => CARD_BY_ID[id]?.type === 'commercial').length;
  return 2 + yellow;
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  /** Pantheon / Agora 扩展开关（本地模式；联机由房主开局设置决定） */
  const [pantheonOn, setPantheonOn] = useState(false);
  const [agoraOn, setAgoraOn] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  /** 键盘走位落点（N2）：方向键移动、Enter 选定，与 selectedSlot 相互独立 */
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [wonderMode, setWonderMode] = useState(false);
  const [muted, setMuted] = useState(() => sfx.muted);
  /** 非空时进入复盘模式，接管整个界面 */
  const [replaySource, setReplaySource] = useState<ReplaySource | null>(null);
  /** 单人模式：指定领袖（null = 随机） */
  const [soloLeaderId, setSoloLeaderId] = useState<string | null>(null);
  const isNarrow = useIsNarrow();

  const local = useLocalGame(
    mode === 'ai' || mode === 'hotseat',
    mode === 'ai' ? 'ai' : 'hotseat',
    difficulty,
    pantheonOn,
    agoraOn,
  );
  const online = useOnlineGame(mode === 'online');
  const solo = useSoloGame(mode === 'solo', pantheonOn, agoraOn, soloLeaderId);
  const game = mode === 'online' ? online : mode === 'solo' ? solo : local;

  /** 单人模式下可选的领袖池 = base 5（+ Pantheon 3）（+ Agora Brutus），与 createSoloGame 一致 */
  const soloLeaderPool = useMemo<SoloLeaderDef[]>(() => {
    let pool = SOLO_LEADERS;
    if (pantheonOn) pool = soloPantheonLeaders(pool);
    if (agoraOn) pool = soloAgoraLeaders(pool);
    return pool;
  }, [pantheonOn, agoraOn]);

  const view = game.view;
  const actor = game.actor;
  const over = view?.victory != null;
  const isOnline = mode === 'online';
  const isAi = mode === 'ai';
  const isSolo = mode === 'solo';

  /** 展示用双方名称：单人模式把座位 1 显示为领袖名字 */
  const names: [string, string] = isSolo
    ? ['你', solo.solo.leader.zh || '领袖']
    : NAMES;

  useEffect(() => {
    void sfx.preloadFiles();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !sfx.muted;
    sfx.setMuted(next);
    if (!next) {
      sfx.unlock();
      sfx.play('click');
    }
    setMuted(next);
  }, []);

  const legal = useMemo(
    () => (view && actor !== null ? legalActions(view, actor) : []),
    [view, actor],
  );

  /** 本端可操作的座位：联机=自己座位；人机 / 单人=玩家一；热座=不限（轮到谁谁操作） */
  const humanSeat: PlayerId | null = isOnline
    ? ((online.online?.seat ?? null) as PlayerId | null)
    : isAi || isSolo
      ? 0
      : null;
  const myTurn =
    actor !== null && game.interactive && !over && (humanSeat === null || actor === humanSeat);

  const act = useCallback(
    (a: GameAction) => {
      sfx.unlock();
      game.act(a);
      setSelectedSlot(null);
      setWonderMode(false);
    },
    [game],
  );

  /** 进入复盘：拿本局的种子 + 完整日志，交给回放器逐帧重放 */
  const startReplay = useCallback(() => {
    const src = game.replay?.() ?? null;
    if (src) {
      setSelectedSlot(null);
      setWonderMode(false);
      setReplaySource(src);
    }
  }, [game]);

  const selectableSlots = useMemo(() => {
    const s = new Set<number>();
    if (myTurn && view && view.phase === 'playing') {
      for (const a of legal) {
        if (a.type === 'BUILD_CARD' || a.type === 'DISCARD_CARD' || a.type === 'BUILD_WONDER') {
          s.add(a.slot);
        }
      }
    }
    return s;
  }, [legal, myTurn, view]);

  const selectedCardId = selectedSlot !== null ? view?.slots[selectedSlot]?.cardId ?? null : null;
  const buildPlan =
    view && actor !== null && selectedCardId ? costPlanForCard(view, actor, selectedCardId) : null;

  const canBuild =
    selectedSlot !== null && legal.some((a) => a.type === 'BUILD_CARD' && a.slot === selectedSlot);
  const canDiscard =
    selectedSlot !== null && legal.some((a) => a.type === 'DISCARD_CARD' && a.slot === selectedSlot);

  const wonderOptions = useMemo(() => {
    if (!view || actor === null || selectedSlot === null) return [];
    return view.players[actor].wondersUnbuilt.flatMap((id) => {
      const w = WONDER_BY_ID[id];
      if (!w) return [];
      const plan = costPlanForWonder(view, actor, w);
      const ok = legal.some(
        (a) => a.type === 'BUILD_WONDER' && a.slot === selectedSlot && a.wonderId === id,
      );
      return [{ id, w, plan, ok }];
    });
  }, [view, actor, selectedSlot, legal]);

  /* ---------------------------- 键盘操作（N2） ---------------------------- */

  const kbNav = useMemo(() => {
    if (!view || !myTurn || view.phase !== 'playing' || selectableSlots.size === 0) return [];
    return [...selectableSlots]
      .filter((i) => view.slots[i])
      .sort((a, b) => view.slots[a].row - view.slots[b].row || view.slots[a].col - view.slots[b].col);
  }, [view, myTurn, selectableSlots]);

  const kbRc = useMemo(() => {
    const rc: Record<number, { row: number; col: number }> = {};
    if (view) for (const i of kbNav) rc[i] = { row: view.slots[i].row, col: view.slots[i].col };
    return rc;
  }, [view, kbNav]);

  /** 键盘处理器读取的最新值快照：监听器只绑定一次，但总能拿到最新状态 */
  const kbdRef = useRef<{
    nav: number[];
    rc: Record<number, { row: number; col: number }>;
    focusedSlot: number | null;
    selectedSlot: number | null;
    wonderMode: boolean;
    actor: PlayerId | null;
    /** 键盘可操作：轮到真人（人机模式下 AI 回合不让玩家代按） */
    operable: boolean;
    phase: string | null;
    wonderIds: { id: string; ok: boolean }[];
    canBuild: boolean;
    canDiscard: boolean;
    act: (a: GameAction) => void;
    selectSlot: Dispatch<SetStateAction<number | null>>;
    setWonderMode: Dispatch<SetStateAction<boolean>>;
    focusSlot: Dispatch<SetStateAction<number | null>>;
  } | null>(null);
  kbdRef.current = {
    nav: kbNav,
    rc: kbRc,
    focusedSlot,
    selectedSlot,
    wonderMode,
    actor,
    operable: myTurn && (mode !== 'ai' || actor === 0),
    phase: view?.phase ?? null,
    wonderIds: wonderOptions.map(({ id, ok }) => ({ id, ok })),
    canBuild,
    canDiscard,
    act,
    selectSlot: setSelectedSlot,
    setWonderMode,
    focusSlot: setFocusedSlot,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const K = kbdRef.current;
      if (!K) return;
      const tgt = e.target as HTMLElement | null;
      // 焦点在输入框等元素上时交给元素自己，避免抢走打字
      if (
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.tagName === 'SELECT' ||
          tgt.isContentEditable)
      ) {
        return;
      }
      if (!K.operable || K.phase !== 'playing' || K.actor === null) return;
      if (K.nav.length === 0) return;

      const dirs: Record<string, Dir> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      if (dirs[e.key]) {
        e.preventDefault();
        const next = moveFocus(dirs[e.key], K.focusedSlot, K.nav, K.rc);
        if (next !== null) K.focusSlot(next);
        return;
      }

      // 数字 1..9：在「建造奇迹」面板中直接选中第 N 座奇迹
      if (/^[1-9]$/.test(e.key)) {
        if (K.wonderMode && K.selectedSlot !== null) {
          const opt = K.wonderIds[Number(e.key) - 1];
          if (opt?.ok && K.actor !== null) {
            e.preventDefault();
            K.act({ type: 'BUILD_WONDER', player: K.actor, slot: K.selectedSlot, wonderId: opt.id });
          }
        }
        return;
      }

      if (e.key === 'w' || e.key === 'W') {
        if (K.selectedSlot !== null) {
          e.preventDefault();
          K.setWonderMode(!K.wonderMode);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (K.wonderMode) K.setWonderMode(false);
        else if (K.selectedSlot !== null) K.selectSlot(null);
        else if (K.focusedSlot !== null) K.focusSlot(null);
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        if (tgt && tgt.tagName === 'BUTTON') return; // 按钮用原生事件
        if (K.selectedSlot === null) {
          if (K.focusedSlot !== null) {
            e.preventDefault();
            K.selectSlot(K.focusedSlot);
            sfx.play('click');
          }
        } else if (!K.wonderMode) {
          // 已选定一张牌：Enter 执行主操作（能建则建，否则弃牌）
          e.preventDefault();
          if (K.canBuild) K.act({ type: 'BUILD_CARD', player: K.actor, slot: K.selectedSlot });
          else if (K.canDiscard) K.act({ type: 'DISCARD_CARD', player: K.actor, slot: K.selectedSlot });
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 复盘模式：接管整个界面，退出后回到原来的模式 */
  if (replaySource) {
    return <ReplayView source={replaySource} onExit={() => setReplaySource(null)} />;
  }

  /* 联机且尚未开局：只显示房间大厅 */
  if (isOnline && !view) {
    return (
      <div className="app">
        <TopBar
          mode={mode}
          setMode={setMode}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          muted={muted}
          toggleMute={toggleMute}
          pantheon={isOnline ? (online.online!.seat === 0 ? pantheonOn : online.online!.pantheon) : pantheonOn}
          pantheonLocked={isOnline && online.online!.seat !== 0}
          pantheonTitle={isOnline ? '只有房主可以在开始对局前选择扩展' : undefined}
          setPantheon={setPantheonOn}
          agora={isOnline ? (online.online!.seat === 0 ? agoraOn : online.online!.agora) : agoraOn}
          setAgora={setAgoraOn}
          tag="联机"
          onRestart={() => undefined}
        />
        <div className="lobby">
          <RoomPanel online={online.online!} pantheon={pantheonOn} agora={agoraOn} onBack={() => setMode('ai')} />
          <div className="panel">
            <h3>怎么玩</h3>
            <ol className="howto">
              <li>在其中一台设备上运行 <code>npm run server</code>，记下它打印的局域网地址。</li>
              <li>两台设备都打开该地址（同一 WiFi 下用局域网 IP，手机也可）。</li>
              <li>一台点「创建房间」，把 6 位房间码告诉另一台，另一台输入后加入。</li>
              <li>双方点「我准备好了」，房主点「开始对局」。</li>
            </ol>
            <p className="desc">
              服务器同时托管网页与对局，手机、平板、电脑都能当客户端；
              对局状态只在服务器推演，客户端拿到的已是去掉暗牌与随机种子的公开状态。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!view) return <div className="app">载入中…</div>;

  const seatTag = isOnline && online.online?.seat !== null && online.online?.seat !== undefined
    ? ` · 你的座位：${online.online.seat === 0 ? NAMES[0] : NAMES[1]}`
    : '';

  /** 对手是否正由 AI 托管（掉线超时后接管） */
  const peerAiControlled =
    isOnline &&
    online.online?.seat !== null &&
    online.online?.seat !== undefined &&
    online.online.aiControlled[(1 - online.online.seat) as PlayerId];

  /** 当前视角：联机=自己的座位；人机/单人=玩家一；热座=当前行动方 */
  const viewer: PlayerId = isOnline
    ? ((online.online?.seat ?? 0) as PlayerId)
    : isAi || isSolo
      ? 0
      : ((actor ?? 0) as PlayerId);

  return (
    <div className="app">
      <TopBar
        mode={mode}
        setMode={setMode}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        muted={muted}
        toggleMute={toggleMute}
        pantheon={isOnline ? !!view.pantheon : pantheonOn}
        agora={isOnline ? !!view.agora : agoraOn}
        pantheonLocked={isOnline}
        pantheonTitle="扩展由房主在开始对局前设置"
        setPantheon={setPantheonOn}
        setAgora={setAgoraOn}
        tag={
          view.phase === 'wonderDraft'
            ? '奇迹选择'
            : over
              ? '对局结束'
              : isSolo && actor === 1
                ? `领袖回合 · 时代 ${view.age}`
                : `时代 ${view.age} · 剩余 ${view.structureRemaining} 张`
        }
        onRestart={isOnline ? () => online.restart() : game.restart}
      />

      {isSolo && (
        <SoloBar
          leader={solo.solo.leader}
          lastDecision={solo.solo.lastDecision}
          deckSize={solo.solo.deckSize}
          deckLeft={solo.solo.deckLeft}
          pantheon={solo.solo.pantheon}
          agora={solo.solo.agora}
          pool={soloLeaderPool}
          leaderId={soloLeaderId}
          onPickLeader={setSoloLeaderId}
        />
      )}

      {peerAiControlled && (
        <div className="ai-takeover-banner" role="status">
          对手掉线超过时限，当前由 AI 托管其行动；对方重连后会自动交还。
        </div>
      )}

      <MilitaryTrack state={view} names={names} />

      {view.agora && (
        <SenateBar
          state={view}
          viewer={viewer}
          onAct={act}
          canAct={myTurn}
        />
      )}

      {view.pantheon && (
        <PantheonBar
          state={view}
          viewer={viewer}
          actions={myTurn ? legal : []}
          onAct={act}
        />
      )}

      <div className="main">
        {/* 窄屏下城市面板可折叠，避免把牌阵挤到屏幕外 */}
        <details className="collapsible" open={!isNarrow}>
          <summary>{names[0]}的城市</summary>
          <PlayerPanel
            state={view}
            player={0}
            name={
              names[0] +
              (isAi || isSolo ? '（你）' : '') +
              (isOnline && online.online?.seat === 0 ? '（你）' : '')
            }
            active={!over && actor === 0}
          />
        </details>

        <div className="center-col">
          <CardStructure
            state={view}
            selectableSlots={selectableSlots}
            selectedSlot={selectedSlot}
            focusedSlot={focusedSlot}
            onFocusSlot={setFocusedSlot}
            onPick={(slot) => {
              setSelectedSlot(slot === selectedSlot ? null : slot);
              setWonderMode(false);
              sfx.play('click');
            }}
          />

          <div className="panel actions">
            <h3>行动</h3>

            {over && (
              <div className="actionbar">
                <span className="hint">对局已结束。</span>
              </div>
            )}

            {!over && game.thinking && (
              <div className="actionbar">
                <span className="thinking">
                  {isOnline ? '等待对手行动' : isSolo ? '领袖正在行动' : 'AI 正在推演'}
                  <span className="dots" />
                </span>
              </div>
            )}

            {!over && !game.thinking && !myTurn && view.phase !== 'wonderDraft' && (
              <div className="actionbar">
                <span className="hint">等待{actor === 0 ? names[0] : names[1]}行动…</span>
              </div>
            )}

            {myTurn && view.phase === 'playing' && (
              <>
                <div className="actionbar">
                  {selectedSlot === null ? (
                    <span className="hint">
                      点击一张高亮的牌（或用方向键移动、Enter 选定），再选择要执行的动作。
                    </span>
                  ) : (
                    <>
                      <button
                        className="btn primary"
                        disabled={!canBuild}
                        onClick={() => act({ type: 'BUILD_CARD', player: actor, slot: selectedSlot })}
                      >
                        建造建筑
                        {buildPlan
                          ? `（${buildPlan.freeByLink ? '连锁免费' : `${buildPlan.total} 金币`}）`
                          : ''}
                      </button>
                      <button
                        className="btn"
                        disabled={!canDiscard}
                        onClick={() => act({ type: 'DISCARD_CARD', player: actor, slot: selectedSlot })}
                      >
                        弃牌换 {discardGain(view, actor)} 金币
                      </button>
                      <button className="btn" onClick={() => setWonderMode((v) => !v)}>
                        {wonderMode ? '取消建造奇迹' : '建造奇迹…'}
                      </button>
                      <button className="btn" onClick={() => setSelectedSlot(null)}>
                        取消
                      </button>
                    </>
                  )}
                </div>

                {selectedSlot !== null && buildPlan && (
                  <div className="cost-detail">
                    {buildPlan.freeByLink ? (
                      <span>已持有前置建筑，本张可免费建造。</span>
                    ) : (
                      <>
                        费用明细：
                        {Object.keys(buildPlan.need).length === 0 && !buildPlan.coinCost ? '免费' : null}
                        {Object.entries(buildPlan.need).map(([r, n]) => {
                          const covered = buildPlan.covered[r as Resource] ?? 0;
                          const buy = buildPlan.toBuy[r as Resource] ?? 0;
                          return (
                            <span key={r}>
                              {' '}
                              {RESOURCE_LABEL[r as Resource]}×{n}
                              {buy > 0
                                ? `（自产 ${covered}，购入 ${buy}×${buildPlan.unitPrice[r as Resource]} 金）`
                                : '（自产）'}
                            </span>
                          );
                        })}
                        {buildPlan.coinCost ? `　卡费 ${buildPlan.coinCost} 金` : null}
                        {buildPlan.total > 0 ? `　合计 ${buildPlan.total} 金` : null}
                        {!buildPlan.affordable && (
                          <span className="warn">　金币不足（持有 {view.players[actor].coins}）</span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {wonderMode && selectedSlot !== null && (
                  <div className="wonder-picker">
                    <div className="picker-hint">
                      选择要建造的奇迹（将消耗当前选中的那张牌，也可按对应的数字键直接选择）：
                    </div>
                    <div className="option-grid">
                      {wonderOptions.map(({ id, w, plan, ok }) => (
                        <button
                          className="option"
                          key={id}
                          disabled={!ok}
                          onClick={() =>
                            act({
                              type: 'BUILD_WONDER',
                              player: actor,
                              slot: selectedSlot,
                              wonderId: id,
                            })
                          }
                          title={w.text}
                        >
                          <div className="t">{w.zh}</div>
                          <div className="d">
                            {Object.entries(w.cost)
                              .map(([r, n]) => `${RESOURCE_LABEL[r as Resource]}×${n}`)
                              .join(' ')}
                          </div>
                          <div className="d">
                            {plan.affordable ? `需 ${plan.total} 金` : '资源或金币不足'}
                            {w.vp ? ` · ${w.vp} 分` : ''}
                            {w.shields ? ` · 盾 ${w.shields}` : ''}
                          </div>
                        </button>
                      ))}
                      {wonderOptions.length === 0 && <span className="empty">没有可建造的奇迹</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="panel board-panel">
            <h3>版图</h3>
            <ProgressTray ids={view.progressAvailable} title="可用发展标记" />
            <div className="city-group discard-group">
              <span className="label" style={{ background: 'var(--muted)' }}>
                弃牌堆 {view.discard.length}
              </span>
              <div className="chips">
                {view.discard.length === 0 && <span className="empty">暂无</span>}
                {view.discard.slice(-8).map((id, i) => (
                  <span className="chip" key={`${id}-${i}`} title={CARD_BY_ID[id]?.text}>
                    {CARD_BY_ID[id]?.zh ?? id}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="right-col">
          <details className="collapsible" open={!isNarrow}>
            <summary>{names[1]}的城市</summary>
            <PlayerPanel
              state={view}
              player={1}
              name={
                names[1] +
                (isAi ? '（AI）' : '') +
                (isSolo ? '（领袖）' : '') +
                (isOnline && online.online?.seat === 1 ? '（你）' : '')
              }
              active={!over && actor === 1}
            />
          </details>
          <LogPanel state={view} />
        </div>
      </div>

      {view.phase === 'wonderDraft' && myTurn && actor !== null && (
        <WonderDraft view={view} actor={actor} onAct={act} names={names} />
      )}

      {myTurn && <ChoiceOverlay state={view} onAct={act} />}

      {view.victory && (
        <ResultOverlay
          state={view}
          names={names}
          onRestart={isOnline ? () => online.restart() : game.restart}
          onReplay={game.replay ? startReplay : undefined}
        />
      )}

      <div className="footer-note">
        {seatTag}
        {seatTag ? '　·　' : ''}
        全场最多建造 7 座奇迹，集齐 6 种科技符号或攻入对方首都即立即获胜。
        {isOnline && online.online?.code ? `　·　房间 ${online.online.code}` : ''}
      </div>
    </div>
  );
}

/* ------------------------------ 顶栏 ------------------------------ */

function TopBar(props: {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  muted: boolean;
  toggleMute: () => void;
  pantheon: boolean;
  setPantheon: (v: boolean) => void;
  agora: boolean;
  setAgora: (v: boolean) => void;
  /** 联机时只有房主能在开局前切换；其余场景锁定 */
  pantheonLocked?: boolean;
  pantheonTitle?: string;
  tag: string;
  onRestart: () => void;
}) {
  const {
    mode,
    setMode,
    difficulty,
    setDifficulty,
    muted,
    toggleMute,
    pantheon,
    setPantheon,
    agora,
    setAgora,
    pantheonLocked,
    pantheonTitle,
    tag,
    onRestart,
  } = props;
  return (
    <div className="topbar">
      <h1>七大奇迹对决</h1>
      <span className="age-tag">{tag}</span>
      <div className="spacer" />
      <div className="seg">
        <button className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}>
          人机对战
        </button>
        <button className={mode === 'hotseat' ? 'on' : ''} onClick={() => setMode('hotseat')}>
          本地热座
        </button>
        <button className={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>
          联机对战
        </button>
        <button className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>
          单人 Solo
        </button>
      </div>
      <div className="seg">
        {DIFFS.map((d) => (
          <button
            key={d}
            className={difficulty === d ? 'on' : ''}
            disabled={mode !== 'ai'}
            onClick={() => setDifficulty(d)}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>
      <button
        className={`btn${pantheon ? ' on' : ''}`}
        disabled={pantheonLocked}
        title={pantheonTitle ?? '切换后立即开始新对局'}
        onClick={() => setPantheon(!pantheon)}
      >
        {pantheon ? '🏛 万神殿开' : '🏛 万神殿关'}
      </button>
      <button
        className={`btn${agora ? ' on' : ''}`}
        disabled={pantheonLocked}
        title={pantheonTitle ?? '切换后立即开始新对局'}
        onClick={() => setAgora(!agora)}
      >
        🏛 市政广场{agora ? '开' : '关'}
      </button>
      <button className="btn" onClick={toggleMute} title="音效开关">
        {muted ? '🔇 音效关' : '🔊 音效开'}
      </button>
      <button className="btn" onClick={onRestart}>
        新对局
      </button>
    </div>
  );
}

/* ------------------------------ 奇迹选择 ------------------------------ */

function WonderDraft({
  view,
  actor,
  onAct,
  names,
}: {
  view: NonNullable<ReturnType<typeof useLocalGame>['view']>;
  actor: PlayerId;
  onAct: (a: GameAction) => void;
  names: [string, string];
}) {
  const step = view.wonderDraftStep;
  const round = step < 4 ? '第一轮' : '第二轮';
  const taken = view.players[0].wondersUnbuilt.length + view.players[1].wondersUnbuilt.length;

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="奇迹选择">
        <h2>奇迹选择（{round}　第 {step + 1} / 8 选）</h2>
        <p className="desc">
          由 {names[actor]} 选择 1 张。第一轮顺序为先手 1 → 后手 2 → 先手 1；
          第二轮改由后手先选。目前双方共已选 {taken} 张。
        </p>
        <div className="offer-row">
          {view.wonderOffer.map((id) => {
            const w = WONDER_BY_ID[id];
            if (!w) return null;
            return (
              <button
                className="option"
                key={id}
                onClick={() => onAct({ type: 'DRAFT_WONDER', player: actor, wonderId: id })}
              >
                <div className="t">{w.zh}</div>
                <div className="d">{w.text}</div>
                <div className="d cost-line">
                  费用：
                  {Object.entries(w.cost)
                    .map(([r, n]) => `${RESOURCE_LABEL[r as Resource]}×${n}`)
                    .join(' ')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
