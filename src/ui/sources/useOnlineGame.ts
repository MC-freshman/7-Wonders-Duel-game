import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activePlayer } from '../../core/engine';
import type { ReplaySource } from '../../core/replay';
import type { GameAction, PlayerId } from '../../core/types';
import type { PublicState } from '../../core/visibility';
import type { ClientMsg, ServerMsg } from '../../../server/protocol';
import { sfx } from '../audio';
import type { ConnStatus, GameApi, OnlineInfo } from './types';

/* ------------------------------------------------------------------
 * 联机：本端不做任何规则推演，只发意图、只收服务器下发的公开状态
 * ------------------------------------------------------------------ */

const CODE_KEY = '7wd-room-code';
const SEAT_KEY = '7wd-room-seat';
const CLIENT_KEY = '7wd-client-id';

function clientId(): string {
  try {
    let v = sessionStorage.getItem(CLIENT_KEY);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(CLIENT_KEY, v);
    }
    return v;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/**
 * WebSocket 地址：
 *   1. 优先用 URL 参数 ?srv=ws://192.168.1.5:8787（Vite 开发服务器与联机服务器分离时）
 *   2. 否则连同源地址（由联机服务器一并托管前端时）
 */
function serverUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('srv');
    if (q) {
      const u = q.trim();
      return u.endsWith('/ws') ? u : u.replace(/\/+$/, '') + '/ws';
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  } catch {
    return 'ws://localhost:8787/ws';
  }
}

