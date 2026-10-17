import { Module } from "some-other-lib";
import { OrdersModule } from "../orders/orders.module";

@Module({ imports: [OrdersModule] })
export class ForeignModule {}
