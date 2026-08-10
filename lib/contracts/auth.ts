/**
 * Contratos de autenticação.
 *
 * Importados pelo cliente (feedback imediato) e pelo servidor (decisão). A validação de
 * servidor **nunca** confia na de cliente: a de cliente existe só para não fazer o
 * usuário esperar uma requisição para descobrir que faltou o arroba.
 */

import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail')
  .max(255, 'E-mail longo demais')
  .email('E-mail inválido')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
  )
  .max(128, 'Senha longa demais');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Informe seu nome')
  .max(120, 'Nome longo demais');

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  /** Sem regra de tamanho: senha antiga curta ainda precisa conseguir entrar. */
  password: z.string().min(1, 'Informe a senha'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
