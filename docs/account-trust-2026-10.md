# Account trust — October 2026

Who may do what on BuyNSellem, and how a person gets there. Two proofs,
asked for in order and only when they protect someone:

- **Verified email**: proves the account reaches a real inbox. Every
  account has it, because signing in requires it.
- **Verified phone**: proves a reachable person, by SMS code. It is asked for
  where the other side relies on being able to reach them, or where money moves.

## 1. What exists today

**Email:**
- Accounts created with a password have no email check at all. Only Google,
  Apple and Facebook vouch for theirs.
- Payload sends no email at all: no adapter is configured. So the
  forgot-password emails never leave the server either.

**Phone:**
- The phone is verified by SMS code (`/api/account/phone/*`).
- It is required to create a shop, join a shop's team, order (cash on
  delivery), be a courier and receive payouts.

**What anyone with an account can do:** publish an ad, reveal a seller's
number and buy a boost.

## 2. The ladder

| Step | How | Unlocks |
| --- | --- | --- |
| Visitor | — | Browse, search, view ads and shops |
| Account, email verified | Sign up, then the link in the email; Google, Apple or Facebook count as verified | Sign in; favourites, saved searches, messages to sellers, reports, reviews of a purchase |
| Phone verified | SMS code, from the account or at the moment it is needed | Publish an ad, show a seller's number, boost, create or join a shop, order, receive payouts |

## 3. Why these lines

**The email is checked at sign-up, and signing in waits for it.** This is
Payload's own `auth.verify`:
- an account cannot sign in before the link is followed;
- every session therefore belongs to a real inbox;
- nothing downstream has to ask again.

**Publishing an ad needs a verified phone.** A buyer calls or messages the
seller about the ad. Fake ads, the first tool of scams here, then each cost a
real SIM.
- A draft can still be written and saved before the phone is verified.
- The ad form shows the requirement before the seller types everything, not
  at the last step.

**Showing a seller's number needs a verified phone.** The seller's number is
personal: a verified caller is accountable, and scraping numbers with
throwaway accounts stops. Messages stay open to every account: they need no
number.

**Boosting needs a verified phone.** Money moves, and the paid ad must
reach a reachable seller.

**Already in place (unchanged):** shops, team, orders, couriers and payouts.

## 4. Email verification, in detail

- **Payload's `auth.verify` on `users`.** The email is sent when the account
  is created and links to the web page `/auth/verify-email?token=…`. That page
  calls `POST /api/users/verify/:token` and then offers to sign in.
- **The email is in the reader's language.** The sign-up form sends the
  interface language with the account (`users.language`).
- **A resend that Payload does not have.** `POST /api/account/email/resend`
  takes an email address:
  - it issues a new token and sends the email again;
  - one minute must pass between two sends;
  - it answers the same way whether or not the address has an account, so it
    cannot be used to find out who is registered.
- **Sign-up and sign-in move to a "check your email" screen**, on both web
  and mobile:
  - sign-up no longer signs in automatically;
  - a sign-in refused for an unverified email offers the resend.
- **Accounts from Google, Apple or Facebook** are created verified, and no
  email is sent.
- **Existing accounts** are marked verified by a migration (grandfathered).
  Without it, every current session would end: Payload's session check
  requires `_verified`.
- **Sending email.** SMTP through `@payloadcms/email-nodemailer`, set by the
  `SMTP_*` variables. Without them, Payload writes the emails to the log, as it
  does in development. The same adapter makes the forgot-password email
  actually leave.

## 5. Phone gates, in detail

- **One shared table.** `contracts/accountTrust.ts` maps each gated action to
  its requirement. The API enforces it; web and mobile read the same table, so
  they prompt before the request rather than after a refusal.
- **One refusal.** A refusal answers `auth.phoneRequired` (403). The apps
  answer it by opening the phone verification they already have, then retrying
  the action.
- **Publishing.** The listing refuses to enter `pending` or `published` for a
  seller without a verified phone. Drafts and the service's own writes
  (products, moderation) are unaffected.

## 6. Known limits

- **The verification link never expires.** Payload stores a random 40-character
  token and checks no age. A resend replaces it, so only the latest link works.
- **Accounts created before this change** keep signing in without having
  verified their email.
