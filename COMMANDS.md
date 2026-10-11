# Arquitetura de comandos

O Kizuna aceita dois tipos de entrada permanentes:

- mensagens com o prefixo configurado no servidor;
- application commands nativos do Discord.

Os dois caminhos terminam no mesmo `dispatchCommand`. As diferenças de transporte ficam nos
adaptadores `MessageCommandInvocation` e `SlashCommandInvocation`. Os handlers não precisam
implementar uma versão para cada entrada.

## Catálogo de slash commands

`src/command-metadata.ts` é a fonte única dos nomes canônicos, aliases, descrições e políticas dos
comandos. Os executores declaram somente o nome e a função que executam. `src/slash-command-catalog.ts`
define a taxonomia pública, as opções tipadas e a conversão para os argumentos desses executores. O
catálogo publica doze comandos raiz:

`/gacha`, `/collection`, `/profile`, `/economy`, `/market`, `/games`, `/global`, `/vip`, `/settings`,
`/setup`, `/admin` e `/help`.

Aliases como `s`, `wl` e `bj` continuam disponíveis apenas em mensagens com prefixo. Eles não são
registrados como application commands.

`/setup prefix` altera somente o prefixo das mensagens legadas. Comandos de barra não possuem
prefixo configurável por servidor.

## Registro automático

Ao iniciar, o bot substitui idempotentemente o catálogo de comandos de cada guild em que já está.
Quando entra em uma nova guild, o evento `GuildCreate` registra o mesmo catálogo imediatamente.
Isso faz o autocomplete aparecer sem configurar um ID de servidor.

## Registro manual

Defina `DISCORD_APPLICATION_ID` e execute:

```text
npm run commands:register
```

Se `DISCORD_COMMAND_GUILD_ID` estiver definido, o script registra nas guilds informadas, aceitando
IDs separados por vírgula. Se estiver vazio, consulta todas as guilds do bot e registra em cada uma.

O script é opcional. O fluxo normal usa o registro automático por guild durante a inicialização.

## Respostas

Slash commands são adiados antes do acesso à API, salvo quando a rota declara `defer: false`. O
primeiro `reply` edita a resposta adiada e os seguintes usam follow-up. Mensagens com prefixo usam
`Message.reply` pelo mesmo contrato.

Restrições de canal, setup pendente, banimento e tratamento de erro são aplicados no dispatcher
compartilhado. Permissões mais específicas, como dono do bot ou dono do servidor, continuam
validadas nos handlers porque o Discord não oferece permissão diferente para cada subcomando.

## Validação

```text
npm run typecheck
npm test
```

Os testes verificam cobertura dos 41 comandos canônicos, unicidade de nomes, aliases e rotas, ordem
das opções, limites das descrições em todos os idiomas, ausência de travessão nas descrições e
conversão de opções para o executor compartilhado.

Os campos, níveis, correlação com a API e métricas operacionais estão documentados em
`OBSERVABILITY.md`.
