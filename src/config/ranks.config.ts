// Escada de ranks globais (temporada quinzenal) + pesos do globalMasteryScore.
// Nomes dos ranks são chaves i18n (rank.<key>.name); aqui só id, emoji e percentil.
import type { Rarity } from './vip-tiers.config';

export interface RankDef {
  id: number; // 1 (mais alto) .. 9 (mais baixo)
  key: string; // chave i18n
  emoji: string;
  minPercentile: number; // corte inferior (>= X)
}

// Ordenado do mais alto (1) ao mais baixo (9).
export const RANKS: RankDef[] = [
  { id: 1, key: 'eternal', emoji: '💎', minPercentile: 0.999 },
  { id: 2, key: 'legend', emoji: '🏆', minPercentile: 0.995 },
  { id: 3, key: 'celestial', emoji: '✨', minPercentile: 0.99 },
  { id: 4, key: 'mythic', emoji: '🔮', minPercentile: 0.97 },
  { id: 5, key: 'soulbinder', emoji: '🔗', minPercentile: 0.93 },
  { id: 6, key: 'vanguard', emoji: '⚔️', minPercentile: 0.85 },
  { id: 7, key: 'adept', emoji: '🌀', minPercentile: 0.7 },
  { id: 8, key: 'seeker', emoji: '🔍', minPercentile: 0.5 },
  { id: 9, key: 'wanderer', emoji: '🧭', minPercentile: 0 },
];

// Pesos do globalMasteryScore (tudo leitura dos dados existentes).
export const MASTERY_WEIGHTS = {
  rarity: { common: 1, uncommon: 3, rare: 5, epic: 20, legendary: 50, mythic: 100 } as Record<Rarity, number>,
  bondFactor: 0.1,
  duelWinFactor: 2,
  streakFactor: 1,
};

// Usuário "ativo" se interagiu nos últimos N dias (denominador do percentil).
export const ACTIVE_WINDOW_DAYS = 14;

export function rankForPercentile(percentile: number): RankDef {
  for (const rank of RANKS) {
    if (percentile >= rank.minPercentile) return rank;
  }
  return RANKS[RANKS.length - 1];
}

export function rankById(id: number): RankDef {
  return RANKS.find((r) => r.id === id) ?? RANKS[RANKS.length - 1];
}

export function rankByKey(key: string): RankDef | undefined {
  return RANKS.find((r) => r.key === key.toLowerCase());
}
