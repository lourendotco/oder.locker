const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

// email rides the fragment so it never reaches server logs
const codeLink = (email: string) =>
  `https://oder.locker/#${encodeURIComponent(email)}`;

function codeEmail(subject: string, greeting: string, intro: string, code: string, email: string) {
  const link = codeLink(email);

  const text = `${greeting}

${intro}

${code}

or open this link and enter the code there:

${link}

the code will expire in 10 mins.

if you did not request this code, you can safely ignore this message.
`;

  const html = `
<!doctype html>
<html>
<head>
    <meta name="viewport" content="width=device-width" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body>
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(intro)}</p>
    <p style="font-size: 2em; letter-spacing: 0.2em; font-weight: bold;">${code}</p>
    <p>or open <a href="${link}">this link</a> and enter the code there.</p>
    <p>the code will expire in 10 mins.</p>
    <p>if you did not request this code, you can safely ignore this message.</p>
</body>
</html>
`;

  return { subject, html, text };
}

export function getOtpEmail(username: string, code: string, email: string) {
  return codeEmail(
    // usernames are free text: line breaks never reach the subject
    `your oder.locker code, ${username}`.replace(/[\r\n]+/g, " "),
    `hi ${username},`,
    "here is your oder.locker sign-in code",
    code,
    email,
  );
}

// For a pending (never-activated) account: no username to greet yet, and
// framed as finishing signup rather than signing in.
export function getSignupOtpEmail(code: string, email: string) {
  return codeEmail(
    "welcome to oder.locker",
    "hi,",
    "welcome to oder.locker — here is your code to finish signing up",
    code,
    email,
  );
}
