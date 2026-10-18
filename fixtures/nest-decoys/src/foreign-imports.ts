import { Controller, Get, Injectable, Module } from "./other-lib";

@Injectable()
export class ForeignService {}

@Controller("foreign")
export class ForeignController {
  @Get() list() {}
}

@Module({ controllers: [ForeignController], providers: [ForeignService] })
export class ForeignModule {}
