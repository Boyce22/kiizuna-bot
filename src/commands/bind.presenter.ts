import { discordRelative } from '@utils';

import type { TranslateFn } from '../interfaces';

import type { BindResult } from '../bind-types';

export interface BindMessages {
  content: string;
  /** Anúncio do roubo a postar no canal (sempre em sucesso). */
  announce?: string;
  /** IDs a mencionar no announce — passados em `allowedMentions` para garantir o ping. */
  announceMentions?: string[];
}

// Render único do resultado de bind — reutilizado pelo comando de texto e pelo botão 💍.
export function renderBindResult(result: BindResult, t: TranslateFn): BindMessages {
  if (!result.ok) {
    if (result.reason === 'cooldown') {
      const key = result.bindKind === 'steal' ? 'bind.steal_cooldown' : 'bind.cooldown';
      return { content: t(key, { time: discordRelative(result.cooldownUntil) }) };
    }
    if (result.reason === 'expired') {
      return { content: t('bind.expired') };
    }
    return { content: t('bind.none_active') };
  }

  // Já tinha dono: sem roubo, só a duplicata em coins (resposta privada, sem announce público).
  if (result.kind === 'dupe') {
    return { content: t('bind.dupe', { name: result.name, coins: result.coins }) };
  }

  const thief = `<@${result.binderId}>`;
  const messages: BindMessages = { content: t('bind.success', { name: result.name }) };

  // Ping de wishlist sempre dispara (quem tinha o personagem na lista perdeu, mesmo num claim próprio).
  if (result.wishlistUserIds.length) {
    const mentions = result.wishlistUserIds.map((id) => `<@${id}>`).join(' ');
    messages.announce = t('bind.wishlist_ping', { users: mentions, name: result.name, thief });
    messages.announceMentions = [result.binderId, ...result.wishlistUserIds];
  } else if (!result.isSelfClaim) {
    // Announce de "roubo" só faz sentido num snipe; na própria summon, não anuncia.
    messages.announce = t('bind.announce', { name: result.name, thief });
    messages.announceMentions = [result.binderId];
  }
  return messages;
}
