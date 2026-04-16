"use client";

import { createContext, useContext } from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

const DemoSession: Session = {
  user: { name: "Demo User", email: "demo@itu.int", image: null },
  expires: "2099-12-31",
};

const DemoContext = createContext(DemoSession);

export const useDemoSession = () => useContext(DemoContext);

export default function DemoSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoContext.Provider value={DemoSession}>
      <SessionProvider session={DemoSession}>{children}</SessionProvider>
    </DemoContext.Provider>
  );
}
