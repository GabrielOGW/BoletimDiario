import { Button } from '@/components/ui/Button';
import { SearchIcon } from '@/components/ui/icons';
import { TextField } from '@/components/ui/TextField';

/**
 * O campo da busca da produção — `<form method="get">`, sem estado e sem JavaScript.
 *
 * Não é a `SearchInput` da diária de propósito: aquela filtra o que já está na tela a cada
 * tecla, porque os dados estão no aparelho. Esta **vai ao servidor**, então o termo mora na
 * URL (`?q=`) — o resultado fica compartilhável, recarregável e volta pelo botão de voltar,
 * três coisas que um estado de componente não dá.
 */
export function BuscaForm({
  productionId,
  termo,
}: {
  productionId: string;
  termo?: string;
}) {
  return (
    <form
      action={`/p/${productionId}/busca`}
      method="get"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <TextField
        label="Buscar na produção"
        name="q"
        defaultValue={termo}
        type="search"
        placeholder="Cartão, arquivo, cena, nota…"
        autoCapitalize="none"
        className="flex-1"
        hint="Cada palavra precisa aparecer — “24 boom” acha o take da cena 24 com nota de boom."
      />
      <Button type="submit" variant="primary" leftIcon={<SearchIcon size={18} />}>
        Buscar
      </Button>
    </form>
  );
}
