/* 渲染冒烟：
 *   1) 渲染首屏（奇迹选择阶段）
 *   2) 推进到时代 II 中段后，渲染牌阵 / 城市面板 / 军事轨道 / 选择弹窗
 * 用以确认组件树在各阶段均无运行时异常。
 */

import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../src/ui/App';
import { CardStructure } from '../src/ui/components/CardStructure';
import { MilitaryTrack } from '../src/ui/components/MilitaryTrack';
import { ChoiceOverlay, ResultOverlay } from '../src/ui/components/Overlays';
import { LogPanel, PlayerPanel, ProgressTray } from '../src/ui/components/PlayerPanel';
import { RoomPanel } from '../src/ui/components/RoomPanel';
import { ReplayView } from '../src/ui/components/ReplayView';
import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import type { GameState } from '../src/core/types';
import type { OnlineInfo } from '../src/ui/sources/types';

const noop = () => {};
const onlineMock = (over: Partial<OnlineInfo> = {}): OnlineInfo => ({
  status: 'connected',
  code: 'AB12CD',
  seat: 0,
  present: [true, true],
  ready: [true, false],
  started: false,
  pantheon: false,
  agora: false,
  peerConnected: true,
  peerDeadline: null,
  error: null,
  aiControlled: [false, false],
  createRoom: noop,
  joinRoom: noop,
  setReady: noop,
  start: () => noop,
  leave: noop,
  ...over,
});

const NAMES: [string, string] = ['玩家一', '玩家二'];

const first = renderToString(createElement(App));
console.log('首屏 HTML 长度：', first.length);

/* 用随机策略推进到时代 II */
let state: GameState = initialState(20260829);
let rnd = 987654321;
const next = () => {
  rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
  return rnd / 0x7fffffff;
};
let steps = 0;
while (!state.victory && state.age < 2 && steps < 200) {
  const actor = activePlayer(state);
  if (actor === null) break;
  const acts = legalActions(state, actor);
  if (acts.length === 0) break;
  state = applyAction(state, acts[Math.floor(next() * acts.length)]);
  steps += 1;
}
console.log(`推进 ${steps} 步后：时代 ${state.age}，阶段 ${state.phase}，剩余 ${state.structureRemaining} 张`);

const live = state.slots.filter((s) => !s.taken && s.cardId);
const selectable = new Set(live.slice(0, 3).map((s) => s.index));

const parts: [string, string][] = [
  [
    '牌阵',
    renderToString(
      createElement(CardStructure, {
        state,
        selectableSlots: selectable,
        selectedSlot: null,
        onPick: () => {},
      }),
    ),
  ],
  ['军事轨道', renderToString(createElement(MilitaryTrack, { state, names: NAMES }))],
  [
    '玩家面板',
    renderToString(
      createElement(PlayerPanel, { state, player: 0, name: NAMES[0], active: true }),
    ) +
      renderToString(
        createElement(PlayerPanel, { state, player: 1, name: NAMES[1], active: false }),
      ),
  ],
  ['日志', renderToString(createElement(LogPanel, { state }))],
  ['发展标记托盘', renderToString(createElement(ProgressTray, { ids: state.progressAvailable, title: '可用发展标记' }))],
  // 无待办选择 / 未结束时，两个弹窗本就应返回 null，故另造场景验证
  ['选择弹窗（无待办→null）', renderToString(createElement(ChoiceOverlay, { state, onAct: () => {} }))],
  ['联机大厅（已建房）', renderToString(createElement(RoomPanel, { online: onlineMock(), pantheon: false, agora: false, onBack: () => {} }))],
  [
    '联机大厅（未建房）',
    renderToString(
      createElement(RoomPanel, { online: onlineMock({ code: null, seat: null }), pantheon: false, agora: false, onBack: () => {} }),
    ),
  ],
  [
    '联机大厅（对手掉线）',
    renderToString(
      createElement(RoomPanel, {
        online: onlineMock({ started: true, peerConnected: false, peerDeadline: Date.now() + 45000 }),
        pantheon: false,
        agora: false,
        onBack: () => {},
      }),
    ),
  ],
  [
    '联机大厅（连接失败）',
    renderToString(
      createElement(RoomPanel, { online: onlineMock({ status: 'error', code: null }), pantheon: false, agora: false, onBack: () => {} }),
    ),
  ],
];

