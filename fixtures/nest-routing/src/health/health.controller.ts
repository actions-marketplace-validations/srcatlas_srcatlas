import { Controller, Get, Post } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health") check() {}
  @Post("health") poke() {}
  @Get("ping") ping() {}
  @Post("ping") pong() {}
}
