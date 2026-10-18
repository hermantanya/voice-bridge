import { SERVER_URL } from "../config";
import { readApiJson } from "./readApiJson";

export async function requestAuthOtp(email: string): Promise<{
  devCode?: string;
  message?: string;
}> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/api/auth/request-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  const body = await readApiJson<{
    error?: string;
    devCode?: string;
    message?: string;
  }>(response);

  if (!response.ok) {
    throw new Error(body.error ?? `Sign-in request failed (${response.status})`);
  }

  return { devCode: body.devCode, message: body.message };
}

export async function verifyAuthOtp(
  email: string,
  code: string,
): Promise<{ token: string }> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, code }),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  const body = await readApiJson<{ token?: string; error?: string }>(response);

  if (!response.ok) {
    throw new Error(body.error ?? `Sign-in failed (${response.status})`);
  }

  if (!body.token) {
    throw new Error("Sign-in did not return a token");
  }

  return { token: body.token };
}
