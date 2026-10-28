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
  // DROP_TAKEN: outra pessoa reservou este drop primeiro (o cooldown não foi gasto).
  | { ok: false; code: 'NONE_ACTIVE' | 'EXPIRED' | 'DROP_TAKEN' }
  // `claim` = summon próprio; `steal` = summon de outra pessoa (cooldowns separados).
  | { ok: false; code: 'COOLDOWN'; bindKind: 'claim' | 'steal'; cooldownUntil: Date }
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
