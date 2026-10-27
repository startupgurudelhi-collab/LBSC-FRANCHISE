import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthTokenPayload } from '../types/index.js';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  secret: string = env.JWT_SECRET
): string {
  return jwt.sign(payload, secret, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(token: string, secret: string = env.JWT_SECRET): AuthTokenPayload {
  return jwt.verify(token, secret) as AuthTokenPayload;
}
