import type { Metadata } from "next";
import { DashboardScreen } from "@/components/app/DashboardScreen";

export const metadata: Metadata = {
  title: "Overview",
  description: "Your live connection dashboard — run a real speed test and track history.",
};

export default function DashboardPage() {
  return <DashboardScreen />;
}
