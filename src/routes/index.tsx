import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import Studio from "@/components/paint/Studio";

const APP_TITLE = "Aeternum Paint Studio";
const APP_DESCRIPTION =
  "A Procreate-grade touch-first digital painting and illustration studio.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: APP_TITLE },
      { name: "description", content: APP_DESCRIPTION },
      { property: "og:title", content: APP_TITLE },
      { property: "og:description", content: APP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
      },
      { name: "theme-color", content: "#121214" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly
      fallback={
        <div className="fixed inset-0 bg-[#121214]" aria-hidden="true" />
      }
    >
      <Studio />
    </ClientOnly>
  );
}
