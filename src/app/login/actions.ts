"use server";

import { redirect } from "next/navigation";

import {
  backendRequest,
  createSessionFromResponse,
} from "@/lib/backend";
import { authFormSchema } from "@/lib/validation";

export interface AuthActionState {
  error?: string;
  message?: string;
}

export async function login(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = authFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  let response: Response;
  try {
    response = await backendRequest("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch {
    return { error: "AppClimb is temporarily unavailable. Try again shortly." };
  }
  if (!response.ok || !(await createSessionFromResponse(response))) {
    return { error: "Email or password is incorrect." };
  }

  redirect("/");
}

export async function signup(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = authFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  let response: Response;
  try {
    response = await backendRequest("/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        ...parsed.data,
        workspaceName: "My AppClimb workspace",
      }),
    });
  } catch {
    return { error: "AppClimb is temporarily unavailable. Try again shortly." };
  }
  if (!response.ok || !(await createSessionFromResponse(response))) {
    return { error: "Could not create the account. Try another email." };
  }

  redirect("/");
}
