import type { ButtonInteraction } from 'discord.js';

import type { BindResult } from '../bind-result';
import type { InternalClient } from '../client';
import type { TranslateFn } from '../interfaces';

import { renderBindResult } from './bind.presenter';
import { renderThiefMessages } from './thief.presenter';
import { applyThiefEvent } from './thief-role.util';

/**
 * Resultado de um vínculo por botão (carta de summon ou sobra de pack): resposta efêmera, anúncio
 * no canal e, se foi roubo que mexeu no cargo de Ladrão, o cargo e as mensagens dele.
 */
export async function publishBindOutcome(
  result: BindResult,
  interaction: ButtonInteraction,
  api: InternalClient,
  t: TranslateFn,
): Promise<void> {
  const { content, announce, announceMentions } = renderBindResult(result, t);
  await interaction.editReply({ content });
  if (announce && interaction.channel?.isSendable()) {
    await interaction.channel.send({ content: announce, allowedMentions: { users: announceMentions ?? [] } });
  }

  if (!result.ok || result.kind !== 'claim' || !result.thiefEvent || !interaction.guild) return;
  await applyThiefEvent(interaction.guild, api, result.thiefEvent, t);
  const thiefMessages = renderThiefMessages(result.thiefEvent, result.binderId, result.summonerId, result.name, t);
  for (const msg of thiefMessages) {
    if (interaction.channel?.isSendable()) {
      await interaction.channel.send({ content: msg.content, allowedMentions: { users: msg.mentions } });
    }
  }
}
