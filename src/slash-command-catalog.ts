import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

import type { ParsedCommand } from './utils/parser.util';
import { getCommandMetadata } from './command-metadata';
import { translate } from './i18n/i18n.service';

type OptionKind = 'string' | 'integer' | 'boolean' | 'user' | 'channel';
type OptionTarget = 'arg' | 'flag' | 'mention' | 'true-arg';

export interface SlashOptionSpec {
  name: string;
  description: string;
  kind: OptionKind;
  required?: boolean;
  target?: OptionTarget;
  targetName?: string;
  choices?: Array<{ name: string; value: string | number }>;
  minValue?: number;
  maxValue?: number;
}

export interface SlashRouteSpec {
  root: string;
  group?: string;
  subcommand?: string;
  description: string;
  legacyCommand: string;
  fixedArgs?: string[];
  options?: SlashOptionSpec[];
  defer?: boolean;
  ephemeral?: boolean;
}

interface SlashRootSpec {
  name: string;
  description: string;
  defaultMemberPermissions?: bigint;
}

type DescriptionLocalizations = Record<'en-US' | 'es-ES' | 'ja', string>;

const rootLocalizations: Record<string, DescriptionLocalizations> = {
  gacha: {
    'en-US': 'Summon characters and manage your rolls',
    'es-ES': 'Invoca personajes y administra tus tiradas',
    ja: 'キャラクターを召喚してロールを管理します',
  },
  collection: {
    'en-US': 'Browse and organize your character collection',
    'es-ES': 'Consulta y organiza tu colección de personajes',
    ja: 'キャラクターコレクションを確認して整理します',
  },
  profile: {
    'en-US': 'Browse profiles, galleries, and bonds',
    'es-ES': 'Consulta perfiles, galerías y vínculos',
    ja: 'プロフィール、ギャラリー、絆を確認します',
  },
  economy: {
    'en-US': 'Check your balance and use social features',
    'es-ES': 'Consulta tu saldo y usa funciones sociales',
    ja: '残高を確認して交流機能を利用します',
  },
  market: {
    'en-US': 'Buy, sell, trade, and auction characters',
    'es-ES': 'Compra, vende, intercambia y subasta personajes',
    ja: 'キャラクターの購入、売却、交換、オークションを行います',
  },
  games: {
    'en-US': 'Play games and challenge the daily boss',
    'es-ES': 'Juega partidas y desafía al jefe diario',
    ja: 'ゲームをプレイしてデイリーボスに挑戦します',
  },
  global: {
    'en-US': 'Browse features shared across servers',
    'es-ES': 'Consulta funciones compartidas entre servidores',
    ja: 'サーバー間で共有される機能を確認します',
  },
  vip: {
    'en-US': 'Browse and manage your VIP subscription',
    'es-ES': 'Consulta y administra tu suscripción VIP',
    ja: 'VIPサブスクリプションを確認して管理します',
  },
  settings: {
    'en-US': 'Change your personal preferences',
    'es-ES': 'Cambia tus preferencias personales',
    ja: '個人設定を変更します',
  },
  setup: {
    'en-US': 'Configure Kizuna for this server',
    'es-ES': 'Configura Kizuna para este servidor',
    ja: 'このサーバーのKizunaを設定します',
  },
  admin: {
    'en-US': 'Run administrative Kizuna operations',
    'es-ES': 'Ejecuta operaciones administrativas de Kizuna',
    ja: 'Kizunaの管理操作を実行します',
  },
  help: {
    'en-US': 'Browse available commands and features',
    'es-ES': 'Consulta los comandos y funciones disponibles',
    ja: '利用可能なコマンドと機能を確認します',
  },
};

export const slashRoots: SlashRootSpec[] = [
  { name: 'gacha', description: 'Invoque personagens e gerencie seus rolls' },
  { name: 'collection', description: 'Consulte e organize sua coleção de personagens' },
  { name: 'profile', description: 'Consulte perfis, galerias e vínculos' },
  { name: 'economy', description: 'Consulte seu saldo e use recursos sociais' },
  { name: 'market', description: 'Compre, venda, troque e leiloe personagens' },
  { name: 'games', description: 'Jogue partidas e enfrente o boss do dia' },
  { name: 'global', description: 'Consulte recursos compartilhados entre servidores' },
  { name: 'vip', description: 'Consulte e gerencie sua assinatura VIP' },
  { name: 'settings', description: 'Ajuste suas preferências pessoais' },
  {
    name: 'setup',
    description: 'Configure o Kizuna neste servidor',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  },
  { name: 'admin', description: 'Execute operações administrativas do Kizuna' },
  { name: 'help', description: 'Consulte os comandos e recursos disponíveis' },
];

