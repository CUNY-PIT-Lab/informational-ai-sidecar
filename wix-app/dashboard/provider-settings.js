const form = document.querySelector("#provider-key-form");
const keyField = document.querySelector("#provider-key");
const status = document.querySelector("#provider-key-status");
const submit = form.querySelector('button[type="submit"]');

function adminAdapter() {
  const adapter = window.FortuneWixAdmin;
  if (
    !adapter
    || typeof adapter.status !== "function"
    || typeof adapter.saveProviderKey !== "function"
  ) {
    throw new Error("The Wix administrator adapter has not been connected.");
  }
  return adapter;
}

async function refreshStatus() {
  try {
    const result = await adminAdapter().status();
    status.textContent = result?.configured
      ? "A provider key is stored for this site. Enter a new key to replace it."
      : "This site does not have a provider key yet.";
  } catch {
    status.textContent = "The provider configuration could not be checked.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = keyField.value.trim();
  if (!value) return;

  submit.disabled = true;
  status.textContent = "Saving the key in Wix Secrets Manager…";
  try {
    const result = await adminAdapter().saveProviderKey(value);
    if (!result?.configured) throw new Error("The key was not stored.");
    keyField.value = "";
    status.textContent = "The provider key is stored for this site.";
  } catch {
    status.textContent = "Wix could not store the provider key. Check administrator access and the Manage Secrets permission.";
  } finally {
    submit.disabled = false;
  }
});

refreshStatus();
