import { EmbedBuilder } from 'discord.js';

import { commandGroups } from '../command-registry';
import type { Command, CommandContext } from '../interfaces';

export class HelpCommands {
  get commands(): Command[] {
    return [
      {
        name: 'help',
        aliases: ['h', 'ajuda', 'comandos'],
        descriptionKey: 'command.help.description',
        availableBeforeSetup: true,
        execute: this.handleHelp,
      },
    ];
  }

  private handleHelp = async (ctx: CommandContext): Promise<void> => {
    const { message, guildConfig, t } = ctx;
    const prefix = guildConfig.prefix;
    const embed = new EmbedBuilder().setTitle(t('help.title'));
    for (const group of commandGroups) {
      if (!group.commands.length) continue;
      const lines = group.commands
        .map((c) => `**${prefix}${c.name}** — ${c.descriptionKey ? t(c.descriptionKey) : ''}`)
        .join('\n');
      embed.addFields({ name: t(`help.category.${group.key}`), value: lines });
    }
    await message.reply({ embeds: [embed] });
  };
}