const stringOption = (
  name: string,
  description: string,
  required = false,
  target: OptionTarget = 'arg',
  targetName?: string,
  choices?: Array<{ name: string; value: string }>,
): SlashOptionSpec => ({ name, description, kind: 'string', required, target, targetName, choices });

const integerOption = (
  name: string,
  description: string,
  required = false,
  minValue?: number,
  maxValue?: number,
): SlashOptionSpec => ({ name, description, kind: 'integer', required, target: 'arg', minValue, maxValue });

const booleanOption = (
  name: string,
  description: string,
  target: OptionTarget = 'flag',
  targetName = name,
): SlashOptionSpec => ({ name, description, kind: 'boolean', target, targetName });

const userOption = (description: string, required = false): SlashOptionSpec => ({
  name: 'usuario',
  description,
  kind: 'user',
  required,
  target: 'mention',
});

const channelOption = (description: string, required = false): SlashOptionSpec => ({
  name: 'canal',
  description,
  kind: 'channel',
  required,
  target: 'mention',
});

const rarityChoices = ['R', 'SR', 'SSR', 'UR'].map((value) => ({ name: value, value }));
const tierChoices = ['kizuna', 'kizuna+', 'eternal'].map((value) => ({ name: value, value }));

export const slashRoutes: SlashRouteSpec[] = [
  {
    root: 'gacha',
    subcommand: 'summon',
    description: 'Invoque um personagem aleatório',
    legacyCommand: 'summon',
    options: [
      stringOption('tipo', 'Escolha waifu, husbando ou todos', true, 'arg', undefined, [
        { name: 'Waifu', value: 'waifu' },
        { name: 'Husbando', value: 'husbando' },
        { name: 'Todos', value: 'all' },
      ]),
      booleanOption('nsfw', 'Inclua personagens marcados como adultos'),
      stringOption('anime', 'Restrinja a invocação a um anime', false, 'flag', 'target'),
    ],
  },
  { root: 'gacha', subcommand: 'bind', description: 'Vincule o personagem invocado', legacyCommand: 'bind' },
  { root: 'gacha', subcommand: 'reroll', description: 'Repita sua última invocação VIP', legacyCommand: 'reroll' },

  {
    root: 'collection',
    subcommand: 'view',
    description: 'Mostre a coleção de um jogador',
    legacyCommand: 'collection',
    options: [userOption('Jogador cuja coleção será mostrada')],
  },
  { root: 'collection', group: 'wishlist', subcommand: 'list', description: 'Mostre sua lista de desejos', legacyCommand: 'wishlist', fixedArgs: ['list'] },
  {
    root: 'collection',
    group: 'wishlist',
    subcommand: 'add',
    description: 'Adicione um personagem à lista de desejos',
    legacyCommand: 'wishlist',
    fixedArgs: ['add'],
    options: [
      stringOption('personagem', 'Nome do personagem', true),
      stringOption('anime', 'Anime do personagem', false, 'flag', 'anime'),
    ],
  },
  {
    root: 'collection',
    group: 'wishlist',
    subcommand: 'remove',
    description: 'Remova um personagem da lista de desejos',
    legacyCommand: 'wishlist',
    fixedArgs: ['remove'],
    options: [
      stringOption('personagem', 'Nome do personagem', true),
      stringOption('anime', 'Anime do personagem', false, 'flag', 'anime'),
    ],
  },
  { root: 'collection', group: 'wishlist', subcommand: 'clear', description: 'Limpe sua lista de desejos', legacyCommand: 'wishlist', fixedArgs: ['clear'] },
  { root: 'collection', group: 'anime', subcommand: 'status', description: 'Mostre o anime acompanhado atualmente', legacyCommand: 'animewishlist' },
  {
    root: 'collection',
    group: 'anime',
    subcommand: 'set',
    description: 'Escolha o anime que você deseja acompanhar',
    legacyCommand: 'animewishlist',
    options: [stringOption('anime', 'Nome do anime', true)],
  },
  { root: 'collection', group: 'anime', subcommand: 'clear', description: 'Remova o anime acompanhado', legacyCommand: 'animewishlist', fixedArgs: ['clear'] },

  { root: 'profile', subcommand: 'view', description: 'Mostre o perfil de um jogador', legacyCommand: 'profile', options: [userOption('Jogador cujo perfil será mostrado')] },
  {
    root: 'profile',
    subcommand: 'gallery',
    description: 'Mostre a galeria de destaques do servidor',
    legacyCommand: 'gallery',
    options: [stringOption('ordem', 'Critério usado para ordenar a galeria', false, 'arg', undefined, [
      { name: 'Vínculo', value: 'bond' },
      { name: 'Raridade', value: 'rarity' },
      { name: 'Almas gêmeas', value: 'soulmates' },
    ])],
  },
  { root: 'profile', subcommand: 'soulmate', description: 'Defina seu personagem alma gêmea', legacyCommand: 'soulmate', options: [integerOption('personagem', 'ID do personagem', true, 1)] },

  { root: 'economy', subcommand: 'balance', description: 'Mostre seu saldo de coins', legacyCommand: 'coins' },
  { root: 'economy', subcommand: 'daily', description: 'Receba sua recompensa diária', legacyCommand: 'daily' },
  { root: 'economy', subcommand: 'gift', description: 'Presenteie um personagem para aumentar o vínculo', legacyCommand: 'gift', options: [integerOption('personagem', 'ID do personagem', true, 1), integerOption('coins', 'Quantidade de coins', true, 1)] },
  { root: 'economy', subcommand: 'duel', description: 'Desafie outro jogador por coins', legacyCommand: 'duel', options: [userOption('Jogador que receberá o desafio', true), integerOption('aposta', 'Quantidade de coins apostada', false, 1)] },

  { root: 'market', subcommand: 'browse', description: 'Consulte personagens à venda por preço fixo', legacyCommand: 'market', options: [stringOption('raridade', 'Filtre os resultados por raridade', false, 'arg', undefined, rarityChoices)] },
  { root: 'market', subcommand: 'sell', description: 'Venda um personagem ao Kizuna', legacyCommand: 'sell', options: [integerOption('personagem', 'ID do personagem', true, 1)] },
  { root: 'market', subcommand: 'trade', description: 'Troque um personagem com outro jogador', legacyCommand: 'trade', options: [userOption('Jogador convidado para a troca', true), stringOption('meu', 'Seu personagem por ID ou nome', true, 'flag', 'meu'), stringOption('dele', 'Personagem do outro jogador por ID ou nome', true, 'flag', 'dele')] },
  { root: 'market', group: 'auction', subcommand: 'list', description: 'Mostre os leilões ativos', legacyCommand: 'auction', fixedArgs: ['list'] },
  { root: 'market', group: 'auction', subcommand: 'start', description: 'Inicie o leilão de um personagem', legacyCommand: 'auction', fixedArgs: ['start'], options: [integerOption('personagem', 'ID do personagem', true, 1), integerOption('lance', 'Lance inicial', false, 1), { ...integerOption('compra_imediata', 'Preço para compra imediata', false, 1), target: 'flag', targetName: 'buynow' }, { ...integerOption('horas', 'Duração do leilão em horas', false, 1), target: 'flag', targetName: 'horas' }] },
  { root: 'market', group: 'auction', subcommand: 'bid', description: 'Faça um lance em um leilão', legacyCommand: 'auction', fixedArgs: ['bid'], options: [integerOption('leilao', 'ID do leilão', true, 1), integerOption('valor', 'Valor do lance', true, 1)] },
  { root: 'market', group: 'auction', subcommand: 'info', description: 'Consulte os detalhes de um leilão', legacyCommand: 'auction', fixedArgs: ['info'], options: [integerOption('leilao', 'ID do leilão', true, 1)] },
  { root: 'market', group: 'auction', subcommand: 'cancel', description: 'Cancele um leilão criado por você', legacyCommand: 'auction', fixedArgs: ['cancel'], options: [integerOption('leilao', 'ID do leilão', true, 1)] },

  { root: 'games', subcommand: 'blackjack', description: 'Jogue blackjack contra o dealer', legacyCommand: 'blackjack', options: [integerOption('aposta', 'Quantidade de coins apostada', true, 1)] },
  { root: 'games', subcommand: 'blackjack-table', description: 'Abra uma mesa de blackjack cooperativa', legacyCommand: 'bjtable', options: [integerOption('aposta', 'Quantidade de coins por jogador', true, 1)] },
  { root: 'games', subcommand: 'blackjack-pvp', description: 'Jogue blackjack contra até três jogadores', legacyCommand: 'bjpvp', options: [integerOption('aposta', 'Quantidade de coins por jogador', true, 1)] },
  { root: 'games', subcommand: 'higher-lower', description: 'Adivinhe qual personagem vale mais', legacyCommand: 'higherlower' },
  { root: 'games', subcommand: 'boss', description: 'Enfrente o boss do dia', legacyCommand: 'boss' },

  { root: 'global', subcommand: 'profile', description: 'Mostre o perfil global de um jogador', legacyCommand: 'globalprofile', options: [userOption('Jogador cujo perfil será mostrado')] },
  { root: 'global', subcommand: 'leaderboard', description: 'Mostre a classificação global', legacyCommand: 'globaltop', options: [stringOption('metrica', 'Métrica usada na classificação', false, 'arg', undefined, [{ name: 'Coleção', value: 'harem' }, { name: 'Vínculo', value: 'bond' }, { name: 'Míticos', value: 'mythics' }])] },
  { root: 'global', subcommand: 'privacy', description: 'Alterne sua visibilidade na classificação global', legacyCommand: 'globalhide' },
  { root: 'global', subcommand: 'ranks', description: 'Mostre a progressão dos ranks globais', legacyCommand: 'ranks' },
  { root: 'global', group: 'showcase', subcommand: 'view', description: 'Mostre a vitrine global de um jogador', legacyCommand: 'showcase', options: [userOption('Jogador cuja vitrine será mostrada')] },
  { root: 'global', group: 'showcase', subcommand: 'set', description: 'Adicione um personagem à sua vitrine global', legacyCommand: 'showcase', fixedArgs: ['set'], options: [integerOption('personagem', 'ID do personagem', true, 1), integerOption('posicao', 'Posição desejada na vitrine', false, 1)] },
  { root: 'global', group: 'showcase', subcommand: 'remove', description: 'Remova uma posição da sua vitrine global', legacyCommand: 'showcase', fixedArgs: ['remove'], options: [integerOption('posicao', 'Posição removida da vitrine', true, 1)] },

  { root: 'vip', subcommand: 'overview', description: 'Mostre os planos e recursos VIP', legacyCommand: 'vip' },
  { root: 'vip', subcommand: 'status', description: 'Mostre o estado da sua assinatura VIP', legacyCommand: 'vip', fixedArgs: ['status'] },
  { root: 'vip', subcommand: 'perks', description: 'Mostre os benefícios de um plano VIP', legacyCommand: 'vip', fixedArgs: ['perks'], options: [stringOption('plano', 'Plano VIP consultado', false, 'arg', undefined, tierChoices)] },
  { root: 'vip', subcommand: 'checkout', description: 'Gere o link para assinar um plano VIP', legacyCommand: 'vip', fixedArgs: ['checkout'], options: [stringOption('plano', 'Plano VIP escolhido', true, 'arg', undefined, tierChoices)] },

  { root: 'settings', subcommand: 'site', description: 'Receba o link seguro para o site da Kizuna', legacyCommand: 'site' },
  { root: 'settings', subcommand: 'language', description: 'Defina o idioma das respostas do Kizuna', legacyCommand: 'language', options: [stringOption('idioma', 'Idioma usado nas respostas', true, 'arg', undefined, [{ name: 'English', value: 'en' }, { name: 'Português', value: 'pt' }, { name: 'Español', value: 'es' }, { name: '日本語', value: 'ja' }])] },

  { root: 'setup', subcommand: 'view', description: 'Mostre a configuração atual do servidor', legacyCommand: 'setup' },
  { root: 'setup', subcommand: 'mode', description: 'Escolha como os dados do servidor serão armazenados', legacyCommand: 'setup', fixedArgs: ['mode'], options: [stringOption('modo', 'Use dados próprios ou compartilhados', true, 'arg', undefined, [{ name: 'Servidor', value: 'guild' }, { name: 'Global', value: 'global' }])] },
  { root: 'setup', subcommand: 'channel', description: 'Use este canal para as invocações automáticas', legacyCommand: 'setup', fixedArgs: ['channel'] },
  { root: 'setup', subcommand: 'types', description: 'Defina os tipos disponíveis nas invocações', legacyCommand: 'setup', fixedArgs: ['types'], options: [stringOption('tipo', 'Tipo permitido nas invocações', true, 'arg', undefined, [{ name: 'Todos', value: 'all' }, { name: 'Waifu', value: 'waifu' }, { name: 'Husbando', value: 'husbando' }])] },
  { root: 'setup', subcommand: 'prefix', description: 'Altere somente o prefixo dos comandos legados', legacyCommand: 'setup', fixedArgs: ['prefix'], options: [stringOption('prefixo', 'Novo prefixo com até três caracteres', true)] },
  { root: 'setup', subcommand: 'locale', description: 'Defina o idioma padrão do servidor', legacyCommand: 'setup', fixedArgs: ['locale'], options: [stringOption('idioma', 'Idioma padrão do servidor', true, 'arg', undefined, [{ name: 'English', value: 'en' }, { name: 'Português', value: 'pt' }, { name: 'Español', value: 'es' }, { name: '日本語', value: 'ja' }])] },
  { root: 'setup', subcommand: 'interval', description: 'Defina o intervalo entre ciclos de invocação', legacyCommand: 'setup', fixedArgs: ['interval'], options: [integerOption('minutos', 'Intervalo em minutos', true, 1)] },
  { root: 'setup', group: 'channels', subcommand: 'list', description: 'Mostre os canais permitidos', legacyCommand: 'setup', fixedArgs: ['channels', 'list'] },
  { root: 'setup', group: 'channels', subcommand: 'add', description: 'Permita comandos em um canal', legacyCommand: 'setup', fixedArgs: ['channels', 'add'], options: [channelOption('Canal que será permitido', true)] },
  { root: 'setup', group: 'channels', subcommand: 'remove', description: 'Remova um canal da lista permitida', legacyCommand: 'setup', fixedArgs: ['channels', 'remove'], options: [channelOption('Canal que deixará de ser permitido', true)] },

  { root: 'admin', group: 'character', subcommand: 'add', description: 'Crie um personagem ou variante', legacyCommand: 'addchar' },
  { root: 'admin', group: 'character', subcommand: 'edit', description: 'Edite um personagem existente', legacyCommand: 'editchar', options: [integerOption('personagem', 'ID do personagem', true, 1)] },
  { root: 'admin', group: 'character', subcommand: 'remove', description: 'Remova um personagem e seus dados relacionados', legacyCommand: 'removechar', options: [integerOption('personagem', 'ID do personagem', true, 1)] },
  { root: 'admin', group: 'image', subcommand: 'add', description: 'Adicione uma imagem a um personagem', legacyCommand: 'charimage', fixedArgs: ['add'], options: [integerOption('personagem', 'ID do personagem', true, 1), stringOption('url', 'Endereço da imagem', true), booleanOption('nsfw', 'Marque a imagem como adulta'), booleanOption('principal', 'Defina a imagem como principal', 'flag', 'primary')] },
  { root: 'admin', group: 'image', subcommand: 'list', description: 'Mostre as imagens de um personagem', legacyCommand: 'charimage', fixedArgs: ['list'], options: [integerOption('personagem', 'ID do personagem', true, 1)] },
  { root: 'admin', group: 'image', subcommand: 'remove', description: 'Remova uma imagem de personagem', legacyCommand: 'charimage', fixedArgs: ['remove'], options: [integerOption('imagem', 'ID da imagem', true, 1)] },
  { root: 'admin', subcommand: 'reset-rolls', description: 'Reabasteça os rolls de um jogador ou de todos', legacyCommand: 'resetrolls', options: [userOption('Jogador que receberá os rolls'), booleanOption('todos', 'Reabasteça os rolls de todos os jogadores', 'true-arg', 'all')] },
  { root: 'admin', subcommand: 'reset-claim', description: 'Remova o tempo de espera de claim de um jogador', legacyCommand: 'resetclaim', options: [userOption('Jogador cujo claim será liberado', true)] },
  { root: 'admin', subcommand: 'clear-messages', description: 'Remova mensagens do bot e comandos legados', legacyCommand: 'clearmessages', options: [channelOption('Canal que será limpo')] },
  { root: 'admin', group: 'coins', subcommand: 'give', description: 'Adicione coins ao saldo de um jogador', legacyCommand: 'coins', fixedArgs: ['give'], options: [userOption('Jogador que receberá os coins', true), integerOption('quantidade', 'Quantidade adicionada', true, 1)] },
  { root: 'admin', group: 'coins', subcommand: 'take', description: 'Remova coins do saldo de um jogador', legacyCommand: 'coins', fixedArgs: ['take'], options: [userOption('Jogador que perderá os coins', true), integerOption('quantidade', 'Quantidade removida', true, 1)] },
  { root: 'admin', group: 'coins', subcommand: 'clear', description: 'Zere o saldo de um jogador', legacyCommand: 'coins', fixedArgs: ['clear'], options: [userOption('Jogador cujo saldo será zerado', true)] },
  { root: 'admin', group: 'market', subcommand: 'add', description: 'Adicione um personagem ao estoque do Kizuna', legacyCommand: 'market-admin', fixedArgs: ['add'], options: [integerOption('personagem', 'ID do personagem', true, 1), integerOption('preco', 'Preço de venda', false, 1)] },
  { root: 'admin', group: 'market', subcommand: 'list', description: 'Mostre o estoque administrado pelo Kizuna', legacyCommand: 'market-admin', fixedArgs: ['list'] },
  { root: 'admin', group: 'market', subcommand: 'remove', description: 'Remova um item do estoque do Kizuna', legacyCommand: 'market-admin', fixedArgs: ['remove'], options: [integerOption('estoque', 'ID do item no estoque', true, 1)] },
  { root: 'admin', group: 'vip', subcommand: 'grant', description: 'Conceda um plano VIP a um jogador', legacyCommand: 'vip-admin', fixedArgs: ['grant'], options: [userOption('Jogador que receberá o plano', true), stringOption('plano', 'Plano VIP concedido', true, 'arg', undefined, tierChoices), integerOption('dias', 'Duração da concessão em dias', false, 1)] },
  { root: 'admin', group: 'vip', subcommand: 'lookup', description: 'Consulte a assinatura VIP de um jogador', legacyCommand: 'vip-admin', fixedArgs: ['lookup'], options: [userOption('Jogador consultado', true)] },

  { root: 'help', description: 'Consulte os comandos e recursos disponíveis', legacyCommand: 'help', defer: false },
];

