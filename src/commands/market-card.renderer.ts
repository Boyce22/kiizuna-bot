import { type Rarity,RARITY_COLORS } from '@config';
import { createCanvas, type Image, loadImage, type SKRSContext2D } from '@napi-rs/canvas';

// ------------------------------------------------------------
// LAYOUT (unidades l├│gicas ÔÇö o canvas f├¡sico ├® SCALE├ù maior)
// ------------------------------------------------------------

const SCALE = 2; // supersampling: renderiza em 2├ù e o Discord exibe n├¡tido em telas retina.

const CARD_W = 260;
const CARD_H = 332;
const IMG_H = 244;
const GAP = 16;
const COLS = 3;
const ROWS = 3;
const CARDS_PER_PAGE = COLS * ROWS;
const PADDING = 18;
const RADIUS = 12;

const CANVAS_W = PADDING * 2 + CARD_W * COLS + GAP * (COLS - 1);
const CANVAS_H = PADDING * 2 + CARD_H * ROWS + GAP * (ROWS - 1);

const IMG_W = CARD_W;

// ------------------------------------------------------------
// CORES
// ------------------------------------------------------------

const BG_COLOR = '#1a1b1e';
const CARD_BG = '#26282c';
const IMG_FALLBACK = '#15161a';
const TEXT_PRIMARY = '#f2f3f5';
const TEXT_SECONDARY = '#9a9ca1';
const TEXT_ACCENT = '#f5c14e';
const TEXT_CHIP = '#d6d8db';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

type Ctx = SKRSContext2D;

// ------------------------------------------------------------
// TIPOS
// ------------------------------------------------------------

export interface CardData {
  imageUrl: string | null;
  name: string;
  series: string | null;
  rarity: Rarity;
  price: number;
  listingId: number;
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function rarityColor(rarity: Rarity): string {
  const hex = RARITY_COLORS[rarity];
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function truncate(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}ÔÇª`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated.trimEnd()}ÔÇª`;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(1)}k`;
  return String(price);
}

const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

const imageCache = new Map<string, Image>();

async function loadImageCached(url: string): Promise<Image | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const img = await loadImage(url);
    imageCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// RENDERER
// ------------------------------------------------------------

export class MarketCardRenderer {
  async renderPage(cards: CardData[]): Promise<Buffer> {
    const canvas = createCanvas(CANVAS_W * SCALE, CANVAS_H * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Suaviza├º├úo m├íxima ao desenhar imagens redimensionadas.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (let i = 0; i < CARDS_PER_PAGE; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = PADDING + col * (CARD_W + GAP);
      const y = PADDING + row * (CARD_H + GAP);
      if (i < cards.length) {
        await this.drawCard(ctx, x, y, cards[i]);
      }
    }

    return canvas.toBuffer('image/png');
  }

  private async drawCard(ctx: Ctx, x: number, y: number, card: CardData): Promise<void> {
    const accent = rarityColor(card.rarity);

    // Sombra + corpo do card
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, y, CARD_W, CARD_H, RADIUS);
    ctx.fill();
    ctx.restore();

    // ├ürea da imagem
    const imgX = x;
    const imgY = y;

    ctx.save();
    roundRectTop(ctx, imgX, imgY, IMG_W, IMG_H, RADIUS);
    ctx.clip();

    ctx.fillStyle = IMG_FALLBACK;
    ctx.fillRect(imgX, imgY, IMG_W, IMG_H);

    if (card.imageUrl) {
      const img = await loadImageCached(card.imageUrl);
      if (img) drawCover(ctx, img, imgX, imgY, IMG_W, IMG_H);
    }

    // Fade inferior para legibilidade
    const grad = ctx.createLinearGradient(imgX, imgY + IMG_H - 60, imgX, imgY + IMG_H);
    grad.addColorStop(0, 'rgba(38,40,44,0)');
    grad.addColorStop(1, 'rgba(38,40,44,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(imgX, imgY + IMG_H - 60, IMG_W, 60);
    ctx.restore();

    // Barra de acento da raridade (rodap├® da imagem)
    ctx.fillStyle = accent;
    ctx.fillRect(imgX, imgY + IMG_H - 3, IMG_W, 3);

    // ÔöÇÔöÇ Texto ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
    const padX = 14;
    const textLeft = x + padX;
    const textRight = x + CARD_W - padX;
    const maxTextW = CARD_W - padX * 2;

    // Nome
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `600 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(truncate(ctx, card.name, maxTextW), textLeft, imgY + IMG_H + 26);

    // S├®rie
    let lineY = imgY + IMG_H + 26;
    if (card.series) {
      lineY += 18;
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(truncate(ctx, card.series, maxTextW), textLeft, lineY);
    }

    // Raridade (esquerda) + pre├ºo (direita)
    lineY = y + CARD_H - 16;

    ctx.fillStyle = accent;
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(RARITY_LABELS[card.rarity].toUpperCase(), textLeft, lineY);

    ctx.fillStyle = TEXT_ACCENT;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(card.price), textRight, lineY);

    // ID da listagem (canto superior esquerdo da imagem, em chip)
    const idLabel = `#${card.listingId}`;
    ctx.font = `600 11px ${FONT}`;
    const idW = ctx.measureText(idLabel).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, imgX + 8, imgY + 8, idW + 14, 20, 6);
    ctx.fill();
    ctx.fillStyle = TEXT_CHIP;
    ctx.textAlign = 'left';
    ctx.fillText(idLabel, imgX + 15, imgY + 22);
  }
}

// ------------------------------------------------------------
// DRAWING HELPERS
// ------------------------------------------------------------

/** Desenha `img` cobrindo (cover) o ret├óngulo destino, recortando o excedente e centralizando. */
function drawCover(ctx: Ctx, img: Image, dx: number, dy: number, dw: number, dh: number): void {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const targetAspect = dw / dh;
  const srcAspect = iw / ih;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (srcAspect > targetAspect) {
    sw = ih * targetAspect;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / targetAspect;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRectTop(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
