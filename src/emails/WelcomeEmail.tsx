import React from "react";

type Props = {
  firstName?: string;
  company?: string;
};

export default function WelcomeEmail({ firstName = "friend", company = "GoodBricks" }: Props) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to {company}</title>
      </head>
      <body style={{ fontFamily: 'Arial, sans-serif', color: '#333', padding: 20 }}>
        <h1 style={{ color: '#111' }}>Assalamu alaikum, {firstName}!</h1>
        <p>Welcome to {company}. We're excited to have you with us.</p>
      </body>
    </html>
  );
}


