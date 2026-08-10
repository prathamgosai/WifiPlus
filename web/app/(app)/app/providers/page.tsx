"use client";

import { Signal } from "lucide-react";
import { AppShell, ComingSoon } from "@/components/app/AppShell";

export default function ProvidersPage() {
  return (
    <AppShell title="Providers">
      <ComingSoon title="Provider comparison" icon={Signal} />
    </AppShell>
  );
}
