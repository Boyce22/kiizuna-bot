// Cadências dos jobs em background (ms). Centralizadas para calibrar sem caçar no código.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const jobs = {
  bondDecayIntervalMs: DAY, // materializa o decaimento de bond (diário)
  auctionSettleIntervalMs: MINUTE, // liquida leilões vencidos (curto)
  vipExpireIntervalMs: HOUR, // rebaixa assinaturas VIP vencidas (horário)
  leaderboardCacheIntervalMs: HOUR, // recalcula o cache do globaltop
  rankSeasonTickMs: DAY, // tick diário; só recalcula ranks nos dias 1 e 16
};

// Dias do mês em que a temporada de rank é recalculada.
export const RANK_SEASON_DAYS = [1, 16];

export type JobsConfig = typeof jobs;
