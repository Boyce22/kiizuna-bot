// Fonte única dos tiers VIP. Nenhum comando deve hardcodar perks — sempre ler daqui
// via VipService.getPerks(tier). Ordem (nível): none < tomodachi < nakama < kizuna < eien.

export type VipTierKey = 'none' | 'tomodachi' | 'nakama' | 'kizuna' | 'eien';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface VipPerks {
  level: number;
  name: string;
  emoji: string;
  embedColor: number | null; // null = usa a cor padrão por tipo (waifu/husbando)
  priceUsd: number;
  rollsPerInterval: number;
  bindCooldownMin: number; // cooldown do claim (vincular summon próprio)
  stealCooldownMin: number; // cooldown do roubo (vincular summon alheio)
  tributeMultiplier: number;
  rerollsPerDay: number;
  wishlistSlots: number;
  showcaseSlots: number;
  targetTokensPerDay: number; // tokens de mira de anime liberados por dia
  marketTaxFloor: number; // piso da taxa progressiva
  marketCheapQuota: number; // nº de vendas/mês na faixa barata
  listingSlots: number; // Infinity = ilimitado
  showcaseFrame: boolean;
}

export const TIER_ORDER: VipTierKey[] = ['none', 'tomodachi', 'nakama', 'kizuna', 'eien'];

export const VIP_TIERS: Record<VipTierKey, VipPerks> = {
  none: {
    level: 0,
    name: 'Nenhum',
    emoji: '',
    embedColor: null,
    priceUsd: 0,
    rollsPerInterval: 10,
    bindCooldownMin: 60,
    stealCooldownMin: 60,
    tributeMultiplier: 1,
    rerollsPerDay: 0,
    wishlistSlots: 5,
    showcaseSlots: 3,
    targetTokensPerDay: 0,
    marketTaxFloor: 0.05,
    marketCheapQuota: 10,
    listingSlots: 2,
    showcaseFrame: false,
  },
  tomodachi: {
    level: 1,
    name: 'Tomodachi',
    emoji: '🥉',
    embedColor: 0xcd7f32,
    priceUsd: 2.99,
    rollsPerInterval: 14,
    bindCooldownMin: 45,
    stealCooldownMin: 45,
    tributeMultiplier: 1.25,
    rerollsPerDay: 1,
    wishlistSlots: 10,
    showcaseSlots: 5,
    targetTokensPerDay: 1,
    marketTaxFloor: 0.04,
    marketCheapQuota: 15,
    listingSlots: 4,
    showcaseFrame: false,
  },
  nakama: {
    level: 2,
    name: 'Nakama',
    emoji: '🥈',
    embedColor: 0xc0c0c0,
    priceUsd: 5.99,
    rollsPerInterval: 18,
    bindCooldownMin: 30,
    stealCooldownMin: 30,
    tributeMultiplier: 1.5,
    rerollsPerDay: 2,
    wishlistSlots: 20,
    showcaseSlots: 7,
    targetTokensPerDay: 2,
    marketTaxFloor: 0.03,
    marketCheapQuota: 25,
    listingSlots: 6,
    showcaseFrame: false,
  },
  kizuna: {
    level: 3,
    name: 'Kizuna',
    emoji: '🥇',
    embedColor: 0xffd700,
    priceUsd: 9.99,
    rollsPerInterval: 24,
    bindCooldownMin: 20,
    stealCooldownMin: 20,
    tributeMultiplier: 2,
    rerollsPerDay: 4,
    wishlistSlots: 40,
    showcaseSlots: 10,
    targetTokensPerDay: 3,
    marketTaxFloor: 0.02,
    marketCheapQuota: 40,
    listingSlots: 10,
    showcaseFrame: false,
  },
  eien: {
    level: 4,
    name: 'Eien',
    emoji: '💎',
    embedColor: 0xb9f2ff,
    priceUsd: 14.99,
    rollsPerInterval: 30,
    bindCooldownMin: 10,
    stealCooldownMin: 10,
    tributeMultiplier: 3,
    rerollsPerDay: 8,
    wishlistSlots: 100,
    showcaseSlots: 15,
    targetTokensPerDay: 5,
    marketTaxFloor: 0.01,
    marketCheapQuota: 100,
    listingSlots: Infinity,
    showcaseFrame: true,
  },
};
