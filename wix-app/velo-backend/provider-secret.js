import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";

const getSecretValue = elevate(secrets.getSecretValue);

export async function getProviderKey() {
  const response = await getSecretValue("fortuneGuideOllamaKey");
  const value = typeof response === "string" ? response : response?.value;
  if (!value) throw new Error("The Website Guide provider is not configured.");
  return value;
}
