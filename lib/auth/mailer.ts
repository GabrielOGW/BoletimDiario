/**
 * Envio de e-mail transacional.
 *
 * A plataforma precisa de e-mail em **um** lugar só: recuperação de senha. Cadastro,
 * login, entrada em produção por código e o preenchimento da diária não dependem disso.
 *
 * Não há provedor configurado (ADR-028). O fluxo de reset está completo e o envio fica
 * atrás desta interface: quando houver domínio verificado, ligar um provedor é escrever
 * um segundo `Mailer` e trocar a linha do `export`. Nada do fluxo muda.
 *
 * Por que não provisionar um provedor agora: sem domínio próprio, o remetente não é
 * verificável e a entrega vai para spam — o que é pior do que não ter, porque aparenta
 * funcionar.
 */

import 'server-only';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Registra no log do servidor em vez de enviar.
 *
 * O link de redefinição é impresso com marcador próprio para ser encontrável nos logs
 * da Vercel. É deliberado que isso seja **visível e feio**: recuperação de senha que
 * depende de alguém ler log de servidor não deve parecer um estado normal do produto.
 */
class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.warn(
      [
        '',
        '═══ E-MAIL NÃO ENVIADO (sem provedor configurado) ═══',
        `  para:    ${mail.to}`,
        `  assunto: ${mail.subject}`,
        '',
        mail.text,
        '════════════════════════════════════════════════════',
        '',
      ].join('\n'),
    );
  }
}

export const mailer: Mailer = new ConsoleMailer();
