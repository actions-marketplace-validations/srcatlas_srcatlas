// Stands in for a library that exports NestJS-looking names. It is not NestJS.
export function Module(_metadata: object) {
  return (target: unknown) => target;
}
export function Injectable() {
  return (target: unknown) => target;
}
export function Controller(_path?: string) {
  return (target: unknown) => target;
}
export function Get(_path?: string) {
  return (_target: object, _key: string) => {};
}
export function MessagePattern(_pattern: string) {
  return (_target: object, _key: string) => {};
}
export const NestFactory = {
  create: (_module: unknown) => ({ setGlobalPrefix: (_prefix: string) => {} }),
};
