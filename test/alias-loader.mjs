// Loader mínimo: resolve o alias "@/..." para caminhos do projeto (.ts/.tsx).
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

const root = process.cwd();

/** Caminho sem extensão → o arquivo real. Espelha a resolução do `moduleResolution` do TS. */
function completar(p) {
  if (existsSync(p) && !existsSync(resolvePath(p, 'index.ts'))) return p;
  if (existsSync(p + '.ts')) return p + '.ts';
  if (existsSync(p + '.tsx')) return p + '.tsx';
  if (existsSync(resolvePath(p, 'index.ts'))) return resolvePath(p, 'index.ts');
  return p;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const p = completar(resolvePath(root, specifier.slice(2)));
    return nextResolve(pathToFileURL(p).href, context);
  }

  // Import relativo sem extensão ou apontando para uma pasta com index.ts — o TS aceita,
  // o Node não. Só entra aqui depois de o Node falhar, então nada de código do runtime
  // muda de caminho por causa do teste.
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      const base = dirname(fileURLToPath(context.parentURL));
      const p = completar(resolvePath(base, specifier));
      if (p.endsWith('.ts') || p.endsWith('.tsx')) {
        return nextResolve(pathToFileURL(p).href, context);
      }
      throw error;
    }
  }

  return nextResolve(specifier, context);
}
