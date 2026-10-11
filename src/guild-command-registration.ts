import type { Guild } from 'discord.js';

import { buildSlashCommandPayloads } from './slash-command-catalog';

export async function registerGuildCommands(guild: Pick<Guild, 'id' | 'commands'>): Promise<number> {
  const commands = buildSlashCommandPayloads();
  await guild.commands.set(commands);
  return commands.length;
}

export async function registerCommandsForCurrentGuilds(
  guilds: Iterable<Pick<Guild, 'id' | 'commands'>>,
): Promise<Array<{ guildId: string; count: number }>> {
  const registered: Array<{ guildId: string; count: number }> = [];
  for (const guild of guilds) {
    registered.push({ guildId: guild.id, count: await registerGuildCommands(guild) });
  }
  return registered;
}
