import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthReady } from "@/lib/auth-context";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyPatientProfile, upsertPatientProfile, addEmergencyContact, removeEmergencyContact } from "@/lib/patient.functions";
import { toast } from "sonner";
import { ChevronLeft, Trash2, Plus } from "lucide-react";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/patient/profile")({
  head: () => ({ meta: [{ title: "Emergency profile — Savitri" }] }),
  component: ProfilePage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="patient" />,
  notFoundComponent: () => <RouteNotFound scope="patient" />,
});

function ProfilePage() {
  const get = useServerFn(getMyPatientProfile);
  const upsert = useServerFn(upsertPatientProfile);
  const addC = useServerFn(addEmergencyContact);
  const delC = useServerFn(removeEmergencyContact);
  const qc = useQueryClient();
  const ready = useAuthReady();
  const { data, isLoading } = useQuery({ queryKey: ["patient-profile"], queryFn: () => get({}), enabled: ready });


  const [form, setForm] = useState({
    full_name: "", phone: "", date_of_birth: "", blood_group: "",
    allergies: "", conditions: "", insurance_provider: "", insurance_policy_no: "",
  });
  useEffect(() => {
    if (data) setForm({
      full_name: data.profile?.full_name ?? "",
      phone: data.profile?.phone ?? "",
      date_of_birth: data.medical?.date_of_birth ?? "",
      blood_group: data.medical?.blood_group ?? "",
      allergies: (data.medical?.allergies ?? []).join(", "),
      conditions: (data.medical?.conditions ?? []).join(", "),
      insurance_provider: data.medical?.insurance_provider ?? "",
      insurance_policy_no: data.medical?.insurance_policy_no ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => upsert({ data: {
      full_name: form.full_name, phone: form.phone || null,
      date_of_birth: form.date_of_birth || null, blood_group: form.blood_group || null,
      allergies: form.allergies.split(",").map(s => s.trim()).filter(Boolean),
      conditions: form.conditions.split(",").map(s => s.trim()).filter(Boolean),
      insurance_provider: form.insurance_provider || null,
      insurance_policy_no: form.insurance_policy_no || null,
    }}),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["patient-profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell requireRole="patient">
      <Link to="/patient" className="inline-flex items-center text-sm text-muted-foreground mb-3"><ChevronLeft className="h-4 w-4" />Back</Link>
      <h1 className="text-2xl font-bold mb-1">Emergency profile</h1>
      <p className="text-sm text-muted-foreground mb-5">Used by EMTs only. Never stored in the QR code.</p>

      {isLoading ? <div>Loading…</div> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="h-12" /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="h-12" /></Field>
            <Field label="Blood group"><Input value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} placeholder="e.g. B+" className="h-12" /></Field>
          </div>
          <Field label="Allergies (comma separated)"><Textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} rows={2} /></Field>
          <Field label="Existing conditions (comma separated)"><Textarea value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} rows={2} /></Field>
          <Field label="Insurance provider"><Input value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} className="h-12" /></Field>
          <Field label="Policy number"><Input value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} className="h-12" /></Field>
          <Button type="submit" disabled={save.isPending} className="w-full h-12 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold">{save.isPending ? "Saving…" : "Save profile"}</Button>
        </form>
      )}

      <div className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Emergency contacts</h2>
        </div>
        <div className="space-y-2">
          {(data?.contacts ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="flex-1">
                <div className="font-medium">{c.name} <span className="text-xs text-muted-foreground">{c.relation}</span></div>
                <div className="text-xs text-muted-foreground">{c.phone || c.email}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={async () => { await delC({ data: { id: c.id } }); qc.invalidateQueries({ queryKey: ["patient-profile"] }); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <AddContact onAdd={async (c) => { await addC({ data: c }); qc.invalidateQueries({ queryKey: ["patient-profile"] }); }} />
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

function AddContact({ onAdd }: { onAdd: (c: { name: string; phone?: string; email?: string; relation?: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ name: "", phone: "", email: "", relation: "" });
  if (!open) return <Button variant="outline" className="w-full mt-3" onClick={() => setOpen(true)}><Plus /> Add contact</Button>;
  return (
    <div className="mt-3 rounded-xl border p-3 space-y-2">
      <Input placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
      <Input placeholder="Relation" value={c.relation} onChange={(e) => setC({ ...c, relation: e.target.value })} />
      <Input placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
      <Input placeholder="Email" type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
      <div className="flex gap-2">
        <Button className="flex-1 bg-neon text-[oklch(0.16_0.04_145)] hover:bg-neon/90" onClick={async () => {
          if (!c.name) return;
          await onAdd({ name: c.name, phone: c.phone || undefined, email: c.email || undefined, relation: c.relation || undefined });
          setC({ name: "", phone: "", email: "", relation: "" }); setOpen(false);
        }}>Save</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
