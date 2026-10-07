import jwt from "jsonwebtoken";

export const WALLETS = {
  ADMIN: "0xd59c546811e9f6df6b09ec3a63d0da98d2a2093c",
  OFFICER: "0x8085d31a8ff75cfe446cfbcafcfddb2db0c46bc6",
  INVESTIGATOR: "0x680b318d16809581ba93270fa6cb8b0be09dd9ce",
  JUDICIARY: "0x99b5506c0438b846e27251249acf8604f04d513f",
  NONE: "0x000000000000000000000000000000000000dead"
};

/** Mints the same session token /api/auth/verify issues, for a given wallet. */
export function tokenFor(wallet) {
  return jwt.sign({ wallet: wallet.toLowerCase() }, process.env.JWT_SECRET, {
    expiresIn: "1h"
  });
}

/** `Authorization` header for a role, using that role's canonical wallet. */
export function authHeader(role) {
  return { Authorization: `Bearer ${tokenFor(WALLETS[role])}` };
}
