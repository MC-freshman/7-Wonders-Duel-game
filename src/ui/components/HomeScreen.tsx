import { DIFFICULTY_LABEL, type Difficulty } from '../../ai/index';
import type { SoloLeaderDef } from '../../core/solo/index';
import type { GameMode } from '../sources/types';

/* ------------------------------------------------------------------
 * 首页模式选择屏
 *
 * 顶栏那条「模式 / 难度 / 扩展 / 音效 / 新对局」横条在手机宽度上是一堵墙，
 * 未开局时改用四张卡片承载同样的选择：点卡片＝选模式（参数就地展开），
 * 点主按钮＝真正开局。
 *
 * ⚠️ 这里只负责「选」，不负责「建局」：真正建局仍由 `App` 的 `started` 门控
 * 传给各 hook 的 `enabled`。Solo 的领袖是先手的，若在屏后提前建局，领袖会在
 * 首页背后自行开跑（见 MEMORY 2026-09-14）。
 * 「联机对战」卡片不进入选择态，直接切到大厅 —— 大厅有自己的就绪/开始流程。
 * ------------------------------------------------------------------ */

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

interface CardDef {
  id: GameMode;
  glyph: string;
  title: string;
  desc: string;
}

const CARDS: CardDef[] = [
  { id: 'ai', glyph: '🤖', title: '人机对战', desc: '你执玩家一，AI 执玩家二' },
  { id: 'hotseat', glyph: '👥', title: '本地热座', desc: '两人共用这台设备轮流走子' },
  { id: 'online', glyph: '🌐', title: '联机对战', desc: '一台电脑当服务器，另一台输房间码' },
  { id: 'solo', glyph: '🎭', title: '单人 Solo', desc: '官方 Solo 变体，对手是按决策卡行事的领袖' },
];

export function HomeScreen({
  mode,
  setMode,
  difficulty,
  setDifficulty,
  pantheon,
  setPantheon,
  agora,
  setAgora,
  leaderPool,
  leaderId,
  setLeaderId,
  onStart,
}: {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  pantheon: boolean;
  setPantheon: (v: boolean) => void;
  agora: boolean;
  setAgora: (v: boolean) => void;
  /** Solo 可选领袖池（随扩展开关变化） */
  leaderPool: SoloLeaderDef[];
  /** null = 随机 */
  leaderId: string | null;
  setLeaderId: (id: string | null) => void;
  onStart: () => void;
}) {
  const exts = [pantheon ? '万神殿' : null, agora ? '市政广场' : null].filter(Boolean) as string[];
  const summary =
    mode === 'ai'
      ? `人机对战 · ${DIFFICULTY_LABEL[difficulty]}`
      : mode === 'hotseat'
        ? '本地热座 · 同一台设备'
        : mode === 'solo'
          ? `单人 Solo · ${leaderId ? (leaderPool.find((l) => l.id === leaderId)?.zh ?? '领袖') : '随机领袖'}`
          : '联机对战';

  return (
    <div className="home">
      <div className="home-grid">
        {CARDS.map((c) => {
          const isOnlineCard = c.id === 'online';
          const on = !isOnlineCard && mode === c.id;
          return (
            <div className={`home-card${on ? ' on' : ''}`} key={c.id}>
              <button
                type="button"
                className="home-pick"
                aria-pressed={on}
                onClick={() => setMode(c.id)}
              >
                <span className="home-glyph" aria-hidden>
                  {c.glyph}
                </span>
                <span className="home-card-title">{c.title}</span>
                <span className="home-card-desc">{c.desc}</span>
                <span className="home-card-note">
                  {isOnlineCard
                    ? '进入大厅 →'
                    : on
                      ? '已选择'
                      : c.id === 'solo'
                        ? `${leaderPool.length} 位领袖`
                        : c.id === 'ai'
                          ? DIFFICULTY_LABEL[difficulty]
                          : '随时可换'}
                </span>
              </button>

              {on && c.id === 'ai' && (
                <div className="home-param">
                  <span>难度</span>
                  <div className="seg" role="group" aria-label="AI 难度">
                    {DIFFS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={difficulty === d ? 'on' : ''}
                        aria-pressed={difficulty === d}
                        onClick={() => setDifficulty(d)}
                      >
                        {DIFFICULTY_LABEL[d]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {on && c.id === 'solo' && (
                <div className="home-param">
                  <label className="home-pick-leader">
                    对手领袖
                    <select
                      value={leaderId ?? ''}
                      onChange={(e) => setLeaderId(e.target.value || null)}
                    >
                      <option value="">随机</option>
                      {leaderPool.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.zh}（{l.name}）
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {on && c.id === 'hotseat' && (
                <div className="home-param">
                  <span>两人共用本设备，行动方切换时互可见（无隐藏信息）。</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="lobby">
        <div className="panel start-panel">
          <h3>开局设置</h3>
          <div className="home-ext">
            <span className="home-ext-label">扩充</span>
            <button
              type="button"
              className={`btn${pantheon ? ' on' : ''}`}
              aria-pressed={pantheon}
              title="神格牌堆与图板：时代 I 放神话 token，时代 II/III 可调用神明"
              onClick={() => setPantheon(!pantheon)}
            >
              🏛 万神殿{pantheon ? '开' : '关'}
            </button>
            <button
              type="button"
              className={`btn${agora ? ' on' : ''}`}
              aria-pressed={agora}
              title="参议院与密谋、16 条法令、2 座新奇迹"
              onClick={() => setAgora(!agora)}
            >
              🏛 市政广场{agora ? '开' : '关'}
            </button>
          </div>
          <p className="desc">
            当前：<strong>{summary}</strong>　·　{exts.length > 0 ? exts.join(' + ') : '无扩展'}
          </p>
          <button
            type="button"
            className="btn primary start-btn"
            onClick={onStart}
            disabled={mode === 'online'}
          >
            开始对局
          </button>
          <p className="desc">
            对局中随时可用顶栏切换模式 / 难度 / 扩展；切换扩展会按新设置重开一局。
          </p>
        </div>

        <div className="panel">
          <h3>怎么玩</h3>
          <ol className="howto">
            <li>点击一张高亮的牌，再选「建造建筑 / 弃牌换金币 / 建造奇迹」。</li>
            <li>也可以用方向键走位、Enter 选定，W 展开奇迹面板，Esc 取消。</li>
            <li>集齐 6 种科技符号或攻入对方首都立即获胜，否则时代 III 末比总分。</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
