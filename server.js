import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Email Configuration ----------
const emailEnabled = process.env.EMAIL_ENABLED === 'true';

function getEmailConfigError() {
  if (!emailEnabled) return null;

  const required = ['EMAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');
  if (missing.length > 0) {
    return `Missing email environment values: ${missing.join(', ')}`;
  }

  const placeholderValues = new Set([
    'your-email@gmail.com',
    'your-16-character-app-password'
  ]);

  if (placeholderValues.has(process.env.EMAIL_FROM) || placeholderValues.has(process.env.SMTP_USER) || placeholderValues.has(process.env.SMTP_PASS)) {
    return 'Email is still using placeholder Gmail credentials in .env';
  }

  if (process.env.SMTP_HOST === 'smtp.gmail.com' && !/^[a-z0-9]{16}$/i.test(process.env.SMTP_PASS.replace(/\s+/g, ''))) {
    return 'Gmail SMTP requires a 16-character app password, not your normal Google account password';
  }

  return null;
}

const emailConfigError = getEmailConfigError();
const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

const transporter = emailEnabled && !emailConfigError ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: smtpPass,
  },
}) : null;

// Verify email configuration on startup
if (emailEnabled && emailConfigError) {
  console.error('Email configuration error:', emailConfigError);
  console.error('For Gmail: enable 2-Step Verification, create an App Password, then set SMTP_USER and SMTP_PASS in .env.');
} else if (emailEnabled && transporter) {
  transporter.verify((error, success) => {
    if (error) {
      const gmailHelp = process.env.SMTP_HOST === 'smtp.gmail.com'
        ? ' Gmail rejects normal account passwords; use a Google App Password for SMTP_PASS.'
        : '';
      console.error(`Email configuration error: ${error.message}.${gmailHelp}`);
    } else {
      console.log('✅ Email server is ready to send messages');
    }
  });
}

