const ext = globalThis.browser ?? globalThis.chrome;
const input = document.getElementById("token");
const status = document.getElementById("status");

function flash(text) {
  status.textContent = text;
  setTimeout(() => (status.textContent = ""), 1500);
}

ext.storage.local.get("token").then(({ token }) => {
  input.value = token || "";
});

document.getElementById("save").addEventListener("click", async () => {
  await ext.storage.local.set({ token: input.value.trim() });
  flash("Saved");
});

document.getElementById("clear").addEventListener("click", async () => {
  input.value = "";
  await ext.storage.local.remove("token");
  flash("Cleared");
});
