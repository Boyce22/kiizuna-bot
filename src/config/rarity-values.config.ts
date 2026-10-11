// Valores e pesos por raridade — fonte única para mercado, k!sell e duelo.
import type { Rarity } from './vip-tiers.config';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// Cor da borda do embed/container por raridade (usada no card de perfil).
export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xffffff,
  uncommon: 0x00cc44,
  rare: 0x0070dd,
  epic: 0xa335ee,
  legendary: 0xffd700,
  mythic: 0xff0000,
};

// Emoji-selo por raridade — fonte única para labels visuais.
export const RARITY_EMOJI: Record<Rarity, string> = {
  common: '📦',
  uncommon: '🍀',
  rare: '💠',
  epic: '💜',
  legendary: '👑',
  mythic: '🪽',
};

// Probabilidades do roll (somam 1.0). Mythic/legendary são ultra-raros e saem por pura sorte:
// chance fixa por roll, sem soft pity. O hard pity (economy.pity) só socorre o azar extremo.
// Mythic a 0,3% → ~1 a cada ~333 rolls em média, com variância alta (a graça da sorte).
export const RARITY_CHANCES: Record<Rarity, number> = {
  common: 0.600,
  uncommon: 0.263,
  rare: 0.100,
  epic: 0.030,
  legendary: 0.006,
  mythic: 0.001,
};

// Raridade derivada da popularidade (favoritos da AniList), não sorteada. Faixas em ordem
// decrescente: a primeira cujo piso o personagem alcança vence (ex.: Zero Two ~60k → mythic).
// Fonte única — usada no import e em qualquer re-derivação em massa. Tunável aqui sem re-buscar
// a API (basta re-rodar a derivação sobre o `favourites` já salvo).
// Calibrado pela distribuição real do pool (~30k personagens AniList). Os limiares anteriores
// deixavam o topo raríssimo (só ~7 com ≥20k, ~94 com ≥6k); estes dão uma graduação saudável.
// Contagens aproximadas sobre os 30k atuais (cumulativo → por faixa):
//   mythic    ≥ 4000  → ~149
//   legendary ≥ 1000  → ~417
//   epic      ≥ 200   → ~982
//   rare      ≥ 50    → ~1914
//   common    < 50    → ~26684
export const RARITY_BY_FAVOURITES: ReadonlyArray<{ rarity: Rarity; minFavourites: number }> = [
  { rarity: 'mythic', minFavourites: 4000 },
  { rarity: 'legendary', minFavourites: 1000 },
  { rarity: 'epic', minFavourites: 200 },
  { rarity: 'rare', minFavourites: 50 },
  { rarity: 'uncommon', minFavourites: 3 },
  { rarity: 'common', minFavourites: 0 },
];

/** Mapeia o nº de favoritos para a raridade (faixa fixa; ver RARITY_BY_FAVOURITES). */
export function rarityFromFavourites(favourites: number): Rarity {
  for (const { rarity, minFavourites } of RARITY_BY_FAVOURITES) {
    if (favourites >= minFavourites) return rarity;
  }
  return 'common';
}

export interface RarityValue {
  floor: number; // lance mínimo / preço-piso (leilão e mercado P2P)
  kizunaPrice: number; // venda direta ao bot (k!sell), valor fixo (baixo de propósito)
  duelWeight: number; // peso no duelo
}

export const RARITY_VALUES: Record<Rarity, RarityValue> = {
  common: { floor: 50, kizunaPrice: 20, duelWeight: 5 },
  uncommon: { floor: 120, kizunaPrice: 50, duelWeight: 7 },
  rare: { floor: 250, kizunaPrice: 100, duelWeight: 10 },
  epic: { floor: 1000, kizunaPrice: 450, duelWeight: 20 },
  legendary: { floor: 2500, kizunaPrice: 1000, duelWeight: 30 },
  mythic: { floor: 5000, kizunaPrice: 2000, duelWeight: 40 },
};

// Multiplicador bond→atributos no k!gift: cada gift gera um "orçamento" de pontos
// (= pontos de bond ganhos × este multiplicador), repartido aleatoriamente entre
// atk/speed/def. Raridade maior converte mais bond em atributos. Tunável aqui.
export const RARITY_ATTR_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.1,
  rare: 1.2,
  epic: 1.6,
  legendary: 2.1,
  mythic: 2.6,
};