// ---------- Email Functions & Templates ----------

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeDateString(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    const y = dateStr.getFullYear();
    const m = String(dateStr.getMonth() + 1).padStart(2, '0');
    const d = String(dateStr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const clean = String(dateStr).trim();
  if (!clean) return null;

  // Check YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
    const d = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const norm = normalizeDateString(dateStr);
    if (!norm) return escapeHtml(String(dateStr).trim());
    const [year, month, day] = norm.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[month - 1]} ${year}`;
  } catch (e) {
    return escapeHtml(dateStr);
  }
}

function calculateExpiryStatus(expiryDateStr) {
  const normDate = normalizeDateString(expiryDateStr);
  if (!normDate) {
    return { daysRemaining: Infinity, days: Infinity, status: 'NORMAL', priority: 'Normal', shouldAlert: false };
  }

  const [year, month, day] = normDate.split('-').map(Number);
  if (!year || !month || !day) {
    return { daysRemaining: Infinity, days: Infinity, status: 'NORMAL', priority: 'Normal', shouldAlert: false };
  }

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysRemaining = Math.round((targetDate.getTime() - todayUTC.getTime()) / 86400000);

  if (daysRemaining <= 0) {
    return { daysRemaining, days: daysRemaining, status: 'EXPIRED', priority: 'Critical', shouldAlert: true };
  }
  if (daysRemaining <= 3) {
    return { daysRemaining, days: daysRemaining, status: 'CRITICAL', priority: 'Critical', shouldAlert: true };
  }
  if (daysRemaining <= 7) {
    return { daysRemaining, days: daysRemaining, status: 'URGENT', priority: 'Urgent', shouldAlert: true };
  }
  if (daysRemaining <= 30) {
    return { daysRemaining, days: daysRemaining, status: 'WARNING', priority: 'Warning', shouldAlert: true };
  }

  return { daysRemaining, days: daysRemaining, status: 'NORMAL', priority: 'Normal', shouldAlert: false };
}

function getSafeDispatchDate(expiryDateStr) {
  const normDate = normalizeDateString(expiryDateStr);
  if (!normDate) return null;
  const [year, month, day] = normDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  const expiryDate = new Date(Date.UTC(year, month - 1, day));
  expiryDate.setUTCDate(expiryDate.getUTCDate() - 21);
  return expiryDate.toISOString().slice(0, 10);
}

function buildProductAlert(product) {
  const expiryStatus = calculateExpiryStatus(product.expiry);
  if (!expiryStatus.shouldAlert) return null;
  return {
    ...product,
    days: expiryStatus.daysRemaining,
    daysRemaining: expiryStatus.daysRemaining,
    status: expiryStatus.status,
    priority: expiryStatus.priority,
    shouldAlert: expiryStatus.shouldAlert,
    safeDispatchDate: getSafeDispatchDate(product.expiry)
  };
}

function getCountdownBadge(days) {
  if (days <= 0) {
    return {
      label: 'EXPIRED',
      badgeBg: '#dc2626',
      badgeColor: '#ffffff',
      cardBorder: '#ef4444',
      statusText: 'EXPIRED',
      priority: 'Critical'
    };
  } else if (days <= 3) {
    return {
      label: days === 1 ? '1 DAY REMAINING' : 'CRITICAL (' + days + ' DAYS)',
      badgeBg: '#dc2626',
      badgeColor: '#ffffff',
      cardBorder: '#ef4444',
      statusText: 'CRITICAL',
      priority: 'Critical'
    };
  } else if (days <= 7) {
    return {
      label: 'URGENT (' + days + ' DAYS)',
      badgeBg: '#ea580c',
      badgeColor: '#ffffff',
      cardBorder: '#f97316',
      statusText: 'URGENT',
      priority: 'Urgent'
    };
  } else if (days <= 30) {
    return {
      label: 'WARNING (' + days + ' DAYS)',
      badgeBg: '#d97706',
      badgeColor: '#ffffff',
      cardBorder: '#f59e0b',
      statusText: 'WARNING',
      priority: 'Warning'
    };
  }

  return {
    label: 'NORMAL',
    badgeBg: '#16a34a',
    badgeColor: '#ffffff',
    cardBorder: '#22c55e',
    statusText: 'NORMAL',
    priority: 'Normal'
  };
}

function buildAlertSubject(user, alerts) {
  const company = user.company ? user.company.trim() : 'CEC Warehouse';
  if (alerts.length === 1) {
    const item = alerts[0];
    if (item.days <= 0) {
      return `🔴 Critical FEFO Alert — ${item.name} EXPIRED | ${company}`;
    } else if (item.days <= 1) {
      const daysText = item.days === 1 ? '1 day' : 'less than 1 day';
      return `🔴 Critical FEFO Alert — ${item.name} expires in ${daysText} | ${company}`;
    } else if (item.days <= 3) {
      return `🔴 Critical FEFO Alert — ${item.name} expires in ${item.days} days | ${company}`;
    } else if (item.days <= 7) {
      return `🟠 Urgent FEFO Alert — ${item.name} expires in ${item.days} days | ${company}`;
    } else {
      return `🟠 FEFO Warning — ${item.name} expiring soon (${item.days} days) | ${company}`;
    }
  } else {
    const hasCritical = alerts.some(a => a.days <= 3);
    if (hasCritical) {
      return `🔴 Critical FEFO Alert — ${alerts.length} Products Require Attention | ${company}`;
    } else {
      return `🟠 FEFO Warning — ${alerts.length} Products Expiring Soon | ${company}`;
    }
  }
}

async function sendAlertEmail(user, alerts) {
  if (!emailEnabled || !transporter) {
    if (emailConfigError) {
      console.log(`Email notifications unavailable: ${emailConfigError}`);
    } else {
      console.log('📧 Email notifications disabled');
    }
    return { sent: false, reason: emailConfigError ? 'email_config_error' : 'email_disabled', message: emailConfigError || 'Email notifications disabled' };
  }

  if (!user.email) return { sent: false, reason: 'missing_recipient_email' };
  if (alerts.length === 0) return { sent: false, reason: 'no_alerts' };

  const urgentAlerts = alerts.filter(a => a.shouldAlert || ['EXPIRED', 'CRITICAL', 'URGENT', 'WARNING'].includes(a.status));
  
  if (urgentAlerts.length === 0) return { sent: false, reason: 'no_urgent_or_expired_alerts' };

  const subject = buildAlertSubject(user, urgentAlerts);
  const emailHtml = generateAlertEmailHTML(user, urgentAlerts);
  const emailText = generateAlertEmailText(user, urgentAlerts);

  try {
    const info = await transporter.sendMail({
      from: `"Warehouse Alert System" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: subject,
      text: emailText,
      html: emailHtml,
    });

    console.log('✅ Alert email sent to:', user.email, 'Message ID:', info.messageId);
    
    // Log email notification in database - ISOLATED IN TRY/CATCH
    try {
      await db.run(
        `INSERT INTO email_logs (userId, email, alertCount, sentAt) VALUES ($1, $2, $3, $4)`,
        [user.id, user.email, urgentAlerts.length, now()]
      );
    } catch (logError) {
      console.error('❌ Error logging email notification:', logError);
    }
    
    return { sent: true, to: user.email, alertCount: urgentAlerts.length, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending alert email:', error);
    return { sent: false, reason: 'send_failed', message: error.message };
  }
}

