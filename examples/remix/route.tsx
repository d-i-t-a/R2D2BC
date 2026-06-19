import { lazy, Suspense } from "react";
import type { Route } from "./+types/route";

/**
 * Remix route for the EPUB reader.
 *
 * In React Router v7 (Remix), file-based routing maps this file to
 * a URL segment. For example, placing it at:
 *
 *   app/routes/reader.tsx  -->  /reader
 *
 * The reader component is lazy-loaded on the client only because
 * D2Reader requires `window` and `document` at import time.
 */

// --- Server loader: passes the manifest URL to the client ---

export function loader({ _request }: Route.LoaderArgs) {
  // In a real app, the manifest URL would come from a database,
  // CMS, or route parameter (e.g. /reader/:bookId).
  return {
    manifestUrl: "https://alice.dita.digital/manifest.json",
  };
}

// --- Route meta ---

export function meta() {
  return [
    { title: "EPUB Reader" },
    {
      name: "description",
      content: "DITA Toolkit EPUB reader — Remix example",
    },
  ];
}

// --- Lazy client-only import ---

/**
 * D2Reader accesses browser globals on import, so it cannot run
 * during SSR. We use React.lazy() so the module is only fetched
 * in the browser, and wrap it in <Suspense> for the loading state.
 *
 * Alternative approach using ClientOnly from remix-utils:
 *
 *   import { ClientOnly } from "remix-utils/client-only";
 *   ...
 *   <ClientOnly fallback={<Loading />}>
 *     {() => <EpubReader manifestUrl={manifestUrl} />}
 *   </ClientOnly>
 */
const EpubReader = lazy(() => import("./EpubReader"));

// --- Route component ---

export default function ReaderRoute({ loaderData }: Route.ComponentProps) {
  const { manifestUrl } = loaderData;

  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontFamily: "system-ui, sans-serif",
            color: "#49454f",
          }}
        >
          Loading reader...
        </div>
      }
    >
      <EpubReader manifestUrl={manifestUrl} />
    </Suspense>
  );
}
