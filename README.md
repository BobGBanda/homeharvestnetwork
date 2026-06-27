# Home Harvest Network

Home Harvest Network is a static marketing site for a local produce network that connects household growers with subscriptions, business buyers, and community partners.

## What's in the site

- `index.html` - homepage
- `about.html` - company story and mission
- `subscriptions.html` - subscription box offers
- `for-growers.html` - grower onboarding information
- `for-business.html` - business sourcing and supply partnership page
- `contact.html` - contact and enquiry form
- `css/` - shared styles
- `js/` - front-end scripts, including lead form handling
- `supabase/` - Supabase Edge Function setup for lead notifications
- `photo rip/` - site images and brand assets

## Local development

This project is plain HTML, CSS, and JavaScript. There is no build step.

1. Open the repository in your editor.
2. Serve the folder with any static file server, or open `index.html` directly in a browser.
3. Update the HTML, CSS, or JS files as needed and refresh the browser.

If you want a quick local server with PowerShell, you can use:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Lead capture and Supabase

The contact and enquiry forms send data to Supabase using the configuration in `js/supabase-config.js`.

The repo also includes a Supabase Edge Function:

- `supabase/functions/notify-lead`

That function is intended to be triggered by a database webhook when a new row is inserted into the `leads` table. See `supabase/lead-notification-setup.md` for the full setup steps.

## Deployment notes

- The project is suitable for static hosting.
- `CNAME` is included for a custom domain setup.
- If you change image paths, keep the `photo rip/` folder name in mind because it contains a space.

## Project goal

The site is designed to:

- attract weekly subscription customers
- onboard local growers
- help businesses source fresh produce
- capture enquiries through a simple lead form flow
