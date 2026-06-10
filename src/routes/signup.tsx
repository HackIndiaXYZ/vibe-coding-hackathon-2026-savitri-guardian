import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SavitriLogo } from "@/components/SavitriLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Savitri" }] }),
  component: SignupPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long")
    .regex(/[A-Za-z]/, "Add at least one letter")
    .regex(/[0-9]/, "Add at least one number"),
});

type Errors = Partial<Record<"name" | "email" | "password", string>>;

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, email, password });
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/patient`,
        data: { full_name: parsed.data.name },
      },
    });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("password")) {
        setErrors({ password: error.message });
      } else if (error.message.toLowerCase().includes("email") || error.message.toLowerCase().includes("registered")) {
        setErrors({ email: error.message });
      } else {
        toast.error(error.message);
      }
      return;
    }
    if (!data.session) {
      toast.success("Check your email to confirm and then sign in.");
      return;
    }
    toast.success("Welcome to Savitri");
    navigate({ to: "/patient" });
  };

  const fieldClass = (hasError: boolean) =>
    cn(
      "h-12 mt-1",
      hasError && "border-destructive focus-visible:ring-destructive/40"
    );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-5 py-4">
        <Link to="/"><SavitriLogo /></Link>
      </header>
      <main className="flex-1 px-5 pt-6 pb-20 mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold">Create your profile</h1>
        <p className="mt-2 text-muted-foreground">
          Patients self-register. EMT and Hospital staff use seeded accounts on the login screen.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
              }}
              aria-invalid={!!errors.name}
              className={fieldClass(!!errors.name)}
            />
            {errors.name && <p className="mt-1.5 text-sm text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              aria-invalid={!!errors.email}
              className={fieldClass(!!errors.email)}
            />
            {errors.email && <p className="mt-1.5 text-sm text-destructive">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
              aria-invalid={!!errors.password}
              className={fieldClass(!!errors.password)}
            />
            {errors.password ? (
              <p className="mt-1.5 text-sm text-destructive">{errors.password}</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                At least 8 characters with letters and numbers. Avoid common passwords.
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full h-12 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold"
          >
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground text-center">
          Have an account? <Link to="/login" className="text-neon font-medium">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
