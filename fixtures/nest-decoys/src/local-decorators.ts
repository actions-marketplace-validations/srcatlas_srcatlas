function Module(_metadata: object) {
  return (target: unknown) => target;
}
function Injectable() {
  return (target: unknown) => target;
}
function Controller(_path?: string) {
  return (target: unknown) => target;
}
function Get(_path?: string) {
  return (_target: object, _key: string) => {};
}

@Injectable()
export class LocalService {}

@Controller("local")
export class LocalController {
  @Get() list() {}
}

@Module({ controllers: [LocalController], providers: [LocalService] })
export class LocalModule {}
