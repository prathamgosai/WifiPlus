import type { Metadata } from "next";
import { SettingsScreen } from "@/components/app/SettingsScreen";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your profile, appearance, testing schedule and alerts.",
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
