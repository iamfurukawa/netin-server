import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

export const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(24),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(24),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