const optionTypes: Record<OptionKind, ApplicationCommandOptionType> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  channel: ApplicationCommandOptionType.Channel,
};

function optionJson(option: SlashOptionSpec) {
  return {
    type: optionTypes[option.kind],
    name: option.name,
    description: option.description,
    description_localizations: optionDescriptionLocalizations[option.name],
    required: option.required,
    choices: option.choices,
    min_value: option.minValue,
    max_value: option.maxValue,
  };
}

function routeLocalizations(route: SlashRouteSpec): DescriptionLocalizations {
  const key = getCommandMetadata(route.legacyCommand).descriptionKey;
  return {
    'en-US': translate(key, 'en'),
    'es-ES': translate(key, 'es'),
    ja: translate(key, 'ja'),
  };
}

export function buildSlashCommandPayloads(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return slashRoots.map((root) => {
    const routes = slashRoutes.filter((route) => route.root === root.name);
    const direct = routes.find((route) => !route.subcommand);
    if (direct) {
      return {
        name: root.name,
        description: root.description,
        description_localizations: rootLocalizations[root.name],
        default_member_permissions: root.defaultMemberPermissions?.toString(),
        options: direct.options?.map(optionJson),
      } as RESTPostAPIChatInputApplicationCommandsJSONBody;
    }

    const options: Array<Record<string, unknown>> = routes
      .filter((route) => !route.group)
      .map((route) => ({
        type: ApplicationCommandOptionType.Subcommand,
        name: route.subcommand!,
        description: route.description,
        description_localizations: routeLocalizations(route),
        options: route.options?.map(optionJson),
      }));

    for (const group of [...new Set(routes.flatMap((route) => (route.group ? [route.group] : [])))]) {
      const children = routes.filter((route) => route.group === group);
      options.push({
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: group,
        description: groupDescription(root.name, group),
        description_localizations: groupDescriptionLocalizations[`${root.name}:${group}`],
        options: children.map((route) => ({
          type: ApplicationCommandOptionType.Subcommand,
          name: route.subcommand!,
          description: route.description,
          description_localizations: routeLocalizations(route),
          options: route.options?.map(optionJson),
        })),
      });
    }

    return {
      name: root.name,
      description: root.description,
      description_localizations: rootLocalizations[root.name],
      default_member_permissions: root.defaultMemberPermissions?.toString(),
      options,
    } as RESTPostAPIChatInputApplicationCommandsJSONBody;
  });
}

