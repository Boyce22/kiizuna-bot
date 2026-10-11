// Parâmetros da luta de boss (card battle web). Calibração num lugar só.
import type { Rarity } from './vip-tiers.config';

export const cardbattle = {
  startingHand: 5, // cartas na mão ao começar (compradas de graça do deck embaralhado)
  maxFieldSize: 5, // teto de cartas na mesa por rodada — a 5ª carta fecha a rodada (o front dispara o ataque)
  fightTtlSeconds: 1800, // TTL da sessão fight:{token} no Redis (30min)

  // Custo de comprar uma carta (em gold = coin real). Base por raridade da carta sorteada do
  // deck; sobe `costGrowth` a cada compra (composto). Ver game.cardCost.
  cardCostBase: {
    common: 60,
    uncommon: 67,
    rare: 75,
    epic: 90,
    legendary: 105,
    mythic: 120,
  } as Record<Rarity, number>,
  costGrowth: 0.06, // +6% por compra (composto)

  // Dano de uma carta no boss: max(min, round(atk*(1+bond/bondDivisor)) - floor(def*defFactor)).
  damage: {
    bondDivisor: 8000,
    defFactor: 0.5,
    min: 1,
  },

  playerMaxHp: 500, // HP fixo de cada jogador na luta (igual pra todos, não deriva do deck)

  playedCardsLimit: 20, // teto do histórico de cartas jogadas guardado na sessão (ver game.recordPlayedCard)

  // Contra-ataque do boss no jogador a cada carta jogada: max(min, atk - floor(def*defFactor)),
  // onde def é da carta jogada (o boss não tem "bond" contra o jogador). Ver game.bossDamage.
  bossDamage: {
    defFactor: 0.5,
    min: 1,
  },

  // Combo: maior grupo de cartas na mesa com a mesma character.series. Tiers por tamanho do
  // grupo (3, 4, 5+). Ver game.detectCombo / game.aggregateFieldDamage / game.fieldCounterDamage.
  combo: {
    minSize: 3, // menor tamanho de grupo que ativa combo (abaixo disso, sem bônus)
    tiers: {
      3: { dmgBonusPct: 0.15, counterReductionPct: 0.15 },
      4: { dmgBonusPct: 0.3, counterReductionPct: 0.3 },
      5: { dmgBonusPct: 0.5, counterReductionPct: 0.5 }, // teto — 6+ na mesma série = mesmo bônus do tier 5
    } as Record<3 | 4 | 5, { dmgBonusPct: number; counterReductionPct: number }>,
  },
};

export type CardBattleConfig = typeof cardbattle;
