// Gera src/api-error-codes.ts a partir do catálogo publicado pela API (contracts/error-codes.json).
// Uso: npm run sync:errors [-- caminho/para/error-codes.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] ?? resolve(here, '../../kizuna/contracts/error-codes.json'));
const codes = Object.keys(JSON.parse(readFileSync(source, 'utf8')));
const body = codes.map((code) => `  ${code}: '${code}',`).join('\n');
writeFileSync(
  resolve(here, '../src/api-error-codes.ts'),
  `// Gerado por \`npm run sync:errors\` a partir de kizuna/contracts/error-codes.json. Não edite.
// Códigos que a API devolve em \`{ code }\` nas respostas de erro.
export const ErrorCode = Object.freeze({
${body}
});

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
`,
);
console.log(`${codes.length} códigos de ${source}`);
