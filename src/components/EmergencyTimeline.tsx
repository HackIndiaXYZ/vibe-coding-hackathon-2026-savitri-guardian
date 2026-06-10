import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronRight } from "lucide-react";

type LogRow = {
  id: string; action: string; created_at: string; metadata: any;
};

const LABELS: Record<string, string> = {
  QR_SCANNED: "Emergency Profile Accessed",
  EMERGENCY_SESSION_CREATED: "Emergency Session Created",
  CONTACT_NOTIFIED: "Emergency Contacts Notified",
  REPORT_SUBMITTED: "Incident Report Submitted",
  HOSPITAL_ALERTED: "Hospital Alerted",
  HOSPITAL_ACCEPTED: "Hospital Accepted",
  PATIENT_ARRIVED: "Patient Arrived",
  SOS_TRIGGERED: "SOS Triggered",
  VOICE_RECORDING_UPLOADED: "Voice Recording Uploaded",
  VOICE_NOTE_PLAYED: "Voice Note Played",
};

export function EmergencyTimeline({ sessionId }: { sessionId: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("audit_logs").select("id, action, created_at, metadata")
        .eq("session_id", sessionId).order("created_at", { ascending: true });
      if (active) setLogs((data ?? []) as LogRow[]);
    };
    load();
    const ch = supabase
      .channel(`timeline-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs", filter: `session_id=eq.${sessionId}` },
        (p) => setLogs((prev) => [...prev, p.new as LogRow]))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [sessionId]);

  const events = logs.filter((l) => LABELS[l.action]);

  if (!events.length) return <p className="text-sm text-muted-foreground">Waiting for events…</p>;

  return (
    <ol className="relative space-y-3">
      {events.map((e, i) => (
        <li key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-8 w-8 rounded-full bg-neon text-[oklch(0.16_0.04_145)] grid place-items-center"><Check className="h-4 w-4" /></div>
            {i < events.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
          </div>
          <div className="pb-3">
            <div className="font-medium">{LABELS[e.action]}</div>
            <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
            {e.metadata?.registration_number && (
              <div className="text-xs mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                Reg {e.metadata.registration_number} <ChevronRight className="h-3 w-3" />
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
