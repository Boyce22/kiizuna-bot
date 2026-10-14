import type { ErrorCode } from '../api-error-codes';
import { type Rarity, RARITY_EMOJI } from '@config';

import type { CharacterType } from '../character-types';
import type { TranslateFn } from '../interfaces';

/** Campos escolhidos por dropdown, comuns aos formulários de criar e de editar personagem. */
export interface CharacterPicks {
  rarity?: Rarity;
  type?: CharacterType;
  nsfw: boolean;
}

/** `customId` de cada dropdown do formulário. */
export interface PickIds {
  rarity: string;
  type: string;
  nsfw: string;
}

type PickHandler = (draft: CharacterPicks, value: string) => void;

/**
 * Tabela `customId → atualização do rascunho`. Um dropdown novo é uma linha aqui, sem mexer
 * no fluxo do coletor.
 */
export function pickHandlers(ids: PickIds): Record<string, PickHandler> {
  return {
    [ids.rarity]: (draft, value) => {
      draft.rarity = value as Rarity;
    },
    [ids.type]: (draft, value) => {
      draft.type = value as CharacterType;
    },
    [ids.nsfw]: (draft, value) => {
      draft.nsfw = value === '1';
    },
  };
}

export function rarityLabel(rarity: Rarity, t: TranslateFn): string {
  return `${RARITY_EMOJI[rarity]} ${t(`common.rarity.${rarity}`)}`;
}

/** O que o handler precisa de `ModalSubmitInteraction.fields` (permite validar sem Discord). */
export interface ModalFields {
  getTextInputValue(customId: string): string;
}

export interface AddCharInput {
  name: string;
  series: string | null;
  imageUrl: string;
  baseCharacterId: number | null;
}

const URL_RE = /^https?:\/\/\S+$/i;

export function isImageUrl(url: string): boolean {
  return URL_RE.test(url);
}

/** Valida os textos do modal de `addchar`; em erro, devolve a chave i18n da mensagem. */
export function parseAddCharModal(
  fields: ModalFields,
): { ok: true; input: AddCharInput } | { ok: false; key: string } {
  const imageUrl = fields.getTextInputValue('url').trim();
  if (!isImageUrl(imageUrl)) return { ok: false, key: 'addchar.invalid_url' };

  let baseCharacterId: number | null = null;
  const baseRaw = fields.getTextInputValue('base').trim();
  if (baseRaw) {
    const n = Number(baseRaw);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, key: 'addchar.invalid_base' };
    baseCharacterId = n;
  }

  return {
    ok: true,
    input: {
      name: fields.getTextInputValue('name').trim(),
      series: fields.getTextInputValue('series').trim() || null,
      imageUrl,
      baseCharacterId,
    },
  };
}

/** Motivo de recusa da API → chave i18n; o que não estiver aqui vira erro genérico. */
const ADDCHAR_ERROR_KEYS: Partial<Record<ErrorCode, string>> = {
  BASE_NOT_FOUND: 'addchar.base_not_found',
};

export function addCharErrorKey(code: ErrorCode): string {
  return ADDCHAR_ERROR_KEYS[code] ?? 'error.generic';
}
