/**
 *
 * Timer function that you can 'await' on
 */
export function delay(t: number, v?: any): Promise<any> {
  return new Promise(function (resolve) {
    setTimeout(resolve.bind(null, v), t);
  });
}

export const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
