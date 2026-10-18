import { Injectable } from "@nestjs/common";

@Injectable()
export class LiteralService {
  // Named like a client, but it is an object with its own widget.findMany.
  private readonly prisma = { widget: { findMany: () => [] as unknown[] } };

  list() {
    return this.prisma.widget.findMany();
  }
}
