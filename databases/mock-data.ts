/**
 * Mock Data for GoodBricks Email Database
 * This file contains all the sample data used for seeding the database tables
 */

export const mockEmailTemplates = [
  {
    id: 'welcome',
    version: 1,
    name: 'Welcome Email',
    category: 'onboarding',
    subject: 'Welcome to GoodBricks!',
    description: 'Welcome new users to the platform',
    isActive: 'true',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    s3Key: 'templates/welcome.html',
    tags: ['welcome', 'onboarding', 'new-user']
  },
  {
    id: 'welcome',
    version: 2,
    name: 'Welcome Email v2',
    category: 'onboarding',
    subject: 'Welcome to GoodBricks! (Updated)',
    description: 'Updated welcome email with new features',
    isActive: 'true',
    createdAt: '2024-02-01T10:00:00Z',
    updatedAt: '2024-02-01T10:00:00Z',
    s3Key: 'templates/welcome.html',
    tags: ['welcome', 'onboarding', 'new-user', 'updated']
  },
  {
    id: 'reset-password',
    version: 1,
    name: 'Password Reset',
    category: 'security',
    subject: 'Reset Your Password',
    description: 'Password reset email for users',
    isActive: 'true',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    s3Key: 'templates/reset-password.html',
    tags: ['password', 'security', 'reset']
  },
  {
    id: 'newsletter',
    version: 1,
    name: 'Weekly Newsletter',
    category: 'marketing',
    subject: 'This Week at GoodBricks',
    description: 'Weekly newsletter with updates',
    isActive: 'true',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
    s3Key: 'templates/newsletter.html',
    tags: ['newsletter', 'marketing', 'weekly']
  },
  {
    id: 'order-confirmation',
    version: 1,
    name: 'Order Confirmation',
    category: 'transactional',
    subject: 'Your Order Has Been Confirmed',
    description: 'Order confirmation email for customers',
    isActive: 'true',
    createdAt: '2024-01-25T10:00:00Z',
    updatedAt: '2024-01-25T10:00:00Z',
    s3Key: 'templates/order-confirmation.html',
    tags: ['order', 'confirmation', 'transactional']
  },
  {
    id: 'promotional',
    version: 1,
    name: 'Promotional Email',
    category: 'marketing',
    subject: 'Special Offer Inside!',
    description: 'Promotional email for special offers',
    isActive: 'true',
    createdAt: '2024-01-30T10:00:00Z',
    updatedAt: '2024-01-30T10:00:00Z',
    s3Key: 'templates/promotional.html',
    tags: ['promotion', 'marketing', 'offer']
  }
];

export const mockEmailHistory = [
  {
    id: 'email-001',
    timestamp: new Date().toISOString(),
    templateId: 'welcome',
    templateVersion: 2,
    recipientEmail: 'user1@example.com',
    recipientName: 'John Doe',
    status: 'sent',
    campaignId: 'cmp-001',
    subject: 'Welcome to GoodBricks! (Updated)',
    sentAt: new Date().toISOString(),
    openedAt: null,
    clickedAt: null
  },
  {
    id: 'email-002',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    templateId: 'welcome',
    templateVersion: 1,
    recipientEmail: 'user2@example.com',
    recipientName: 'Jane Smith',
    status: 'opened',
    campaignId: 'cmp-001',
    subject: 'Welcome to GoodBricks!',
    sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    openedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    clickedAt: null
  },
  {
    id: 'email-003',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    templateId: 'reset-password',
    templateVersion: 1,
    recipientEmail: 'user3@example.com',
    recipientName: 'Bob Johnson',
    status: 'clicked',
    campaignId: 'cmp-002',
    subject: 'Reset Your Password',
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    clickedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString()
  },
  {
    id: 'email-004',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    templateId: 'newsletter',
    templateVersion: 1,
    recipientEmail: 'user4@example.com',
    recipientName: 'Alice Brown',
    status: 'sent',
    campaignId: 'cmp-003',
    subject: 'This Week at GoodBricks',
    sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    openedAt: null,
    clickedAt: null
  },
  {
    id: 'email-005',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    templateId: 'order-confirmation',
    templateVersion: 1,
    recipientEmail: 'customer1@example.com',
    recipientName: 'Mike Wilson',
    status: 'opened',
    campaignId: 'cmp-004',
    subject: 'Your Order Has Been Confirmed',
    sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    openedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
    clickedAt: null
  }
];

export const mockEmailAnalytics = [
  {
    templateId: 'welcome',
    date: new Date().toISOString().slice(0, 10),
    totalSent: 1200,
    opened: 820,
    clicked: 260,
    campaignId: 'cmp-001'
  },
  {
    templateId: 'reset-password',
    date: new Date().toISOString().slice(0, 10),
    totalSent: 300,
    opened: 210,
    clicked: 95,
    campaignId: 'cmp-002'
  },
  {
    templateId: 'newsletter',
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    totalSent: 500,
    opened: 350,
    clicked: 120,
    campaignId: 'cmp-003'
  },
  {
    templateId: 'welcome',
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    totalSent: 800,
    opened: 600,
    clicked: 180,
    campaignId: 'cmp-001'
  },
  {
    templateId: 'order-confirmation',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    totalSent: 150,
    opened: 120,
    clicked: 45,
    campaignId: 'cmp-004'
  }
];

export const mockS3Templates = [
  { 
    key: 'templates/welcome.html', 
    body: '<html><body><h1>Welcome to GoodBricks!</h1><p>Thanks for joining our platform. We\'re excited to have you on board!</p><p>Get started by exploring our features.</p></body></html>' 
  },
  { 
    key: 'templates/reset-password.html', 
    body: '<html><body><h1>Reset Your Password</h1><p>Click the link below to reset your password:</p><a href="{{resetLink}}">Reset Password</a></body></html>' 
  },
  { 
    key: 'templates/newsletter.html', 
    body: '<html><body><h1>This Week at GoodBricks</h1><p>Here\'s what\'s new this week:</p><ul><li>New feature updates</li><li>Community highlights</li><li>Upcoming events</li></ul></body></html>' 
  },
  { 
    key: 'templates/order-confirmation.html', 
    body: '<html><body><h1>Order Confirmation</h1><p>Thank you for your order #{{orderNumber}}</p><p>Your order will be processed shortly.</p></body></html>' 
  },
  { 
    key: 'templates/promotional.html', 
    body: '<html><body><h1>Special Offer!</h1><p>Don\'t miss out on our limited-time offer: {{offerDetails}}</p><a href="{{offerLink}}">Claim Offer</a></body></html>' 
  }
];

export const mockBrandedTemplates = [
  { 
    key: 'templates/welcome_brandA.html', 
    body: '<html><body><h1 style="color: #FF6B6B;">Welcome to Brand A!</h1><p>Thanks for joining Brand A. We\'re excited to have you!</p></body></html>' 
  },
  { 
    key: 'templates/welcome_brandB.html', 
    body: '<html><body><h1 style="color: #4ECDC4;">Welcome to Brand B!</h1><p>Thanks for joining Brand B. Let\'s get started!</p></body></html>' 
  },
  { 
    key: 'templates/newsletter_brandA.html', 
    body: '<html><body><h1 style="color: #FF6B6B;">Brand A Newsletter</h1><p>This week\'s updates from Brand A...</p></body></html>' 
  },
  { 
    key: 'templates/newsletter_brandB.html', 
    body: '<html><body><h1 style="color: #4ECDC4;">Brand B Newsletter</h1><p>This week\'s updates from Brand B...</p></body></html>' 
  }
];