export function parseSlashCommand(interaction: ChatInputCommandInteraction<'cached'>): {
  route: SlashRouteSpec;
  parsed: ParsedCommand;
} | null {
  const group = interaction.options.getSubcommandGroup(false) ?? undefined;
  const subcommand = interaction.options.getSubcommand(false) ?? undefined;
  const route = slashRoutes.find(
    (candidate) =>
      candidate.root === interaction.commandName &&
      candidate.group === group &&
      candidate.subcommand === subcommand,
  );
  if (!route) return null;

  const args = [...(route.fixedArgs ?? [])];
  const flags: Record<string, string | boolean> = {};
  for (const option of route.options ?? []) {
    const value = readOption(interaction, option);
    if (value === null || value === undefined || option.target === 'mention') continue;
    if (option.target === 'flag') {
      if (option.kind !== 'boolean' || value === true) {
        flags[option.targetName ?? option.name] = typeof value === 'boolean' ? value : String(value);
      }
      continue;
    }
    if (option.target === 'true-arg') {
      if (value === true) args.push(option.targetName ?? option.name);
      continue;
    }
    args.push(String(value));
  }
  return { route, parsed: { name: route.legacyCommand, args, flags } };
}

function readOption(interaction: ChatInputCommandInteraction<'cached'>, option: SlashOptionSpec) {
  switch (option.kind) {
    case 'string':
      return interaction.options.getString(option.name, option.required ?? false);
    case 'integer':
      return interaction.options.getInteger(option.name, option.required ?? false);
    case 'boolean':
      return interaction.options.getBoolean(option.name, option.required ?? false);
    case 'user':
      return interaction.options.getUser(option.name, option.required ?? false);
    case 'channel':
      return interaction.options.getChannel(option.name, option.required ?? false);
  }
}

