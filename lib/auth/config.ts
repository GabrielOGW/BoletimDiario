/**
 * Configuração da Better Auth.
 *
 * Escolhida sobre o `Credentials` do Auth.js porque este último não gerencia senha:
 * hash, comparação, rate limit, token de reset e expiração ficariam por conta da
 * aplicação — a "autenticação caseira" que o projeto proíbe, com o agravante de parecer
 * coberta (ADR-004).
 *
 * Dois ajustes fazem este schema conviver com o do domínio, e nenhum é opcional:
 *
 * - `generateId: 'uuid'` — sem isso a Better Auth gera id em texto, e **toda** coluna
 *   `created_by`/`updated_by` do domínio, que é `uuid references users(id)`, perde a FK.
 * - `usePlural: true` — as tabelas do repositório são `users`/`sessions`, não
 *   `user`/`session`.
 */

import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db, schema } from '@/lib/db/client';

import { mailer } from './mailer';

const secret = process.env.BETTER_AUTH_SECRET;

if (!secret) {
  throw new Error(
    'BETTER_AUTH_SECRET não está definida. Gere uma com: openssl rand -base64 32',
  );
}

export const auth = betterAuth({
  appName: 'Boletim Audiovisual',
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }),

  advanced: {
    database: {
      generateId: 'uuid',
    },
  },

  emailAndPassword: {
    enabled: true,
    /**
     * Verificação de e-mail desligada: exigi-la sem provedor de envio trancaria todo
     * mundo do lado de fora. Volta a ser avaliada quando houver domínio (ADR-028).
     */
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,

    async sendResetPassword({ user, url }) {
      await mailer.send({
        to: user.email,
        subject: 'Redefinir sua senha — Boletim Audiovisual',
        text: [
          `Olá${user.name ? `, ${user.name}` : ''}.`,
          '',
          'Alguém pediu para redefinir a senha desta conta. Se não foi você, ignore',
          'esta mensagem — a senha atual continua valendo.',
          '',
          `Para escolher uma nova senha: ${url}`,
          '',
          'O link vale por 1 hora.',
        ].join('\n'),
      });
    },
  },

  session: {
    /**
     * 90 dias, renovados a cada semana de uso.
     *
     * Não é preguiça de segurança: a sessão persistir é o que sustenta a promessa de
     * offline (ADR-025) — em locação sem sinal, uma sessão expirada não tem como ser
     * renovada, e o profissional fica sem conseguir preencher a diária. Revogar
     * dispositivo perdido continua possível porque a sessão vive no banco, não num JWT.
     */
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24 * 7,
  },

  /** Precisa ser o último: escreve os cookies de sessão nas Server Actions do Next. */
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
