/**
 * Formats a plain-text email body (including signature and URLs) into
 * clean, modern, responsive HTML suitable for all email clients (Gmail, Outlook, Apple Mail).
 */
export function formatEmailHtml(text: string): string {
  if (!text || !text.trim()) {
    return "";
  }

  // Identify signature section (starting with Regards, Best regards, Sincerely, Thanks, etc.)
  let mainBody = text;
  let signatureText = "";

  const sigMatch = text.match(/\n\s*(Regards|Best regards|Sincerely|Warm regards|Thanks & regards|Thanks|Thank you|Cheers),?\s*\n/i);
  if (sigMatch && sigMatch.index !== undefined) {
    mainBody = text.slice(0, sigMatch.index).trim();
    signatureText = text.slice(sigMatch.index).trim();
  }

  // URL linkifier
  const linkify = (content: string): string => {
    return content.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">$1</a>',
    );
  };

  // Convert main body paragraphs
  const paragraphs = mainBody
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const withBreaks = p.replace(/\n/g, "<br />");
      return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #1e293b;">${linkify(withBreaks)}</p>`;
    })
    .join("\n");

  // Format signature
  let signatureHtml = "";
  if (signatureText) {
    const lines = signatureText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const greeting = lines[0] || "Regards,";
    const name = lines.length > 1 ? lines[1] : "";
    const remaining = lines.slice(2);

    const badges: string[] = [];
    const textLines: string[] = [];

    for (const line of remaining) {
      if (/^phone:\s*/i.test(line)) {
        const num = line.replace(/^phone:\s*/i, "");
        badges.push(
          `<span style="display: inline-block; margin-right: 12px; color: #475569;">📞 <a href="tel:${num}" style="color: #475569; text-decoration: none;">${num}</a></span>`,
        );
      } else if (/^email:\s*/i.test(line)) {
        const email = line.replace(/^email:\s*/i, "");
        badges.push(
          `<span style="display: inline-block; margin-right: 12px; color: #2563eb;">✉️ <a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></span>`,
        );
      } else if (/^linkedin:\s*/i.test(line)) {
        const url = line.replace(/^linkedin:\s*/i, "");
        badges.push(
          `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-right: 8px; margin-bottom: 6px; padding: 4px 12px; background-color: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">LinkedIn ↗</a>`,
        );
      } else if (/^github:\s*/i.test(line)) {
        const url = line.replace(/^github:\s*/i, "");
        badges.push(
          `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-right: 8px; margin-bottom: 6px; padding: 4px 12px; background-color: #f8fafc; color: #334155; border: 1px solid #e2e8f0; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">GitHub ↗</a>`,
        );
      } else if (/^portfolio:\s*/i.test(line)) {
        const url = line.replace(/^portfolio:\s*/i, "");
        badges.push(
          `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-right: 8px; margin-bottom: 6px; padding: 4px 12px; background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">Portfolio ↗</a>`,
        );
      } else {
        textLines.push(
          `<div style="font-size: 14px; color: #64748b; margin-bottom: 4px;">${linkify(line)}</div>`,
        );
      }
    }

    signatureHtml = `
      <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 4px 0; font-size: 15px; color: #475569;">${greeting}</p>
        ${name ? `<p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #0f172a;">${name}</p>` : ""}
        ${textLines.join("\n")}
        ${badges.length > 0 ? `<div style="margin-top: 10px; font-size: 13px; line-height: 2;">${badges.join(" ")}</div>` : ""}
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
            <tr>
              <td style="padding: 28px 24px;">
                ${paragraphs}
                ${signatureHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
