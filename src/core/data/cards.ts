import type { CardDef } from '../types';
import { TEMPLES } from './pantheon';
import { senatorCardDefs } from './agora';

/* ------------------------------------------------------------------
 * 卡牌数据
 * 依据官方英文规则书（7-Wonders-Duel-Rules-US.pdf）第 18-19 页卡表整理，
 * 并对照第 5、15、16 页的符号说明与行会/奇迹正文补全数值。
 * ------------------------------------------------------------------ */

export const CARDS: CardDef[] = [
  /* ------------------------------ 时代 I（23） ------------------------------ */
  { id: 'lumber-yard', name: 'Lumber Yard', zh: '伐木场', type: 'raw', age: 1, produces: { wood: 1 }, text: '产出 1 木材' },
  { id: 'logging-camp', name: 'Logging Camp', zh: '伐木营地', type: 'raw', age: 1, coinCost: 1, produces: { wood: 1 }, text: '产出 1 木材' },
  { id: 'clay-pool', name: 'Clay Pool', zh: '黏土池', type: 'raw', age: 1, produces: { clay: 1 }, text: '产出 1 黏土' },
  { id: 'clay-pit', name: 'Clay Pit', zh: '黏土坑', type: 'raw', age: 1, coinCost: 1, produces: { clay: 1 }, text: '产出 1 黏土' },
  { id: 'quarry', name: 'Quarry', zh: '采石场', type: 'raw', age: 1, produces: { stone: 1 }, text: '产出 1 石材' },
  { id: 'stone-pit', name: 'Stone Pit', zh: '石矿', type: 'raw', age: 1, coinCost: 1, produces: { stone: 1 }, text: '产出 1 石材' },
  { id: 'glassworks', name: 'Glassworks', zh: '玻璃工坊', type: 'manufactured', age: 1, coinCost: 1, produces: { glass: 1 }, text: '产出 1 玻璃' },
  { id: 'press', name: 'Press', zh: '造纸坊', type: 'manufactured', age: 1, coinCost: 1, produces: { papyrus: 1 }, text: '产出 1 纸草' },

  { id: 'guard-tower', name: 'Guard Tower', zh: '哨塔', type: 'military', age: 1, shields: 1, text: '1 面战争盾' },
  { id: 'stable', name: 'Stable', zh: '马厩', type: 'military', age: 1, cost: { wood: 1 }, shields: 1, link: 'stable', text: '1 面战争盾；提供连锁符号' },
  { id: 'garrison', name: 'Garrison', zh: '卫戍队', type: 'military', age: 1, cost: { clay: 1 }, shields: 1, link: 'garrison', text: '1 面战争盾；提供连锁符号' },
  { id: 'palisade', name: 'Palisade', zh: '木栅', type: 'military', age: 1, coinCost: 1, shields: 1, link: 'palisade', text: '1 面战争盾；提供连锁符号' },

  { id: 'workshop', name: 'Workshop', zh: '工坊', type: 'scientific', age: 1, cost: { papyrus: 1 }, science: 'math', vp: 1, text: '科技符号「衡」；1 分' },
  { id: 'apothecary', name: 'Apothecary', zh: '药房', type: 'scientific', age: 1, cost: { glass: 1 }, science: 'wheel', vp: 1, text: '科技符号「轮」；1 分' },
  { id: 'scriptorium', name: 'Scriptorium', zh: '缮写室', type: 'scientific', age: 1, coinCost: 2, science: 'writing', link: 'scriptorium', text: '科技符号「书」；提供连锁符号' },
  { id: 'pharmacist', name: 'Pharmacist', zh: '药剂师', type: 'scientific', age: 1, coinCost: 2, science: 'chemistry', link: 'pharmacist', text: '科技符号「药」；提供连锁符号' },

  { id: 'altar', name: 'Altar', zh: '祭坛', type: 'civilian', age: 1, vp: 3, link: 'altar', text: '3 分；提供连锁符号' },
  { id: 'theater', name: 'Theater', zh: '剧场', type: 'civilian', age: 1, vp: 3, link: 'theater', text: '3 分；提供连锁符号' },
  { id: 'baths', name: 'Baths', zh: '浴场', type: 'civilian', age: 1, cost: { stone: 1 }, vp: 3, link: 'baths', text: '3 分；提供连锁符号' },

  { id: 'tavern', name: 'Tavern', zh: '酒馆', type: 'commercial', age: 1, coins: 4, link: 'tavern', text: '立即获得 4 金币；提供连锁符号' },
  { id: 'stone-reserve', name: 'Stone Reserve', zh: '石材储备', type: 'commercial', age: 1, coinCost: 3, trades: ['stone'], text: '此后购买石材恒为 1 金币' },
  { id: 'clay-reserve', name: 'Clay Reserve', zh: '黏土储备', type: 'commercial', age: 1, coinCost: 3, trades: ['clay'], text: '此后购买黏土恒为 1 金币' },
  { id: 'wood-reserve', name: 'Wood Reserve', zh: '木材储备', type: 'commercial', age: 1, coinCost: 3, trades: ['wood'], text: '此后购买木材恒为 1 金币' },

  /* ------------------------------ 时代 II（23） ------------------------------ */
  { id: 'sawmill', name: 'Sawmill', zh: '锯木厂', type: 'raw', age: 2, coinCost: 2, produces: { wood: 2 }, text: '产出 2 木材' },
  { id: 'shelf-quarry', name: 'Shelf Quarry', zh: '层积采石场', type: 'raw', age: 2, coinCost: 2, produces: { stone: 2 }, text: '产出 2 石材' },
  { id: 'brickyard', name: 'Brickyard', zh: '砖窑', type: 'raw', age: 2, coinCost: 2, produces: { clay: 2 }, text: '产出 2 黏土' },
  { id: 'glass-blower', name: 'Glass-Blower', zh: '吹制工坊', type: 'manufactured', age: 2, produces: { glass: 1 }, text: '产出 1 玻璃' },
  { id: 'drying-room', name: 'Drying Room', zh: '干燥室', type: 'manufactured', age: 2, produces: { papyrus: 1 }, text: '产出 1 纸草' },

  { id: 'walls', name: 'Walls', zh: '城墙', type: 'military', age: 2, cost: { wood: 2 }, shields: 2, text: '2 面战争盾' },
  { id: 'archery-range', name: 'Archery Range', zh: '射箭场', type: 'military', age: 2, cost: { stone: 1, wood: 1, papyrus: 1 }, shields: 2, link: 'archery-range', text: '2 面战争盾；提供连锁符号' },
  { id: 'parade-ground', name: 'Parade Ground', zh: '阅兵场', type: 'military', age: 2, cost: { clay: 2, papyrus: 1 }, shields: 2, link: 'parade-ground', text: '2 面战争盾；提供连锁符号' },
  { id: 'horse-breeders', name: 'Horse Breeders', zh: '养马场', type: 'military', age: 2, cost: { clay: 1, wood: 1 }, shields: 1, freeLink: 'stable', text: '1 面战争盾；持有「马厩」可免费建造' },
  { id: 'barracks', name: 'Barracks', zh: '兵营', type: 'military', age: 2, coinCost: 3, shields: 1, freeLink: 'garrison', text: '1 面战争盾；持有「卫戍队」可免费建造' },

  { id: 'library', name: 'Library', zh: '图书馆', type: 'scientific', age: 2, cost: { stone: 1, wood: 1, glass: 1 }, science: 'writing', vp: 2, freeLink: 'scriptorium', text: '科技符号「书」，2 分；持有「缮写室」可免费建造' },
  { id: 'dispensary', name: 'Dispensary', zh: '诊疗所', type: 'scientific', age: 2, cost: { clay: 2, stone: 1 }, science: 'chemistry', vp: 2, freeLink: 'pharmacist', text: '科技符号「药」，2 分；持有「药剂师」可免费建造' },
  { id: 'school', name: 'School', zh: '学校', type: 'scientific', age: 2, cost: { wood: 1, papyrus: 2 }, science: 'wheel', vp: 1, link: 'school', text: '科技符号「轮」，1 分；提供连锁符号' },
  { id: 'laboratory', name: 'Laboratory', zh: '实验室', type: 'scientific', age: 2, cost: { wood: 1, glass: 2 }, science: 'math', vp: 1, link: 'laboratory', text: '科技符号「衡」，1 分；提供连锁符号' },

  { id: 'statue', name: 'Statue', zh: '雕像', type: 'civilian', age: 2, cost: { clay: 2 }, vp: 4, link: 'statue', freeLink: 'theater', text: '4 分；持有「剧场」可免费建造；提供连锁符号' },
  { id: 'temple', name: 'Temple', zh: '神殿', type: 'civilian', age: 2, cost: { wood: 1, papyrus: 1 }, vp: 4, link: 'temple', freeLink: 'altar', text: '4 分；持有「祭坛」可免费建造；提供连锁符号' },
  { id: 'rostrum', name: 'Rostrum', zh: '讲坛', type: 'civilian', age: 2, cost: { stone: 1, wood: 1 }, vp: 4, link: 'rostrum', text: '4 分；提供连锁符号' },
  { id: 'aqueduct', name: 'Aqueduct', zh: '引水渠', type: 'civilian', age: 2, cost: { stone: 3 }, vp: 5, freeLink: 'baths', text: '5 分；持有「浴场」可免费建造' },
  { id: 'tribunal', name: 'Tribunal', zh: '法庭', type: 'civilian', age: 2, cost: { wood: 2, glass: 1 }, vp: 5, text: '5 分' },

  { id: 'brewery', name: 'Brewery', zh: '酿酒坊', type: 'commercial', age: 2, coins: 6, link: 'brewery', text: '立即获得 6 金币；提供连锁符号' },
  { id: 'caravansery', name: 'Caravansery', zh: '商队客栈', type: 'commercial', age: 2, coinCost: 2, cost: { glass: 1, papyrus: 1 }, producesOneOf: ['wood', 'clay', 'stone'], text: '每回合任选产出 1 木/泥/石（不计入贸易价格）' },
  { id: 'forum', name: 'Forum', zh: '集市', type: 'commercial', age: 2, coinCost: 1, cost: { clay: 1 }, producesOneOf: ['glass', 'papyrus'], text: '每回合任选产出 1 玻/纸（不计入贸易价格）' },
  { id: 'customs-house', name: 'Customs House', zh: '海关', type: 'commercial', age: 2, coinCost: 4, trades: ['papyrus', 'glass'], text: '此后购买纸草与玻璃恒为 1 金币' },

  /* ------------------------------ 时代 III（20） ------------------------------ */
  { id: 'courthouse', name: 'Courthouse', zh: '法院', type: 'military', age: 3, coinCost: 8, shields: 3, text: '3 面战争盾' },
  { id: 'arsenal', name: 'Arsenal', zh: '兵工厂', type: 'military', age: 3, cost: { clay: 3, wood: 2 }, shields: 3, text: '3 面战争盾' },
  { id: 'siege-workshop', name: 'Siege Workshop', zh: '攻城工坊', type: 'military', age: 3, cost: { wood: 3, glass: 1 }, shields: 2, freeLink: 'archery-range', text: '2 面战争盾；持有「射箭场」可免费建造' },
  { id: 'circus', name: 'Circus', zh: '竞技场', type: 'military', age: 3, cost: { clay: 2, stone: 2 }, shields: 2, freeLink: 'parade-ground', text: '2 面战争盾；持有「阅兵场」可免费建造' },
  { id: 'fortifications', name: 'Fortifications', zh: '要塞', type: 'military', age: 3, cost: { stone: 2, clay: 1, papyrus: 1 }, shields: 2, freeLink: 'palisade', text: '2 面战争盾；持有「木栅」可免费建造' },

  { id: 'academy', name: 'Academy', zh: '学院', type: 'scientific', age: 3, cost: { stone: 1, wood: 1, glass: 2 }, science: 'sundial', vp: 3, text: '科技符号「晷」；3 分' },
  { id: 'study', name: 'Study', zh: '书房', type: 'scientific', age: 3, cost: { wood: 2, glass: 1, papyrus: 1 }, science: 'sundial', vp: 3, text: '科技符号「晷」；3 分' },
  { id: 'university', name: 'University', zh: '大学', type: 'scientific', age: 3, cost: { clay: 1, glass: 1, papyrus: 1 }, science: 'astronomy', vp: 2, freeLink: 'school', text: '科技符号「星」，2 分；持有「学校」可免费建造' },
  { id: 'observatory', name: 'Observatory', zh: '天文台', type: 'scientific', age: 3, cost: { stone: 1, papyrus: 2 }, science: 'astronomy', vp: 2, freeLink: 'laboratory', text: '科技符号「星」，2 分；持有「实验室」可免费建造' },

  { id: 'palace', name: 'Palace', zh: '宫殿', type: 'civilian', age: 3, cost: { stone: 1, wood: 1, clay: 1, glass: 2 }, vp: 7, text: '7 分' },
  { id: 'town-hall', name: 'Town Hall', zh: '市政厅', type: 'civilian', age: 3, cost: { stone: 3, wood: 2 }, vp: 7, text: '7 分' },
  { id: 'obelisk', name: 'Obelisk', zh: '方尖碑', type: 'civilian', age: 3, cost: { stone: 2, glass: 1 }, vp: 5, text: '5 分' },
  { id: 'pantheon', name: 'Pantheon', zh: '万神殿', type: 'civilian', age: 3, cost: { clay: 1, wood: 1, papyrus: 2 }, vp: 6, freeLink: 'temple', text: '6 分；持有「神殿」可免费建造' },
  { id: 'senate', name: 'Senate', zh: '元老院', type: 'civilian', age: 3, cost: { clay: 1, stone: 1, papyrus: 2 }, vp: 6, freeLink: 'rostrum', text: '6 分；持有「讲坛」可免费建造' },
  { id: 'gardens', name: 'Gardens', zh: '园林', type: 'civilian', age: 3, cost: { wood: 2, clay: 2 }, vp: 6, freeLink: 'statue', text: '6 分；持有「雕像」可免费建造' },

  { id: 'chamber-of-commerce', name: 'Chamber Of Commerce', zh: '商会', type: 'commercial', age: 3, cost: { papyrus: 2 }, vp: 3, coinsPer: { target: 'manufactured', amount: 3 }, text: '建造时每张灰卡得 3 金币；终局 3 分' },
  { id: 'port', name: 'Port', zh: '港口', type: 'commercial', age: 3, cost: { wood: 1, glass: 1, papyrus: 1 }, vp: 3, coinsPer: { target: 'raw', amount: 2 }, text: '建造时每张棕卡得 2 金币；终局 3 分' },
  { id: 'armory', name: 'Armory', zh: '军械库', type: 'commercial', age: 3, cost: { stone: 2, glass: 1 }, vp: 3, coinsPer: { target: 'military', amount: 1 }, text: '建造时每张红卡得 1 金币；终局 3 分' },
  { id: 'arena', name: 'Arena', zh: '圆形剧场', type: 'commercial', age: 3, cost: { clay: 1, stone: 1, wood: 1 }, vp: 3, coinsPer: { target: 'wonder', amount: 2 }, freeLink: 'brewery', text: '建造时每座奇迹得 2 金币；终局 3 分；持有「酿酒坊」可免费建造' },
  { id: 'lighthouse', name: 'Lighthouse', zh: '灯塔', type: 'commercial', age: 3, cost: { clay: 2, glass: 1 }, vp: 3, coinsPer: { target: 'commercial', amount: 1 }, freeLink: 'tavern', text: '建造时每张黄卡（含自身）得 1 金币；终局 3 分；持有「酒馆」可免费建造' },

  /* ------------------------------ 行会（7） ------------------------------ */
  { id: 'traders-guild', name: 'Traders Guild', zh: '商人行会', type: 'guild', guild: true, age: 3, cost: { wood: 1, clay: 1, glass: 1, papyrus: 1 }, coinsPer: { target: 'commercial', amount: 1 }, vpPer: { target: 'commercial', amount: 1 }, text: '建造时、终局各按黄卡较多一方的黄卡数得金币 / 分数' },
  { id: 'shipowners-guild', name: 'Shipowners Guild', zh: '船主行会', type: 'guild', guild: true, age: 3, cost: { stone: 1, clay: 1, glass: 1, papyrus: 1 }, coinsPer: { target: 'brownGrey', amount: 1 }, vpPer: { target: 'brownGrey', amount: 1 }, text: '建造时、终局各按棕+灰较多一方的数量得金币 / 分数（两色须取同一座城市）' },
  { id: 'builders-guild', name: 'Builders Guild', zh: '建筑行会', type: 'guild', guild: true, age: 3, cost: { stone: 2, wood: 1, clay: 1, glass: 1 }, vpPer: { target: 'wonder', amount: 2 }, text: '终局按奇迹较多一方的奇迹数，每张 2 分' },
  { id: 'magistrates-guild', name: 'Magistrates Guild', zh: '司法行会', type: 'guild', guild: true, age: 3, cost: { wood: 2, clay: 1, papyrus: 1 }, coinsPer: { target: 'civilian', amount: 1 }, vpPer: { target: 'civilian', amount: 1 }, text: '建造时、终局各按蓝卡较多一方的蓝卡数得金币 / 分数' },
  { id: 'scientists-guild', name: 'Scientists Guild', zh: '学者行会', type: 'guild', guild: true, age: 3, cost: { clay: 2, wood: 2 }, coinsPer: { target: 'scientific', amount: 1 }, vpPer: { target: 'scientific', amount: 1 }, text: '建造时、终局各按绿卡较多一方的绿卡数得金币 / 分数' },
  { id: 'moneylenders-guild', name: 'Moneylenders Guild', zh: '钱庄行会', type: 'guild', guild: true, age: 3, cost: { stone: 2, wood: 2 }, vpPer: { target: 'coins3', amount: 1 }, text: '终局按金币较多一方，每 3 金币 1 分' },
  { id: 'tacticians-guild', name: 'Tacticians Guild', zh: '兵法行会', type: 'guild', guild: true, age: 3, cost: { stone: 2, clay: 1, papyrus: 1 }, coinsPer: { target: 'military', amount: 1 }, vpPer: { target: 'military', amount: 1 }, text: '建造时、终局各按红卡较多一方的红卡数得金币 / 分数' },
];

/** 基础卡池（不含扩展卡）；AGE_CARDS / GUILD_CARDS 由此派生 */
export const BASE_CARDS = CARDS;

/** CARD_BY_ID 含扩展卡（大殿等），供城市卡与效果查询 */
const ALL_CARDS: CardDef[] = [...CARDS, ...TEMPLES, ...senatorCardDefs()];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export const AGE_CARDS = (age: 1 | 2 | 3): CardDef[] => CARDS.filter((c) => c.age === age && !c.guild);
export const GUILD_CARDS = (): CardDef[] => CARDS.filter((c) => c.guild);
