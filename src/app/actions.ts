"use server";

import { redirect } from "next/navigation";

import {
  backendRequest,
  clearBackendSession,
  getRefreshToken,
} from "@/lib/backend";

export async function logout() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await backendRequest("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Local cookie deletion remains the secure fallback if the API is down.
    }
  }
  await clearBackendSession();
  redirect("/login");
}
