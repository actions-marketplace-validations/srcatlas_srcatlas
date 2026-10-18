import { Injectable } from "@nestjs/common";

@Injectable()
export class RepoService {
  private readonly widgetRepo = { findMany: () => [] as unknown[] };

  list() {
    return this.widgetRepo.findMany();
  }
}
