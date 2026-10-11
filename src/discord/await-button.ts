import { type ButtonInteraction, ComponentType, type Message, MessageFlags } from 'discord.js';

import type { TranslateFn } from '../interfaces';

/**
 * Aguarda um clique do autor em bot├Áes de um prompt.
 * Cliques de terceiros recebem resposta ef├¬mera ("n├úo ├® sua vez") e a espera continua.
 * Respeita o deadline absoluto ÔÇö terceiros n├úo estendem o tempo do autor.
 *
 * Usa um ├║nico coletor vivo durante toda a janela (em vez de recriar a escuta a cada
 * clique de terceiro) ÔÇö recriar deixava uma brecha entre chamadas em que nenhum coletor
 * estava ativo, e um clique fora da vez nesse instante nunca era respondido (Discord
 * mostrava "Esta intera├º├úo falhou" pra quem clicou).
 */
export function awaitAuthorButton(
  prompt: Message,
  authorId: string,
  deadline: number,
  t: TranslateFn,
): Promise<ButtonInteraction> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error('timeout'));

  return new Promise<ButtonInteraction>((resolve, reject) => {
    const collector = prompt.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: remaining,
    });

    collector.on('collect', (interaction) => {
      if (interaction.user.id === authorId) {
        collector.stop('author');
        resolve(interaction);
        return;
      }
      interaction
        .reply({ content: t('pagination.not_yours'), flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    });

    collector.on('end', (_collected, reason) => {
      if (reason !== 'author') reject(new Error('timeout'));
    });
  });
}
