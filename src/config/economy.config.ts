// Números da economia — faucets, sinks e parâmetros de balanceamento.
// Tudo num lugar só para calibrar sem caçar valores no código.

export const economy = {
  // --- Tribute (faucet principal) ---
  tribute: {
    base: 120, // coins/dia
    streak7Multiplier: 2, // x2 com streak >= 7 dias
    streak30Multiplier: 3, // x3 com streak >= 30 dias
  },

  // --- Gift / bond (sink principal) ---
  bond: {
    coinsPerPoint: 10, // 10 coins = +1 bond
    decayGraceDays: 7, // dias sem interação antes de começar a cair
    decayPerDay: 1, // -1 bond/dia após o grace
    favoriteDecayFactor: 0.5, // favoritos/soulmate decaem na metade da taxa
    floorFactor: 0.5, // bond não cai abaixo de metade do bondPeak
    soulmateBondBonus: 0.1, // +10% de bond passivo para soulmate (Kizuna+)
  },

  // --- Bind: duplicata (faucet) ---
  // Vincular um personagem que já tem dono não dá posse: paga uma "duplicata" em coins
  // (consolação), proporcional ao kizunaPrice da raridade. Consome o cooldown de bind como
  // um claim normal — então não dá para farmar coins repetindo o clique.
  bind: {
    dupeRewardFactor: 0.25, // fração do kizunaPrice da raridade (N 7 … UR 500)
  },

  // --- Pity timer (só hard) ---
  // Sem soft pity: SSR/UR são pura sorte (chance fixa por roll, ver RARITY_CHANCES). O
  // hard pity é só misericórdia para sequências muito azaradas — fica longe de propósito pra não
  // virar um contador. O contador (rollsSinceHighRarity) zera ao obter Legendary OU Mythic.
  pity: {
    hardPity: 1000, // garante SSR; rede de segurança, não um teto que todos batem
  },

  // --- Mira de anime (targeting VIP) ---
  // Um target token mira um anime específico no summon. A raridade continua sorteada normalmente;
  // com o token ativo, esta é a chance de o personagem vir do pool daquele anime (senão, roll normal).
  targeting: {
    seriesHitChance: 0.5,
  },

  // --- Mercado: taxa progressiva por volume mensal (curva base; VIP melhora) ---
  marketTax: {
    tiers: [
      { upTo: 10, rate: 0.05 }, // vendas 1–10
      { upTo: 25, rate: 0.08 }, // 11–25
      { upTo: Infinity, rate: 0.12 }, // 26+
    ] as Array<{ upTo: number; rate: number }>,
  },

  // --- Trava de re-trade (anti-flip) ---
  tradeLockDays: 7,

  // --- Cooldowns anti-abuso (ms). Limitam comandos caros (ORDER BY RANDOM, collectors). ---
  cooldowns: {
    summonMs: 1_000, // por usuário, entre summons (anti double-fire; rollsLeft é o throttle real)
  },
};

export type EconomyConfig = typeof economy;
