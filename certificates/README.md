# Supabase public database CA

`supabase-prod-ca-2021.crt` is a public CA certificate, not a key or credential.
It is the same provider certificate reviewed for the isolated/testing transport.
Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 certificate fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

Expiry: 2031-04-26. Runtime checks require exactly this certificate and its current
validity. Rotation fails closed and requires review; never append other trust roots
or disable hostname/certificate verification. Nothing installs this into OS trust.
