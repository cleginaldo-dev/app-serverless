import crypto from 'node:crypto';

export function UuidV4() {
  return crypto.randomUUID();
}
