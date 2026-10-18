import { Injectable } from "@nestjs/common";
import type { LedgerDb } from "./ledger-db";

@Injectable()
export class PaymentsService {
  constructor(private readonly ledger: LedgerDb) {}

  async settle(data: object) {
    await this.ledger.$transaction(async (tx) => {
      await tx.payment.create({ data });
      await tx.invoice.update({ where: { id: 1 }, data });
    });
  }

  async refund(data: object) {
    await this.ledger.$transaction([
      this.ledger.payment.updateMany({ data }),
      this.ledger.refund.create({ data }),
    ]);
  }
}
