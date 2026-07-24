import { elevate } from "wix-auth";
import { Permissions, webMethod } from "wix-web-module";
import { secrets } from "wix-secrets-backend.v2";

const SECRET_NAME = "fortuneGuideOllamaKey";
const DESCRIPTION = "Ollama Cloud key for the Fortune Digital Equity guide";

const createSecret = elevate(secrets.createSecret);
const listSecretInfo = elevate(secrets.listSecretInfo);
const updateSecret = elevate(secrets.updateSecret);

function rowsFrom(response) {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.secrets) ? response.secrets : [];
}

async function findProviderSecret() {
  const response = await listSecretInfo();
  return rowsFrom(response).find((row) => row?.name === SECRET_NAME) || null;
}

export const providerKeyStatus = webMethod(Permissions.Admin, async () => ({
  configured: Boolean(await findProviderSecret()),
}));

export const saveProviderKey = webMethod(Permissions.Admin, async (input) => {
  const value = String(input || "").trim();
  if (value.length < 12 || value.length > 3500) {
    throw new Error("Enter a valid provider key.");
  }

  const existing = await findProviderSecret();
  if (existing?._id || existing?.id) {
    await updateSecret(existing._id || existing.id, { value });
  } else {
    await createSecret({
      name: SECRET_NAME,
      value,
      description: DESCRIPTION,
    });
  }
  return { configured: true };
});
