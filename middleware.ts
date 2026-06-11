import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/apply/(.*)",
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Match all paths except static files; explicitly include "/"
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
