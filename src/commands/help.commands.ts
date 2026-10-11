import { EmbedBuilder } from 'discord.js';

import { commandGroups } from '../command-registry';
import type { CommandContext, CommandExecutor } from '../interfaces';
import { slashRoots } from '../slash-command-catalog';

export class HelpCommands {
  get commands(): CommandExecutor[] {
    return [
      {
        name: 'help',
        execute: this.handleHelp,
      },
    ];
  }

  private handleHelp = async (ctx: CommandContext): Promise<void> => {
    const { invocation, guildConfig, t } = ctx;
    const prefix = guildConfig.prefix;
    const embed = new EmbedBuilder().setTitle(t('help.title'));
    if (invocation.source === 'slash') {
      const lines = slashRoots.map((root) => `**/${root.name}**\n${root.description}`).join('\n');
      embed.setDescription(lines);
      await invocation.reply({ embeds: [embed] });
      return;
    }
    for (const group of commandGroups) {
      if (!group.commands.length) continue;
      const lines = group.commands
        .map((c) => `**${prefix}${c.name}**\n${c.descriptionKey ? t(c.descriptionKey) : ''}`)
        .join('\n');
      embed.addFields({ name: t(`help.category.${group.key}`), value: lines });
    }
    await invocation.reply({ embeds: [embed] });
  };
}
