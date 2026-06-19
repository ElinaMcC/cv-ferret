Free up ports 5173 (Vite) and 5000 (Express) if anything is running on them, then start the CV Ferret dev server and confirm both services are up.

Steps:
1. Use PowerShell to check for and kill any process on port 5173, then port 5000. For each port: run `Get-NetTCPConnection -LocalPort <port> -ErrorAction SilentlyContinue` to find the owning PID, then `Stop-Process -Id <pid> -Force` if one exists. Report whether anything was killed or the port was already free.
2. Run `npm run dev` in the background.
3. Wait a few seconds, then confirm the dev server is up by checking that http://localhost:5173 is reachable (use `Invoke-WebRequest` or similar). Report success clearly so the user knows it's ready to use.
