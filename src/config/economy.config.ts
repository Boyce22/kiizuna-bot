// Números da economia — faucets, sinks e parâmetros de balanceamento.
// Tudo num lugar só para calibrar sem caçar valores no código.

export const economy = {
  // --- Tribute (faucet principal) ---
  tribute: {
    base: 120, // coins/dia
    streak7Multiplier: 2, // x2 com streak >= 7 dias
    streak30Multiplier: 3, // x3 com streak >= 30 dias
  },

  // --- Duelo (net-zero + sink) ---
  duel: {
    defaultWager: 100,
    rake: 0.05, // 5% do pote, queimado
    bondWeightFactor: 0.01, // +1% de peso por ponto de bond (pequeno)
    variance: 0.3, // ±30% de variação aleatória
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

  // --- Higher/Lower (faucet pequeno, escala com streak) ---
  higherLower: {
    roundTimeoutMs: 25_000, // janela por rodada (botões)
    maxRounds: 15, // teto de rodadas por sessão (evita farm infinito)
    baseReward: 15, // coins por acerto
    perStreakBonus: 10, // +coins por ponto de streak
    bustKeepFactor: 0.25, // ao errar, mantém só 25% do acumulado (sacar mantém 100%)
  },

  // --- Blackjack (sink/source com vantagem da casa via regras) ---
  blackjack: {
    minBet: 10,
    maxBet: 2_000,
    blackjackMultiplier: 1.5, // 21 natural paga 3:2
    dealerStandsOn: 17, // dealer compra até 17
    roundTimeoutMs: 60_000, // janela total de decisão do jogador (por turno, na mesa)
    tableMaxPlayers: 4, // jogadores por mesa multiplayer
    tableJoinTimeoutMs: 30_000, // janela para outros entrarem na mesa antes do início
    pvpRake: 0.05, // taxa da casa sobre o pote no PvP (anti-trade: dois combinados perdem 15%)
  },

  // --- Cooldowns anti-abuso (ms). Limitam comandos caros (ORDER BY RANDOM, collectors). ---
  cooldowns: {
    summonMs: 1_000, // por usuário, entre summons (anti double-fire; rollsLeft é o throttle real)
    higherLowerMs: 4_000, // por usuário, para iniciar um higher/lower
    blackjackMs: 4_000, // por usuário, para iniciar um blackjack
  },
};

export type EconomyConfig = typeof economy;
