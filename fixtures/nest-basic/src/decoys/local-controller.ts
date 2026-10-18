import type { OrdersService } from "../orders/orders.service";

// A Controller and a Get that are local functions, not the NestJS ones.
function Controller(_path: string) {
  return (target: unknown) => target;
}

function Get(_path?: string) {
  return (_target: object, _key: string) => {};
}

@Controller("decoys")
export class LocalController {
  constructor(private readonly orders: OrdersService) {}

  @Get() list() {}
}
