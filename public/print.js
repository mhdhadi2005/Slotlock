// Print button on the consent record page (inline scripts are blocked by CSP).
document.getElementById("print")?.addEventListener("click", () => window.print());
