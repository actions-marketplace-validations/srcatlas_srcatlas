import { Injectable } from "@nestjs/common";
import { Pool } from "./fake-client";

@Injectable()
export class PoolService {
  // The name is in clientNames, but the type resolves to something that is not a Prisma client.
  private readonly db: Pool = new Pool();

  list() {
    return this.db.widget.findMany();
  }
}