function groupDescription(root: string, group: string): string {
  const descriptions: Record<string, string> = {
    'collection:wishlist': 'Gerencie sua lista de personagens desejados',
    'collection:anime': 'Gerencie o anime que você deseja acompanhar',
    'market:auction': 'Gerencie leilões de personagens',
    'global:showcase': 'Gerencie sua vitrine global',
    'setup:channels': 'Gerencie os canais permitidos no servidor',
    'admin:character': 'Gerencie personagens do catálogo',
    'admin:image': 'Gerencie imagens dos personagens',
    'admin:coins': 'Gerencie o saldo de jogadores',
    'admin:market': 'Gerencie o estoque oficial do mercado',
    'admin:vip': 'Gerencie assinaturas VIP',
  };
  return descriptions[`${root}:${group}`] ?? `Gerencie ${group}`;
}

const groupDescriptionLocalizations: Record<string, DescriptionLocalizations> = {
  'collection:wishlist': { 'en-US': 'Manage your character wishlist', 'es-ES': 'Administra tu lista de personajes deseados', ja: 'キャラクターのほしいものリストを管理します' },
  'collection:anime': { 'en-US': 'Manage the anime you want to follow', 'es-ES': 'Administra el anime que quieres seguir', ja: 'フォローするアニメを管理します' },
  'market:auction': { 'en-US': 'Manage character auctions', 'es-ES': 'Administra subastas de personajes', ja: 'キャラクターオークションを管理します' },
  'global:showcase': { 'en-US': 'Manage your global showcase', 'es-ES': 'Administra tu vitrina global', ja: 'グローバルショーケースを管理します' },
  'setup:channels': { 'en-US': 'Manage allowed server channels', 'es-ES': 'Administra los canales permitidos del servidor', ja: 'サーバーで許可するチャンネルを管理します' },
  'admin:character': { 'en-US': 'Manage catalog characters', 'es-ES': 'Administra personajes del catálogo', ja: 'カタログのキャラクターを管理します' },
  'admin:image': { 'en-US': 'Manage character images', 'es-ES': 'Administra imágenes de personajes', ja: 'キャラクター画像を管理します' },
  'admin:coins': { 'en-US': 'Manage player balances', 'es-ES': 'Administra saldos de jugadores', ja: 'プレイヤーの残高を管理します' },
  'admin:market': { 'en-US': 'Manage official market stock', 'es-ES': 'Administra el inventario oficial del mercado', ja: '公式マーケットの在庫を管理します' },
  'admin:vip': { 'en-US': 'Manage VIP subscriptions', 'es-ES': 'Administra suscripciones VIP', ja: 'VIPサブスクリプションを管理します' },
};

