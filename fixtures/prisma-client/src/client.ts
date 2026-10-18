import { PrismaClient } from "@prisma/client";

const globalForLedger = globalThis as unknown as { client?: PrismaClient };

export const ledgerClient = globalForLedger.client ?? new PrismaClient();
