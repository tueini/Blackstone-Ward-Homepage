'use strict';
// Blackstone Ward sign-up / RSVP Functions, codebase 'signup' (Signup Phase 1, 2026-11-25).
// Deploy ONLY with: firebase deploy --only functions:signup --project blackstoneward-b861c (from BW_Home), after
// Duane's explicit approval. This codebase never touches the 'default' codebase (passkeyApi, sendFeedbackEmail,
// tdReschedule, tdPublicSync, changeRequestNotify) or BW_Platform's 'platform' codebase.
// SendGrid key: Functions secret SENDGRID_API_KEY (already used by BW_Youth sendFeedbackEmail); referenced by name only.
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { createApp } = require('./lib/app');
const { makeMailer } = require('./lib/mail');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const app = createApp({ db, auth: admin.auth(), mailer: makeMailer(db) });

// Same runtime service account as sendFeedbackEmail, which can already read the SENDGRID_API_KEY secret.
const SERVICE_ACCOUNT = 'blackstoneward-b861c@appspot.gserviceaccount.com';

exports.signupApi = onRequest(
  { region: 'us-central1', cors: false, maxInstances: 10, memory: '256MiB', secrets: ['SENDGRID_API_KEY'], serviceAccount: SERVICE_ACCOUNT },
  app.handler
);

exports.signupDaily = onSchedule(
  { schedule: 'every day 07:00', timeZone: 'America/New_York', region: 'us-central1', memory: '256MiB', secrets: ['SENDGRID_API_KEY'], serviceAccount: SERVICE_ACCOUNT },
  async () => {
    const r = await app.runDaily();
    console.log('signupDaily', JSON.stringify(r));
  }
);
