/**
 * Tipos mínimos para `require.context` (webpack). Usado em src/lib/optionalModules.ts
 * para importar módulos que outros agentes ainda podem não ter criado sem quebrar o build.
 */
interface AzimuthRequireContext {
  keys(): string[];
  (id: string): unknown;
  resolve(id: string): string;
  id: string;
}

declare namespace NodeJS {
  interface Require {
    context(
      directory: string,
      useSubdirectories: boolean,
      regExp: RegExp,
      mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once',
    ): AzimuthRequireContext;
  }
}
