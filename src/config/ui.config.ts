// Parâmetros de apresentação (paginação, timeouts de coletor). Centralizados para
// evitar números mágicos espalhados pelos comandos.
export const ui = {
  pagination: {
    collectionPageSize: 1, // 1 personagem por página (estilo galeria, com imagem)
    wishlistPageSize: 10, // lista de desejos em texto (várias linhas por página)
    defaultTimeoutMs: 120_000, // tempo até desabilitar a navegação por botão
  },
};

export type UiConfig = typeof ui;