function generateAlertEmailHTML(user, alerts) {
  const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  const hasExpired = alerts.some(a => a.days <= 0);
  const hasCritical = alerts.some(a => a.days <= 3);

  // Banner colors
  let bannerBg = '#fef2f2';
  let bannerBorder = '#dc2626';
  let bannerTitleColor = '#991b1b';
  let bannerTextColor = '#7f1d1d';
  let bannerIcon = '🔴';
  let bannerTitle = 'CRITICAL INVENTORY ALERT';

  if (!hasExpired && !hasCritical) {
    bannerBg = '#fffbe6';
    bannerBorder = '#d97706';
    bannerTitleColor = '#92400e';
    bannerTextColor = '#78350f';
    bannerIcon = '🟠';
    bannerTitle = 'FEFO INVENTORY WARNING';
  }

  // Product Cards HTML
  const productCardsHtml = alerts.map(alert => {
    const badge = getCountdownBadge(alert.days);
    const formattedExpiry = formatDate(alert.expiry);
    const formattedDispatch = formatDate(alert.safeDispatchDate || alert.safedispatchdate);
    const batchNo = escapeHtml(alert.batchNumber || alert.batch || ('BATCH-' + alert.id));
    const category = escapeHtml(alert.category || 'General Inventory');
    const qtyDisplay = (alert.qty !== undefined && alert.qty !== null && alert.qty !== '') ? `${alert.qty} Units` : 'N/A';
    const priceDisplay = (alert.price !== undefined && alert.price !== null && alert.price !== '') ? `₹${alert.price}` : 'N/A';

    return `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid ${badge.cardBorder}; border-radius: 10px; margin-bottom: 20px; overflow: hidden; border-spacing: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <!-- Card Header -->
        <tr>
          <td style="background-color: #f8fafc; padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <span style="font-size: 17px; font-weight: 800; color: #0f172a; display: inline-block; vertical-align: middle;">${escapeHtml(alert.name)}</span>
                  <span style="display: inline-block; background-color: #e2e8f0; color: #475569; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; margin-left: 8px; vertical-align: middle;">
                    ID: ${escapeHtml(alert.id)}
                  </span>
                </td>
                <td align="right">
                  <!-- Expiry Countdown Pill -->
                  <span style="display: inline-block; background-color: ${badge.badgeBg}; color: ${badge.badgeColor}; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 20px; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${badge.label}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card Body -->
        <tr>
          <td style="padding: 20px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <!-- Col 1 -->
                <td width="50%" valign="top" style="padding-right: 12px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Expiry Date</td>
                    </tr>
                    <tr>
                      <td style="font-size: 14px; font-weight: 700; color: #dc2626; padding-bottom: 14px;">${formattedExpiry}</td>
                    </tr>
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Safe Dispatch By</td>
                    </tr>
                    <tr>
                      <td style="font-size: 13px; font-weight: 600; color: #1e293b; padding-bottom: 14px;">${formattedDispatch}</td>
                    </tr>
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Batch Number</td>
                    </tr>
                    <tr>
                      <td style="font-size: 13px; font-weight: 600; color: #334155;">${batchNo}</td>
                    </tr>
                  </table>
                </td>

                <!-- Col 2 -->
                <td width="50%" valign="top" style="padding-left: 12px; border-left: 1px dashed #e2e8f0;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Quantity Available</td>
                    </tr>
                    <tr>
                      <td style="font-size: 14px; font-weight: 700; color: #0f172a; padding-bottom: 14px;">${qtyDisplay}</td>
                    </tr>
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Category</td>
                    </tr>
                    <tr>
                      <td style="font-size: 13px; font-weight: 600; color: #334155; padding-bottom: 14px;">${category}</td>
                    </tr>
                    <tr>
                      <td style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; padding-bottom: 3px;">Unit Price</td>
                    </tr>
                    <tr>
                      <td style="font-size: 13px; font-weight: 600; color: #334155;">${priceDisplay}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  // Summary Rows HTML
  const summaryRowsHtml = alerts.map((alert, idx) => {
    const badge = getCountdownBadge(alert.days);
    const formattedExpiry = formatDate(alert.expiry);
    const actionText = alert.days <= 0 ? 'Quarantine & Replace' : 'Dispatch Immediately';
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    return `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #0f172a;">${escapeHtml(alert.name)}</td>
        <td style="padding: 10px 12px; font-size: 12px; color: #64748b;">${escapeHtml(alert.id)}</td>
        <td style="padding: 10px 12px; font-size: 12px; color: #334155; font-weight: 600;">${formattedExpiry}</td>
        <td style="padding: 10px 12px; font-size: 12px;">
          <span style="color: ${badge.badgeBg}; font-weight: 700;">${alert.days <= 0 ? 'Expired' : `${alert.days} day${alert.days > 1 ? 's' : ''}`}</span>
        </td>
        <td style="padding: 10px 12px; font-size: 12px; color: #0f172a; font-weight: 600;">${badge.priority}</td>
        <td style="padding: 10px 12px; font-size: 12px; color: #0369a1; font-weight: 700;">${actionText}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FEFO Inventory Alert</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
          <td align="center">
            <!-- Main Email Container -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
              
              <!-- Enterprise Header -->
              <tr>
                <td style="background-color: #0f172a; padding: 28px 32px; text-align: left;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <div style="font-size: 11px; font-weight: 700; color: #38bdf8; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px;">
                          INVENTORY INTELLIGENCE
                        </div>
                        <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                          FEFO Inventory Management
                        </div>
                      </td>
                      <td align="right" valign="middle">
                        <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); padding: 6px 14px; border-radius: 6px; color: #e2e8f0; font-size: 12px; font-weight: 600;">
                          ${escapeHtml(user.company || 'CEC Warehouse')}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Urgent Banner Section -->
              <tr>
                <td style="padding: 24px 32px 12px 32px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bannerBg}; border-left: 4px solid ${bannerBorder}; border-radius: 8px; padding: 18px 20px;">
                    <tr>
                      <td>
                        <div style="font-size: 14px; font-weight: 800; color: ${bannerTitleColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                          ${bannerIcon} ${bannerTitle}
                        </div>
                        <div style="font-size: 13px; color: ${bannerTextColor}; margin-top: 4px; line-height: 1.5;">
                          <strong>${alerts.length}</strong> product${alerts.length > 1 ? 's require' : ' requires'} immediate FEFO attention for <strong>${escapeHtml(user.company)}</strong>.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Greeting -->
              <tr>
                <td style="padding: 12px 32px 16px 32px;">
                  <p style="font-size: 15px; color: #334155; margin: 0; line-height: 1.6;">
                    Hello <strong>${escapeHtml(user.name)}</strong>,
                  </p>
                  <p style="font-size: 14px; color: #64748b; margin: 6px 0 0 0; line-height: 1.5;">
                    The automated FEFO monitoring engine has flagged inventory approaching or past its expiration threshold. Please review the details below:
                  </p>
                </td>
              </tr>

              <!-- Product Cards Loop -->
              <tr>
                <td style="padding: 0 32px 8px 32px;">
                  ${productCardsHtml}
                </td>
              </tr>

              <!-- FEFO Recommendation Box -->
              <tr>
                <td style="padding: 8px 32px 24px 32px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px;">
                    <tr>
                      <td>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td style="font-size: 12px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 1px;">
                              RECOMMENDED ACTION (FEFO PRINCIPLE)
                            </td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px; color: #0c4a6e; line-height: 1.6; padding-top: 6px;">
                              This product is approaching its expiry date. According to <strong>First Expired, First Out (FEFO)</strong> principles, prioritize this inventory for dispatch before newer stock.
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top: 16px;">
                              <a href="${appUrl}/inventory.html" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; letter-spacing: 0.3px;">
                                [ VIEW INVENTORY ]
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Alert Summary Section -->
              <tr>
                <td style="padding: 0 32px 24px 32px;">
                  <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">
                    ALERT SUMMARY
                  </div>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Product</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">ID</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Expiry</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Remaining</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Priority</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">FEFO Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${summaryRowsHtml}
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
                  <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 4px;">
                    Warehouse Intelligence &bull; FEFO Inventory Management System
                  </div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
                    This is an automated operational notification generated for <strong>${escapeHtml(user.company)}</strong>. Please do not reply to this email.
                  </div>
                  <div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
                    <a href="${appUrl}/dashboard.html" style="color: #2563eb; text-decoration: none; margin: 0 8px;">Dashboard</a> |
                    <a href="${appUrl}/inventory.html" style="color: #2563eb; text-decoration: none; margin: 0 8px;">Inventory</a> |
                    <a href="${appUrl}/reports.html" style="color: #2563eb; text-decoration: none; margin: 0 8px;">Reports</a>
                  </div>
                  <div style="font-size: 11px; color: #94a3b8;">
                    &copy; 2026 ${escapeHtml(user.company || 'CEC')} Warehouse Management System. All rights reserved.
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function generateAlertEmailText(user, alerts) {
  const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  let text = `====================================================\n`;
  text += `   FEFO INVENTORY EXPIRY ALERT — WAREHOUSE INTELLIGENCE\n`;
  text += `====================================================\n\n`;
  text += `Company: ${user.company}\n`;
  text += `Recipient: ${user.name} (${user.email})\n`;
  text += `Total Alert Items: ${alerts.length}\n\n`;
  text += `----------------------------------------------------\n`;
  text += `ALERT PRODUCTS SUMMARY\n`;
  text += `----------------------------------------------------\n\n`;

  alerts.forEach((alert, i) => {
    const badge = getCountdownBadge(alert.days);
    text += `[${i + 1}] ${alert.name} (ID: ${alert.id})\n`;
    text += `    Status:        ${badge.label}\n`;
    text += `    Expiry Date:   ${formatDate(alert.expiry)}\n`;
    text += `    Safe Dispatch: ${formatDate(alert.safeDispatchDate || alert.safedispatchdate)}\n`;
    text += `    Quantity:      ${alert.qty !== undefined ? alert.qty : 'N/A'}\n`;
    text += `    Category:      ${alert.category || 'General Inventory'}\n`;
    text += `    Batch No:      ${alert.batchNumber || alert.batch || 'BATCH-' + alert.id}\n\n`;
  });

  text += `----------------------------------------------------\n`;
  text += `RECOMMENDED FEFO ACTION\n`;
  text += `----------------------------------------------------\n`;
  text += `This product is approaching its expiry date. According to FEFO (First Expired, First Out) principles, prioritize this inventory for dispatch before newer stock.\n\n`;
  text += `View Inventory Dashboard: ${appUrl}/inventory.html\n\n`;
  text += `====================================================\n`;
  text += `© 2026 ${user.company || 'CEC'} Warehouse Management System\n`;
  text += `Automated Notification — Please do not reply\n`;

  return text;
}

// Check and send alerts for a specific user
async function checkAndSendUserAlerts(userId) {
  try {
    const user = await db.get(`SELECT id, email, name, company FROM users WHERE id = $1`, [userId]);
    if (!user) return { sent: false, reason: 'user_not_found' };

    // FETCH by COMPANY for alerts
    const products = await db.all(`SELECT * FROM products WHERE company = $1`, [user.company]);
    
    const alerts = products
      .map(buildProductAlert)
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    if (alerts.length > 0) {
      return await sendAlertEmail(user, alerts);
    }
    return { sent: false, reason: 'no_alerts' };
  } catch (error) {
    console.error('Error checking alerts for user:', userId, error);
    return { sent: false, reason: 'alert_check_failed', message: error.message };
  }
}

// Check alerts for all users (scheduled task)
async function checkAllUsersAlerts() {
  try {
    const users = await db.all(`SELECT id FROM users`);
    console.log(`🔍 Checking alerts for ${users.length} users...`);
    
    for (const user of users) {
      await checkAndSendUserAlerts(user.id);
    }
  } catch (error) {
    console.error('Error checking all user alerts:', error);
  }
}

// Schedule alert checks (every 6 hours)
if (emailEnabled) {
  setInterval(checkAllUsersAlerts, 6 * 60 * 60 * 1000); // 6 hours
  console.log('📅 Scheduled alert checks every 6 hours');
  
  // Run initial check after 1 minute
  setTimeout(checkAllUsersAlerts, 60 * 1000);
}

// ---------- Helpers ----------
function now(){ return Date.now(); }

function fmtID(prefix, n){ return prefix + String(n).padStart(4,'0'); }

// ---------- Auth Middleware ----------
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT id, email, name, company FROM users WHERE id = $1', [decoded.userId]);
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ---------- Auth Routes ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, company, password } = req.body;
    
    if (!name || !email || !company || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const userId = 'user_' + Date.now();
    await db.run(
      'INSERT INTO users (id, name, email, company, password, createdAt) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, name, email, company, hashedPassword, now()]
    );
    
    res.json({
      success: true,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find user
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Update last login
    await db.run('UPDATE users SET lastLogin = $1 WHERE id = $2', [now(), user.id]);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ---------- User Profile Routes ----------
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Name cannot be empty' });
    }
    
    await db.run('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), userId]);
    
    const updatedUser = await db.get('SELECT id, email, name, company FROM users WHERE id = $1', [userId]);
    
    console.log(`[user/profile] Updated profile for user id=${userId}, email=${updatedUser.email}`);
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed. Please try again.'
    });
  }
});

