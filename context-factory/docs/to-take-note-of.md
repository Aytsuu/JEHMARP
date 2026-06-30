Where Costs Can Surprise You

The expensive cases are not normal customers. The
risk is abuse.

Example:

bot sends 1,000,000 reseller form attempts
each attempt does 4 Redis commands
= 4,000,000 commands
= about $8 Redis cost

That is not terrible, but if the bot reaches your
Edge Function each time, you also consume function
invocations.

So the best cost control is:

1. Put Turnstile before expensive work.
2. Rate-limit before database insert.
3. Rate-limit before email sending.
4. Add spend alerts.
5. Log abuse patterns.
6. Block obvious abuse at CDN/WAF level when
needed.

Cloudflare Turnstile
Upstash Redis free/pay-as-you-go
Supabase Edge Functions

Budget expectation:

Development: $0 extra
Early production: $0-$5/month extra
Normal small business usage: $0-$10/month extra
Moderate usage: $10-$25/month extra

Do not over-engineer this at the start. Add Redis +
Turnstile for the three public abuse points:

reseller application
contact inquiry
guest order

For admin and agent actions, rate-limit by
authenticated user_id. Those are much lower risk
and should cost almost nothing.