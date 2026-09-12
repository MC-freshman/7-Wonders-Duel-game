import type { SoloCardColor, SoloDecisionCardDef, SoloLeaderDef } from '../../core/solo/index';

/* ------------------------------------------------------------------
 * 单人 Solo 顶条：领袖身份 + 当前决策卡 + 决策牌堆进度 + 领袖选择器
 *
 * 「决策卡」是玩家唯一能推演领袖下一步的线索：箭头 = 扫描方向（⟶ 从最左列起 /
 * ⟵ 从最右列起），三个色格 = 依次尝试的卡色偏好（空槽位 = 领袖色）。
 * 因此把它完整展示出来，配合牌阵就能预判领袖会拿哪张牌。
 * ------------------------------------------------------------------ */

const COLOR_ZH: Record<SoloCardColor, string> = {
  purple: '紫',
  yellow: '黄',
  blue: '蓝',
  grey: '灰',
  brown: '棕',
  red: '红',
  green: '绿',
};

const COLOR_HEX: Record<SoloCardColor, string> = {
  purple: '#8e6bbf',
  yellow: '#d8a72c',
  blue: '#3f7fbf',
  grey: '#9aa0a6',
  brown: '#9b6b43',
  red: '#c04a3f',
  green: '#4a9a5c',
};

const REPLAY_ZH: Record<string, string> = { circle: '◉', triangle: '▲' };

function ColorChip({ color, leader }: { color: SoloCardColor | null; leader: SoloLeaderDef }) {
  if (color === null) {
    return leader.preferLink ? (
      <span className="solo-chip link" title="可用链接符号建造的卡">
        链接
      </span>
    ) : (
      <span
        className="solo-chip"
        style={{ background: COLOR_HEX[leader.cardColor] }}
        title={`领袖色：${COLOR_ZH[leader.cardColor]}`}
      >
        {COLOR_ZH[leader.cardColor]}
      </span>
    );
  }
  return (
    <span className="solo-chip" style={{ background: COLOR_HEX[color] }} title={COLOR_ZH[color]}>
      {COLOR_ZH[color]}
    </span>
  );
}

export function DecisionCardView({
  card,
  leader,
}: {
  card: SoloDecisionCardDef | null;
  leader: SoloLeaderDef;
}) {
  if (!card) return <span className="empty">尚未抽卡</span>;
  return (
    <span className="solo-decision">
      <span className="arrow" title={card.direction === 'left' ? '从左往右扫描' : '从右往左扫描'}>
        {card.direction === 'left' ? '⟶' : '⟵'}
      </span>
      <ColorChip color={card.primaryColor} leader={leader} />
      <ColorChip color={card.secondaryColor} leader={leader} />
      <ColorChip color={card.tertiaryColor} leader={leader} />
      {card.replay && (
        <span className="solo-chip replay" title="连动符号：命中则领袖可再行动一次">
          {REPLAY_ZH[card.replay]}
        </span>
      )}
      {card.agoraIcon && (
        <span className="solo-chip icon" title="Agora 图标：先触发 1 张密谋，并优先拿参议员">
          ▢市
        </span>
      )}
      {card.pantheonIcon && (
        <span className="solo-chip icon" title="万神殿图标：时代 II/III 优先调用神明">
          ▢神
        </span>
      )}
    </span>
  );
}

export function SoloBar({
  leader,
  lastDecision,
  deckSize,
  deckLeft,
  pantheon,
  agora,
  pool,
  leaderId,
  onPickLeader,
}: {
  leader: SoloLeaderDef;
  lastDecision: SoloDecisionCardDef | null;
  deckSize: number;
  deckLeft: number;
  pantheon: boolean;
  agora: boolean;
  pool: SoloLeaderDef[];
  leaderId: string | null;
  onPickLeader: (id: string | null) => void;
}) {
  const tags: string[] = [];
  if (pantheon) tags.push('万神殿');
  if (agora) tags.push('市政广场');

  return (
    <div className="solo-bar">
      <span className="solo-title">
        单人 Solo
        {tags.length > 0 ? ` · ${tags.join(' + ')}` : ''}
      </span>

      <label className="solo-pick">
        对手领袖
        <select value={leaderId ?? ''} onChange={(e) => onPickLeader(e.target.value || null)}>
          <option value="">随机</option>
          {pool.map((l) => (
            <option key={l.id} value={l.id}>
              {l.zh}（{l.name}）
            </option>
          ))}
        </select>
      </label>

      <span className="solo-leader">
        <span className="solo-chip" style={{ background: COLOR_HEX[leader.cardColor] }}>
          {COLOR_ZH[leader.cardColor]}
        </span>
        {leader.zh}（{leader.name}）
        {leader.replays.length > 0 && (
          <span className="hint">　连动 {leader.replays.map((r) => REPLAY_ZH[r]).join(' ')}</span>
        )}
      </span>

      <span className="solo-decision-wrap">
        本回合决策卡：
        <DecisionCardView card={lastDecision} leader={leader} />
      </span>

      <span className="solo-deck">
        决策牌堆 {deckLeft}/{deckSize}
      </span>

      <span className="hint solo-help">
        领袖不付资源与金币；箭头为扫描方向，色格为其取牌顺序。
      </span>
    </div>
  );
}