export function useOnlineGame(enabled: boolean): GameApi {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [view, setView] = useState<PublicState | null>(null);
  const [code, setCode] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(CODE_KEY);
    } catch {
      return null;
    }
  });
  const [seat, setSeat] = useState<PlayerId | null>(() => {
    try {
      const v = sessionStorage.getItem(SEAT_KEY);
      return v === '0' || v === '1' ? (Number(v) as PlayerId) : null;
    } catch {
      return null;
    }
  });
  const [present, setPresent] = useState<[boolean, boolean]>([false, false]);
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const [started, setStarted] = useState(false);
  /** 服务器侧的本局扩展设置（ROOM 广播） */
  const [pantheon, setPantheon] = useState(false);
  const [agora, setAgora] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [peerDeadline, setPeerDeadline] = useState<number | null>(null);
  const [aiControlled, setAiControlled] = useState<[boolean, boolean]>([false, false]);
  /** 终局时由服务器下发的种子，用于本地复盘重放 */
  const [replaySeed, setReplaySeed] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const prevLog = useRef(0);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  /* 建立连接 + 自动重连 */
  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    setStatus((s) => (s === 'connected' ? s : 'connecting'));

    const ws = new WebSocket(serverUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (closed) return;
      setStatus('connected');
      setError(null);
      setAttempt(0);
      // 刷新或断线后自动回到原房间
      const saved = code;
      if (saved) {
        const savedSeat = sessionStorage.getItem(SEAT_KEY);
        send({
          t: 'ROOM_JOIN',
          code: saved,
          clientId: clientId(),
          ...(savedSeat === '0' || savedSeat === '1'
            ? { resumeSeat: Number(savedSeat) as PlayerId }
            : {}),
        });
      }
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'ROOM':
          setCode(msg.code);
          if (msg.seat !== null) {
            setSeat(msg.seat);
            try {
              sessionStorage.setItem(SEAT_KEY, String(msg.seat));
              sessionStorage.setItem(CODE_KEY, msg.code);
            } catch {
              /* 忽略 */
            }
          }
          setPresent(msg.present);
          setReady(msg.ready);
          setStarted(msg.started);
          setPantheon(msg.pantheon);
          setAgora(msg.agora);
          if (msg.aiControlled) setAiControlled(msg.aiControlled);
          if (msg.seat !== null) {
            setPeerConnected(msg.present[(1 - msg.seat) as PlayerId]);
          }
          break;
        case 'GAME': {
          setSeat(msg.seat);
          setView(msg.view);
          setStarted(true);
          prevLog.current = msg.view.log.length;
          try {
            sessionStorage.setItem(SEAT_KEY, String(msg.seat));
          } catch {
            /* 忽略 */
          }
          break;
        }
        case 'UPDATE': {
          setView(msg.view);
          for (const e of msg.entries) void e;
          playSfxForEntries(msg.view, prevLog.current);
          prevLog.current = msg.view.log.length;
          break;
        }
        case 'REJECT':
          setError(`动作被拒绝：${msg.reason}`);
          setTimeout(() => setError(null), 2500);
          break;
        case 'PEER':
          setPeerConnected(msg.connected);
          setPeerDeadline(msg.deadline);
          break;
        case 'OVER':
          setView((v) => (v ? { ...v, victory: msg.victory } : v));
          if (typeof msg.seed === 'number') setReplaySeed(msg.seed);
          sfx.play(msg.victory.winner === seat || msg.victory.type === 'draw' ? 'win' : 'lose');
          break;
        case 'ERROR':
          setError(msg.reason);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (closed) return;
      setStatus((s) => (s === 'connected' ? 'reconnecting' : 'error'));
      setAttempt((a) => {
        const next = a + 1;
        retry = setTimeout(() => setAttempt(next), Math.min(5000, 600 * next));
        return a;
      });
    };

    ws.onerror = () => {
      if (closed) return;
      setStatus('error');
      setError('无法连接到联机服务器');
    };

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        ws.close();
      } catch {
        /* 忽略 */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);

  /* 心跳 */
  useEffect(() => {
    if (!enabled || status !== 'connected') return;
    const t = setInterval(() => send({ t: 'PING', ts: Date.now() }), 15_000);
    return () => clearInterval(t);
  }, [enabled, status, send]);

  /* 切回前台时主动同步一次，避免依赖心跳超时 */
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && wsRef.current?.readyState === WebSocket.OPEN) {
        send({ t: 'RESYNC', lastLog: prevLog.current });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, send]);

  const act = useCallback(
    (a: GameAction) => {
      sfx.unlock();
      const id = `${clientId()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      send({ t: 'ACTION', id, action: a });
    },
    [send],
  );

  const online: OnlineInfo = useMemo(
    () => ({
      status,
      code,
      seat,
      present,
      ready,
      started,
      peerConnected,
      peerDeadline,
      error,
      aiControlled,
      createRoom: () => {
        setError(null);
        send({ t: 'ROOM_CREATE', clientId: clientId() });
      },
      joinRoom: (c: string) => {
        setError(null);
        const v = c.trim().toUpperCase();
        setCode(v);
        send({ t: 'ROOM_JOIN', code: v, clientId: clientId() });
      },
      setReady: (v: boolean) => send({ t: 'READY', ready: v }),
      pantheon,
      agora,
      start: (p: boolean, a: boolean) => send({ t: 'START', pantheon: p, agora: a }),
      leave: () => {
        send({ t: 'LEAVE' });
        setCode(null);
        setSeat(null);
        setStarted(false);
        setView(null);
        try {
          sessionStorage.removeItem(CODE_KEY);
          sessionStorage.removeItem(SEAT_KEY);
        } catch {
          /* 忽略 */
        }
      },
    }),
    [status, code, seat, present, ready, started, pantheon, agora, peerConnected, peerDeadline, error, aiControlled, send],
  );

  const actor = view && !view.victory ? activePlayer(view) : null;

  /** 联机复盘：服务器在终局时下发 seed，配合本端已收到的完整日志重放 */
  const replay = useCallback((): ReplaySource | null => {
    if (replaySeed === null || !view) return null;
    return { seed: replaySeed, log: view.log, names: ['玩家一', '玩家二'], options: { pantheon, agora } };
  }, [replaySeed, view, pantheon, agora]);

  return {
    view,
    actor,
    thinking: actor !== null && seat !== null && actor !== seat,
    act,
    restart: () => send({ t: 'NEW_GAME' }),
    online,
    interactive: seat !== null && actor === seat,
    replay,
  };
}

function playSfxForEntries(view: PublicState, from: number): void {
  const entries = view.log.slice(from);
  for (const e of entries) {
    const t = e.text;
    if (t.startsWith('建造奇迹')) sfx.play('wonder');
    else if (t.startsWith('建造')) sfx.play('build');
    else if (t.startsWith('弃掉')) sfx.play('discard');
    else if (t.startsWith('翻开')) sfx.play('reveal');
    else if (t.startsWith('获得发展标记')) sfx.play('token');
    else if (t.includes('对手失去') || t.startsWith('摧毁')) sfx.play('fine');
    else if (t.includes('进入「')) sfx.play('shield');
    else if (t.includes('时代') && t.includes('开始')) sfx.play('age');
  }
}
