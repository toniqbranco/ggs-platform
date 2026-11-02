# Sign-in waiting and owner continuation

After an email request, the waiting page keeps the generic response for known,
unknown and provider-failure cases. It does not claim successful delivery or expose
whether an address has an account. It hides the submission form, explains using
the newest email in the requesting browser, warns that sending may be temporarily
limited, and offers a session check. Returning to the form later is an explicit
navigation; this is a UX guard, not a replacement for provider/server rate limits.

Verified sessions no longer show a sign-in-again link. When local stored review is
enabled, the session page makes a second fresh owner-only access check. Only a
successful `pilot-management` decision reveals the private review link. Admin,
streamer, anonymous or failed/revoked checks receive no owner link. The queue and
its data endpoint retain their own fresh authorization; a navigation link grants
no access. No HQ link is added to the public website.

Development-only diagnostics record the request/callback stage, a boolean for a
browser verifier cookie and one controlled outcome label. They never include the
cookie value, email, auth code, token, raw provider exception or request URL. They
are off in test/staging/production application environments and production Node
mode. Next's ordinary development request logging is separate and can include
callback query strings; do not share raw terminal logs or email links.

## Testing and current incident boundary

An isolated localhost browser test with synthetic authentication and storage off
confirmed both same-tab and new-in-app-tab PKCE exchanges. It sent no email and
made no hosted Auth/database request. This does not prove the real owner's failed
attempt was in the same cookie context. The original real callback reported a
missing verifier; the exact reason it was absent has not been reproduced.

Read-only provider logs separately confirmed a later real email request returned
429 `over_email_send_rate_limit`. The waiting page's generic message previously
looked like an invitation to request again. This PR improves that recovery path;
it does not reset quotas or promise a delivery time. A fresh real-owner browser
check still requires a successfully delivered new link after the limit clears.

No change is made to PKCE, cookie security, public signup, account admission,
Supabase email/rate settings, SMTP, credentials, application records or deployment.
The original email-link plan remains in effect. No new email is sent by tests.
