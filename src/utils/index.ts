/**
 *
 * Timer function that you can 'await' on
 */
export function delay(t: number, v?: any): Promise<any> {
  return new Promise(function (resolve) {
    setTimeout(resolve.bind(null, v), t);
  });
}