// ---------- NEW: Change Password Route ----------
app.put('/api/user/password', authenticateToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the user's password
    await db.run('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    console.log(`[user/password] Updated password for user id=${userId}`);
    res.json({
      success: true,
      message: 'Password updated successfully. Please log in with your new password.'
    });

  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({
      success: false,
      message: 'Password update failed. Please try again.'
    });
  }
});
// ----------------------------------------------------

// ---------- Email Update Route ----------
app.put('/api/user/email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email cannot be empty' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Check if email already exists for another user
    const existingUser = await db.get(`SELECT id FROM users WHERE email = $1 AND id != $2`, [email.trim(), userId]);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already in use by another user' });
    }

    // Update the email
    await db.run(`UPDATE users SET email = $1 WHERE id = $2`, [email.trim(), userId]);

    const updatedUser = await db.get(
      `SELECT id, email, name, company FROM users WHERE id = $1`,
      [userId]
    );

    console.log(`✅ Email updated for user ${userId}: ${updatedUser.email}`);

    res.json({ 
      success: true, 
      message: 'Email updated successfully. You will now receive alerts at this address.', 
      user: updatedUser 
    });
  } catch (error) {
    console.error('Email update error:', error);
    res.status(500).json({ success: false, message: 'Email update failed. Please try again.' });
  }
});

