import React from 'react';

interface GoodBricksImpactReportProps {
  firstName?: string;
}

export default function GoodBricksImpactReport({
  firstName = 'Friend',
}: GoodBricksImpactReportProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h1 style={{ color: '#333', fontSize: '28px', marginBottom: '10px' }}>GoodBricks</h1>
        <p style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px', color: '#666' }}>2024 Impact Report</p>
        <h2 style={{ fontSize: '32px', fontWeight: '500', margin: '20px 0' }}>Dear {firstName},</h2>
        <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px' }}>
          What an incredible year it's been! Together, we've made a real difference in our community. 
          Let's celebrate the impact we've created together.
        </p>
        <a href="https://www.goodbricks.org" style={{ display: 'inline-block', backgroundColor: '#333', color: '#fff', padding: '15px 30px', textDecoration: 'none', borderRadius: '25px', fontWeight: 'bold', fontSize: '14px' }}>
          View Full Impact Report
        </a>
      </div>

      <div style={{ margin: '20px', padding: '30px', backgroundColor: '#fef3e7', borderRadius: '15px', textAlign: 'center' }}>
        <h3 style={{ color: '#a63b00', fontSize: '24px', margin: '0 0 20px 0' }}>Lives Impacted</h3>
        <div style={{ fontSize: '60px', fontWeight: 'bold', color: '#333', lineHeight: '1' }}>2,847</div>
        <p style={{ fontSize: '24px', fontWeight: '500', color: '#333', margin: '15px 0' }}>people reached through our programs</p>
        <p style={{ fontSize: '14px', color: '#333', lineHeight: '1.4' }}>
          Every number represents a real person whose life has been touched by our community's generosity and dedication.
        </p>
      </div>

      <div style={{ margin: '20px', padding: '30px', backgroundColor: '#f3f4f6', borderRadius: '15px', textAlign: 'center' }}>
        <h3 style={{ color: '#374151', fontSize: '24px', margin: '0 0 20px 0' }}>Our Most Impactful Program</h3>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', margin: '15px 0' }}>"Community Food Drive Initiative"</p>
        <div style={{ fontSize: '40px', fontWeight: '500', color: '#333', margin: '15px 0' }}>1,200 lives changed</div>
        <p style={{ fontSize: '14px', color: '#333', lineHeight: '1.4' }}>
          This program has been a beacon of hope and transformation in our community!
        </p>
      </div>

      <div style={{ margin: '20px', padding: '30px', backgroundColor: '#fef7e0', borderRadius: '15px', textAlign: 'center' }}>
        <h3 style={{ color: '#9c7b4a', fontSize: '24px', margin: '0 0 20px 0' }}>Our Most Active Month</h3>
        <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#333', margin: '15px 0' }}>November</div>
        <p style={{ fontSize: '24px', fontWeight: '500', color: '#333', margin: '15px 0' }}>with 8 events</p>
        <p style={{ fontSize: '14px', color: '#333', lineHeight: '1.4' }}>
          November was our busiest month. The community came together in amazing ways to create lasting change.
        </p>
      </div>

      <div style={{ margin: '20px', padding: '30px', backgroundColor: '#ecfdf5', borderRadius: '15px', textAlign: 'center' }}>
        <h3 style={{ color: '#065f46', fontSize: '24px', margin: '0 0 20px 0' }}>Total Volunteer Hours</h3>
        <div style={{ fontSize: '60px', fontWeight: 'bold', color: '#333', lineHeight: '1' }}>3,840</div>
        <p style={{ fontSize: '18px', fontWeight: '500', color: '#333', margin: '15px 0' }}>hours of service this year</p>
        <p style={{ fontSize: '14px', color: '#065f46', lineHeight: '1.4' }}>
          Every hour represents dedication, compassion, and the belief that together we can build a better world.
        </p>
      </div>

      <div style={{ padding: '30px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: '#333', lineHeight: '1.6', marginBottom: '20px' }}>
          Thank you for being part of this incredible journey of impact!<br/>
          Together, we're building a better tomorrow, one act of kindness at a time.
        </p>
        <a href="https://www.goodbricks.org" style={{ display: 'inline-block', backgroundColor: '#333', color: '#fff', padding: '15px 30px', textDecoration: 'none', borderRadius: '25px', fontWeight: 'bold', fontSize: '14px', marginBottom: '10px' }}>
          Join Our Next Initiative
        </a><br/>
        <a href="https://www.goodbricks.org" style={{ color: '#333', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
          Visit Our Community Hub
        </a>
      </div>
    </div>
  );
}

GoodBricksImpactReport.PreviewProps = {
  firstName: 'John',
} satisfies GoodBricksImpactReportProps;
