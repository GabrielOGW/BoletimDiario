import type { Metadata } from 'next';
import Link from 'next/link';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchIcon } from '@/components/ui/icons';
import { requireMember } from '@/lib/auth/guards';
import {
  LIMITE_DE_BUSCA,
  palavrasDoTermo,
  searchProduction,
  type SearchHit,
} from '@/lib/db/queries/search';
import { BuscaForm } from '@/features/production/BuscaForm';
import { formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Buscar na produção' };

/**
 * A busca da **produção inteira** — o último item da Fase 8.
 *
 * Server Component lendo Drizzle, como toda tela de sala: **exige rede**, e isso é uma
 * escolha, não uma limitação ([ADR-036](../../../../../docs/decisions.md)). A busca que
 * precisa funcionar sem sinal é a **da diária**, que é local e já existe na visão
 * consolidada; esta alcança o que este aparelho nunca baixou, e não haveria como fazê-lo
 * offline.
 *
 * As duas respondem igual — cada palavra do termo precisa aparecer — e cada uma leva à
 * outra com o termo na mão. O que elas nunca fazem é virar uma lista só: metade dela
 * sumiria quando a rede caísse, e uma busca que encolhe em silêncio faz alguém concluir
 * "isso não existe".
 */
export default async function BuscaPage({
  params,
  searchParams,
}: {
  params: Promise<{ productionId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { productionId } = await params;
  const { q } = await searchParams;

  await requireMember(productionId);

  const termo = (q ?? '').trim();
  const temTermo = palavrasDoTermo(termo).length > 0;
  const resultados = temTermo ? await searchProduction({ productionId, termo }) : [];

  const porDiaria = agrupaPorDiaria(resultados);

  return (
    <>
      <AppHeader
        title="Buscar"
        subtitle="Em todas as diárias da produção"
        backHref={`/p/${productionId}`}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <BuscaForm productionId={productionId} termo={termo} />

        {!temTermo ? (
          <EmptyState
            icon={<SearchIcon size={40} />}
            title="O que você está procurando?"
            description="Cartão, nome de arquivo, roll, cena, plano ou uma nota de qualquer departamento. Esta busca alcança todas as diárias e precisa de rede — a busca da diária aberta é local e funciona sem sinal."
          />
        ) : resultados.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={40} />}
            title={`Nada encontrado para “${termo}”`}
            description="A busca varreu todas as diárias desta produção. Cada palavra do termo precisa aparecer — com menos palavras, ela encontra mais."
          />
        ) : (
          <>
            <p className="px-1 text-sm text-zinc-500">
              {resultados.length === LIMITE_DE_BUSCA
                ? `Mostrando os ${LIMITE_DE_BUSCA} primeiros. Acrescente uma palavra para estreitar.`
                : `${resultados.length} ${resultados.length === 1 ? 'take' : 'takes'} em ${porDiaria.length} ${porDiaria.length === 1 ? 'diária' : 'diárias'}.`}
            </p>

            {porDiaria.map((grupo) => (
              <SectionCard
                key={grupo.chave}
                title={grupo.titulo}
                action={
                  grupo.shootingDayId ? (
                    <Link
                      href={`/p/${productionId}/diarias/${grupo.shootingDayId}/consolidado?q=${encodeURIComponent(termo)}`}
                      className="text-xs font-medium text-brand underline underline-offset-2"
                    >
                      Abrir diária
                    </Link>
                  ) : null
                }
              >
                <ul className="flex flex-col gap-2.5">
                  {grupo.hits.map((hit) => (
                    <li
                      key={hit.takeId}
                      className="rounded-xl border border-line bg-surface-raised px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-zinc-100">
                        Cena {hit.cena}
                        {hit.bloco ?? ''} · Plano {hit.plano} · Take {hit.take}
                      </p>
                      {hit.camera ? (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          <span className="text-zinc-500">Câmera: </span>
                          {hit.camera}
                        </p>
                      ) : null}
                      {hit.som ? (
                        <p className="text-xs text-zinc-400">
                          <span className="text-zinc-500">Som: </span>
                          {hit.som}
                        </p>
                      ) : null}
                      {hit.nota ? (
                        <p className="mt-0.5 break-words text-xs italic text-zinc-500">
                          {hit.nota}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ))}
          </>
        )}
      </PageContainer>
    </>
  );
}

interface GrupoDeDiaria {
  chave: string;
  titulo: string;
  shootingDayId: string | null;
  hits: SearchHit[];
}

/**
 * Resultado agrupado por diária, na ordem que a consulta já devolveu.
 *
 * Agrupar, e não listar corrido, é o que faz o resultado ser lido: "cena 24, take 3" só
 * quer dizer alguma coisa depois de saber **de que dia** ele é. Setup órfão — plano sem
 * diária — cai num grupo próprio em vez de sumir.
 */
function agrupaPorDiaria(hits: SearchHit[]): GrupoDeDiaria[] {
  const grupos: GrupoDeDiaria[] = [];

  for (const hit of hits) {
    const chave = hit.shootingDayId ?? 'sem-diaria';
    const atual = grupos[grupos.length - 1];

    if (atual && atual.chave === chave) {
      atual.hits.push(hit);
      continue;
    }

    grupos.push({
      chave,
      shootingDayId: hit.shootingDayId,
      titulo: hit.date
        ? `${hit.dayNumber ? `Diária ${hit.dayNumber} · ` : ''}${formatDiaria(hit.date)}`
        : 'Sem diária',
      hits: [hit],
    });
  }

  return grupos;
}
