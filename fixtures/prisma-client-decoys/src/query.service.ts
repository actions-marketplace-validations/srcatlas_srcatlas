import { Injectable } from "@nestjs/common";

@Injectable()
export class QueryService {
  private readonly db: any = undefined;

  list() {
    return this.db.query.widgets.findMany();
  }
}
