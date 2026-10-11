# Observabilidade do bot

O bot usa Pino com o mesmo formato da API. Em desenvolvimento os logs são legíveis e coloridos. Em
produção cada linha é JSON, adequada para coleta por Loki, Datadog, CloudWatch ou outro agregador.

## Configuração

- `LOG_LEVEL=debug` mostra decisões do parser e chamadas internas em desenvolvimento.
- `LOG_LEVEL=info` é o padrão de produção.
- `NODE_ENV=production` desativa o formatador visual e emite JSON puro.

Tokens, segredos e assinaturas HMAC são redigidos. Conteúdo de mensagens, argumentos de comandos e
corpos enviados à API não são registrados.

## Correlação

Cada mensagem e interação recebe um `requestId`. O bot envia esse valor no header `X-Request-ID`
das chamadas internas. A API reaproveita o header como `reqId`, permitindo seguir uma operação do
evento Discord até a resposta HTTP correspondente.

Os principais campos são:

- `requestId`, `source` e `event`;
- `guildId`, `channelId` e `discordUserId`;
- `invokedCommand` e `command` canônico;
- `outcome`, `phase` e `elapsedMs`;
- `component`, `path`, `status` e `code` nas integrações.

Resultados esperados, como canal incorreto, setup pendente, usuário banido e comando desconhecido,
possuem `outcome` próprio. Falhas inesperadas incluem o objeto `err` serializado.

## Métricas periódicas

A cada 30 segundos o evento `runtime metrics` agrega:

- memória e CPU do processo;
- utilização, p95 e máximo do event loop;
- quantidade, erros, tempo total e maior latência por comando, origem e resultado;
- quantidade, erros, tempo total e maior latência por rota da API interna.

As dimensões são limitadas a comandos, resultados e rotas conhecidas para evitar cardinalidade
descontrolada.

## Eventos operacionais

Também são registrados bootstrap, ready do Discord, desconexão e retomada de shards, sincronização
de application commands, drenagem de notificações e shutdown por sinal.
