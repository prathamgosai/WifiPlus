"use client";

import { Bell } from "lucide-react";
import { AppShell, ComingSoon } from "@/components/app/AppShell";

export default function AlertsPage() {
  return (
    <AppShell title="Alerts">
      <ComingSoon title="Outage alerts" icon={Bell} />
    </AppShell>
  );
}
