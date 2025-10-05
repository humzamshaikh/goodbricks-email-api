import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Tailwind,
  Body,
  Container,
  Section,
  Img,
  Heading,
  Text,
  Button,
  Hr,
  Link,
} from "@react-email/components";

// --- Usage notes -------------------------------------------------------------
// File: emails/DonationCampaignEmail.tsx (or .jsx)
// Render HTML (Node):
//   import { render } from "@react-email/render";
//   import DonationCampaignEmail from "./emails/DonationCampaignEmail";
//   const html = render(
//     <DonationCampaignEmail
//       firstName="Omar"
//       orgName="GoodBricks Foundation"
//       campaignName="Winter Warmth Drive"
//       donateUrl="https://example.org/donate"
//       heroImage="https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200"
//       orgLogo="https://placehold.co/200x60?text=Logo"
//       goalAmount={50000}
//       raisedAmount={18750}
//       tiers={[25, 50, 100, 250]}
//       matchNote="All gifts doubled today by a generous sponsor."
//       impactPoints={["$50 provides a warm meal for 10 people","$100 covers a week of essentials for one family","$250 supports legal services for a client"]}
//       footerLinks={{ website: "https://example.org", instagram: "https://instagram.com/example", facebook: "https://facebook.com/example" }}
//     />
//   );
// ----------------------------------------------------------------------------

export type DonationCampaignEmailProps = {
  firstName?: string;
  orgName?: string;
  campaignName?: string;
  donateUrl?: string;
  heroImage?: string;
  orgLogo?: string;
  goalAmount?: number; // in dollars
  raisedAmount?: number; // in dollars
  tiers?: number[]; // preset amounts
  matchNote?: string;
  impactPoints?: string[];
  footerLinks?: { website?: string; instagram?: string; facebook?: string; twitter?: string };
};

