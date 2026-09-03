/**
 * The same 404 page, one boundary lower, so a public route's miss keeps the
 * site around it.
 *
 * Next renders a not-found in place of everything below the boundary that
 * catches it. With only `app/not-found.tsx`, that boundary is the app root,
 * so `/posts/<no such post>` replaced the header, the navigation and the
 * footer as well — a page with no way out except the links it draws itself.
 * Declaring the boundary here instead means the miss is caught inside
 * `(public)/layout.tsx`, and the chrome stays. Verified by screenshot both
 * ways; the status stays 404 in both.
 *
 * A RE-EXPORT RATHER THAN A COPY, because two 404 pages that drift apart is
 * exactly the failure this whole change is undoing. `app/not-found.tsx` still
 * has to exist — it is the only file Next consults for a URL that matches no
 * route at all, which is the other half of the problem and cannot be handled
 * from inside a route group.
 */
export { default, metadata } from "@/app/not-found";
