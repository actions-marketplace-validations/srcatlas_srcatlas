import { Controller, Get } from "@nestjs/common";
import { EventPattern, MessagePattern } from "@nestjs/microservices";

@Controller("listener")
export class ListenerController {
  @Get() status() {}
  @MessagePattern("sum") sum() {}
  @EventPattern("user.created") onUserCreated() {}
}