export default function DonationCampaignEmail({
  firstName = "there",
  orgName = "Your Organization",
  campaignName = "Donation Campaign",
  donateUrl = "https://example.org/donate",
  heroImage = "https://images.unsplash.com/photo-1557683316-973673baf926?w=1600",
  orgLogo = "https://placehold.co/200x60?text=Logo",
  goalAmount = 50000,
  raisedAmount = 12500,
  tiers = [25, 50, 100, 250],
  matchNote,
  impactPoints = [
    "$50 provides a warm meal for 10 people",
    "$100 covers a week of essentials for one family",
    "$250 supports legal services for a client",
  ],
  footerLinks = {},
}: DonationCampaignEmailProps) {
  const pct = clampPct((raisedAmount / Math.max(goalAmount, 1)) * 100);
  const currency = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <Html>
      <Head />
      <Preview>
        {campaignName}: Help us reach {currency(goalAmount)} — every gift moves us closer.
      </Preview>
      <Tailwind>
        <Body className="bg-[#f6f9fc] m-0 p-0">
          <Container className="mx-auto my-0 max-w-[640px] p-0">
            {/* Top bar */}
            <Section className="bg-white pt-6 pb-4 px-6 rounded-t-2xl">
              <table width="100%" role="presentation">
                <tbody>
                  <tr>
                    <td className="align-middle w-[180px]">
                      {orgLogo && (
                        <Link href={footerLinks.website || donateUrl} className="inline-block">
                          <Img src={orgLogo} alt={`${orgName} logo`} width={160} className="block" />
                        </Link>
                      )}
                    </td>
                    <td className="text-right">
                      <Text className="text-xs text-slate-500 m-0">{orgName}</Text>
                      <Heading as="h2" className="text-xl font-semibold leading-tight m-0">
                        {campaignName}
                      </Heading>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* Hero */}
            <Section className="bg-white px-6">
              {heroImage && (
                <Img
                  src={heroImage}
                  alt="Campaign hero image"
                  width="100%"
                  className="rounded-xl border border-slate-200"
                />
              )}
            </Section>

            {/* Message */}
            <Section className="bg-white px-6">
              <Heading as="h1" className="text-2xl sm:text-3xl leading-snug mt-6 mb-3">
                {`Hi ${firstName}, will you help us reach ${currency(goalAmount)}?`}
              </Heading>
              {matchNote && (
                <Text className="text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 inline-block">
                  {matchNote}
                </Text>
              )}
              <Text className="text-[15px] leading-[1.6] text-slate-700 mt-4">
                Your support fuels our work. Every contribution — big or small — creates tangible impact for the
                community we serve. We’re {currency(goalAmount - raisedAmount)} away from our goal.
              </Text>
            </Section>

            {/* Progress */}
            <Section className="bg-white px-6">
              <Text className="text-sm text-slate-600 m-0">Raised so far</Text>
              <Text className="text-lg font-semibold m-0">{currency(raisedAmount)} / {currency(goalAmount)}</Text>
              <div className="h-3 w-full bg-slate-200 rounded-full mt-2">
                <div
                  className="h-3 rounded-full"
                  style={{ width: `${pct}%`, background: "linear-gradient(90deg, #22c55e, #15803d)" }}
                />
              </div>
              <Text className="text-xs text-slate-500 mt-1">{pct}% of goal</Text>
            </Section>

            {/* Tiers & CTA */}
            <Section className="bg-white px-6">
              <table width="100%" role="presentation">
                <tbody>
                  <tr>
                    {tiers.slice(0, 4).map((amt, i) => (
                      <td key={i} className="pr-2 pb-2">
                        <Button
                          href={`${donateUrl}?amount=${amt}`}
                          className="w-full text-center px-4 py-3 text-sm font-semibold rounded-xl border border-slate-200 hover:no-underline"
                        >
                          {currency(amt)}
                        </Button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>

              <Button
                href={donateUrl}
                className="mt-2 w-full text-center px-5 py-4 text-base font-bold rounded-xl bg-black text-white hover:no-underline"
              >
                Donate now
              </Button>

              <Text className="text-xs text-slate-500 mt-2">Prefer another amount? You can enter it on the donation page.</Text>
            </Section>

            {/* Impact bullets */}
            {impactPoints?.length ? (
              <Section className="bg-white px-6">
                <Heading as="h3" className="text-[18px] font-semibold mt-6 mb-2">
                  Your gift at work
                </Heading>
                <ul className="m-0 pl-5">
                  {impactPoints.map((pt, idx) => (
                    <li key={idx} className="text-[15px] leading-[1.6] text-slate-700 mb-1">
                      {pt}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* Divider */}
            <Section className="bg-white px-6">
              <Hr className="border-slate-200 my-6" />
            </Section>

            {/* Secondary CTA */}
            <Section className="bg-white px-6 pb-6 rounded-b-2xl">
              <Text className="text-[15px] leading-[1.6] text-slate-700">
                If you can’t give today, sharing this campaign helps tremendously. Forward this email to a friend or post
                about it on social.
              </Text>
              <table role="presentation" cellPadding={0} cellSpacing={0} className="mt-2">
                <tbody>
                  <tr>
                    {footerLinks.facebook && (
                      <td className="pr-2">
                        <Button href={footerLinks.facebook} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                          Facebook
                        </Button>
                      </td>
                    )}
                    {footerLinks.instagram && (
                      <td className="pr-2">
                        <Button href={footerLinks.instagram} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                          Instagram
                        </Button>
                      </td>
                    )}
                    {footerLinks.twitter && (
                      <td className="pr-2">
                        <Button href={footerLinks.twitter} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                          X / Twitter
                        </Button>
                      </td>
                    )}
                    {footerLinks.website && (
                      <td>
                        <Button href={footerLinks.website} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                          Website
                        </Button>
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* Footer */}
            <Section className="text-center text-xs text-slate-500 leading-5 px-6 py-6">
              <Text className="m-0">
                You’re receiving this because you opted in to updates from {orgName}. To manage preferences or unsubscribe,
                visit <Link href={`${footerLinks.website || "#"}/preferences`}>preferences</Link>.
              </Text>
              <Text className="m-0">{orgName} • 123 Main St • Your City, ST 00000</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
