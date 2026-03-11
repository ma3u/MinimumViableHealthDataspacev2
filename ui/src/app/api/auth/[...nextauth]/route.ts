import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// Log configuration on startup (server-side only)
if (typeof window === "undefined") {
  console.log("[NextAuth] Configuration loaded:");
  console.log("  NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
  console.log("  KEYCLOAK_CLIENT_ID:", process.env.KEYCLOAK_CLIENT_ID);
  console.log("  KEYCLOAK_ISSUER:", process.env.KEYCLOAK_ISSUER);
  console.log("  KEYCLOAK_PUBLIC_URL:", process.env.KEYCLOAK_PUBLIC_URL);
}

export { handler as GET, handler as POST };
