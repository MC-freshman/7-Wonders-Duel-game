import { useEffect, useState } from 'react';
import type { OnlineInfo } from '../sources/types';

const NAMES = ['玩家一（房主）', '玩家二'];

export function RoomPanel({
  online,
  pantheon,
  agora,
  onBack,
}: {
  online: OnlineInfo;
  /** 房主在顶栏选好的扩展开关，开始对局时随 START 发给服务器 */
  pantheon: boolean;
  agora: boolean;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [, force] = useState(0);

  // 对手掉线倒计时需要每秒刷新
  useEffect(() => {
    if (online.peerDeadline === null) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [online.peerDeadline]);

  const remain =
    online.peerDeadline === null ? null : Math.max(0, Math.ceil((online.peerDeadline - Date.now()) / 1000));

  return (
    <div className="panel room">
      <h3>联机房间</h3>

      <div className={`conn conn-${online.status}`}>
        {online.status === 'connected' ? '● 已连接' : null}
        {online.status === 'connecting' ? '○ 连接中…' : null}
        {online.status === 'reconnecting' ? '◌ 连接断开，正在重连…' : null}
        {online.status === 'error' ? '✕ 无法连接服务器' : null}
        {online.status === 'idle' ? '○ 未连接' : null}
      </div>

      {online.error && <div className="err-box">{online.error}</div>}

      {online.status === 'error' && (
        <p className="desc">
          请确认联机服务器已启动（<code>npm run server</code>）。
          若前端是用 <code>npm run dev</code> 单独启动的，需在地址后加上{' '}
          <code>?srv=ws://服务器IP:8080</code>。
        </p>
      )}

      {online.code === null ? (
        <div className="room-actions">
          <button
            className="btn primary"
            disabled={online.status !== 'connected'}
            onClick={online.createRoom}
          >
            创建房间
          </button>
          <div className="join-row">
            <input
              className="code-input"
              placeholder="6 位房间码"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="btn"
              disabled={online.status !== 'connected' || code.trim().length === 0}
              onClick={() => online.joinRoom(code)}
            >
              加入
            </button>
          </div>
          <button className="btn" onClick={onBack}>
            返回单机
          </button>
        </div>
      ) : (
        <div className="room-actions">
          <div className="room-code">
            房间码 <strong>{online.code}</strong>
            <button
              className="btn tiny"
              onClick={() => void navigator.clipboard?.writeText(online.code ?? '')}
            >
              复制
            </button>
          </div>
          <div className="seats">
            {([0, 1] as const).map((i) => (
              <div key={i} className={`seat${online.seat === i ? ' me' : ''}`}>
                <span className="nm">{NAMES[i]}</span>
                <span className={online.present[i] ? 'on' : 'off'}>
                  {online.present[i] ? '已就位' : '等待中'}
                </span>
                {online.ready[i] && <span className="rdy">已准备</span>}
                {online.aiControlled[i] && <span className="ai-tag">AI 托管</span>}
              </div>
            ))}
          </div>

          {!online.started && (
            <>
              <button
                className="btn primary"
                disabled={online.seat === null}
                onClick={() => online.setReady(true)}
              >
                {online.ready[online.seat ?? 0] ? '已准备' : '我准备好了'}
              </button>
              {online.seat === 0 && (
                <button
                  className="btn"
                  disabled={!online.present[0] || !online.present[1]}
                  onClick={() => online.start(pantheon, agora)}
                >
                  开始对局{!online.present[1] ? '（等待对手加入）' : ''}
                </button>
              )}
              {online.seat === 1 && <p className="desc">等待房主开始对局…</p>}
            </>
          )}

          {!online.peerConnected && online.started && (
            <div className="warn-box">
              对手已掉线
              {remain !== null
                ? online.aiControlled[(1 - (online.seat ?? 0)) as 0 | 1]
                  ? '，AI 正在托管其行动'
                  : `，${remain} 秒后将由 AI 接管`
                : ''}
            </div>
          )}

          <button className="btn" onClick={online.leave}>
            离开房间
          </button>
        </div>
      )}
    </div>
  );
}
