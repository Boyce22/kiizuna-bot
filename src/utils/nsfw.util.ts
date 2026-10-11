import type { Channel } from 'discord.js';

export interface NsfwCheck {
  allowed: boolean;
  reasonKey?: string; // chave i18n para mensagem de erro
}

// Centraliza a lógica NSFW: libera imagem/personagem NSFW só se a flag estiver ligada
// E o canal estiver marcado como NSFW no Discord.
export function checkNsfwPermission(channel: Channel | null, nsfwFlag: boolean): NsfwCheck {
  if (!nsfwFlag) return { allowed: false }; // SFW: sem erro, apenas filtra
  const channelIsNsfw =
    !!channel && 'nsfw' in channel && (channel as { nsfw?: boolean }).nsfw === true;
  if (!channelIsNsfw) return { allowed: false, reasonKey: 'error.nsfw_channel' };
  return { allowed: true };
}
