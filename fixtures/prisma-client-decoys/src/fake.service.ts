import { Injectable } from "@nestjs/common";
import { PrismaClient } from "./fake-client";

@Injectable()
export class FakeService {
  private readonly client = new PrismaClient();

  list() {
    return this.client.widget.findMany();
  }
}
