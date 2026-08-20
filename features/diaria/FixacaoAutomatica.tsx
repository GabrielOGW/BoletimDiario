'use client';

import { useEffect } from 'react';

import { diasParaFixar } from '@/lib/atalhos';
import { fetchAndPin } from '@/lib/sync/engine';

/**
 * Fixa hoje e amanhã em segundo plano (Fase 11 — a pendência declarada na Fase 4).
 *
 * Sem isto, o atalho "diária de hoje" leva a uma tela que **precisa de rede** para
 * carregar — e o momento em que alguém usa o atalho é justamente quando saiu de casa às
 * 5h para uma locação sem cobertura. Amanhã entra junto pelo mesmo motivo: a diária de
 * amanhã costuma começar antes de haver sinal.
 *
 * É a **ponte** entre a sala e a fronteira offline, e por isso mora em `features/diaria/`,
 * não em `features/production/`: fixar é trazer a diária para dentro do banco local. A
 * sala continua sem depender de Dexie para nada do que mostra — se a fixação falhar, esta
 * tela não muda de aparência, e é para isso que ela devolve `null` e engole o erro.
 */
export function FixacaoAutomatica({ dias }: { dias: { id: string; date: string }[] }) {
  /*
   * Os alvos são calculados no render — a função é pura e barata — e o efeito depende da
   * lista de ids como **string**. A lista de props chega como array novo a cada render; se
   * ela fosse a dependência, a fixação recomeçaria a cada re-render da sala.
   */
  const chave = diasParaFixar(dias).join(',');

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!chave) return;

    const alvos = chave.split(',');
    let cancelado = false;

    void (async () => {
      for (const id of alvos) {
        if (cancelado) return;
        try {
          // Já fixada continua sendo atualizada: chegar na locação com o dia de ontem
          // baixado seria o mesmo que não ter baixado nada.
          await fetchAndPin(id);
        } catch {
          // Sem rede ou sem permissão: a sala não muda, e a diária fixa quando abrir.
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [chave]);

  return null;
}
