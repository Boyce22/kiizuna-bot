import type { InternalClient } from '../client';
import { awaitSelection } from '../discord/selection';
import type { CommandContext } from '../interfaces';

/**
 * Qual carta o jogador quer numa ação (vender, presentear, anunciar…). A posse não é única: o mesmo
 * personagem pode ter várias cópias. `#12` aponta a cópia 12; um número sozinho é o personagem, e
 * com várias cópias dele o jogador escolhe num seletor.
 */
export interface CardRef {
  characterId?: number;
  cardId?: number;
}

/** O que a API devolve de uma cópia (recusa CARD_AMBIGUOUS e `/harem/owned`). */
export interface CopyView {
  cardId: number;
  quality: number;
  giftMult: number;
  passiveId: string | null;
  passiveName: string | null;
  passiveValue: number | null;
  bond: number;
}

/** A cópia resolvida, com o personagem e os preços de referência. */
export interface OwnedCopy extends CopyView {
  characterId: number;
  name: string;
  rarity: string;
  series: string | null;
  kizunaPrice: number;
  floor: number;
}

export type CopyPick =
  | { status: 'picked'; copy: OwnedCopy }
  | { status: 'not_owned' }
  | { status: 'timeout' };

/** Selo de cada qualidade (Normal, Boa, Excelente, Obra-prima): igual em todo idioma. */
const QUALITY_SEAL = ['並', '良', '優', '極'];

/** Opções do seletor: o Discord aceita até 25. */
const MAX_OPTIONS = 25;
const PICK_TIMEOUT_MS = 30_000;

/** `#12` → cópia 12; `34` → personagem 34; qualquer outra coisa → nulo. */
export function parseCardRef(arg: string | undefined): CardRef | null {
  if (!arg) return null;
  const cardMatch = /^#(\d+)$/.exec(arg);
  if (cardMatch) return { cardId: Number(cardMatch[1]) };
  const characterId = Number(arg);
  if (Number.isInteger(characterId) && characterId > 0) return { characterId };
  return null;
}

/** Uma linha da cópia: `#123 · 極 · ×1.27 · Pele de aço 9.4%`. */
export function copyLabel(copy: CopyView): string {
  const passive = copy.passiveName ? ` · ${copy.passiveName} ${copy.passiveValue ?? 0}%` : '';
  return `#${copy.cardId} · ${QUALITY_SEAL[copy.quality] ?? '並'} · ×${copy.giftMult}${passive}`;
}

/** Dono da carta procurada; sem ele, quem digitou o comando. */
export interface CopyOwner {
  discordId: string;
  username?: string;
}

/**
 * Resolve a cópia da ação. Com o personagem e várias cópias, a API recusa com CARD_AMBIGUOUS e a
 * lista; quem digitou escolhe no seletor (inclusive a cópia de outro jogador, numa troca) e a busca
 * repete com o `cardId`.
 */
export async function pickOwnedCopy(
  api: InternalClient,
  ctx: CommandContext,
  ref: CardRef,
  owner?: CopyOwner,
): Promise<CopyPick> {
  const { invocation, user, t } = ctx;
  const actor = {
    discordId: owner?.discordId ?? user.discordId,
    username: owner ? owner.username : (user.username ?? undefined),
    guildId: invocation.guildId,
  };

  const owned = await api.call<OwnedCopy, { copies: CopyView[] }>('/internal/v1/harem/owned', { ...actor, ...ref });
  if (owned.ok) return { status: 'picked', copy: owned };
  if (owned.code !== 'CARD_AMBIGUOUS' || !owned.copies?.length) return { status: 'not_owned' };

  const options = owned.copies.slice(0, MAX_OPTIONS).map((copy) => ({ label: copyLabel(copy), value: copy.cardId }));
  const outcome = await awaitSelection({
    invocation,
    content: t('copy.pick'),
    placeholder: t('copy.placeholder'),
    options,
    authorizedUserId: user.discordId,
    timeoutMs: PICK_TIMEOUT_MS,
    idPrefix: 'copy',
  });
  if (outcome.status === 'timeout') {
    await outcome.prompt.edit({ content: t('copy.timeout'), components: [] }).catch(() => undefined);
    return { status: 'timeout' };
  }

  await outcome.interaction.update({ content: t('copy.picked', { card: `#${outcome.value}` }), components: [] });
  const picked = await api.call<OwnedCopy>('/internal/v1/harem/owned', { ...actor, cardId: outcome.value });
  if (!picked.ok) return { status: 'not_owned' };
  return { status: 'picked', copy: picked };
}
