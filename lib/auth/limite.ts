/**
 * Rate limit para o que **não** passa pelas rotas da Better Auth.
 *
 * A biblioteca limita `/api/auth/**` sozinha. O que ficou de fora é o resgate de código de
 * convite, que é Server Action — e é exatamente o lugar onde a força bruta compensa: o
 * código tem quatro caracteres depois do hífen sobre um alfabeto de 32, e o prefixo vem do
 * nome da produção, que quem quer entrar geralmente conhece. Sem limite, o espaço inteiro
 * cabe numa tarde ([permissions.md §4](../../docs/architecture/permissions.md#4-entrada-na-sala)).
 *
 * Usa a **mesma tabela** da Better Auth (`rate_limits`, migration `0008`), e não uma
 * paralela: um contador só é um lugar só para olhar quando alguém reclamar de ter sido
 * barrado — e um lugar só para limpar.
 *
 * Janela fixa ancorada na primeira tentativa contada. Não é a mais sofisticada; é a que
 * cabe num `insert … on conflict` só, e uma leitura seguida de uma escrita deixaria a
 * janela entre as duas — que é justamente onde o paralelismo entra.
 */

import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

export interface Veredito {
  permitido: boolean;
  /** Quanto falta para a janela virar. `0` quando permitido. */
  esperarSegundos: number;
}

export interface Regra {
  janelaSegundos: number;
  maximo: number;
}

/**
 * Conta uma tentativa e diz se ela passa.
 *
 * Contar **antes** de saber se deu certo é deliberado: contar só o fracasso deixaria a
 * porta aberta para quem acerta de vez em quando, e o custo para quem é de verdade é
 * nenhum — ninguém entra numa sala dez vezes por hora.
 */
export async function consomeTentativa(chave: string, regra: Regra): Promise<Veredito> {
  try {
    return await conta(chave, regra);
  } catch {
    /**
     * **Falha aberto**, e de propósito.
     *
     * O contador vive no mesmo Neon que o resto; um erro passageiro aqui derrubaria a
     * entrada na sala inteira. Um limitador que tranca todo mundo quando ele próprio
     * quebra transforma um defeito de contador em indisponibilidade — e a porta que ele
     * guarda já exige sessão e um código secreto.
     */
    return { permitido: true, esperarSegundos: 0 };
  }
}

async function conta(chave: string, regra: Regra): Promise<Veredito> {
  const agora = Date.now();
  const janelaMs = regra.janelaSegundos * 1000;

  const { rows } = await db.execute<{ count: number; last_request: string }>(sql`
    insert into rate_limits (key, count, last_request)
    values (${chave}, 1, ${agora})
    on conflict (key) do update set
      count = case
        when ${agora} - rate_limits.last_request >= ${janelaMs} then 1
        else rate_limits.count + 1
      end,
      last_request = case
        when ${agora} - rate_limits.last_request >= ${janelaMs} then ${agora}
        else rate_limits.last_request
      end
    returning count, last_request
  `);

  // `returning` sempre devolve uma linha; se não devolveu, quem decide é o `catch` de
  // cima, com a mesma política.
  const linha = rows[0];
  if (!linha) throw new Error('O contador não devolveu linha.');

  const contagem = Number(linha.count);
  const inicioDaJanela = Number(linha.last_request);

  // A faxina anda junto da **abertura** de janela, que é rara, e não de toda tentativa:
  // presa à tentativa, quem está sendo barrado faria o servidor varrer a tabela a cada
  // batida — trabalho feito em nome de quem já foi recusado.
  if (contagem === 1) await podaVencidos(agora);

  if (contagem <= regra.maximo) return { permitido: true, esperarSegundos: 0 };

  const restanteMs = inicioDaJanela + janelaMs - agora;
  return {
    permitido: false,
    esperarSegundos: Math.max(1, Math.ceil(restanteMs / 1000)),
  };
}

/**
 * Uma linha por chave, e chave nova a cada IP: sem poda, a tabela só cresce.
 *
 * A Better Auth também poda esta tabela — e o corte dela vem de `rateLimit.window`, não
 * das janelas de cada regra (ver `config.ts`). Esta poda aqui é a rede de segurança para
 * quando ninguém tocar em `/api/auth`: aí a limpeza da biblioteca simplesmente não roda.
 *
 * Vinte e quatro horas cobrem com folga a janela mais longa em uso, e a linha podada não
 * perdoa ninguém — quem passou do limite há um dia já teria recomeçado a contagem.
 *
 * Se um dia a tabela crescer a ponto de isso não bastar, o lugar certo é um cron — não
 * uma poda mais agressiva no caminho da requisição.
 */
const RETENCAO_MS = 24 * 60 * 60 * 1000;

async function podaVencidos(agora: number): Promise<void> {
  await db.execute(sql`
    delete from rate_limits where last_request < ${agora - RETENCAO_MS}
  `);
}

/**
 * Entrada por código: dez tentativas por hora, **por usuário**.
 *
 * Por usuário e não por IP porque a ação exige sessão: para ganhar paralelismo, quem
 * estiver adivinhando precisa de muitas contas — e criar conta já é limitado pela Better
 * Auth. Por IP puniria a equipe inteira atrás do mesmo roteador da base, que é o caso
 * normal e não o suspeito.
 */
export const LIMITE_DE_ENTRADA: Regra = { janelaSegundos: 60 * 60, maximo: 10 };

export const chaveDeEntrada = (userId: string) => `entrar-por-codigo:${userId}`;

/**
 * Zera a cota de quem acertou.
 *
 * Contar toda tentativa protege contra adivinhação, mas puniria o caso legítimo que se
 * parece com ela: o assistente de produção que entra em cinco salas numa tarde, ou quem
 * errou o código dez vezes antes de alguém ditar o certo. A propriedade contra força
 * bruta continua de pé — um acerto **encerra** o ataque, não o continua —, e o falso
 * positivo some.
 */
export async function esqueceTentativas(chave: string): Promise<void> {
  try {
    await db.execute(sql`delete from rate_limits where key = ${chave}`);
  } catch {
    // Falhar aqui só significa que a cota da pessoa segue contada. Não é motivo para
    // derrubar uma entrada que já deu certo.
  }
}

/** "Espere 13 minutos" é acionável; "espere 743 segundos" não é. */
export function emLinguagemDeGente(segundos: number): string {
  if (segundos < 60) return `${segundos} segundo${segundos === 1 ? '' : 's'}`;
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
}
