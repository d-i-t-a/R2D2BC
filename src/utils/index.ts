/**
 *
 * Timer function that you can 'await' on
 */
import log from "loglevel";

export function delay(t: number, v?: any): Promise<any> {
  return new Promise(function (resolve) {
    setTimeout(resolve.bind(null, v), t);
  });
}

const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
log.setLevel(IS_DEV ? "trace" : "warn", true);
