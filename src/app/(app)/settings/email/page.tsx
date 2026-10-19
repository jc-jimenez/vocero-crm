import { notFound } from "next/navigation";
import { EmailClient } from "@/components/settings/email-client";
import { correoEnabled } from "@/server/mail/flag";

export const dynamic = "force-dynamic";

export default function EmailSettingsPage() {
  // 022 — sin la bandera CORREO esta pantalla no existe en esta instancia.
  if (!correoEnabled()) notFound();
  return <EmailClient />;
}
