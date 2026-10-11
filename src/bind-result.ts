import type { BindResult, ThiefEvent } from './bind-types';

export type { BindResult, ThiefEvent };

export function reviveBindResult(raw: Record<string, unknown>): BindResult {
  if (raw.ok !== true) {
    if (raw.reason === 'cooldown') {
      return {
        ok: false,
        reason: 'cooldown',
        bindKind: raw.bindKind === 'steal' ? 'steal' : 'claim',
        cooldownUntil: new Date(String(raw.cooldownUntil)),
      };
    }
    if (raw.reason === 'expired') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'none_active' };
  }
  if (raw.kind === 'dupe') {
    return { ok: true, kind: 'dupe', name: String(raw.name), coins: Number(raw.coins) };
  }
  return {
    ok: true,
    kind: 'claim',
    name: String(raw.name),
    binderId: String(raw.binderId),
    wishlistUserIds: Array.isArray(raw.wishlistUserIds) ? (raw.wishlistUserIds as string[]) : [],
    isSelfClaim: Boolean(raw.isSelfClaim),
    summonerId: typeof raw.summonerId === 'string' ? raw.summonerId : undefined,
    thiefEvent: raw.thiefEvent as ThiefEvent | undefined,
  };
}
