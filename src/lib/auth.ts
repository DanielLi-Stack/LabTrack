import { compare } from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import { redirect } from "next/navigation";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "LabTrack",
    credentials: { username: { label: "用户名", type: "text" }, password: { label: "密码", type: "password" } },
    async authorize(credentials) {
      const username = credentials?.username?.trim();
      if (!username || !credentials?.password) return null;
      const user = await db.userProfile.findUnique({ where: { username } });
      if (!user || user.status !== "ACTIVE" || !(await compare(credentials.password, user.passwordHash))) return null;
      return { id: user.id, name: user.name, email: user.email ?? undefined };
    }
  })],
  callbacks: {
    async jwt({ token, user }) { if (user) token.sub = user.id; return token; },
    async session({ session, token }) { if (session.user && token.sub) (session.user as { id?: string }).id = token.sub; return session; }
  }
};

export async function currentUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  return db.userProfile.findFirst({ where: { id, status: "ACTIVE" }, select: { id: true, name: true, username: true, role: true, email: true } });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
