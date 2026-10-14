"use client";

import React, { useEffect, useState } from "react";
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
import { Terminal } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { useRouter } from "next/navigation";
import { backendUrl } from "@/lib/configENV";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const { login, currentUser } = useBounty();
  const router = useRouter();

  useEffect(() => {
    const errorCode = new URLSearchParams(window.location.search).get("error");
    if (errorCode) {
      const messages: Record<string, string> = {
        oauth_cancelled: "GitHub sign-in was cancelled.",
        oauth_failed: "GitHub sign-in failed. Please try again.",
        no_email: "Your GitHub account must provide an email address.",
        google_not_configured: "Google sign-in is not configured yet.",
        google_sign_in_cancelled: "Google sign-in was cancelled.",
        google_state_invalid:
          "Google sign-in could not be verified. Please try again.",
        google_account_conflict:
          "That email is linked to a different Google account.",
        google_email_unverified:
          "Sign in with a Google account that has a verified email address.",
      };
      setError(messages[errorCode] || "Sign-in failed. Please try again.");
    }

    fetch(`${backendUrl}/auth/providers`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load sign-in providers");
        const providers = await response.json();
        setGithubEnabled(providers.github === true);
        setGoogleEnabled(providers.google === true);
      })
      .catch((providerError) => {
        console.error("Failed to load sign-in providers:", providerError);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success && result.user) {
        // Check user role and redirect accordingly
        if (result.user.role === "ADMIN") {
          router.push("/admin");
        } else {
          router.push("/home");
        }
      } else {
        setError("Invalid email or password");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
    } finally {
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
            {error && (
              <Alert className="border-destructive/30 bg-destructive/10">
                <AlertDescription className="text-destructive">
                  {error}
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

            {githubEnabled && (
              <a
                href={`${backendUrl}/auth/github`}
                className="github-login-btn block"
              >
                <Button
                  type="button"
                  className="w-full h-11 font-medium hover:cursor-pointer"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Login with GitHub"}
                </Button>
              </a>
            )}
            {googleEnabled && (
              <a
                href={`${backendUrl}/auth/google`}
                className="block"
                aria-label="Continue with Google"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full font-medium"
                  disabled={isLoading}
                >
                  <span
                    aria-hidden="true"
                    className="mr-2 font-bold text-[#4285F4]"
                  >
                    G
                  </span>
                  Continue with Google
                </Button>
              </a>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
