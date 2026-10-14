// Valores e pesos por raridade — fonte única para mercado e {prefix}sell.
import type { Rarity } from './vip-tiers.config';

export const RARITIES: Rarity[] = ['N', 'R', 'SR', 'SSR', 'UR'];

// Cor da borda do embed/container por raridade (usada no card de perfil).
export const RARITY_COLORS: Record<Rarity, number> = {
  N: 0xffffff,
  R: 0x0070dd,
  SR: 0xa335ee,
  SSR: 0xffd700,
  UR: 0xff0000,
};

// Emoji-selo por raridade — fonte única para labels visuais.
export const RARITY_EMOJI: Record<Rarity, string> = {
  N: '📦',
  R: '💠',
  SR: '💜',
  SSR: '👑',
  UR: '🪽',
};

// Probabilidades do roll (somam 1.0). UR/SSR são ultra-raros e saem por pura sorte:
// chance fixa por roll, sem soft pity. O hard pity (economy.pity) só socorre o azar extremo.
// N soma as antigas common (0,6) e uncommon (0,263).
export const RARITY_CHANCES: Record<Rarity, number> = {
  N: 0.863,
  R: 0.1,
  SR: 0.03,
  SSR: 0.006,
  UR: 0.001,
};

// Raridade derivada da popularidade (favoritos da AniList), não sorteada. Faixas em ordem
// decrescente: a primeira cujo piso o personagem alcança vence (ex.: Zero Two ~60k → UR).
// Fonte única — usada no import e em qualquer re-derivação em massa. Tunável aqui sem re-buscar
// a API (basta re-rodar a derivação sobre o `favourites` já salvo).
// Calibrado pela distribuição real do pool (~30k personagens AniList).
// Contagens aproximadas sobre os 30k atuais (cumulativo → por faixa):
//   UR  ≥ 4000  → ~149
//   SSR ≥ 1000  → ~417
//   SR  ≥ 200   → ~982
//   R   ≥ 50    → ~1914
//   N   < 50    → ~26684
export const RARITY_BY_FAVOURITES: ReadonlyArray<{ rarity: Rarity; minFavourites: number }> = [
  { rarity: 'UR', minFavourites: 4000 },
  { rarity: 'SSR', minFavourites: 1000 },
  { rarity: 'SR', minFavourites: 200 },
  { rarity: 'R', minFavourites: 50 },
  { rarity: 'N', minFavourites: 0 },
];

/** Mapeia o nº de favoritos para a raridade (faixa fixa; ver RARITY_BY_FAVOURITES). */
export function rarityFromFavourites(favourites: number): Rarity {
  for (const { rarity, minFavourites } of RARITY_BY_FAVOURITES) {
    if (favourites >= minFavourites) return rarity;
  }
  return 'N';
}

export interface RarityValue {
  floor: number; // lance mínimo / preço-piso (leilão e mercado P2P)
  kizunaPrice: number; // venda direta ao bot (k!sell), valor fixo (baixo de propósito)
}

// N: média das antigas common/uncommon ponderada pela chance de cada uma no roll.
export const RARITY_VALUES: Record<Rarity, RarityValue> = {
  N: { floor: 70, kizunaPrice: 30 },
  R: { floor: 250, kizunaPrice: 100 },
  SR: { floor: 1000, kizunaPrice: 450 },
  SSR: { floor: 2500, kizunaPrice: 1000 },
  UR: { floor: 5000, kizunaPrice: 2000 },
};

// Multiplicador bond→atributos no k!gift: cada gift gera um "orçamento" de pontos
// (= pontos de bond ganhos × este multiplicador), repartido aleatoriamente entre
// atk/speed/def. Raridade maior converte mais bond em atributos. Tunável aqui.
export const RARITY_ATTR_MULT: Record<Rarity, number> = {
  N: 1,
  R: 1.2,
  SR: 1.6,
  SSR: 2.1,
  UR: 2.6,
};
