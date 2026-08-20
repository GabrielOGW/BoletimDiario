'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ClapperboardIcon, UploadIcon } from '@/components/ui/icons';
import { countBoletins, groupBoletins } from '@/domain/platform/from-boletim';
import type { BoletimGroup } from '@/domain/platform/from-boletim';
import { loadAll } from '@/lib/storage';
import { useMounted } from '@/hooks/useMounted';

import { importarBoletinsAction, type ImportarResposta } from './actions';

/**
 * A importação dos boletins deste aparelho, vista de dentro do boletim.
 *
 * Ela mora aqui, ao lado dos boletins que importa, e não na sala (ADR-032): quem tem o que
 * importar está aqui. É opcional, e nada some depois — `bdc:boletins:v1` continua intacto
 * e as telas locais continuam funcionando (ADR-023).
 */
export function ImportarBoletins() {
  const montado = useMounted();
  const [grupos, setGrupos] = useState<BoletimGroup[]>([]);

  useEffect(() => {
    setGrupos(groupBoletins(loadAll()));
  }, []);

  if (!montado) {
    return <p className="py-8 text-center text-sm text-zinc-400">Lendo o aparelho…</p>;
  }

  if (grupos.length === 0) {
    return (
      <EmptyState
        icon={<ClapperboardIcon size={40} />}
        title="Nenhum boletim neste aparelho"
        description="Não há nada para importar. Os boletins que você criar aqui aparecem nesta tela."
        action={
          <Link href="/legado">
            <Button variant="secondary">Voltar aos boletins</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-zinc-400">
        Cada projeto vira uma <strong className="text-zinc-200">produção</strong> da qual
        você é dono, e cada boletim vira uma diária dela. Nada é apagado deste aparelho, e
        importar de novo não duplica: o que já subiu é reconhecido e o que falta é
        completado.
      </p>

      {grupos.map((grupo) => (
        <GrupoCard key={grupo.key} grupo={grupo} />
      ))}
    </div>
  );
}

function GrupoCard({ grupo }: { grupo: BoletimGroup }) {
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<ImportarResposta | null>(null);

  const contagem = countBoletins(grupo.boletins);

  async function importar() {
    setEnviando(true);
    try {
      setResposta(await importarBoletinsAction(grupo.boletins));
    } catch {
      setResposta({ status: 'ERRO', motivo: 'Não foi possível falar com o servidor.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SectionCard
      title={grupo.name}
      icon={<ClapperboardIcon size={18} />}
      action={
        resposta?.status === 'OK' ? (
          <Badge tone="approved">importado</Badge>
        ) : (
          <Button
            size="sm"
            variant="primary"
            leftIcon={<UploadIcon size={15} />}
            disabled={enviando}
            onClick={() => void importar()}
          >
            {enviando ? 'Importando…' : 'Importar'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {grupo.company ? <p className="text-sm text-zinc-400">{grupo.company}</p> : null}

        <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-5">
          <Numero rotulo="Diárias" valor={grupo.boletins.length} />
          <Numero rotulo="Cenas" valor={contagem.scenes} />
          <Numero rotulo="Planos" valor={contagem.setups} />
          <Numero rotulo="Takes" valor={contagem.takes} />
          <Numero rotulo="Aprovados" valor={contagem.approvedTakes} destaque />
        </dl>

        {resposta ? <Resultado resposta={resposta} /> : null}
      </div>
    </SectionCard>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd
        className={`text-lg font-semibold ${destaque ? 'text-approved' : 'text-zinc-100'}`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * O relatório do que entrou.
 *
 * Mostra o que **de fato** foi inserido, não o que foi enviado: com `on conflict do
 * nothing`, reimportar devolve zeros, e ver "0 takes novos" é a confirmação de que a
 * segunda importação não duplicou nada.
 */
function Resultado({ resposta }: { resposta: ImportarResposta }) {
  if (resposta.status === 'OK') {
    const { inseridos } = resposta;
    const nada = Object.values(inseridos).every((valor) => valor === 0);

    return (
      <div className="rounded-xl border border-approved/40 bg-approved-soft px-3.5 py-3 text-sm leading-relaxed text-zinc-200">
        {resposta.criada ? (
          <p>
            Produção <strong>{resposta.productionName}</strong> criada, com você como
            dono.
          </p>
        ) : (
          <p>
            Produção <strong>{resposta.productionName}</strong> já existia — completada
            sem sobrescrever nada.
          </p>
        )}

        <p className="mt-1 text-zinc-400">
          {nada
            ? 'Nada novo: tudo já estava lá.'
            : `Novos: ${inseridos.shootingDays} diária(s), ${inseridos.scenes} cena(s), ${inseridos.setups} plano(s), ${inseridos.takes} take(s).`}
        </p>

        <Link
          href={`/p/${resposta.productionId}`}
          className="mt-2 inline-block font-medium text-brand underline underline-offset-2"
        >
          Abrir a produção
        </Link>
      </div>
    );
  }

  const motivo =
    resposta.status === 'VAZIO'
      ? 'Não havia boletim legível neste grupo.'
      : resposta.status === 'GRANDE_DEMAIS'
        ? 'A base deste aparelho é grande demais para uma importação só. Exporte o backup para não perder nada e importe um projeto de cada vez.'
        : resposta.status === 'NAO_E_DONO'
          ? 'Já existe uma produção com este identificador e ela não é sua. Renomeie o projeto no boletim e tente de novo.'
          : resposta.motivo;

  return (
    <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm leading-relaxed text-red-200">
      {motivo}
    </p>
  );
}
