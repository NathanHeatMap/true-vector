import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes that do NOT require authentication.
 * Candidate apply pages are public (they're the entry point for the workflow).
 */
const isPublicRoute = createRouteMatcher([
  "/", // landing
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/apply/(.*)", // candidate-facing apply pages
  "/api/webhooks/(.*)", // webhooks authenticate via signatures
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals + all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
