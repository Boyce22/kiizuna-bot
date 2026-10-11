import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

/**
 * Link do site da Kizuna (coleção, conta). A API devolve uma URL com ticket que só abre na conta do
 * site vinculada a este Discord; mesmo assim ela vai em resposta efêmera (só quem clicou vê).
 * Comando de texto não tem resposta efêmera, então o link sai do clique no botão.
 */
export class SiteCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'site', execute: this.handleSite }];
  }

  private handleSite = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    const reply = await invocation.reply({
      content: t('site.prompt'),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setCustomId('site_open')
            .setLabel(t('site.open'))
            .setEmoji('🔗'),
        ),
      ],
    });

    try {
      const interaction = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === invocation.author.id,
        time: 60_000,
      });
      // O ticket nasce no clique (vale 15 min e uma vez só).
      const link = await this.api.post<{ url: string }>('/internal/v1/links', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        intent: 'collection',
      });
      await interaction.reply({
        content: t('site.link', { url: link.url }),
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // Timeout: o botão expira em silêncio.
    }
  };
}
