import { Injectable } from "@nestjs/common";

@Injectable()
export class StoreService {
  private readonly store: any = undefined;

  list() {
    return this.store.widget.findMany();
  }
}
