import { PlainStaticModule } from "./plain-static.module";

// Looks like a dynamic module factory, but the class is not a @Module: no node, no edge.
export class FakeFactory {
  static forRoot() {
    return { module: FakeFactory, providers: [PlainStaticModule] };
  }
}
