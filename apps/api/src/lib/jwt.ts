import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@jumaah/shared';

export interface AccessClaims {
  sub: string;
  email: string;
  role: Role;
  tid: string | null;
  /** Set when a super admin is acting inside a tenant. */
  imp?: string;
}

const enc = new TextEncoder();

export async function signAccessToken(secret: string, claims: AccessClaims, ttlSeconds: number): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role, tid: claims.tid, imp: claims.imp })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('jumaah')
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(enc.encode(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret), { issuer: 'jumaah' });
  return {
    sub: String(payload.sub),
    email: String(payload.email),
    role: payload.role as Role,
    tid: (payload.tid as string | null) ?? null,
    imp: payload.imp as string | undefined,
  };
}
