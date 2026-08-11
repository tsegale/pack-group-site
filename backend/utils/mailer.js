const nodemailer = require("nodemailer");

/* Public-facing contact number, matched to what's already hardcoded in
   the site's footer/contact page — the static public site doesn't read
   this from site_settings at runtime, so neither does this. */
const PACK_PHONE = "085 819 6462";

const DIVISION_ADDRESS = {
  "real-estate": process.env.MAIL_USER,
  insurance: process.env.MAIL_USER_INSURANCE,
};

const DIVISION_NAME = {
  "real-estate": "Pack Real Estate",
  insurance: "Pack Insurance Broker",
  general: "Pack Group",
};

function createTransporter(user, pass) {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT, 10) || 465,
    secure: true,
    auth: { user, pass },
  });
}

const realEstateTransporter = createTransporter(
  process.env.MAIL_USER,
  process.env.MAIL_PASS,
);
const insuranceTransporter = createTransporter(
  process.env.MAIL_USER_INSURANCE,
  process.env.MAIL_PASS_INSURANCE,
);

/* Called once on server startup — logs whether each inbox's SMTP
   credentials actually work, rather than only discovering a bad
   password the first time a real inquiry silently fails to send. */
function verifyTransporters() {
  realEstateTransporter.verify((error) => {
    if (error) {
      console.error("SMTP error (real estate inbox):", error.message);
    } else {
      console.log("Mail server ready: real estate inbox");
    }
  });
  insuranceTransporter.verify((error) => {
    if (error) {
      console.error("SMTP error (insurance inbox):", error.message);
    } else {
      console.log("Mail server ready: insurance inbox");
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTimestamp(date) {
  return date.toLocaleString("en-NA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/* Sends the new-inquiry notification to the relevant division inbox.
   'general' inquiries go to both — real estate as the primary
   recipient (and sender), insurance cc'd. */
async function sendInquiryNotification(lead) {
  const division = lead.source_division;
  const label = DIVISION_NAME[division] || "Pack Group";
  const submitted = formatTimestamp(new Date());

  let transporter, from, to, cc;
  if (division === "general") {
    transporter = realEstateTransporter;
    from = `Pack Group <${process.env.MAIL_USER}>`;
    to = process.env.MAIL_USER;
    cc = process.env.MAIL_USER_INSURANCE;
  } else {
    const address = DIVISION_ADDRESS[division];
    transporter =
      division === "insurance" ? insuranceTransporter : realEstateTransporter;
    from = `${label} <${address}>`;
    to = address;
  }

  const lines = [
    `Name: ${lead.name}`,
    `Phone: ${lead.phone || "Not provided"}`,
    `Email: ${lead.email || "Not provided"}`,
    `Message: ${lead.message || "No message provided."}`,
  ];
  if (lead.property_title) lines.push(`Property: ${lead.property_title}`);
  lines.push(`Submitted: ${submitted}`);

  const text =
    lines.join("\n") +
    "\n\nReply directly to this email to respond to the client.";

  const htmlRows = [
    ["Name", lead.name],
    ["Phone", lead.phone || "Not provided"],
    ["Email", lead.email || "Not provided"],
    ["Message", lead.message || "No message provided."],
  ];
  if (lead.property_title) htmlRows.push(["Property", lead.property_title]);
  htmlRows.push(["Submitted", submitted]);

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a;">
      <h2 style="margin: 0 0 16px;">New ${escapeHtml(label)} Inquiry</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
        ${htmlRows
          .map(
            ([key, val]) => `
          <tr>
            <td style="font-weight: 600; vertical-align: top; padding-right: 12px;">${escapeHtml(key)}</td>
            <td style="white-space: pre-wrap;">${escapeHtml(val)}</td>
          </tr>`,
          )
          .join("")}
      </table>
      <p style="margin-top: 20px; color: #555;">Reply directly to this email to respond to the client.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    cc,
    replyTo: lead.email || undefined,
    subject: `New ${label} Inquiry from ${lead.name}`,
    text,
    html,
  });
}

/* Sends the submitter a plain confirmation that their inquiry was
   received. No-ops silently if they didn't leave an email address. */
async function sendAutoReply(lead) {
  if (!lead.email) return;

  const division = lead.source_division;
  const label = DIVISION_NAME[division] || "Pack Group";
  const transporter =
    division === "insurance" ? insuranceTransporter : realEstateTransporter;
  const fromAddress =
    division === "insurance"
      ? process.env.MAIL_USER_INSURANCE
      : process.env.MAIL_USER;

  const text = `Hi ${lead.name},

Thank you for contacting ${label}. We've received your inquiry and a member of our team will be in touch within 1 business day.

In the meantime, you can reach us directly:
Phone: ${PACK_PHONE}

Kind regards,
${label}
Pack Group — Built on Trust. Driven by Unity.`;

  await transporter.sendMail({
    from: `${label} <${fromAddress}>`,
    to: lead.email,
    subject: `Thank you for contacting ${label}`,
    text,
  });
}

module.exports = { sendInquiryNotification, sendAutoReply, verifyTransporters };
