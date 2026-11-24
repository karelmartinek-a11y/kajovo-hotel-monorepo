const button = document.getElementById("connect");
const status = document.getElementById("status");
const scope = document.getElementById("requested-scope");
const ticket = new URLSearchParams(location.hash.slice(1)).get("ticket");

async function consent(action) {
  const response = await fetch("/sections/hotel/oauth/consent", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ticket, action}),
  });
  if (!response.ok) throw new Error("Připojení vypršelo nebo se ho nepodařilo povolit.");
  return response.json();
}

async function showScope() {
  try {
    if (!ticket) throw new Error("Chybí žádost o připojení.");
    const {scopes} = await consent("inspect");
    const labels = {
      "breakfast:read": "čtení snídaní", "breakfast:write": "změny snídaní",
      "lost_found:read": "čtení ztrát a nálezů", "lost_found:write": "změny ztrát a nálezů",
    };
    scope.textContent = `ChatGPT žádá o ${scopes.map(value => labels[value]).join(", ")}.`;
    button.disabled = false;
  } catch (error) {
    status.textContent = error.message;
  }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const {redirect} = await consent("approve");
    const callback = new URL(redirect);
    if (callback.origin !== "https://chatgpt.com") throw new Error("Návratová adresa není platná.");
    const link = document.createElement("a");
    link.href = callback.href;
    link.textContent = "Dokončit připojení v ChatGPT";
    status.replaceChildren(link);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

void showScope();
