import FormData from "form-data";
import Mailgun from "mailgun.js";

async function sendSimpleMessage() {
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: process.env.MAILGUN_API_KEY || "",
    url: "https://api.eu.mailgun.net",
  });

  const data = await mg.messages.create("vexara.world", {
    from: "Mailgun Sandbox <postmaster@vexara.world>",
    to: ["Andre Ferreira <andrerafaelff@gmail.com>"],
    subject: "Hello Andre Ferreira",
    text: "Congratulations Andre Ferreira, you just sent an email with Mailgun! You are truly awesome!",
  });

  console.log("Mailgun response:", data);
}

sendSimpleMessage().catch((err) => {
  console.error("Mailgun test failed:", err);
  process.exit(1);
});