/* 找到一个真正存在待办选择的局面 */
let pendingState: GameState | null = null;
let probe = state;
for (let i = 0; i < 400 && !probe.victory; i++) {
  const actor = activePlayer(probe);
  if (actor === null) break;
  if (probe.pending) {
    pendingState = probe;
    break;
  }
  const acts = legalActions(probe, actor);
  if (acts.length === 0) break;
  probe = applyAction(probe, acts[Math.floor(next() * acts.length)]);
}
if (pendingState) {
  const html = renderToString(
    createElement(ChoiceOverlay, { state: pendingState, onAct: () => {} }),
  );
  parts.push(['选择弹窗（有待办）', html]);
} else {
  console.log('· 本次随机对局未出现待办选择，跳过该场景');
}

/* 跑到终局，验证结算弹窗 */
let finished: GameState = state;
for (let i = 0; i < 400 && !finished.victory; i++) {
  const actor = activePlayer(finished);
  if (actor === null) break;
  const acts = legalActions(finished, actor);
  if (acts.length === 0) break;
  finished = applyAction(finished, acts[Math.floor(next() * acts.length)]);
}
if (finished.victory) {
  parts.push([
    '结算弹窗',
    renderToString(
      createElement(ResultOverlay, { state: finished, names: NAMES, onRestart: () => {} }),
    ),
  ]);
  console.log(
    `终局：${finished.victory.type}，胜者 ${finished.victory.winner === null ? '平局' : NAMES[finished.victory.winner]}`,
  );
}

/* Pantheon 冒烟：推进到时代 II，渲染图板条与神格选择弹窗 */
import { PantheonBar } from '../src/ui/components/PantheonBar';
let panState: GameState = initialState(20260903, { pantheon: true });
let panSteps = 0;
while (!panState.victory && panState.age < 2 && panSteps < 200) {
  const actor = activePlayer(panState);
  if (actor === null) break;
  const acts = legalActions(panState, actor);
  if (acts.length === 0) break;
  panState = applyAction(panState, acts[Math.floor(next() * acts.length)]);
  panSteps += 1;
}
console.log(`Pantheon 推进 ${panSteps} 步后：时代 ${panState.age}，剩余 ${panState.structureRemaining} 张`);
parts.push([
  'Pantheon 图板条',
  renderToString(
    createElement(PantheonBar, {
      state: panState,
      viewer: 0,
      actions: legalActions(panState, 0),
      onAct: () => {},
    }),
  ),
]);
let panPending: GameState | null = null;
let probePan = panState;
for (let i = 0; i < 500 && !probePan.victory; i++) {
  if (probePan.pending?.kind === 'pantheon') {
    panPending = probePan;
    break;
  }
  const actor = activePlayer(probePan);
  if (actor === null) break;
  const acts = legalActions(probePan, actor);
  if (acts.length === 0) break;
  probePan = applyAction(probePan, acts[Math.floor(next() * acts.length)]);
}
if (panPending) {
  parts.push([
    'Pantheon 选择弹窗',
    renderToString(createElement(ChoiceOverlay, { state: panPending, onAct: () => {} })),
  ]);
} else {
  console.log('· 本次 Pantheon 随机对局未出现神格选择弹窗，跳过该场景');
}


/* Agora 冒烟：参议院条 + 密谋选择弹窗（确定性构造 conspiratorChoose / conspireKeep 两种） */
import { SenateBar } from '../src/ui/components/SenateBar';
import type { PendingChoice } from '../src/core/types';
let agoraState: GameState = initialState(20260905, { agora: true });
let agoraSteps = 0;
while (!agoraState.victory && agoraState.age < 2 && agoraSteps < 200) {
  const actor = activePlayer(agoraState);
  if (actor === null) break;
  const acts = legalActions(agoraState, actor);
  if (acts.length === 0) break;
  agoraState = applyAction(agoraState, acts[Math.floor(next() * acts.length)]);
  agoraSteps += 1;
}
console.log(`Agora 推进 ${agoraSteps} 步后：时代 ${agoraState.age}，剩余 ${agoraState.structureRemaining} 张，chambers=${agoraState.agora ? agoraState.agora.senate.chambers.map((c) => c.cubes[0] + '+' + c.cubes[1]).join('/') : '-'}`);
parts.push([
  'Agora 参议院条',
  renderToString(
    createElement(SenateBar, {
      state: agoraState,
      viewer: 0,
      onAct: () => {},
      canAct: false,
    }),
  ),
]);

/* 确定性构造两类 Agora 待决弹窗 */
const agoraPendings: [string, PendingChoice][] = [
  ['Agora 弹窗（密谋者二选一）', { kind: 'agora', player: 0, steps: [{ kind: 'conspiratorChoose', options: ['place', 'conspire'] }] }],
  ['Agora 弹窗（Conspire 保留）', { kind: 'agora', player: 0, steps: [{ kind: 'conspireKeep', options: ['con-sabotage', 'con-blackmail'] }] }],
  ['Agora 弹窗（免费建造）', { kind: 'agora', player: 0, steps: [{ kind: 'pickBuild', options: agoraState.slots.filter((sl) => sl.faceUp && sl.cardId && !sl.taken).slice(0, 4).map((sl) => sl.cardId!) }] }],
];
for (const [label, pend] of agoraPendings) {
  const st: GameState = { ...agoraState, pending: pend, phase: "agoraChoice" } as GameState;
  parts.push([label, renderToString(createElement(ChoiceOverlay, { state: st, onAct: () => {} }))]);
}

