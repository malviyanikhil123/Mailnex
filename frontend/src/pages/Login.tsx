import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "../services/auth.api";
import { useAuth } from "../store/auth";
import { toast } from "../store/toast";
import { Button, Card, Input } from "../components/ui/primitives";
import { PasswordInput } from "../components/ui/PasswordInput";

/**
 * Distinguishes "the server said no" from "the server never answered".
 *
 * Reporting every failure as "Invalid credentials" sends people off hunting for a
 * typo when the real problem is that the API is down or pointed at the wrong port.
 */
function loginErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number }; code?: string };
  if (!e?.response) {
    return e?.code === "ECONNABORTED"
      ? "The server took too long to respond. Please try again."
      : "Can't reach the server. Check that the backend is running.";
  }
  if (e.response.status === 401) return "Invalid credentials";
  if (e.response.status === 429) return "Too many attempts. Please wait a moment.";
  return "Something went wrong signing you in. Please try again.";
}

// Mirrors the backend loginSchema. The 8–72 character rule is for new passwords only;
// older accounts may predate it, so sign-in just caps absurd lengths.
const schema = z.object({
  email: z.string().trim().max(254, "Email is too long").email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(1024, "Password is too long"),
  rememberMe: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { rememberMe: false } });

  const mutation = useMutation({
    mutationFn: ({ email, password, rememberMe }: FormValues) => authApi.login(email, password, rememberMe),
    onSuccess: (data, { rememberMe }) => {
      setAuth({ ...data, rememberMe });
      navigate("/");
    },
    onError: (err) => toast.error(loginErrorMessage(err)),
  });

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[#E0F2FE] p-4 dark:bg-[#091517]">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#60A5FA] text-white font-black text-sm shadow-xs dark:from-[#71C9CE] dark:to-[#36888e]">
            M
          </div>
          <span className="text-xl font-bold text-[#0F172A] dark:from-[#A6E3E9] dark:to-[#71C9CE] dark:bg-clip-text dark:text-transparent">
            Mailnex
          </span>
        </div>
        <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Sign in</h1>
        <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">Automated Outreach & Cold Emailing Platform</p>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <Input id="login-email" type="email" autoComplete="email" placeholder="john@example.com" {...register("email")} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <PasswordInput id="login-password" autoComplete="current-password" placeholder="••••••••" {...register("password")} />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#BAE6FD] accent-[#3B82F6] dark:accent-[#71C9CE]"
              {...register("rememberMe")}
            />
            Remember me (30 days)
          </label>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{" "}
            <Link to="/register" className="font-semibold text-[#3B82F6] hover:underline dark:text-[#71C9CE]">
              Sign up
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
