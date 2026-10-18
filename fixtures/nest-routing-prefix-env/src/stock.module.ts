import { Controller, Get, Module } from "@nestjs/common";

@Controller("stock")
export class StockController {
  @Get() list() {}
}

@Module({ controllers: [StockController] })
export class StockModule {}
