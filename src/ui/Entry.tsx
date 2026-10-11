import { useMemo, useState, type ComponentType } from 'react';
import type { Difficulty } from '../ai/difficulty';
import { SOLO_LEADERS } from '../core/solo/data';
import { soloPantheonLeaders } from '../core/solo/pantheon/data';
import { soloAgoraLeaders } from '../core/solo/agora/data';
import type { GameMode } from './sources/types';
import { HomeScreen } from './components/HomeScreen';
import { TopBar } from './components/TopBar';
import { sfx } from './audio';

export interface StartupOptions {
  mode: GameMode;
  difficulty: Difficulty;
  pantheon: boolean;
  agora: boolean;
  leaderId: string | null;
}

/** 首页只加载模式选择；点击开局或联机后才加载规则、AI、棋盘及复盘。 */
export default function Entry() {
  const [mode, setMode] = useState<GameMode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [pantheon, setPantheon] = useState(false);
  const [agora, setAgora] = useState(false);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [muted, setMuted] = useState(sfx.muted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [startup, setStartup] = useState<StartupOptions | null>(null);
  const [GameApp, setGameApp] = useState<ComponentType<{ startup?: StartupOptions }> | null>(null);
  const leaders = useMemo(() => {
    let pool = SOLO_LEADERS;
    if (pantheon) pool = soloPantheonLeaders(pool);
    if (agora) pool = soloAgoraLeaders(pool);
    return pool;
  }, [pantheon, agora]);

  async function start(nextMode = mode) {
    if (loading) return;
    setMode(nextMode);
    sfx.unlock();
    sfx.play('click');
    setLoading(true);
    setError(false);
    try {
      const module = await import('./App');
      setStartup({ mode: nextMode, difficulty, pantheon, agora, leaderId });
      setGameApp(() => module.default);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (GameApp && startup) return <GameApp startup={startup} />;
  const pickMode = (next: GameMode) => {
    if (loading) return;
    if (next === 'online') void start(next);
    else setMode(next);
  };
  return <div className="app" aria-busy={loading}>
    <TopBar mode={mode} setMode={pickMode} difficulty={difficulty} setDifficulty={setDifficulty}
      muted={muted} toggleMute={() => { sfx.setMuted(!muted); setMuted(!muted); }}
      pantheon={pantheon} setPantheon={setPantheon} agora={agora} setAgora={setAgora}
      tag="未开局" onRestart={() => undefined} compact />
    <HomeScreen mode={mode} setMode={pickMode} difficulty={difficulty} setDifficulty={setDifficulty}
      pantheon={pantheon} setPantheon={setPantheon} agora={agora} setAgora={setAgora}
      leaderPool={leaders} leaderId={leaderId} setLeaderId={setLeaderId} onStart={() => void start()} />
    {loading && <p role="status">正在加载对局…</p>}
    {error && <p role="alert">加载对局失败，请重试。<button className="btn" onClick={() => void start()}>重试</button></p>}
  </div>;
}
