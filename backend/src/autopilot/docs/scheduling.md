# Running Job Autopilot by itself

Normally somebody has to type `pnpm run hunt` for anything to happen. The scheduler does
it for you: start it once and it keeps running in the background, hunting for jobs three
times a day and checking your job alert emails every half hour.

Nothing below has been set up for you. Registering a task that starts with Windows is
your decision, so the commands are here for you to run when you want to.

## The timetable

| What | When | Setting in `.env` |
| --- | --- | --- |
| Full job hunt | 07:00, 13:00 and 19:00 India time | `SCHEDULE_HUNT` |
| Read job alert emails | Every 30 minutes | `SCHEDULE_INBOX` |
| Which clock those times use | `Asia/Kolkata` | `SCHEDULE_TZ` |

You do not have to change anything. If you want to, the lines are ordinary cron lines —
[crontab.guru](https://crontab.guru) will explain any of them in English.

## Try it first

Open a terminal in the `job-autopilot` folder and run:

```
pnpm run schedule
```

It prints when each job is next due and then waits. Leave it a while and you will see
runs appear. Press `Ctrl-C` to stop it. This is worth doing once before you set up
anything permanent, so you know it works.

## Make it start with Windows

This registers a Scheduled Task that starts the scheduler when you log in. Copy the
whole block into **PowerShell** — all one line each — from the `job-autopilot` folder.

```powershell
$folder = "C:\Users\puroh\OneDrive\Desktop\images\resume-clone\job-autopilot"
$logs   = "$folder\logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$cmd = "cmd /c cd /d ""$folder"" && pnpm run schedule >> ""$logs\scheduler.log"" 2>&1"
schtasks /Create /TN "Job Autopilot scheduler" /TR $cmd /SC ONLOGON /RL LIMITED /F
```

That is it. Restart the computer, or start it now without restarting:

```powershell
schtasks /Run /TN "Job Autopilot scheduler"
```

Two things worth knowing:

- It starts when **you** log in, not when the machine powers on. That is deliberate — it
  needs your account to read your `.env` file.
- A black console window may flash up. That is the scheduler starting. To hide it
  entirely, tick "Run whether user is logged on or not" in Task Scheduler, but Windows
  will then ask for your Windows password.

## Check it is running

```powershell
schtasks /Query /TN "Job Autopilot scheduler" /V /FO LIST
```

Look for **Status: Running** and **Last Result: 0**.

You can also just look for the process:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Format-Table Id, StartTime
```

The friendliest check is the web app. Run `pnpm run web`, open
<http://localhost:5055>, go to **Sources**, and read the **Automatic runs** panel at the
top. It shows when it last ran, whether it worked, what it found and when it runs next.

## See the log

Everything the scheduler says goes into the file named in the command above:

```powershell
Get-Content "C:\Users\puroh\OneDrive\Desktop\images\resume-clone\job-autopilot\logs\scheduler.log" -Tail 40
```

To watch it as it happens, add `-Wait`:

```powershell
Get-Content "C:\Users\puroh\OneDrive\Desktop\images\resume-clone\job-autopilot\logs\scheduler.log" -Tail 40 -Wait
```

Press `Ctrl-C` to stop watching. That only stops the watching, not the scheduler.

## Stop it

Stop it for now, but leave it registered so it starts again next time you log in:

```powershell
schtasks /End /TN "Job Autopilot scheduler"
```

Remove it altogether, so it never starts on its own again:

```powershell
schtasks /Delete /TN "Job Autopilot scheduler" /F
```

## If something goes wrong

The scheduler is built to keep going. A job board having a bad day, a failed run, even a
crash inside a run — none of those stop it, and it tries again at the next scheduled
time. If the same job fails **twice in a row** you get one email about it, not one per
failure.

Two things it does on purpose that can look like faults:

- **"skipped this slot — the previous run is still going"** means a hunt was still
  working when the next one came due. Starting a second one would hit the same job
  boards twice over, so it waits for the next slot instead. Nothing is lost.
- **"hiring.cafe was skipped"** means the headless browser that site needs is not
  installed. Every other source still runs. To switch it on, run
  `pnpm run browser:install` once.

If nothing at all is appearing, check in this order:

1. Is the task running? `schtasks /Query /TN "Job Autopilot scheduler"`
2. Does the log say anything? See **See the log** above.
3. Does it work by hand? `pnpm run hunt remotive` — that is the quickest source.
4. Is `SCHEDULE_HUNT_ONLY` left set in `.env`? It should be blank. Anything in it
   narrows the hunt to one source, which is only meant for testing.
