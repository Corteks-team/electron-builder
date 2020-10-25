import * as PkgCloud from 'pkgcloud';
declare module 'pkgcloud' {
  namespace storage {
    interface Client {
      auth(
        callback: (err: any) => any,
      ): void;
    }
  }
}