const optionDescriptionLocalizations: Record<string, DescriptionLocalizations> = {
  tipo: { 'en-US': 'Select the type', 'es-ES': 'Selecciona el tipo', ja: '種類を選択します' },
  nsfw: { 'en-US': 'Include adult content', 'es-ES': 'Incluye contenido para adultos', ja: '成人向けコンテンツを含めます' },
  anime: { 'en-US': 'Enter the anime name', 'es-ES': 'Escribe el nombre del anime', ja: 'アニメ名を入力します' },
  usuario: { 'en-US': 'Select a player', 'es-ES': 'Selecciona un jugador', ja: 'プレイヤーを選択します' },
  personagem: { 'en-US': 'Enter the character identifier', 'es-ES': 'Escribe el identificador del personaje', ja: 'キャラクターIDを入力します' },
  ordem: { 'en-US': 'Select the sorting criterion', 'es-ES': 'Selecciona el criterio de orden', ja: '並び順を選択します' },
  coins: { 'en-US': 'Enter the coin amount', 'es-ES': 'Escribe la cantidad de coins', ja: 'コイン数を入力します' },
  aposta: { 'en-US': 'Enter the wager amount', 'es-ES': 'Escribe el valor de la apuesta', ja: '賭け金を入力します' },
  raridade: { 'en-US': 'Select a rarity', 'es-ES': 'Selecciona una rareza', ja: 'レアリティを選択します' },
  meu: { 'en-US': 'Enter your character name or ID', 'es-ES': 'Escribe el nombre o ID de tu personaje', ja: '自分のキャラクター名かIDを入力します' },
  dele: { 'en-US': 'Enter the other character name or ID', 'es-ES': 'Escribe el nombre o ID del otro personaje', ja: '相手のキャラクター名かIDを入力します' },
  leilao: { 'en-US': 'Enter the auction ID', 'es-ES': 'Escribe el ID de la subasta', ja: 'オークションIDを入力します' },
  lance: { 'en-US': 'Enter the starting bid', 'es-ES': 'Escribe la puja inicial', ja: '開始入札額を入力します' },
  valor: { 'en-US': 'Enter the amount', 'es-ES': 'Escribe el valor', ja: '金額を入力します' },
  compra_imediata: { 'en-US': 'Enter the instant purchase price', 'es-ES': 'Escribe el precio de compra inmediata', ja: '即時購入価格を入力します' },
  horas: { 'en-US': 'Enter the duration in hours', 'es-ES': 'Escribe la duración en horas', ja: '期間を時間で入力します' },
  metrica: { 'en-US': 'Select the ranking metric', 'es-ES': 'Selecciona la métrica de clasificación', ja: 'ランキング指標を選択します' },
  posicao: { 'en-US': 'Enter the showcase position', 'es-ES': 'Escribe la posición de la vitrina', ja: 'ショーケースの位置を入力します' },
  plano: { 'en-US': 'Select a VIP plan', 'es-ES': 'Selecciona un plan VIP', ja: 'VIPプランを選択します' },
  idioma: { 'en-US': 'Select a language', 'es-ES': 'Selecciona un idioma', ja: '言語を選択します' },
  modo: { 'en-US': 'Select the storage mode', 'es-ES': 'Selecciona el modo de almacenamiento', ja: '保存モードを選択します' },
  prefixo: { 'en-US': 'Enter a legacy prefix up to three characters', 'es-ES': 'Escribe un prefijo legado de hasta tres caracteres', ja: '3文字以内の従来プレフィックスを入力します' },
  minutos: { 'en-US': 'Enter the interval in minutes', 'es-ES': 'Escribe el intervalo en minutos', ja: '間隔を分で入力します' },
  canal: { 'en-US': 'Select a channel', 'es-ES': 'Selecciona un canal', ja: 'チャンネルを選択します' },
  url: { 'en-US': 'Enter the image address', 'es-ES': 'Escribe la dirección de la imagen', ja: '画像URLを入力します' },
  principal: { 'en-US': 'Set the image as primary', 'es-ES': 'Define la imagen como principal', ja: 'メイン画像に設定します' },
  imagem: { 'en-US': 'Enter the image ID', 'es-ES': 'Escribe el ID de la imagen', ja: '画像IDを入力します' },
  todos: { 'en-US': 'Apply the operation to every player', 'es-ES': 'Aplica la operación a todos los jugadores', ja: 'すべてのプレイヤーに適用します' },
  quantidade: { 'en-US': 'Enter the amount', 'es-ES': 'Escribe la cantidad', ja: '数量を入力します' },
  preco: { 'en-US': 'Enter the sale price', 'es-ES': 'Escribe el precio de venta', ja: '販売価格を入力します' },
  estoque: { 'en-US': 'Enter the stock item ID', 'es-ES': 'Escribe el ID del artículo en inventario', ja: '在庫アイテムIDを入力します' },
  dias: { 'en-US': 'Enter the duration in days', 'es-ES': 'Escribe la duración en días', ja: '期間を日数で入力します' },
};
