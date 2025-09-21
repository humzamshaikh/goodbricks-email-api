import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { HttpError } from '../../lib/http.js';

// AWS SES Client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

interface SendEmailRequest {
  recipients: string[]; // Array of email addresses
  subject: string;
  content: {
    html?: string;
    text?: string;
  };
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  tags?: Array<{
    name: string;
    value: string;
  }>;
  configurationSet?: string;
}

interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  message?: string;
  error?: string;
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendEmailResponse> => {
  const body = event.body ? JSON.parse(event.body) as SendEmailRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
    throw new HttpError(400, 'recipients array is required and must not be empty');
  }

  if (!body.subject || typeof body.subject !== 'string') {
    throw new HttpError(400, 'subject is required and must be a string');
  }

  if (!body.content || (!body.content.html && !body.content.text)) {
    throw new HttpError(400, 'content with either html or text is required');
  }

  if (!body.fromEmail || typeof body.fromEmail !== 'string') {
    throw new HttpError(400, 'fromEmail is required and must be a string');
  }

  // Validate email addresses
  const allEmails = [
    ...body.recipients,
    body.fromEmail,
    ...(body.cc || []),
    ...(body.bcc || []),
    ...(body.replyTo ? [body.replyTo] : [])
  ];

  for (const email of allEmails) {
    if (!validateEmail(email)) {
      throw new HttpError(400, `Invalid email address: ${email}`);
    }
  }

  try {
    // Prepare email parameters
    const emailParams: any = {
      Source: body.fromName ? `${body.fromName} <${body.fromEmail}>` : body.fromEmail,
      Destination: {
        ToAddresses: body.recipients,
        ...(body.cc && body.cc.length > 0 && { CcAddresses: body.cc }),
        ...(body.bcc && body.bcc.length > 0 && { BccAddresses: body.bcc })
      },
      Message: {
        Subject: {
          Data: body.subject,
          Charset: 'UTF-8'
        },
        Body: {}
      },
      ...(body.replyTo && { ReplyToAddresses: [body.replyTo] }),
      ...(body.tags && body.tags.length > 0 && { Tags: body.tags }),
      ...(body.configurationSet && { ConfigurationSetName: body.configurationSet })
    };

    // Add content to message body
    if (body.content.html) {
      emailParams.Message.Body.Html = {
        Data: body.content.html,
        Charset: 'UTF-8'
      };
    }

    if (body.content.text) {
      emailParams.Message.Body.Text = {
        Data: body.content.text,
        Charset: 'UTF-8'
      };
    }

    // Send email via SES
    const command = new SendEmailCommand(emailParams);
    const result = await sesClient.send(command);

    return {
      success: true,
      messageId: result.MessageId,
      message: 'Email sent successfully'
    };

  } catch (error) {
    console.error('Error sending email:', error);
    
    // Handle specific SES errors
    if (error instanceof Error) {
      if (error.message.includes('MessageRejected')) {
        throw new HttpError(400, 'Email was rejected by SES. Please check your email content and recipient addresses.');
      }
      if (error.message.includes('MailFromDomainNotVerified')) {
        throw new HttpError(400, 'The sending domain is not verified in SES.');
      }
      if (error.message.includes('ConfigurationSetDoesNotExist')) {
        throw new HttpError(400, 'The specified configuration set does not exist.');
      }
    }

    throw new HttpError(500, `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
