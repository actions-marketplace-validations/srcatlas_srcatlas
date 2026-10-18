import { Controller, Get } from "@nestjs/common";

@Controller("assets")
export class AssetsController {
  @Get("files/*") anyFile() {}
  @Get("files/*rest") namedFile() {}
}
