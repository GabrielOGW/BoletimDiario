// Loader mínimo: resolve o alias "@/..." para caminhos do projeto (.ts/.tsx).
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const root = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let p = resolvePath(root, specifier.slice(2));
    if (!existsSync(p)) {
      if (existsSync(p + '.ts')) p += '.ts';
      else if (existsSync(p + '.tsx')) p += '.tsx';
      else if (existsSync(resolvePath(p, 'index.ts'))) p = resolvePath(p, 'index.ts');
    }
    return nextResolve(pathToFileURL(p).href, context);
  }
  return nextResolve(specifier, context);
}