/* 单人 Solo 冒烟：顶条（领袖身份 + 最近一张决策卡） + 领袖侧 Pantheon 待决弹窗 */
import { SoloBar } from '../src/ui/components/SoloBar';
import { chooseAction } from '../src/ai/index';
import {
  createSoloGame,
  soloApplyAction,
  soloLeaderTurn,
  isLeaderAgoraPending,
  isLeaderPantheonPending,
  SOLO_LEADERS,
} from '../src/core/solo/index';
const soloGame = createSoloGame(20260910, 'imhotep', { pantheon: true });
soloLeaderTurn(soloGame); // 让领袖走完第一轮
parts.push([
  '单人 Solo 顶条',
  renderToString(
    createElement(SoloBar, {
      leader: soloGame.leader,
      lastDecision: soloGame.lastDecision,
      deckSize: soloGame.decisionCards.length,
      deckLeft: soloGame.deck.length - soloGame.deckIndex,
      pantheon: !!soloGame.pantheon,
      agora: !!soloGame.agora,
      pool: SOLO_LEADERS,
      leaderId: 'imhotep',
      onPickLeader: () => {},
    }),
  ),
]);
console.log(
  `Solo 冒烟：领袖=${soloGame.leader.zh} 决策卡=${
    soloGame.lastDecision ? soloGame.lastDecision.direction : '无'
  } 决策牌堆=${soloGame.decisionCards.length} 图板=${soloGame.state.pantheon!.board
    .map((x) => (x === null ? '·' : x === 'gate' ? '门' : '神'))
    .join('')}`,
);
/* 用 AI 扮演玩家把 Solo 对局推进到出现 Pantheon 待决，验证弹窗可渲染 */
{
  let sp: GameState | null = null;
  const probeSolo = createSoloGame(1000, 'caligula', { pantheon: true });
  for (let i = 0; i < 400 && !probeSolo.state.victory; i++) {
    const st = probeSolo.state;
    if (st.pending?.kind === 'pantheon') {
      sp = st;
      break;
    }
    if (st.pending) {
      const pa = st.pending.kind === 'startPlayer' ? st.pending.chooser : st.pending.player;
      const acts = legalActions(st, pa);
      if (acts.length === 0) break;
      if (pa === 1) soloLeaderTurn(probeSolo);
      else soloApplyAction(probeSolo, acts[0]);
      continue;
    }
    if (isLeaderAgoraPending(probeSolo) || isLeaderPantheonPending(probeSolo)) {
      soloLeaderTurn(probeSolo);
      continue;
    }
    if (st.current === 1) {
      soloLeaderTurn(probeSolo);
    } else {
      const dec = chooseAction(st, 0, 'easy');
      if (!dec?.action) break;
      soloApplyAction(probeSolo, dec.action);
    }
  }
  if (sp) {
    parts.push([
      'Solo Pantheon 待决弹窗',
      renderToString(createElement(ChoiceOverlay, { state: sp, onAct: () => {} })),
    ]);
  } else {
    console.log('· 本次 Solo 探测未捕获到 Pantheon 待决，跳过该场景');
  }
}

/* 复盘视图冒烟：给出一局完整日志，从第 0 帧（开局）渲染只读界面 + 复盘控制条 */
if (finished.victory) {
  parts.push([
    '复盘视图',
    renderToString(
      createElement(ReplayView, {
        source: { seed: 20260829, log: finished.log, names: NAMES },
        onExit: noop,
      }),
    ),
  ]);
}

let ok = first.includes('七大奇迹对决') && first.includes('track-cell');
console.log(`${ok ? '✓' : '✗'} 首屏渲染`);
for (const [label, html] of parts) {
  // 「无待办选择→null」这一项本就应为空，其余项必须有内容
  const expectEmpty = label.includes('→null');
  const pass = expectEmpty
    ? html.length === 0
    : html.length > 0 && !html.includes('NaN') && !html.includes('undefined');
  console.log(`${pass ? '✓' : '✗'} ${label}（${html.length} 字节）`);
  if (!pass) ok = false;
}

if (!ok) process.exit(1);
console.log('\n渲染冒烟通过：各阶段组件均无异常。');
