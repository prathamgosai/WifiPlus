import type { Metadata } from "next";
import { LoginScreen } from "@/components/app/LoginScreen";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your WifiPlus speed history across devices.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
