import { Controller, Delete, Get, Patch, Post, Put } from "@nestjs/common";

@Controller("orders")
export class OrdersController {
  @Get() findAll() {}
  @Post() create() {}
  @Get(":id") findOne() {}
  @Put(":id") replace() {}
  @Patch(":id") update() {}
  @Delete(":id") remove() {}
}
