import * as lib from "./other-lib";

@lib.Injectable()
export class NamespaceService {}

@lib.Controller("namespace")
export class NamespaceController {
  @lib.MessagePattern("sum") sum() {}
  @lib.Get() list() {}
}

@lib.Module({ providers: [NamespaceService] })
export class NamespaceModule {}
