import type { BindResult, ThiefEvent } from './bind-types';
import type { ApiResult } from './client';

export type { BindResult, ThiefEvent };

/** Resposta de `/gacha/bind` (via `call`) → resultado tipado; recusa desconhecida vira NONE_ACTIVE. */
export function reviveBindResult(raw: ApiResult<Record<string, unknown>, Record<string, unknown>>): BindResult {
  if (!raw.ok) {
    if (raw.code === 'COOLDOWN') {
      return {
        ok: false,
        code: 'COOLDOWN',
        bindKind: raw.bindKind === 'steal' ? 'steal' : 'claim',
        cooldownUntil: new Date(String(raw.cooldownUntil)),
      };
    }
    if (raw.code === 'EXPIRED') return { ok: false, code: 'EXPIRED' };
    return { ok: false, code: 'NONE_ACTIVE' };
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
