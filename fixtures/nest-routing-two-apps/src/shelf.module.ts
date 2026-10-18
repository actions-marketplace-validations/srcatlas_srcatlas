import { Controller, Get, Module } from "@nestjs/common";

@Controller("shelf")
export class ShelfController {
  @Get() list() {}
}

@Module({ controllers: [ShelfController] })
export class ShelfModule {}
