'use client';

import { useEffect, useRef, useState } from 'react';

import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';

interface DebouncedTextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  /** Sugestões de `<datalist>` — aceleram sem travar a digitação. */
  options?: readonly string[];
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Campo de várias linhas (observações). */
  multiline?: boolean;
  rows?: number;
  className?: string;
  onCommit: (valor: string) => void;
}

/**
 * Campo de texto com auto-save de 500 ms e flush no desmonte.
 *
 * É o contrato do `useBoletim`, e é ele que faz o app não ter botão salvar — o
 * comportamento validado em set. A coalescência da fila de sync cuida de o debounce não
 * virar uma dezena de operações.
 *
 * Nasceu privado dentro de `features/camera/TakeRow.tsx`. Virou componente quando o Som
 * precisou do mesmo comportamento: dois auto-saves com temporizadores levemente diferentes
 * seriam dois módulos perdendo tecla de jeitos diferentes, e o segundo a errar é sempre o
 * que ninguém testou.
 */
export function DebouncedTextField({
  label,
  value,
  placeholder,
  disabled,
  options,
  inputMode,
  autoCapitalize,
  multiline,
  rows,
  className,
  onCommit,
}: DebouncedTextFieldProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<string | null>(null);
  const commit = useRef(onCommit);

  commit.current = onCommit;

  // Valor de fora (pull, outro dispositivo) só entra quando não há edição pendente:
  // sobrescrever o que o dedo está digitando é a pior coisa que uma tela de set faz.
  useEffect(() => {
    if (pendente.current === null) setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendente.current !== null) commit.current(pendente.current);
    };
  }, []);

  const aoDigitar = (valor: string) => {
    setLocal(valor);
    pendente.current = valor;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      commit.current(valor);
      pendente.current = null;
    }, 500);
  };

  if (multiline) {
    return (
      <TextAreaField
        label={label}
        value={local}
        placeholder={placeholder}
        rows={rows}
        className={className}
        onChange={aoDigitar}
      />
    );
  }

  return (
    <TextField
      label={label}
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      options={options}
      inputMode={inputMode}
      autoCapitalize={autoCapitalize}
      className={className}
      onChange={aoDigitar}
    />
  );
}