// ---------- Manual Email Test Endpoint ----------
app.post('/api/test-email', authenticateToken, async (req, res) => {
  try {
    if (emailConfigError) {
      return res.status(400).json({ success: false, message: emailConfigError });
    }

    const emailResult = await checkAndSendUserAlerts(req.user.id);
    res.json({ success: Boolean(emailResult?.sent), message: emailResult?.sent ? 'Test email sent! Check your inbox.' : 'No test email was sent.', emailResult });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email' });
  }
});

// ---------- Protected Routes (require authentication) ----------
// CRITICAL: All product/order/dispatch queries now filter by req.user.company

async function triggerProductAlertCheck(userId, product, actionLabel) {
  const expiryStatus = calculateExpiryStatus(product.expiry);
  const alertRequired = expiryStatus.shouldAlert ? 'YES' : 'NO';
  console.log(`[${actionLabel}] Product saved: ${product.name} (ID: ${product.id})`);
  console.log(`[Expiry Check] Days remaining: ${expiryStatus.daysRemaining} | Status: ${expiryStatus.status} | Alert required: ${alertRequired}`);

  if (!expiryStatus.shouldAlert) {
    return { sent: false, reason: 'no_alert_needed', expiryStatus };
  }

  try {
    console.log(`[Email Alert] Sending email check for user: ${userId}...`);
    const emailResult = await checkAndSendUserAlerts(userId);
    if (emailResult?.sent) {
      console.log(`[Email Alert] ✅ Email sent successfully (Message ID: ${emailResult.messageId})`);
    } else {
      console.warn(`[Email Alert] Email not sent: ${emailResult?.reason || 'unknown_reason'}`, emailResult?.message || '');
    }
    return { ...emailResult, expiryStatus };
  } catch (error) {
    console.error(`[Email Alert] ❌ Email check failed after product save:`, error);
    return { sent: false, reason: 'email_trigger_failed', message: error.message, expiryStatus };
  }
}

