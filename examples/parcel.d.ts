/**
 * Parcel URL imports — `import x from "url:./file.css"` resolves
 * to the asset's output URL at build time.
 *
 * @see https://parceljs.org/features/dependency-resolution/#url-scheme
 */
declare module "url:*" {
  const url: string;
  export default url;
}
