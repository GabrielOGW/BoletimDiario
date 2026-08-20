'use client';

import { useActionState, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Dispositivo } from '@/lib/auth/dispositivos';
import { SubmitButton } from '@/features/production/SubmitButton';
import { FormError } from '@/features/auth/AuthCard';

import { revogarDispositivoAction, revogarOutrosAction } from './actions';

/**
 * Onde a conta está aberta, e o botão para fechar o que não deveria.
 *
 * A sessão desta plataforma dura 90 dias de propósito — reverificá-la para editar
 * quebraria o offline (ADR-025). Esta tela é a contrapartida: o aparelho que ficou no
 * táxi sai daqui, e sai **agora**, sem esperar três meses de expiração.
 *
 * O aparelho atual não tem botão de revogar. Ele tem "Sair", que é outra coisa e está no
 * cabeçalho — misturar os dois faria alguém se deslogar tentando derrubar o outro.
 */
export function DispositivosList({ dispositivos }: { dispositivos: Dispositivo[] }) {
  const [state, revogar] = useActionState(revogarDispositivoAction, {});
  const [outrosState, revogarOutros] = useActionState(revogarOutrosAction, {});
  const [confirmando, setConfirmando] = useState(false);

  const outros = dispositivos.filter((dispositivo) => !dispositivo.atual);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {dispositivos.map((dispositivo) => (
          <li
            key={dispositivo.token}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-zinc-100">
                <span className="truncate">{dispositivo.descricao}</span>
                {dispositivo.atual ? <Badge tone="brand">este aparelho</Badge> : null}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {dispositivo.ip ? `${dispositivo.ip} · ` : ''}
                entrou em {formata(dispositivo.criadoEm)} · vale até{' '}
                {formata(dispositivo.expiraEm)}
              </p>
            </div>

            {dispositivo.atual ? null : (
              <form action={revogar}>
                <input type="hidden" name="token" value={dispositivo.token} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Saindo…">
                  <span className="text-red-400">Desconectar</span>
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>

      <FormError>{state.error ?? outrosState.error}</FormError>

      {outros.length > 0 ? (
        <>
          <Button variant="ghost" fullWidth onClick={() => setConfirmando(true)}>
            <span className="text-red-400">
              Desconectar os outros {outros.length} aparelho
              {outros.length === 1 ? '' : 's'}
            </span>
          </Button>

          <ConfirmDialog
            open={confirmando}
            title="Desconectar os outros aparelhos?"
            description="Este aparelho continua conectado. Nos outros, será preciso entrar de novo — e isso exige rede, então não faça em locação sem sinal."
            confirmLabel="Desconectar"
            destructive
            onConfirm={() => {
              setConfirmando(false);
              revogarOutros();
            }}
            onCancel={() => setConfirmando(false)}
          />
        </>
      ) : null}
    </div>
  );
}

/** Data curta em pt-BR. Sem hora: o que se quer é reconhecer, não auditar. */
function formata(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
