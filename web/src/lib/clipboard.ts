/**
 * Copy text on HTTP and HTTPS.
 * navigator.clipboard only works in secure contexts (https/localhost);
 * landa.tharavad.xyz is currently plain HTTP so we need a fallback.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Nothing to copy");
  }

  // Secure context path
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback: hidden textarea + execCommand (works on http://)
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.padding = "0";
  ta.style.border = "none";
  ta.style.outline = "none";
  ta.style.boxShadow = "none";
  ta.style.background = "transparent";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("Copy command failed");
}
