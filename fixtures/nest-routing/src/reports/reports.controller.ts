import { Controller, Get } from "@nestjs/common";

@Controller("reports")
export class ReportsController {
  @Get("daily") daily() {}
  @Get("/daily/") dailyAgain() {}
}

@Controller("reports")
export class ArchiveReportsController {
  @Get("daily") archived() {}
}
