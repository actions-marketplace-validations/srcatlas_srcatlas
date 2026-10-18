import { Injectable } from "@nestjs/common";

@Injectable()
export class ReportsService {
  // Not injected and not typed: only its name says it might be a client.
  private readonly db: any = undefined;

  refunds() {
    return this.db.refund.findMany();
  }
}
