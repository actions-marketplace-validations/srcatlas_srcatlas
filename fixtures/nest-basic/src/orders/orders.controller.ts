import { Controller, Delete, Get, Patch, Post, Put } from "@nestjs/common";
import type { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get() findAll() {}
  @Post() create() {}
  @Get(":id") findOne() {}
  @Put(":id") replace() {}
  @Patch(":id") update() {}
  @Delete(":id") remove() {}
}
