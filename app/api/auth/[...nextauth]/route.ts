// NextAuth v5 mounts both GET and POST handlers at this route — these
// are the OAuth redirect, callback, signout, and CSRF endpoints.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
