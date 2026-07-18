# Twilio A2P 10DLC registration (do before pilot)

Business SMS to US/Canada numbers requires **A2P 10DLC** registration. Approval
can take **several days**, so start it in week 1 — not the day before go-live.

## Checklist (SCH-26 AC4 — must be complete before texting real staff)

- [ ] Twilio account upgraded from trial (trial only texts verified numbers).
- [ ] **Brand** registered (business legal name, EIN/BN, address).
- [ ] **Campaign** registered (use case: *low volume mixed / customer care*;
      sample messages = the cover-ask + confirmation copy from
      `src/lib/notifications/templates.ts`).
- [ ] A sending phone number added to the Messaging Service tied to the campaign.
- [ ] Campaign shows **approved/registered** in the Twilio console.
- [ ] Opt-in language documented (staff consent to receive shift texts) and an
      opt-out (STOP) path confirmed working.

## How SMS is gated in the app

The SMS channel (`src/lib/notifications/channels/twilio-sms.ts`) is only
registered by `getNotificationService` (`factory.ts`) when **`SMS_LIVE=true`** and
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` are all set.
With any of those missing, an `sms`/`both` preference is logged as `queued` and no
Twilio request is made — so dev/CI can never text real staff.

Enable `SMS_LIVE=true` in the production Vercel environment **only after** the
checklist above is complete.
