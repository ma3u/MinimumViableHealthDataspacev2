// eslint-disable-next-line @typescript-eslint/no-unused-vars
import NextAuth, { DefaultSession } from "next-auth";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
    roles: string[];
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface Profile {
    realm_access?: {
      roles?: string[];
    };
    preferred_username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    roles?: string[];
  }
}
