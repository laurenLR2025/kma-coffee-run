# KMA Coffee Run

A shared Starbucks coffee-run app for a small office. The server stores profiles, favorites, the team season, and the latest run in SQLite. Each employee signs up once with a unique display name and the team code. The browser remembers their profile. **My profile → Recovery key** lets them restore it on another device.

## Try it locally

Install Python 3.9 or newer. Unzip the app, open a terminal in the app folder, and run:

```sh
KMA_TEAM_CODE='choose-a-private-team-code' python3 server.py
```

Open http://127.0.0.1:8080 and use the code you set. The local database is created beside the app. No Python packages are needed.

## Deploy and share

1. Deploy the included Dockerfile to an internal server or a container host that offers persistent disk storage and HTTPS. Use a single always-running instance. Route the host's HTTPS traffic to container port 8080.
2. Mount a persistent volume at `/data`. The app stores `coffee.sqlite3` there. Set `KMA_TEAM_CODE` as a secret environment variable with a long random value. Keep the database directory outside any publicly served file tree.
3. Open the HTTPS URL from a laptop and a phone. Create two test profiles with the team code, save a favorite, start a run, join from the other device, and copy the list. Use a separate volume for this rehearsal if you want a clean rollout.
4. Share the HTTPS URL in the team's private channel and give the team code to the intended employees privately. Ask employees to keep their personal recovery key private. Keep the app behind your organization's access gateway if one is available. Changing the team code controls new signups. Existing profiles keep access.
5. Back up the volume regularly using your host's consistent snapshots or SQLite's backup facility. Keep the volume attached during redeploys.

## Run day

- Save your usual drink under **Your favorite**. Milk and customizations are optional.
- Any team member can start a run and optionally set an order cutoff. The entered time uses the organizer's device timezone and is displayed in each person's local time.
- Use **Join with favorite** for one-tap ordering, or enter an order for this run. Edits to a run order and the saved favorite are independent.
- The organizer can copy the consolidated list and close the run. The deadline stops order changes automatically. The organizer closes the run before the team opens another. The closed list remains available until the next run starts.
- Change the team-wide season in **My profile**. Other open tabs refresh shared data every few seconds.

## Verification

Tested in a desktop browser from signup through copying an edited order. Checked the 375 px layout for a single column and no horizontal overflow. Local HTTP tests covered ten concurrent joins, organizer-only closing, deadline enforcement, shared edits and theme, persistence across process restart, and starting the next run. The Docker deployment steps require a host with a persistent volume.
