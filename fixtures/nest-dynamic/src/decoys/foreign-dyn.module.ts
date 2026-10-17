import { Module } from "some-other-lib";

@Module({})
export class ForeignDynModule {
  static forRoot() {
    return { module: ForeignDynModule, global: true };
  }
}
