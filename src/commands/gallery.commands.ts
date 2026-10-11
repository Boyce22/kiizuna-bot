import { ui } from '@config';
import { checkNsfwPermission, paginate } from '@utils';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

import { buildGalleryEmbed, type GalleryCard, type GalleryMode } from './gallery.presenter';

const MODES: Record<string, GalleryMode> = {
  bond: 'bond',
  rarity: 'rarity',
  raridade: 'rarity',
  soulmates: 'soulmates',
  soulmate: 'soulmates',
};

export class GalleryCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [{ name: 'gallery', aliases: ['galeria'], descriptionKey: 'command.gallery.description', execute: this.handleGallery }];
  }

  private handleGallery = async (ctx: CommandContext): Promise<void> => {
    const { message, args, t } = ctx;
    const guildId = message.guildId;
    if (!guildId) return;
    const mode = MODES[(args[0] ?? '').toLowerCase()] ?? 'bond';
    const nsfw = checkNsfwPermission(message.channel, true).allowed;
    const pageSize = ui.pagination.collectionPageSize;
    type Page = { total: number; card: GalleryCard | null; imageUrl: string | null };
    const first = await this.api.post<Page>('/internal/v1/gallery/page', { guildId, mode, nsfw, page: 0, pageSize });
    if (first.total === 0 || !first.card) {
      await message.reply(t('gallery.empty'));
      return;
    }
    await paginate({
      message,
      total: first.total,
      pageSize,
      t,
      renderPage: async (page, totalPages) => {
        const data = page === 0 ? first : await this.api.post<Page>('/internal/v1/gallery/page', { guildId, mode, nsfw, page, pageSize });
        const card = data.card!;
        const member = await message.guild?.members.fetch(card.ownerDiscordId).catch(() => null);
        const user = member?.user ?? (await message.client.users.fetch(card.ownerDiscordId).catch(() => null));
        return buildGalleryEmbed(
          mode,
          card,
          data.imageUrl,
          {
            page,
            totalPages,
            ownerName: member?.displayName ?? user?.username ?? t('gallery.unknown_owner'),
            ownerIconUrl: (member ?? user)?.displayAvatarURL(),
          },
          t,
        );
      },
    });
  };
}
