import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "../services/auth.api";
import { useAuth } from "../store/auth";
import { toast } from "../store/toast";
import { Button, Card, Input } from "../components/ui/primitives";

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: ({ name, email, password }: FormValues) =>
      authApi.register(name, email, password),
    onSuccess: (data) => {
      setAuth(data);
      toast.success("Account created successfully!");
      navigate("/");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Registration failed");
    },
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
        <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Create an account</h1>
        <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">Automated Outreach & Cold Emailing Platform</p>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
            <Input type="text" placeholder="John Doe" {...register("name")} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <Input type="email" placeholder="john@example.com" {...register("email")} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <Input type="password" placeholder="••••••••" {...register("password")} />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
            <Input type="password" placeholder="••••••••" {...register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating account…" : "Create Account"}
          </Button>
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-[#3B82F6] hover:underline dark:text-[#71C9CE]">
              Sign in
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
