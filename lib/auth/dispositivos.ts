/**
 * Sessões por dispositivo — listar e revogar (Fase 10).
 *
 * A sessão dura 90 dias e **nunca é reverificada para editar**: é o que sustenta a
 * promessa de offline (ADR-025). O preço disso é que um telefone perdido continua entrando
 * na produção por três meses — e a resposta para isso não é encurtar a sessão, que
 * quebraria o offline, e sim **poder revogar**. Isso só existe porque a sessão vive no
 * banco e não num JWT: um JWT não tem como ser cancelado antes de expirar.
 *
 * Nada aqui decide autorização de produção; quem decide é `guards.ts`.
 */

import 'server-only';

import { headers } from 'next/headers';

import { auth } from './config';

export interface Dispositivo {
  /** Token da sessão — é o identificador que a revogação aceita. */
  token: string;
  /** Este é o aparelho onde a pessoa está agora. Não se revoga por engano. */
  atual: boolean;
  descricao: string;
  ip: string | null;
  criadoEm: string;
  expiraEm: string;
}

export async function listarDispositivos(): Promise<Dispositivo[]> {
  const cabecalhos = await headers();
  const [sessoes, atual] = await Promise.all([
    auth.api.listSessions({ headers: cabecalhos }),
    auth.api.getSession({ headers: cabecalhos }),
  ]);

  return sessoes
    .map((sessao) => ({
      token: sessao.token,
      atual: sessao.token === atual?.session.token,
      descricao: descreveAparelho(sessao.userAgent ?? null),
      ip: sessao.ipAddress || null,
      criadoEm: new Date(sessao.createdAt).toISOString(),
      expiraEm: new Date(sessao.expiresAt).toISOString(),
    }))
    .sort((a, b) => {
      if (a.atual !== b.atual) return a.atual ? -1 : 1;
      return b.criadoEm.localeCompare(a.criadoEm);
    });
}

export async function revogarDispositivo(token: string): Promise<void> {
  await auth.api.revokeSession({ body: { token }, headers: await headers() });
}

/** Sair de todos os outros — o botão para quando o aparelho já se foi. */
export async function revogarOutrosDispositivos(): Promise<void> {
  await auth.api.revokeOtherSessions({ headers: await headers() });
}

/**
 * User-agent → "Chrome no Android".
 *
 * Deliberadamente rasa e sem biblioteca: o que a pessoa precisa é reconhecer **qual dos
 * aparelhos dela** é aquele, e para isso "iPhone" e "Android" já bastam. Uma tabela de
 * quinhentos navegadores seria peso de manutenção para um problema que ninguém tem.
 */
export function descreveAparelho(userAgent: string | null): string {
  if (!userAgent) return 'Aparelho desconhecido';

  const sistema =
    [
      ['iPhone', 'iPhone'],
      ['iPad', 'iPad'],
      ['Android', 'Android'],
      ['Windows', 'Windows'],
      ['Mac OS X', 'Mac'],
      ['Macintosh', 'Mac'],
      ['Linux', 'Linux'],
    ].find(([marca]) => userAgent.includes(marca))?.[1] ?? null;

  // A ordem importa: todo navegador em Chromium diz "Safari", e o Edge diz "Chrome".
  const navegador =
    [
      ['Edg/', 'Edge'],
      ['OPR/', 'Opera'],
      ['SamsungBrowser', 'Samsung Internet'],
      ['Firefox', 'Firefox'],
      ['Chrome', 'Chrome'],
      ['Safari', 'Safari'],
    ].find(([marca]) => userAgent.includes(marca))?.[1] ?? null;

  if (navegador && sistema) return `${navegador} no ${sistema}`;
  return navegador ?? sistema ?? 'Aparelho desconhecido';
}
