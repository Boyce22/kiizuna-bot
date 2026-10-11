// Parâmetros de apresentação (paginação, timeouts de coletor). Centralizados para
// evitar números mágicos espalhados pelos comandos.
export const ui = {
  pagination: {
    collectionPageSize: 1, // 1 personagem por página (estilo galeria, com imagem)
    wishlistPageSize: 10, // lista de desejos em texto (várias linhas por página)
    defaultTimeoutMs: 120_000, // tempo até desabilitar a navegação por botão
  },
  timeouts: {
    duelChallengeMs: 60_000, // tempo para o desafiado aceitar/recusar um duelo
  },
  blackjack: {
    // Thumbnail dos embeds de blackjack (lobby/jogo/resultado): arquivo local anexado à
    // mensagem e referenciado via attachment://. Caminho relativo à raiz do projeto.
    // Deixe thumbnailPath = '' para não mostrar imagem.
    thumbnailPath: 'assets/blackjack.png',
    thumbnailName: 'blackjack.png',
  },
};

export type UiConfig = typeof ui;
