import { Injectable } from "@nestjs/common";
import type { LedgerDb } from "./ledger-db";

@Injectable()
export class RawService {
  constructor(private readonly ledger: LedgerDb) {}

  async run(sql: string) {
    await this.ledger.$queryRaw`SELECT 1`;
    await this.ledger.$executeRawUnsafe(sql);
    await this.ledger.$connect();
  }
}
