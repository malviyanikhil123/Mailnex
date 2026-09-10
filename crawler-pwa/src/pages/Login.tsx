import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, LogIn } from "lucide-react";
import { authApi } from "../services/api.js";
import { useAuth } from "../store/auth.js";
import { Card, Button, Input } from "../components/ui/primitives.js";
import { toast } from "../store/toast.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setAuth(res.accessToken, res.refreshToken, res.user);
      toast.success("Welcome back to LeadCrawler!");
      navigate("/");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#E0F2FE] dark:bg-[#091517]">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-6 shadow-xl border-[#BAE6FD] dark:border-[#164549]">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#60A5FA] text-white shadow-md dark:bg-[#71C9CE] dark:text-gray-950">
            <Compass size={28} />
          </div>
          <h1 className="text-2xl font-black text-[#0F172A] dark:text-[#E3FDFD]">
            LeadCrawler PWA
          </h1>
          <p className="text-xs text-[#334155] dark:text-gray-400">
            Sign in with your Mailnex credentials to manage discovery crawls
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1">
              Password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold mt-2"
          >
            <LogIn size={16} /> {loading ? "Signing in…" : "Sign In to Crawler"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
