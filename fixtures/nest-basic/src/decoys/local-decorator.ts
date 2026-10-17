import { OrdersService } from "../orders/orders.service";

// A decorator called Module that is not the NestJS one.
function Module(_metadata: { providers?: unknown[] }) {
  return (target: unknown) => target;
}

@Module({ providers: [OrdersService] })
export class LocalDecoratorModule {}
