import type { Interaction, Message } from 'discord.js';

import type { DiscordContext } from './context';

/** `joined_at` vem como `Date` no membro em cache e como texto ISO no membro cru da API. */
function joinedAtOf(member: unknown): string | undefined {
  if (!member || typeof member !== 'object') return undefined;
  if ('joinedAt' in member && member.joinedAt instanceof Date) return member.joinedAt.toISOString();
  if ('joined_at' in member && typeof member.joined_at === 'string') return member.joined_at;
  return undefined;
}

/** Comando por prefixo: a mensagem não traz o idioma do usuário. */
export function messageDiscordContext(message: Message): DiscordContext {
  return { eventId: message.id, trigger: 'message', memberJoinedAt: joinedAtOf(message.member) };
}

export function interactionDiscordContext(interaction: Interaction): DiscordContext {
  return {
    eventId: interaction.id,
    trigger: 'interaction',
    locale: interaction.locale,
    memberJoinedAt: joinedAtOf(interaction.member),
  };
}
