import type { TranslateFn } from '../interfaces';

import type { ThiefEvent } from '../bind-types';

export interface ThiefMessage {
  content: string;
  /** IDs a mencionar, passados em `allowedMentions` para garantir o ping. */
  mentions: string[];
}

/**
 * Renderiza as mensagens públicas do cargo de Ladrão/Thief a partir do `thiefEvent` retornado
 * pelo claim. Coroação e "thief roubado" são independentes — podem coexistir na mesma ação
 * (ex.: o próprio roubo que destrona o antigo campeão pode ter sido cometido contra ele).
 */
export function renderThiefMessages(
  event: ThiefEvent | undefined,
  stealerId: string,
  victimId: string | undefined,
  name: string,
  t: TranslateFn,
): ThiefMessage[] {
  if (!event) return [];

  const messages: ThiefMessage[] = [];

  if (event.crown) {
    const newThief = `<@${event.crown.newThiefDiscordId}>`;
    if (event.crown.type === 'new') {
      messages.push({
        content: t(event.scope === 'global' ? 'thief.new_global' : 'thief.new', {
          thief: newThief,
          count: event.crown.count,
        }),
        mentions: [event.crown.newThiefDiscordId],
      });
    } else {
      const oldThief = event.crown.oldThiefDiscordId ? `<@${event.crown.oldThiefDiscordId}>` : '—';
      messages.push({
        content: t(event.scope === 'global' ? 'thief.dethroned_global' : 'thief.dethroned', {
          newThief,
          oldThief,
          count: event.crown.count,
        }),
        mentions: [event.crown.newThiefDiscordId, ...(event.crown.oldThiefDiscordId ? [event.crown.oldThiefDiscordId] : [])],
      });
    }
  }

  if (event.victimWasThief && victimId) {
    messages.push({
      content: t('thief.robbed', { thief: `<@${victimId}>`, stealer: `<@${stealerId}>`, name }),
      mentions: [victimId, stealerId],
    });
  }

  return messages;
}