// Products
app.get('/api/products', authenticateToken, async (req, res) => {
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    // FILTER BY COMPANY
    const rows = await db.all('SELECT * FROM products WHERE company = $1 ORDER BY createdAt DESC', [req.user.company]);
    res.json(rows);
  } catch (e) {
    console.error('Products fetch error:', e);
    res.status(500).json({error:e.message});
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  const { id, name, category, qty=0, price=0, expiry=null } = req.body || {};
  const low = 10;
  if(!id || !name) return res.status(400).json({error:'id and name required'});
  
  try{
    // INSERT company field
    await db.run(
      `INSERT INTO products(id,name,category,qty,price,expiry,low,createdAt,userId,company) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [String(id), String(name), String(category||''), parseInt(qty||0,10),
        parseFloat(price||0), expiry||null, parseInt(low,10), now(), req.user.id, req.user.company]
    );
    const savedProduct = { id: String(id), name: String(name), category: String(category||''), qty: parseInt(qty||0,10), price: parseFloat(price||0), expiry: expiry||null, company: req.user.company };
    const emailResult = await triggerProductAlertCheck(req.user.id, savedProduct, 'Product Creation');
    res.json({ok:true, emailSent: Boolean(emailResult?.sent), emailResult});
  }catch(e){
    console.error('Product creation error:', e);
    res.status(400).json({error:e.message});
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  // FILTER BY COMPANY
  const p = await db.get('SELECT * FROM products WHERE id=$1 AND company=$2', [id, req.user.company]);
  if(!p) return res.status(404).json({error:'not found'});
  
  const { name=p.name, category=p.category, qty=p.qty, price=p.price, expiry=p.expiry } = req.body || {};
  try {
    // FILTER BY COMPANY
    await db.run(
      `UPDATE products SET name=$1, category=$2, qty=$3, price=$4, expiry=$5 WHERE id=$6 AND company=$7`,
      [String(name), String(category||''), parseInt(qty||0,10), parseFloat(price||0), expiry||null, id, req.user.company]
    );
    const savedProduct = { id: String(id), name: String(name), category: String(category||''), qty: parseInt(qty||0,10), price: parseFloat(price||0), expiry: expiry||null, company: req.user.company };
    const emailResult = await triggerProductAlertCheck(req.user.id, savedProduct, 'Product Update');
    res.json({ok:true, emailSent: Boolean(emailResult?.sent), emailResult});
  } catch(e) {
    console.error('Product update error:', e);
    res.status(500).json({error:e.message});
  }
});

app.delete('/api/products/all', authenticateToken, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM products WHERE company = $1', [req.user.company]);
    console.log(`[Delete All] Removed all products for company: ${req.user.company}`);
    res.json({ ok: true, message: 'All products deleted successfully', count: result.changes || 0 });
  } catch (e) {
    console.error('Delete all products error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    // FILTER BY COMPANY
    await db.run('DELETE FROM products WHERE id=$1 AND company=$2', [req.params.id, req.user.company]);
    res.json({ok:true});
  } catch(e) {
    console.error('Product delete error:', e);
    res.status(500).json({error:e.message});
  }
});

app.post('/api/products/bulk', authenticateToken, async (req, res) => {
  const { products } = req.body || {};
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Array of products required' });
  }

  const low = 10;
  let addedCount = 0;
  let updatedCount = 0;
  const errors = [];

  try {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p || typeof p !== 'object') continue;

      try {
        const rawName = String(p.name || '').trim();
        const rawId = String(p.id || '').trim();

        // If both ID and name are missing, skip row
        if (!rawName && !rawId) continue;

        const pname = rawName || `Product ${rawId}`;
        const pid = rawId || ('PRD-' + Date.now().toString().slice(-6) + '-' + (i + 1));
        const pcat = String(p.category || 'General').trim() || 'General';
        
        let pqty = 0;
        if (typeof p.qty === 'number') {
          pqty = isNaN(p.qty) ? 0 : Math.max(0, Math.round(p.qty));
        } else if (p.qty !== null && p.qty !== undefined) {
          const cleanQty = String(p.qty).replace(/[^0-9.-]/g, '');
          const parsedQty = parseInt(cleanQty, 10);
          pqty = isNaN(parsedQty) ? 0 : Math.max(0, parsedQty);
        }

        let pprice = 0;
        if (typeof p.price === 'number') {
          pprice = isNaN(p.price) ? 0 : Math.max(0, p.price);
        } else if (p.price !== null && p.price !== undefined) {
          const cleanPrice = String(p.price).replace(/[^0-9.-]/g, '');
          const parsedPrice = parseFloat(cleanPrice);
          pprice = isNaN(parsedPrice) ? 0 : Math.max(0, parsedPrice);
        }

        const pexp = normalizeDateString(p.expiry);

        const existing = await db.get('SELECT id FROM products WHERE id=$1 AND company=$2', [pid, req.user.company]);
        if (existing) {
          await db.run(
            `UPDATE products SET name=$1, category=$2, qty=$3, price=$4, expiry=$5 WHERE id=$6 AND company=$7`,
            [pname, pcat, pqty, pprice, pexp, pid, req.user.company]
          );
          updatedCount++;
        } else {
          await db.run(
            `INSERT INTO products(id,name,category,qty,price,expiry,low,createdAt,userId,company) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [pid, pname, pcat, pqty, pprice, pexp, parseInt(low, 10), now(), req.user.id, req.user.company]
          );
          addedCount++;
        }
      } catch (rowError) {
        console.error(`[Bulk Import] Error importing product at row ${i + 1}:`, rowError);
        errors.push({ row: i + 1, error: rowError.message });
      }
    }

    console.log(`[Bulk Import] Company ${req.user.company}: Added ${addedCount}, Updated ${updatedCount} products. Errors: ${errors.length}`);
    const emailResult = await checkAndSendUserAlerts(req.user.id);
    res.json({
      ok: true,
      message: `Bulk import complete: ${addedCount} added, ${updatedCount} updated.`,
      addedCount,
      updatedCount,
      totalProcessed: addedCount + updatedCount,
      totalRows: products.length,
      errors: errors.length > 0 ? errors : undefined,
      emailSent: Boolean(emailResult?.sent),
      emailResult
    });
  } catch (e) {
    console.error('Bulk product import error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Orders + Items + Auto Dispatch
app.get('/api/orders', authenticateToken, async (req, res) => {
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    // FILTER BY COMPANY
    const orders = await db.all('SELECT * FROM orders WHERE company = $1 ORDER BY date DESC', [req.user.company]);
    const items = await db.all(`
      SELECT oi.* FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.company = $1
    `, [req.user.company]);
    
    const map = {};
    orders.forEach(o => map[o.id] = {...o, items: []});
    items.forEach(it => {
      if(map[it.order_id]) map[it.order_id].items.push({ pid: it.product_id, qty: it.qty });
    });
    res.json(Object.values(map));
  } catch(e) {
    console.error('Orders fetch error:', e);
    res.status(500).json({error:e.message});
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  let { id, customer, date, items=[] } = req.body || {};
  if(!customer || !Array.isArray(items) || items.length===0) return res.status(400).json({error:'customer and items required'});
  
  try {
    // FILTER BY COMPANY
    const last = await db.get('SELECT id FROM orders WHERE company = $1 ORDER BY createdAt DESC LIMIT 1', [req.user.company]);
    const nextNum = last ? (parseInt(String(last.id).replace(/\D/g,'')) + 1) : 5001;
    id = id || fmtID('O', nextNum);
    
    // FILTER BY COMPANY
    const products = await db.all('SELECT * FROM products WHERE company = $1', [req.user.company]);
    const ok = items.every(it => {
      const p = products.find(pp => pp.id === it.pid);
      return p && p.qty >= it.qty;
    });
    
    const status = ok ? 'Ready to Ship' : 'Pending';
    // INSERT company field
    await db.run(
      'INSERT INTO orders(id, customer, date, status, userId, company) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, customer, date || new Date().toISOString().slice(0,10), status, req.user.id, req.user.company]
    );
    
    for(const it of items){
      await db.run('INSERT INTO order_items(order_id, product_id, qty) VALUES ($1, $2, $3)',
        [id, it.pid, parseInt(it.qty||0,10)]);
    }
    
    let dispatchId = null;
    if(ok){
      for(const it of items){
        // FILTER BY COMPANY
        await db.run('UPDATE products SET qty = qty - $1 WHERE id = $2 AND company = $3', [parseInt(it.qty||0,10), it.pid, req.user.company]);
      }
      
      // FILTER BY COMPANY
      const lastD = await db.get('SELECT id FROM dispatches WHERE company = $1 ORDER BY createdAt DESC LIMIT 1', [req.user.company]);
      const nextD = lastD ? (parseInt(String(lastD.id).replace(/\D/g,'')) + 1) : 1001;
      dispatchId = fmtID('D', nextD);
      // INSERT company field
      await db.run(
        'INSERT INTO dispatches(id, order_id, transport, status, createdAt, userId, company) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [dispatchId, id, 'Truck', 'Dispatched', now(), req.user.id, req.user.company]
      );
    }
    
    res.json({ok:true, id, dispatchId, status});
  } catch(e) {
    console.error('Order creation error:', e);
    res.status(500).json({error:e.message});
  }
});

// Dispatches
app.get('/api/dispatches', authenticateToken, async (req, res) => {
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    // FILTER BY COMPANY
    const rows = await db.all('SELECT * FROM dispatches WHERE company = $1 ORDER BY createdAt DESC', [req.user.company]);
    res.json(rows);
  } catch(e) {
    console.error('Dispatches fetch error:', e);
    res.status(500).json({error:e.message});
  }
});

// Metrics for Dashboard
app.get('/api/metrics', authenticateToken, async (req, res) => {
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    // FILTER BY COMPANY
    const products = await db.all('SELECT * FROM products WHERE company = $1', [req.user.company]);
    const value = products.reduce((sum,p)=> sum + (p.qty*(p.price||0)), 0);
    const productStatuses = products.map((p) => calculateExpiryStatus(p.expiry));
    const soon = productStatuses.filter((status) => status.shouldAlert && status.daysRemaining >= 0).length;
    const expired = productStatuses.filter((status) => status.status === 'EXPIRED').length;
    const low = products.filter(p => (p.qty||0) <= (p.low||0)).length;
    const recent = products.filter(p => (Date.now() - (p.createdat||0)) <= 7*24*3600*1000).length;
    const safe = products.length - soon - expired;
    // FILTER BY COMPANY
    const ready = await db.get('SELECT COUNT(*) as c FROM dispatches WHERE status=$1 AND company=$2', ['Dispatched', req.user.company]);
    
    res.json({
      totalProducts: products.length,
      safe, soon, expired, low, recent,
      dispatchReady: ready.c,
      value
    });
  } catch(e) {
    console.error('Metrics fetch error:', e);
    res.status(500).json({error:e.message});
  }
});

// CRITICAL: Alerts endpoint - THIS IS WHAT POPULATES THE BELL ICON
app.get('/api/alerts', authenticateToken, async (req, res) => {
  // Prevent caching - always fetch fresh data
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    // ADD THIS LINE to explicitly set the response type
    'Content-Type': 'application/json' 
  });
  
  try {
    // FILTER BY COMPANY
    const products = await db.all('SELECT * FROM products WHERE company = $1', [req.user.company]);
    
    const alerts = products
      .map(buildProductAlert)
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
    
    // SEND THE RESPONSE
    res.json({alerts});
  } catch(e) {
    console.error('Alerts fetch error:', e);
    // SEND THE ERROR RESPONSE
    res.status(500).json({error:e.message, alerts: []});
  }
});

// ---------- Public Routes ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log('📧 Email notifications: ' + (emailEnabled ? 'ENABLED ✅' : 'DISABLED ❌'));
    console.log(`🔍 Visit http://localhost:${PORT} to start using the warehouse management system\n`);
  });
}

export default app;

