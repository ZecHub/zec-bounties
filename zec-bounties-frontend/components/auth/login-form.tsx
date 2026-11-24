"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBounty } from "@/lib/bounty-context";
import { useRouter, useSearchParams } from "next/navigation";
import { backendUrl } from "@/lib/configENV";
import {
  startGithubLogin,
  getGithubOAuthErrorMessage,
} from "@/lib/githubLogin";

function getPostLoginPath(role?: string) {
  if (role === "ADMIN") return "/admin";
  if (role === "TEAM") return "/teams";
  if (role === "CLIENT") return "/onboarding";
  return "/home";
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const submittingRef = useRef(false);
  const { login } = useBounty();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Surface OAuth callback errors that arrive as ?error=... and clear when absent
  useEffect(() => {
    const msg = getGithubOAuthErrorMessage(searchParams.get("error"));
    setOauthError(msg ?? null);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isLoading) return;
    submittingRef.current = true;
    setError("");
    setOauthError(null);
    setIsLoading(true);

    try {
      const result = await login(email.trim(), password);

      if (result.success && result.user) {
        router.push(getPostLoginPath(result.user.role));
      } else {
        setError("Invalid email or password");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="ZecHubBlue.png"
              alt="ZecHubBlue.png"
              style={{ height: "5rem" }}
            />
          </div>
          <CardTitle className="text-2xl font-bold">Zechub Bounties</CardTitle>
          <CardDescription>Log In to start earning bounties!</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || oauthError) && (
              <Alert className="border-destructive/30 bg-destructive/10">
                <AlertDescription className="text-destructive">
                  {error || oauthError}
                </AlertDescription>
              </Alert>
            )}

            {process.env.NODE_ENV === "development" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-muted/50 border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-muted/50 border"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </>
            )}

            <a
              href={`${backendUrl}/auth/github`}
              className="github-login-btn block"
              onClick={(e) => {
                e.preventDefault();
                if (isLoading || submittingRef.current) return;
                startGithubLogin();
              }}
            >
              <Button
                type="button"
                className="w-full h-11 font-medium hover:cursor-pointer"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Login with GitHub"}
              </Button>
            </a>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
