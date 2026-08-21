Renew Certificate command: sudo sh -c 'systemctl stop nginx && certbot renew --force-renewal && cat /etc/letsencrypt/live/minkerpage.ch/privkey.pem /etc/letsencrypt/live/minkerpage.ch/fullchain.pem > /opt/psa/var/certificates/scf8o0f5undfqvj1wFzw8e && systemctl start nginx'
Manual pull: sudo plesk ext git --deploy -domain minkerpage.ch -name "MinkerPage.git"
Refresh after pull: sudo touch /var/www/vhosts/minkerpage.ch/httpdocs/tmp/restart.txt

## Email verification setup

Account email verification and password reset emails use Resend by default.
Create a Resend API key, then provide these environment variables to the Python backend before restarting it:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=replace_with_resend_api_key
EMAIL_FROM=MinkerPage <onboarding@resend.dev>
```

For production, verify your own sending domain in Resend and replace `EMAIL_FROM` with something like `MinkerPage <no-reply@minkerpage.ch>`.
SMTP is still available as a fallback by setting `EMAIL_PROVIDER=smtp` and configuring `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_USE_TLS`.
