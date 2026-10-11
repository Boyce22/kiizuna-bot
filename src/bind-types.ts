export interface ThiefEvent {
  /** `global`: a coroa vale em todos os servidores globais; `guild`: só neste servidor. */
  scope?: 'guild' | 'global';
  crown?: {
    type: 'new' | 'dethroned';
    newThiefDiscordId: string;
    oldThiefDiscordId?: string;
    count: number;
    existingRoleId: string | null;
  };
  victimWasThief?: boolean;
}

export type BindResult =
  | { ok: false; reason: 'none_active' | 'expired' }
  // `claim` = summon próprio; `steal` = summon de outra pessoa (cooldowns separados).
  | { ok: false; reason: 'cooldown'; bindKind: 'claim' | 'steal'; cooldownUntil: Date }
  | { ok: true; kind: 'dupe'; name: string; coins: number }
  | {
      ok: true;
      kind: 'claim';
      name: string;
      binderId: string;
      wishlistUserIds: string[];
      isSelfClaim: boolean;
      summonerId?: string;
      thiefEvent?: ThiefEvent;
    };
