import { Module } from "@nestjs/common";
import { FakeService } from "./fake.service";
import { LiteralService } from "./literal.service";
import { PoolService } from "./pool.service";
import { QueryService } from "./query.service";
import { RepoService } from "./repo.service";
import { StoreService } from "./store.service";

@Module({
  providers: [
    FakeService,
    LiteralService,
    QueryService,
    RepoService,
    PoolService,
    StoreService,
  ],
})
export class ShopModule {}
