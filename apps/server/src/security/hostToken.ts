import { hash, verify } from "@node-rs/argon2";
import { customAlphabet } from "nanoid";

const tokenAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const createToken = customAlphabet(tokenAlphabet, 40);

export function createHostToken(): string {
  return createToken();
}

export async function hashHostToken(token: string, pepper: string): Promise<string> {
  return hash(`${pepper}:${token}`, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyHostToken(token: string, tokenHash: string, pepper: string): Promise<boolean> {
  return verify(tokenHash, `${pepper}:${token}`);
}
