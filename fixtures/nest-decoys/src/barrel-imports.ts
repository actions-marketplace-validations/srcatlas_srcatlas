import { Controller, Get, Injectable, Module } from "./barrel";

@Injectable()
export class BarrelService {}

@Controller("barrel")
export class BarrelController {
  constructor(private readonly service: BarrelService) {}

  @Get() list() {}
}

@Module({ controllers: [BarrelController], providers: [BarrelService] })
export class BarrelModule {}
