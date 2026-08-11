import { BoletimListView } from '@/features/boletins/BoletimListView';

/**
 * `/` continua sendo o Boletim de Câmera local — a mesma tela de `/legado`.
 *
 * É o `start_url` do PWA já instalado no aparelho de quem usa o app em set. Trocá-lo pela
 * plataforma custaria um toque a mais, todo dia, para chegar nos boletins que já estão no
 * aparelho — e a regra número um do roadmap é que o Boletim de Câmera não regride, nem em
 * toques. Quando `/` passar a ser sensível à sessão, será na Fase 11, que é onde o caminho
 * curto até a anotação é o assunto (ADR-032).
 */
export default function HomePage() {
  return <BoletimListView />;
}
